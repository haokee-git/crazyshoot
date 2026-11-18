/**
 * CRAZYSHOOT signaling service.
 *
 * 只负责：房间码、SDP/ICE 转发、P2P 失败时的游戏数据中继、在线状态。
 * 不跑游戏逻辑，不持久化。
 *
 * 断线恢复（背景标签被冻结 / 心跳超时 / 网络抖动）：
 * - 每个 peer 在 created/joined 时拿到 resumeToken，同一条 WS 断开后进入宽限期；
 * - 宽限期内 peer 仍留在房间（标记 offline），只广播 peer-offline，不发 peer-left；
 * - 客户端用新 WS 发 {type:'resume', code, peerId, token} 可原地恢复，peerId 不变；
 * - 房主离线同样保留房间，宽限期结束才 closeRoom(host-timeout)；
 * - heartbeat 连续 3 次没有 pong 才 terminate；pong 与任何房间消息都会 touch 房间，
 *   因此 P2P 对战期间信令没有业务流量也不会被 idle-timeout 掉。
 *
 * 环境变量：
 *   PORT / HOST                      监听地址（默认 127.0.0.1:18789）
 *   SIGNAL_RESUME_GRACE_MS           断线宽限期（默认 180000 = 3 分钟）
 *   SIGNAL_ROOM_TTL_MS               房间无活动回收时间（默认 900000 = 15 分钟）
 *   SIGNAL_HEARTBEAT_MS              WS ping 间隔（默认 30000）
 *   SIGNAL_HEARTBEAT_MISSES          连续未 pong 上限（默认 3，最少 2）
 *
 * 运行：node server/signal/server.mjs
 * 端口：127.0.0.1:18789（生产由 nginx /signal 反代）
 */
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 18789);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_PEERS = 200; // 100v100（含房主）
const MIN_PEERS = 2;
/** 房间容量：host 可在 2..60 之间调整（每侧人数 ×2）。 */
function clampMaxPeers(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return MAX_PEERS;
  return Math.max(MIN_PEERS, Math.min(MAX_PEERS, Math.floor(n)));
}
function envMs(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
const RESUME_GRACE_MS = envMs('SIGNAL_RESUME_GRACE_MS', 3 * 60 * 1000);
const ROOM_TTL_MS = envMs('SIGNAL_ROOM_TTL_MS', 15 * 60 * 1000);
const HEARTBEAT_MS = Math.max(50, envMs('SIGNAL_HEARTBEAT_MS', 30_000));
const HEARTBEAT_MISS_LIMIT = Math.max(2, Math.floor(Number(process.env.SIGNAL_HEARTBEAT_MISSES) || 3));
const SWEEP_MS = Math.min(30_000, Math.max(100, Math.floor(RESUME_GRACE_MS / 5)));
const RATE_WINDOW_MS = 10_000;
const RATE_MAX = 2400;
const ROOM_CODES = 10_000;

/** @typedef {{ id: string, token: string, ws: import('ws').WebSocket | null, name: string, version: string, joinedAt: number, msgTimes: number[], offline: boolean, offlineAt: number }} Peer */
/** @typedef {{ code: string, password: string | null, hostId: string, peers: Map<string, Peer>, createdAt: number, lastActivity: number }} Room */

/** @type {Map<string, Room>} */
const rooms = new Map();
let nextLog = 0;

function log(...args) {
  const now = Date.now();
  if (now - nextLog < 1000) return;
  nextLog = now;
  console.log(new Date(now).toISOString(), ...args);
}

function roomCode() {
  if (rooms.size >= ROOM_CODES) return null;
  const start = crypto.randomInt(ROOM_CODES);
  for (let offset = 0; offset < ROOM_CODES; offset++) {
    const code = String((start + offset) % ROOM_CODES).padStart(4, '0');
    if (!rooms.has(code)) return code;
  }
  return null;
}

function peerId() {
  return crypto.randomBytes(8).toString('hex');
}

function resumeToken() {
  return crypto.randomBytes(16).toString('hex');
}

function send(ws, message) {
  if (!ws || ws.readyState !== ws.OPEN) return;
  try {
    ws.send(JSON.stringify(message));
  } catch {
    /* ignore */
  }
}

function broadcast(room, message, exceptId = null) {
  for (const [id, peer] of room.peers) {
    if (id !== exceptId) send(peer.ws, message);
  }
}

function touch(room) {
  room.lastActivity = Date.now();
}

function rateOk(peer) {
  const now = Date.now();
  peer.msgTimes = peer.msgTimes.filter((t) => now - t < RATE_WINDOW_MS);
  if (peer.msgTimes.length >= RATE_MAX) return false;
  peer.msgTimes.push(now);
  return true;
}

function peerInfo(room, peer) {
  return {
    id: peer.id,
    name: peer.name,
    host: peer.id === room.hostId,
    offline: !!peer.offline,
  };
}

function roomSummary(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    maxPeers: room.maxPeers ?? MAX_PEERS,
    peers: [...room.peers.values()].map((p) => peerInfo(room, p)),
  };
}

