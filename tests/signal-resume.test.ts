import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import WebSocket from 'ws';
import { ACTION_CODES, DEFAULT_BINDS, loadBinds, saveBinds } from '../src/game/core/keybinds';

/**
 * 真实信令服务恢复测试：启动 server/signal/server.mjs（独立端口 / 短宽限期），
 * 用 ws 客户端走 create/join → 掉线 → resume → 宽限超时 全链路。
 * 不接触正在运行的 18789 / 5174。
 */

const MAIN_PORT = 18791;
const HEARTBEAT_PORT = 18792;
const GRACE_MS = 700;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface Pending {
  pred: (msg: any) => boolean;
  resolve: (msg: any) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

class TestClient {
  readonly ws: WebSocket;
  readonly inbox: any[] = [];
  closedWith: { code: number; reason: string } | null = null;
  private waiters: Pending[] = [];
  private readonly closedPromise: Promise<{ code: number; reason: string }>;
  private resolveClosed!: (value: { code: number; reason: string }) => void;

  private constructor(url: string, opts?: { autoPong?: boolean }) {
    this.ws = new WebSocket(url, opts);
    this.closedPromise = new Promise((resolve) => { this.resolveClosed = resolve; });
    this.ws.on('message', (raw) => {
      let msg: any;
      try { msg = JSON.parse(String(raw)); } catch { return; }
      const index = this.waiters.findIndex((waiter) => waiter.pred(msg));
      if (index >= 0) {
        const [waiter] = this.waiters.splice(index, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      } else {
        this.inbox.push(msg);
      }
    });
    this.ws.on('close', (code, reason) => {
      this.closedWith = { code, reason: String(reason) };
      for (const waiter of this.waiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error(`socket closed while waiting for a message (${code})`));
      }
      this.resolveClosed(this.closedWith);
    });
  }

  static open(port: number, opts?: { autoPong?: boolean }): Promise<TestClient> {
    return new Promise((resolve, reject) => {
      const client = new TestClient(`ws://127.0.0.1:${port}/signal`, opts);
      client.ws.once('open', () => resolve(client));
      client.ws.once('error', reject);
    });
  }

  send(message: unknown) {
    this.ws.send(JSON.stringify(message));
  }

  next(pred: (msg: any) => boolean = () => true, timeout = 4000): Promise<any> {
    const index = this.inbox.findIndex(pred);
    if (index >= 0) return Promise.resolve(this.inbox.splice(index, 1)[0]);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const at = this.waiters.findIndex((waiter) => waiter.timer === timer);
        if (at >= 0) this.waiters.splice(at, 1);
        reject(new Error('timed out waiting for a signaling message'));
      }, timeout);
      this.waiters.push({ pred, resolve, reject, timer });
    });
  }

  async expectNone(pred: (msg: any) => boolean, ms: number) {
    await wait(ms);
    expect(this.inbox.find(pred)).toBeUndefined();
  }

  whenClosed() {
    return this.closedPromise;
  }

  close() {
    try { this.ws.close(); } catch { /* ignore */ }
  }

  terminate() {
    try { this.ws.terminate(); } catch { /* ignore */ }
  }
}

const servers: { proc: ChildProcess; output: string[] }[] = [];

