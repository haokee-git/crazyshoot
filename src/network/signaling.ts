import { VERSION } from '../version';

export interface PeerInfo {
  id: string;
  name: string;
  host: boolean;
  /** 宽限期内断线、等待 resume 的玩家；仍在房间名单里，但信令不可达。 */
  offline?: boolean;
}

export type SignalingEvent =
  | { type: 'created'; code: string; peerId: string; hostId: string; resumeToken?: string }
  | { type: 'joined'; code: string; peerId: string; hostId: string; peers: PeerInfo[]; resumeToken?: string }
  | { type: 'resumed'; code: string; peerId: string; hostId: string; peers: PeerInfo[]; resumeToken?: string }
  | { type: 'peer-joined'; peer: PeerInfo }
  | { type: 'peer-left'; peerId: string }
  | { type: 'peer-offline'; peerId: string }
  | { type: 'peer-online'; peer: PeerInfo }
  | { type: 'signal'; from: string; data: unknown }
  | { type: 'relay'; from: string; data: unknown }
  | { type: 'room-closed'; reason: string }
  | { type: 'error'; code: string; message: string }
  | { type: 'disconnected'; code?: number; reason?: string };

type Handler = (e: SignalingEvent) => void;

export class SignalingClient {
  private ws: WebSocket | null = null;
  private handler: Handler;
  peerId = '';
  hostId = '';
  code = '';
  peers: PeerInfo[] = [];
  resumeToken = '';
  /** 最近一次服务端 pong 的时间；用来识别“半开”WS（后台冻结/网络切换）。 */
  lastPongAt = 0;
  /** 最近一次异常关闭码；大厅恢复流程据此区分“可重连”和“会话已被接管”。 */
  lastCloseCode = 0;
  private intentional = false;

  constructor(handler: Handler) {
    this.handler = handler;
  }

  setHandler(handler: Handler) {
    this.handler = handler;
  }

  get open() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  /** 打开一条新的 WS；可重复调用（重连）。已打开时直接返回。 */
  connect(url?: string) {
    if (this.open) return Promise.resolve();
    this.intentional = false;
    this.closeSocket();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const target = url || `${proto}://${location.host}/signal`;
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(target);
      this.ws = ws;
      let settled = false;
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        if (this.ws === ws) this.ws = null;
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error('signaling timeout'));
      }, 8000);
      ws.onopen = () => {
        if (this.ws !== ws) return;
        window.clearTimeout(timer);
        if (settled) return;
        settled = true;
        this.lastPongAt = 0;
        resolve();
      };
      ws.onerror = () => {
        if (this.ws !== ws) return;
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        reject(new Error('signaling connection failed'));
      };
      ws.onclose = (ev) => {
        // 旧 socket 的迟到 close 不影响新会话。
        if (this.ws !== ws) return;
        this.ws = null;
        this.lastCloseCode = ev.code;
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          reject(new Error('signaling closed'));
          return;
        }
        if (this.intentional) return;
        this.handler({ type: 'disconnected', code: ev.code, reason: ev.reason });
      };
      ws.onmessage = (ev) => {
        if (this.ws !== ws) return;
        let msg: any;
        try { msg = JSON.parse(String(ev.data)); } catch { return; }
        if (!msg || typeof msg !== 'object') return;
        switch (msg.type) {
          case 'hello':
            break;
          case 'created':
            this.code = msg.code;
            this.peerId = msg.peerId;
            this.hostId = msg.hostId;
            this.resumeToken = typeof msg.resumeToken === 'string' ? msg.resumeToken : this.resumeToken;
            this.handler({ type: 'created', code: msg.code, peerId: msg.peerId, hostId: msg.hostId, resumeToken: this.resumeToken });
            break;
          case 'joined':
            this.code = msg.code;
            this.peerId = msg.peerId;
            this.hostId = msg.hostId;
            this.peers = msg.peers ?? [];
            this.resumeToken = typeof msg.resumeToken === 'string' ? msg.resumeToken : this.resumeToken;
            this.handler({ type: 'joined', code: msg.code, peerId: msg.peerId, hostId: msg.hostId, peers: this.peers, resumeToken: this.resumeToken });
            break;
          case 'resumed':
            this.code = msg.code;
            this.peerId = msg.peerId;
            this.hostId = msg.hostId;
            this.peers = msg.peers ?? [];
            this.resumeToken = typeof msg.resumeToken === 'string' ? msg.resumeToken : this.resumeToken;
            this.handler({ type: 'resumed', code: msg.code, peerId: msg.peerId, hostId: msg.hostId, peers: this.peers, resumeToken: this.resumeToken });
            break;
          case 'peer-joined':
            this.peers = [...this.peers.filter((p) => p.id !== msg.peer?.id), msg.peer];
            this.handler({ type: 'peer-joined', peer: msg.peer });
            break;
          case 'peer-left':
            this.peers = this.peers.filter((p) => p.id !== msg.peerId);
            this.handler({ type: 'peer-left', peerId: msg.peerId });
            break;
          case 'peer-offline': {
            this.peers = this.peers.map((p) => p.id === msg.peerId ? { ...p, offline: true } : p);
            this.handler({ type: 'peer-offline', peerId: String(msg.peerId) });
            break;
          }
          case 'peer-online': {
            const next = msg.peer as PeerInfo;
            this.peers = this.peers.some((p) => p.id === next?.id)
              ? this.peers.map((p) => p.id === next.id ? { ...next, offline: false } : p)
              : [...this.peers, { ...next, offline: false }];
            this.handler({ type: 'peer-online', peer: { ...next, offline: false } });
            break;
          }
          case 'signal':
            this.handler({ type: 'signal', from: msg.from, data: msg.data });
            break;
          case 'relay':
            this.handler({ type: 'relay', from: msg.from, data: msg.data });
            break;
          case 'room-closed':
            this.handler({ type: 'room-closed', reason: String(msg.reason ?? 'closed') });
            break;
          case 'pong':
            this.lastPongAt = Date.now();
            break;
          case 'error':
            this.handler({ type: 'error', code: String(msg.code), message: String(msg.message) });
            break;
        }
      };
    });
  }

  private send(msg: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  create(name: string, maxPeers?: number) {
    this.send({ type: 'create', name, version: VERSION, maxPeers });
  }

  /** 房主调整房间容量（2..60）；server 会拒绝非房主调用。 */
  capacity(maxPeers: number) {
    this.send({ type: 'capacity', maxPeers });
  }

  join(code: string, name: string) {
    this.send({ type: 'join', code: code.trim(), name, version: VERSION });
  }

  /** 用新 WS 恢复同一 peerId（宽限期内有效）。 */
  resume(code: string, peerId: string, token: string) {
    this.send({ type: 'resume', code, peerId, token, version: VERSION });
  }

  /** 房间内保活：服务端收到消息会 touch 房间，P2P 对战期间也不会 idle-timeout。 */
  ping() {
    this.send({ type: 'ping', t: Date.now() });
  }

  signal(to: string, data: unknown) {
    this.send({ type: 'signal', to, data });
  }

  relay(data: unknown, to?: string | string[]) {
    if(['snap','inputs','input','vehInput'].includes((data as any)?.t)&&(this.ws?.bufferedAmount??0)>32768)return;
    this.send({ type: 'relay', to, data });
  }

  leave() {
    this.intentional = true;
    this.send({ type: 'leave' });
    this.closeSocket();
  }

  close() {
    this.intentional = true;
    this.closeSocket();
  }

  private closeSocket() {
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    try { ws.close(); } catch { /* ignore */ }
  }
}