function newPeer(ws, name, version) {
  return {
    id: peerId(),
    token: resumeToken(),
    ws,
    name: String(name || 'PLAYER').slice(0, 24),
    version: String(version || 'dev').slice(0, 32),
    joinedAt: Date.now(),
    msgTimes: [],
    offline: false,
    offlineAt: 0,
  };
}

function closeRoom(room, reason) {
  if (!rooms.has(room.code)) return;
  rooms.delete(room.code);
  for (const peer of room.peers.values()) {
    send(peer.ws, { type: 'room-closed', reason });
    try {
      peer.ws?.close(4001, 'room closed');
    } catch {
      /* ignore */
    }
    peer.ws = null;
  }
  log('room closed', room.code, reason);
}

/** 标记 peer 掉线但保留房间/名单，宽限期内可 resume。 */
function markOffline(peer, room, reason) {
  if (peer.offline) return;
  peer.ws = null;
  peer.offline = true;
  peer.offlineAt = Date.now();
  touch(room);
  broadcast(room, { type: 'peer-offline', peerId: peer.id });
  log('peer offline', room.code, peer.id, peer.id === room.hostId ? 'host' : 'guest', reason || '');
}

function handleMessage(ws, raw) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    send(ws, { type: 'error', code: 'bad_json', message: 'Invalid JSON' });
    return;
  }
  if (!msg || typeof msg !== 'object') return;

  /** @type {Peer | undefined} */
  const peer = ws.__peer;
  /** @type {Room | undefined} */
  const room = ws.__room;

  if (msg.type === 'create') {
    if (room) {
      send(ws, { type: 'error', code: 'already_in_room', message: 'Already in a room' });
      return;
    }
    const code = roomCode();
    if (code === null) {
      send(ws, { type: 'error', code: 'rooms_full', message: '房间已满，请稍后再创建' });
      return;
    }
    const host = newPeer(ws, msg.name || 'HOST', msg.version);
    const newRoom = {
      code,
      password: msg.password ? String(msg.password).slice(0, 32) : null,
      hostId: host.id,
      maxPeers: clampMaxPeers(msg.maxPeers),
      peers: new Map([[host.id, host]]),
      createdAt: Date.now(),
      lastActivity: Date.now(),
    };
    rooms.set(code, newRoom);
    ws.__peer = host;
    ws.__room = newRoom;
    send(ws, {
      type: 'created',
      code,
      peerId: host.id,
      hostId: host.id,
      resumeToken: host.token,
      ice: { iceServers: [] },
    });
    log('room created', code);
    return;
  }

  if (msg.type === 'join') {
    if (room) {
      send(ws, { type: 'error', code: 'already_in_room', message: 'Already in a room' });
      return;
    }
    const code = typeof msg.code === 'string' ? msg.code.trim() : '';
    if (!/^[0-9]{4}$/.test(code)) {
      send(ws, { type: 'error', code: 'bad_room_code', message: '请输入四位数字房间码' });
      return;
    }
    const target = rooms.get(code);
    if (!target) {
      send(ws, { type: 'error', code: 'room_not_found', message: '房间不存在或已关闭' });
      return;
    }
    if (target.peers.size >= (target.maxPeers ?? MAX_PEERS)) {
      send(ws, { type: 'error', code: 'room_full', message: '房间已满，无法加入' });
      return;
    }
    if (target.password && String(msg.password || '') !== target.password) {
      send(ws, { type: 'error', code: 'bad_password', message: '房间密码错误' });
      return;
    }
    const guest = newPeer(ws, msg.name || 'PLAYER', msg.version);
    target.peers.set(guest.id, guest);
    touch(target);
    ws.__peer = guest;
    ws.__room = target;
    send(ws, {
      type: 'joined',
      ...roomSummary(target),
      peerId: guest.id,
      resumeToken: guest.token,
      ice: { iceServers: [] },
    });
    broadcast(target, { type: 'peer-joined', peer: peerInfo(target, guest) }, guest.id);
    log('room join', code, target.peers.size);
    return;
  }

  if (msg.type === 'resume') {
    if (room) {
      send(ws, { type: 'error', code: 'already_in_room', message: 'Already in a room' });
      return;
    }
    const code = typeof msg.code === 'string' ? msg.code.trim() : '';
    const target = rooms.get(code);
    if (!target) {
      send(ws, { type: 'error', code: 'resume_failed', message: '房间已关闭，无法恢复' });
      return;
    }
    const wantedId = typeof msg.peerId === 'string' ? msg.peerId : '';
    const token = typeof msg.token === 'string' ? msg.token : '';
    const existing = target.peers.get(wantedId);
    if (!existing || !token || existing.token !== token) {
      send(ws, { type: 'error', code: 'resume_failed', message: '会话已失效，请重新加入房间' });
      return;
    }
    if (existing.ws && existing.ws !== ws) {
      // 旧连接可能还挂在 NAT 上（没有 FIN）：新连接接管，旧 socket 静默丢弃。
      const previous = existing.ws;
      previous.__detached = true;
      existing.ws = null;
      try {
        previous.close(4002, 'session resumed elsewhere');
      } catch {
        /* ignore */
      }
      log('peer socket replaced', target.code, existing.id);
    }
    existing.ws = ws;
    existing.offline = false;
    existing.offlineAt = 0;
    existing.msgTimes = [];
    ws.__peer = existing;
    ws.__room = target;
    touch(target);
    send(ws, {
      type: 'resumed',
      ...roomSummary(target),
      peerId: existing.id,
      resumeToken: existing.token,
      ice: { iceServers: [] },
    });
    broadcast(target, { type: 'peer-online', peer: peerInfo(target, existing) }, existing.id);
    log('peer resumed', target.code, existing.id);
    return;
  }

  if (!room || !peer) {
    send(ws, { type: 'error', code: 'not_in_room', message: '先创建或加入房间' });
    return;
  }
  if (!rateOk(peer)) {
    send(ws, { type: 'error', code: 'rate_limited', message: '消息太频繁' });
    return;
  }
  touch(room);

  if (msg.type === 'capacity') {
    if (room.hostId !== peer.id) {
      send(ws, { type: 'error', code: 'host_only', message: '只有房主可以调整房间容量' });
      return;
    }
    room.maxPeers = clampMaxPeers(msg.maxPeers);
    broadcast(room, { type: 'room-capacity', maxPeers: room.maxPeers }, peer.id);
    return;
  }

  if (msg.type === 'signal') {
    const to = String(msg.to || '');
    const target = room.peers.get(to);
    if (!target || target.offline) {
      // 对方正在重连：静默丢弃，恢复后由房主重新发 offer。
      return;
    }
    send(target.ws, { type: 'signal', from: peer.id, data: msg.data ?? null });
    return;
  }

  if (msg.type === 'relay') {
    const data = msg.data ?? null;
    const recipients = Array.isArray(msg.to) ? new Set(msg.to) : msg.to ? new Set([msg.to]) : null;
    const realtime = ['snap', 'inputs', 'input', 'vehInput'].includes(data?.t);
    const payload = JSON.stringify({ type: 'relay', from: peer.id, data });
    for (const [id, target] of room.peers) {
      if (id === peer.id || recipients && !recipients.has(id) || !target.ws || target.ws.readyState !== target.ws.OPEN) continue;
      if (realtime && target.ws.bufferedAmount > 32768) continue;
      try { target.ws.send(payload); } catch { /* target disconnected */ }
    }
    return;
  }

  if (msg.type === 'state') {
    // 可选：玩家在大厅更新 ready/队伍等；仅广播给同房间
    broadcast(room, { type: 'peer-state', from: peer.id, state: msg.state ?? null }, peer.id);
    return;
  }

  if (msg.type === 'leave') {
    const wasHost = room.hostId === peer.id;
    room.peers.delete(peer.id);
    ws.__room = null;
    ws.__peer = null;
    send(ws, { type: 'left' });
    if (wasHost) {
      closeRoom(room, 'host-left');
    } else {
      broadcast(room, { type: 'peer-left', peerId: peer.id });
      log('peer left', room.code, room.peers.size);
    }
    return;
  }

  if (msg.type === 'ping') {
    send(ws, { type: 'pong', t: msg.t ?? Date.now(), serverTime: Date.now() });
    return;
  }

  send(ws, { type: 'error', code: 'unknown_type', message: `Unknown type: ${String(msg.type)}` });
}