function startServer(port: number, env: Record<string, string>) {
  const proc = spawn(process.execPath, ['server/signal/server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port), HOST: '127.0.0.1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const output: string[] = [];
  proc.stdout?.on('data', (data) => output.push(String(data)));
  proc.stderr?.on('data', (data) => output.push(String(data)));
  servers.push({ proc, output });
  return { proc, output };
}

async function waitForServer(port: number) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/signal/health`);
      if (response.ok) return;
    } catch { /* not ready yet */ }
    await wait(80);
  }
  throw new Error(`signal server on ${port} did not start`);
}

beforeAll(async () => {
  startServer(MAIN_PORT, {
    SIGNAL_RESUME_GRACE_MS: String(GRACE_MS),
    SIGNAL_HEARTBEAT_MS: '30000',
  });
  startServer(HEARTBEAT_PORT, {
    SIGNAL_RESUME_GRACE_MS: '1000',
    SIGNAL_HEARTBEAT_MS: '200',
    SIGNAL_HEARTBEAT_MISSES: '3',
  });
  await Promise.all([waitForServer(MAIN_PORT), waitForServer(HEARTBEAT_PORT)]);
}, 20_000);

afterAll(async () => {
  for (const { proc } of servers) {
    try { proc.kill('SIGKILL'); } catch { /* ignore */ }
  }
  await wait(120);
});

describe('signaling resume', () => {
  it('resumes the same peer after a dropped guest socket without peer-left inside the grace window', async () => {
    const host = await TestClient.open(MAIN_PORT);
    const hello = await host.next((msg) => msg.type === 'hello');
    expect(hello.protocol).toBe(2);
    expect(hello.resume).toBe(true);

    host.send({ type: 'create', name: 'HOST', version: 'test' });
    const created = await host.next((msg) => msg.type === 'created');
    expect(created.code).toMatch(/^\d{4}$/);
    expect(typeof created.resumeToken).toBe('string');
    expect(created.resumeToken.length).toBeGreaterThan(10);

    const guest = await TestClient.open(MAIN_PORT);
    guest.send({ type: 'join', code: created.code, name: 'GUEST', version: 'test' });
    const joined = await guest.next((msg) => msg.type === 'joined');
    expect(joined.peerId).toBeTruthy();
    expect(joined.resumeToken).toBeTruthy();
    const peerJoined = await host.next((msg) => msg.type === 'peer-joined');
    expect(peerJoined.peer.id).toBe(joined.peerId);

    // 模拟后台标签被冻结/网络抖动：WS 直接消失。
    guest.terminate();
    const offline = await host.next((msg) => msg.type === 'peer-offline');
    expect(offline.peerId).toBe(joined.peerId);
    // 宽限期内绝不能广播 peer-left（否则房主会把后台玩家踢出对局）。
    await host.expectNone((msg) => msg.type === 'peer-left', 250);

    const resumedClient = await TestClient.open(MAIN_PORT);
    resumedClient.send({ type: 'resume', code: created.code, peerId: joined.peerId, token: joined.resumeToken });
    const resumed = await resumedClient.next((msg) => msg.type === 'resumed');
    expect(resumed.peerId).toBe(joined.peerId);
    expect(resumed.code).toBe(created.code);
    expect(resumed.hostId).toBe(created.peerId);
    expect(resumed.peers.map((peer: any) => peer.id).sort()).toEqual([created.peerId, joined.peerId].sort());
    expect(resumed.peers.find((peer: any) => peer.id === joined.peerId).offline).toBe(false);

    const online = await host.next((msg) => msg.type === 'peer-online');
    expect(online.peer.id).toBe(joined.peerId);
    await host.expectNone((msg) => msg.type === 'peer-left', 150);

    // 房间还活着：ping 有 pong。
    host.send({ type: 'ping', t: 42 });
    expect((await host.next((msg) => msg.type === 'pong')).t).toBe(42);

    // 主动 leave 仍然立即广播 peer-left。
    resumedClient.send({ type: 'leave' });
    expect((await host.next((msg) => msg.type === 'peer-left')).peerId).toBe(joined.peerId);

    host.send({ type: 'leave' });
    host.close();
    resumedClient.close();
  }, 20_000);

  it('rejects a bad resume token and expires the offline peer after the grace window', async () => {
    const host = await TestClient.open(MAIN_PORT);
    host.send({ type: 'create', name: 'HOST2', version: 'test' });
    const created = await host.next((msg) => msg.type === 'created');
    const guest = await TestClient.open(MAIN_PORT);
    guest.send({ type: 'join', code: created.code, name: 'GUEST2', version: 'test' });
    const joined = await guest.next((msg) => msg.type === 'joined');
    await host.next((msg) => msg.type === 'peer-joined');

    guest.terminate();
    await host.next((msg) => msg.type === 'peer-offline');

    const bad = await TestClient.open(MAIN_PORT);
    bad.send({ type: 'resume', code: created.code, peerId: joined.peerId, token: 'deadbeef' });
    const error = await bad.next((msg) => msg.type === 'error');
    expect(error.code).toBe('resume_failed');
    bad.close();

    const left = await host.next((msg) => msg.type === 'peer-left', GRACE_MS + 4000);
    expect(left.peerId).toBe(joined.peerId);
    // 房间本身还在（房主在线）。
    host.send({ type: 'ping', t: 7 });
    expect((await host.next((msg) => msg.type === 'pong')).t).toBe(7);
    host.send({ type: 'leave' });
    host.close();
  }, 20_000);

  it('keeps the room while the host is offline, then closes it once the host grace expires', async () => {
    const host = await TestClient.open(MAIN_PORT);
    host.send({ type: 'create', name: 'HOST3', version: 'test' });
    const created = await host.next((msg) => msg.type === 'created');
    const guest = await TestClient.open(MAIN_PORT);
    guest.send({ type: 'join', code: created.code, name: 'GUEST3', version: 'test' });
    await guest.next((msg) => msg.type === 'joined');
    await host.next((msg) => msg.type === 'peer-joined');

    host.terminate();
    const offline = await guest.next((msg) => msg.type === 'peer-offline');
    expect(offline.peerId).toBe(created.peerId);
    const closed = await guest.next((msg) => msg.type === 'room-closed', GRACE_MS + 4000);
    expect(closed.reason).toBe('host-timeout');
    guest.close();
  }, 20_000);
});

describe('heartbeat tolerance', () => {
  it('survives one missed heartbeat and only terminates after several', async () => {
    const frozen = await TestClient.open(HEARTBEAT_PORT, { autoPong: false });
    frozen.send({ type: 'create', name: 'FROZEN', version: 'test' });
    await frozen.next((msg) => msg.type === 'created');

    // heartbeat=200ms、上限 3 次：第一次没 pong 不应被立刻 terminate。
    await wait(350);
    expect(frozen.closedWith).toBeNull();

    const closed = await frozen.whenClosed();
    // 连续 3 次没有 pong 才被服务端主动断开。
    expect(closed.code).not.toBe(1000);
  }, 20_000);
});

/**
 * 默认键位回归：静步/下潜仍是 Ctrl，蹲仍是 C。
 * （曾尝试把静步挪到 Alt 以绕开 Ctrl+W，按需求已回退；只保留退出确认。）
 */
function stubBindsStorage(initial?: unknown) {
  const store = new Map<string, string>();
  if (initial !== undefined) store.set('crazyshoot.binds', JSON.stringify(initial));
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  });
  return store;
}

describe('default bindings stay unchanged', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps walk/dive on ControlLeft and crouch on KeyC', () => {
    stubBindsStorage();
    expect(DEFAULT_BINDS.walk).toBe('ControlLeft');
    expect(DEFAULT_BINDS.crouch).toBe('KeyC');
    expect(loadBinds().walk).toBe('ControlLeft');
  });

  it('migrates the old v1 pair (crouch=Ctrl, walk=Alt) to C / Ctrl', () => {
    stubBindsStorage({ ...ACTION_CODES, forward: 'KeyY' });
    const binds = loadBinds();
    expect(binds.forward).toBe('KeyY');
    expect(binds.crouch).toBe('KeyC');
    expect(binds.walk).toBe('ControlLeft');
  });

  it('never overwrites a deliberately remapped walk key', () => {
    stubBindsStorage({ ...DEFAULT_BINDS, walk: 'KeyT', version: 2 });
    expect(loadBinds().walk).toBe('KeyT');
  });

  it('saves with version 2 and keeps the original defaults', () => {
    const store = stubBindsStorage();
    saveBinds({ ...DEFAULT_BINDS });
    const saved = JSON.parse(store.get('crazyshoot.binds')!);
    expect(saved.version).toBe(2);
    expect(loadBinds().walk).toBe('ControlLeft');
  });

  it('undoes the abandoned v3 walk=Alt save instead of changing the default', () => {
    stubBindsStorage({ ...DEFAULT_BINDS, walk: 'AltLeft', version: 3 });
    expect(loadBinds().walk).toBe('ControlLeft');
  });
});

describe('host resume', () => {
  it('keeps the room while the host is offline and lets the host resume inside the grace window', async () => {
    const host = await TestClient.open(MAIN_PORT);
    host.send({ type: 'create', name: 'HOST-H', version: 'test' });
    const created = await host.next((msg) => msg.type === 'created');
    const guest = await TestClient.open(MAIN_PORT);
    guest.send({ type: 'join', code: created.code, name: 'GUEST-H', version: 'test' });
    const joined = await guest.next((msg) => msg.type === 'joined');
    await host.next((msg) => msg.type === 'peer-joined');

    host.terminate();
    const offline = await guest.next((msg) => msg.type === 'peer-offline');
    expect(offline.peerId).toBe(created.peerId);
    await guest.expectNone((msg) => msg.type === 'room-closed', 250);

    const resumedHost = await TestClient.open(MAIN_PORT);
    resumedHost.send({ type: 'resume', code: created.code, peerId: created.peerId, token: created.resumeToken });
    const resumed = await resumedHost.next((msg) => msg.type === 'resumed');
    expect(resumed.peerId).toBe(created.peerId);
    expect(resumed.hostId).toBe(created.peerId);
    expect(resumed.peers.map((peer: any) => peer.id).sort()).toEqual([created.peerId, joined.peerId].sort());

    const online = await guest.next((msg) => msg.type === 'peer-online');
    expect(online.peer.id).toBe(created.peerId);
    await guest.expectNone((msg) => msg.type === 'room-closed', 150);
    resumedHost.send({ type: 'ping', t: 5 });
    expect((await resumedHost.next((msg) => msg.type === 'pong')).t).toBe(5);

    resumedHost.send({ type: 'leave' });
    guest.close();
  }, 20_000);
});

describe('resume takeover', () => {
  it('lets a new socket take over a peer whose old socket is still open', async () => {
    const host = await TestClient.open(MAIN_PORT);
    host.send({ type: 'create', name: 'HOST-T', version: 'test' });
    const created = await host.next((msg) => msg.type === 'created');
    const guest = await TestClient.open(MAIN_PORT);
    guest.send({ type: 'join', code: created.code, name: 'GUEST-T', version: 'test' });
    const joined = await guest.next((msg) => msg.type === 'joined');
    await host.next((msg) => msg.type === 'peer-joined');

    // 浏览器可能在旧 TCP 还没被回收时就发起重连：服务端应让新连接接管。
    const replacement = await TestClient.open(MAIN_PORT);
    replacement.send({ type: 'resume', code: created.code, peerId: joined.peerId, token: joined.resumeToken });
    const resumed = await replacement.next((msg) => msg.type === 'resumed');
    expect(resumed.peerId).toBe(joined.peerId);

    const closed = await guest.whenClosed();
    expect(closed.code).toBe(4002);
    const online = await host.next((msg) => msg.type === 'peer-online');
    expect(online.peer.id).toBe(joined.peerId);
    await host.expectNone((msg) => msg.type === 'peer-left', 200);

    replacement.send({ type: 'leave' });
    host.send({ type: 'leave' });
    replacement.close();
    host.close();
  }, 20_000);
});