const server = http.createServer((req, res) => {
  if (req.url === '/signal/health' || req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, uptime: process.uptime() }));
    return;
  }
  if (req.url === '/signal' || req.url?.startsWith('/signal?')) {
    res.writeHead(426, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('WebSocket upgrade required\n');
    return;
  }
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('not found\n');
});

const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 64 * 1024,
  // Full snapshots repeat field names and unchanged state, which compress cheaply.
  perMessageDeflate: {
    threshold: 1024,
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 12,
    zlibDeflateOptions: { level: 1, memLevel: 5 },
    concurrencyLimit: 8,
  },
});

server.on('upgrade', (req, socket, head) => {
  if (!req.url || !req.url.startsWith('/signal')) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.__peer = null;
    ws.__room = null;
    ws.__detached = false;
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', (ws) => {
  ws.missedPings = 0;
  ws.on('pong', () => {
    ws.missedPings = 0;
    const room = ws.__room;
    if (room && rooms.has(room.code)) touch(room);
  });
  ws.on('message', (raw) => {
    try {
      handleMessage(ws, raw);
    } catch (err) {
      console.error('message error', err);
      send(ws, { type: 'error', code: 'internal', message: 'Internal error' });
    }
  });
  ws.on('close', () => {
    if (ws.__detached) return;
    const peer = ws.__peer;
    const room = ws.__room;
    if (!peer || !room || !rooms.has(room.code)) return;
    if (peer.ws !== ws) return;
    // 断线不立刻踢人：标记 offline，宽限期内等待 resume。
    markOffline(peer, room, 'socket closed');
  });
  ws.on('error', () => {
    /* close handler cleans up */
  });
  send(ws, { type: 'hello', serverTime: Date.now(), protocol: 2, resume: true });
});

// 宽限期与房间回收：offline 超过宽限期才移除并广播 peer-left；房主超时则关房。
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [code, room] of [...rooms]) {
    let hostGone = false;
    for (const [id, peer] of [...room.peers]) {
      if (!peer.offline) continue;
      if (now - peer.offlineAt <= RESUME_GRACE_MS) continue;
      room.peers.delete(id);
      if (room.hostId === id) {
        hostGone = true;
        closeRoom(room, 'host-timeout');
        break;
      }
      broadcast(room, { type: 'peer-left', peerId: id });
      log('peer grace expired', code, id);
    }
    if (hostGone || !rooms.has(code)) continue;
    if (room.peers.size === 0) {
      rooms.delete(code);
      log('room dropped empty', code);
      continue;
    }
    if (now - room.lastActivity > ROOM_TTL_MS) closeRoom(room, 'idle-timeout');
  }
}, SWEEP_MS);

// 容忍连续多次没有 pong（后台标签/短暂卡顿），超过阈值才 terminate。
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    ws.missedPings = (ws.missedPings ?? 0) + 1;
    if (ws.missedPings >= HEARTBEAT_MISS_LIMIT) {
      try { ws.terminate(); } catch { /* ignore */ }
      continue;
    }
    try { ws.ping(); } catch { /* ignore */ }
  }
}, HEARTBEAT_MS);

function shutdown(signal) {
  log('shutting down', signal);
  clearInterval(sweep);
  clearInterval(heartbeat);
  for (const room of rooms.values()) closeRoom(room, 'server-shutdown');
  wss.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

server.listen(PORT, HOST, () => {
  log(`CRAZYSHOOT signaling on ws://${HOST}:${PORT}/signal`, `resumeGrace=${RESUME_GRACE_MS}ms heartbeat=${HEARTBEAT_MS}ms x${HEARTBEAT_MISS_LIMIT}`);
});
