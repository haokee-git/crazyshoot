import { SignalingClient, type PeerInfo, type SignalingEvent } from './signaling';

export type NetRole = 'host' | 'guest';

export interface NetEvent {
  type: 'code' | 'peers' | 'connected' | 'message' | 'closed' | 'error' | 'status' | 'reconnecting';
  code?: string;
  peers?: PeerInfo[];
  peerId?: string;
  data?: unknown;
  message?: string;
}

type Listener = (e: NetEvent) => void;

interface PeerLink {
  id: string;
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
  stateChannel: RTCDataChannel | null;
  pendingIce: RTCIceCandidateInit[];
  remoteSet: boolean;
  stateRelayUntil?:number;
}

const RECONNECT_MAX_DELAY_MS = 15_000;
const RESUME_TIMEOUT_MS = 6_000;
const PING_INTERVAL_MS = 25_000;

export class NetworkSession {
  role: NetRole;
  name: string;
  /** 房主创建时声明的房间容量（2..60）；客机为 undefined。 */
  maxPeers?: number;
  code = '';
  peerId = '';
  hostId = '';
  peers: PeerInfo[] = [];
  connected = false;
  /** 信令断开后正在后台重连；P2P 与房间状态都保留。 */
  reconnecting = false;
  private signaling: SignalingClient;
  private links = new Map<string, PeerLink>();
  private listener: Listener;
  private joinCode: string;
  private closed = false;

  private iceServers: RTCIceServer[];
  private resumeToken = '';
  private fatalClosed = false;
  private connecting = false;
  private retryTimer = 0;
  private pingTimer = 0;
  private resumeTimer = 0;
  private reconnectAttempt = 0;
  private awaitingResume = false;
  private lifecycleAttached = false;
  private hiddenAt = 0;
  private onVisibility: (() => void) | null = null;
  private onOnline: (() => void) | null = null;

  constructor(opts: { role: NetRole; name: string; code?: string; iceServers?: RTCIceServer[]; maxPeers?: number }, listener: Listener) {
    this.role = opts.role;
    this.name = opts.name;
    this.joinCode = opts.code || '';
    this.iceServers = opts.iceServers ?? [];
    this.maxPeers = opts.role === 'host' ? opts.maxPeers : undefined;
    this.listener = listener;
    this.signaling = new SignalingClient((e) => this.onSignalEvent(e));
  }

  async start(): Promise<void> {
    this.attachLifecycle();
    try {
      await this.openSignaling();
      this.emit({ type: 'status', message: 'connected to signaling' });
    } catch (error) {
      this.emit({ type: 'error', message: String((error as Error)?.message || error) });
      this.scheduleReconnect();
    }
  }

  /** 房主调整房间容量（每侧人数 ×2）；客机忽略。 */
  setCapacity(maxPeers: number) {
    if (this.role !== 'host') return;
    this.maxPeers = maxPeers;
    this.signaling.capacity(maxPeers);
  }

  /** 主动退出房间：server 广播 peer-left / 关闭房间，并断开所有 P2P。 */
  leave() {
    this.closed = true;
    this.clearTimers();
    this.detachLifecycle();
    try { this.signaling.leave(); } catch { /* ignore */ }
    for (const link of this.links.values()) {
      try { link.stateChannel?.close(); link.channel?.close(); link.pc.close(); } catch { /* ignore */ }
    }
    this.links.clear();
  }

  get fastStatePath() {
    const peers = this.role === 'host' ? this.peers.map(peer => peer.id) : [this.hostId];
    return peers.length > 0 && peers.every(id => this.links.get(id)?.stateChannel?.readyState === 'open');
  }

  send(data: unknown) {
    const text = JSON.stringify(data);
    const realtime=['snap','inputs','input','vehInput'].includes((data as any)?.t);
    const sent = new Set<string>();
    for (const [id, link] of this.links) {
      if (['disconnected', 'failed', 'closed'].includes(link.pc.connectionState)) continue;
      // Use the unordered state channel for real-time traffic on every network,
      // including LAN. Reliable ordered events must never hold movement behind them.
      const channel=realtime?link.stateChannel:link.channel;
      if(channel?.readyState!=='open')continue;
      // Never enqueue current movement behind an older unsent packet. SCTP can
      // stall even on a loss-free LAN; a 32 KiB queue hid hundreds of milliseconds
      // of input. Relay the fresh update immediately; sequence numbers discard
      // older state if the peer channel drains later.
      if(realtime){
        const now=performance.now();
        if(channel.bufferedAmount>0)link.stateRelayUntil=now+1000;
        // Keep using the relay briefly while SCTP drains, rather than alternating
        // fresh WS packets with another burst into the same stalled peer queue.
        if(now<(link.stateRelayUntil??0))continue;
      }
      try {
        channel.send(text);
        sent.add(id);
      } catch {
        /* fall back to relay below */
      }
    }
    if (this.role === 'guest') {
      if (sent.size === 0) this.signaling.relay(data, this.hostId);
      return;
    }
    const missing = this.peers.filter((peer) => !sent.has(peer.id));
    if (missing.length === 0) return;
    if (missing.length === this.peers.length) this.signaling.relay(data);
    else this.signaling.relay(data, missing.map(peer => peer.id));
  }

  close() {
    this.closed = true;
    this.clearTimers();
    this.detachLifecycle();
    for (const link of this.links.values()) {
      try { link.stateChannel?.close();link.channel?.close(); } catch { /* ignore */ }
      try { link.pc.close(); } catch { /* ignore */ }
    }
    this.links.clear();
    this.signaling.close();
  }

  private log(..._args: unknown[]) {
    // 生产保持安静；需要调试时在这里打开 console.log。
  }

  private emit(e: NetEvent) {
    this.listener(e);
  }

  /* ----------------------------- 信令连接/重连 ----------------------------- */

  /** 建立 WS；若已有恢复凭据则先 resume，否则 create/join。 */
  private async openSignaling() {
    if (this.closed || this.fatalClosed || this.connecting) return;
    this.connecting = true;
    try {
      await this.signaling.connect();
      if (this.closed || this.fatalClosed) {
        this.signaling.close();
        return;
      }
      this.reconnecting = false;
      this.reconnectAttempt = 0;
      this.startPing();
      if (this.resumeToken && this.code && this.peerId) {
        this.awaitingResume = true;
        this.signaling.resume(this.code, this.peerId, this.resumeToken);
        this.armResumeWatchdog();
        return;
      }
      if (this.role === 'host') this.signaling.create(this.name, this.maxPeers);
      else this.signaling.join(this.joinCode, this.name);
    } finally {
      this.connecting = false;
    }
  }

  private scheduleReconnect() {
    if (this.closed || this.fatalClosed || this.userLeft) return;
    if (this.retryTimer) return;
    this.reconnecting = true;
    const attempt = Math.min(6, this.reconnectAttempt + 1);
    this.reconnectAttempt = attempt;
    const delay = Math.min(RECONNECT_MAX_DELAY_MS, 1000 * 2 ** (attempt - 1));
    this.emit({ type: 'reconnecting', message: `信令连接中断，${Math.round(delay / 1000)} 秒后重试…` });
    this.retryTimer = window.setTimeout(() => {
      this.retryTimer = 0;
      void this.tryReconnect();
    }, delay);
  }

  private async tryReconnect() {
    if (this.closed || this.fatalClosed || this.userLeft || this.signaling.open) return;
    try {
      await this.openSignaling();
      if (!this.awaitingResume) {
        this.emit({ type: 'status', message: this.resumeToken ? '信令已重连，恢复房间…' : '信令已重连' });
      }
    } catch {
      this.emit({ type: 'status', message: '信令重连失败，继续重试…' });
      this.scheduleReconnect();
    }
  }

  /** 回到前台 / 网络恢复时立刻重试，不等退避计时器。 */
  private flushReconnect() {
    if (this.closed || this.fatalClosed || this.userLeft) return;
    if (this.signaling.open) {
      // WS 半开（后台冻结/换网）时 pong 会停止更新；超过 70s 视为死亡，强制换新连接。
      if (this.signaling.lastPongAt && Date.now() - this.signaling.lastPongAt > 70_000) {
        this.forceReconnect();
        return;
      }
      // WS 还在：补一次房间保活消息即可。
      this.signaling.ping();
      return;
    }
    if (this.connecting) return;
    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = 0;
    }
    this.reconnectAttempt = 0;
    void this.tryReconnect();
  }

  /** 丢弃当前 WS（不触发 disconnected 事件）并立刻重连；用于后台挂起后回到前台。 */
  private forceReconnect() {
    if (this.closed || this.fatalClosed || this.connecting) return;
    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = 0;
    }
    this.awaitingResume = false;
    this.reconnectAttempt = 0;
    if (this.signaling.open) this.signaling.close();
    void this.tryReconnect();
  }

  private attachLifecycle() {
    if (this.lifecycleAttached || typeof document === 'undefined' || typeof window === 'undefined') return;
    this.lifecycleAttached = true;
    this.onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        this.hiddenAt = Date.now();
        return;
      }
      const hiddenFor = this.hiddenAt ? Date.now() - this.hiddenAt : 0;
      this.hiddenAt = 0;
      // 后台挂起超过 30s：旧 WS 多半已经被冻结/半开，直接换新连接 + resume。
      if (hiddenFor > 30_000) this.forceReconnect();
      else this.flushReconnect();
    };
    this.onOnline = () => this.flushReconnect();
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('online', this.onOnline);
  }

  private detachLifecycle() {
    if (!this.lifecycleAttached) return;
    this.lifecycleAttached = false;
    if (this.onVisibility) document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.onOnline) window.removeEventListener('online', this.onOnline);
    this.onVisibility = null;
    this.onOnline = null;
  }

  private startPing() {
    this.stopPing();
    if (typeof window === 'undefined') return;
    // 25s 一次：房间保持活跃，同时在后台被节流时也不会积压太多消息。
    this.pingTimer = window.setInterval(() => {
      if (!this.code) return;
      if (this.signaling.open && this.signaling.lastPongAt && Date.now() - this.signaling.lastPongAt > 70_000) {
        // 房间还在但 pong 断了：半开连接，换新 WS + resume。
        this.forceReconnect();
        return;
      }
      this.signaling.ping();
    }, PING_INTERVAL_MS);
  }

  private stopPing() {
    if (this.pingTimer) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = 0;
    }
  }

  private armResumeWatchdog() {
    this.clearResumeWatchdog();
    this.resumeTimer = window.setTimeout(() => {
      this.resumeTimer = 0;
      if (!this.awaitingResume) return;
      // 服务端没有回 resumed（旧 socket 还占着 peer / 半开连接）：丢弃后走普通重连。
      this.awaitingResume = false;
      this.signaling.close();
      this.scheduleReconnect();
    }, RESUME_TIMEOUT_MS);
  }

  private clearResumeWatchdog() {
    if (this.resumeTimer) {
      window.clearTimeout(this.resumeTimer);
      this.resumeTimer = 0;
    }
  }

  private clearTimers() {
    if (this.retryTimer) {
      window.clearTimeout(this.retryTimer);
      this.retryTimer = 0;
    }
    this.stopPing();
    this.clearResumeWatchdog();
    this.awaitingResume = false;
  }

  /** 信令层的“致命关闭”：只有 room-closed / 恢复失败 / 主动离开才回大厅。 */
  private failClosed(message: string) {
    if (this.fatalClosed || this.userLeft) return;
    this.fatalClosed = true;
    this.connected = false;
    this.clearTimers();
    // 不能把半开 WS 留给调用方；main 的 dropToLobby 会再 leave 一次（幂等）。
    try { this.signaling.close(); } catch { /* ignore */ }
    this.emit({ type: 'closed', message });
  }

  /** 兼容旧字段：用户主动离开（main 的 leavingRef 流程）。 */
  private get userLeft() {
    return this.closed;
  }

  private onSignalEvent(e: SignalingEvent) {
    if (this.closed) return;
    this.log('signal-event', e.type, (e as any).peerId ?? (e as any).peer?.id ?? '');
    switch (e.type) {
      case 'created':
        this.awaitingResume = false;
        this.clearResumeWatchdog();
        this.code = e.code;
        this.peerId = e.peerId;
        this.hostId = e.hostId;
        if (e.resumeToken) this.resumeToken = e.resumeToken;
        this.emit({ type: 'code', code: e.code });
        break;
      case 'joined':
        this.awaitingResume = false;
        this.clearResumeWatchdog();
        this.code = e.code;
        this.peerId = e.peerId;
        this.hostId = e.hostId;
        this.peers = e.peers;
        if (e.resumeToken) this.resumeToken = e.resumeToken;
        this.emit({ type: 'code', code: e.code });
        this.emit({ type: 'peers', peers: this.peers });
        break;
      case 'resumed':
        this.awaitingResume = false;
        this.clearResumeWatchdog();
        this.reconnecting = false;
        this.reconnectAttempt = 0;
        this.code = e.code;
        this.peerId = e.peerId;
        this.hostId = e.hostId;
        this.peers = e.peers ?? [];
        if (e.resumeToken) this.resumeToken = e.resumeToken;
        this.emit({ type: 'status', message: '已恢复房间连接' });
        this.emit({ type: 'peers', peers: this.peers });
        if (this.role === 'host') this.rebuildHostLinks();
        break;
      case 'peer-joined':
        this.peers = [...this.peers.filter((peer) => peer.id !== e.peer.id), e.peer];
        this.emit({ type: 'peers', peers: this.peers });
        if (this.role === 'host' && typeof RTCPeerConnection === 'function') {
          void this.createHostOffer(e.peer.id).catch(error => this.onRtcError(e.peer.id, error));
        }
        break;
      case 'peer-offline':
        this.peers = this.peers.map((peer) => peer.id === e.peerId ? { ...peer, offline: true } : peer);
        this.emit({ type: 'peers', peers: this.peers });
        this.emit({ type: 'status', message: `${this.peerName(e.peerId)} 正在重连…` });
        break;
      case 'peer-online':
        this.peers = this.peers.some((peer) => peer.id === e.peer.id)
          ? this.peers.map((peer) => peer.id === e.peer.id ? { ...e.peer, offline: false } : peer)
          : [...this.peers, { ...e.peer, offline: false }];
        this.emit({ type: 'peers', peers: this.peers });
        this.emit({ type: 'status', message: `${e.peer.name} 已恢复连接` });
        if (this.role === 'host' && typeof RTCPeerConnection === 'function') this.scheduleHostOffer(e.peer.id);
        break;
      case 'peer-left':
        this.peers = this.peers.filter((p) => p.id !== e.peerId);
        this.dropLink(e.peerId);
        this.emit({ type: 'peers', peers: this.peers });
        break;
      case 'signal':
        if (typeof RTCPeerConnection === 'function' &&
            (this.role === 'guest' ? e.from === this.hostId : this.peers.some(peer => peer.id === e.from))) {
          void this.onPeerSignal(e.from, e.data).catch(error => this.onRtcError(e.from, error));
        }
        break;
      case 'relay':
        this.emit({ type: 'message', peerId: e.from, data: e.data });
        break;
      case 'room-closed':
        this.failClosed(e.reason);
        break;
      case 'error':
        if (e.code === 'resume_failed' || e.code === 'resume_expired' || e.code === 'session_taken_over') {
          this.failClosed(e.message || '恢复房间连接失败');
        } else {
          this.emit({ type: 'error', message: e.message });
        }
        break;
      case 'disconnected':
        if (this.fatalClosed) return;
        if (e.code === 4001) {
          this.failClosed('房间已关闭');
          return;
        }
        if (e.code === 4002) {
          this.failClosed('该房间会话已在另一个窗口恢复');
          return;
        }
        this.stopPing();
        this.scheduleReconnect();
        break;
    }
  }

  private peerName(id: string) {
    const peer = this.peers.find((entry) => entry.id === id);
    return peer?.name || id.slice(0, 6);
  }

  /* ----------------------------- P2P 恢复 ----------------------------- */

  /** 只有 game + state 两个数据通道都 open 才算健康的 P2P；单通道 open 仍会重协商。 */
  private linkFullyOpen(link: PeerLink) {
    return link.channel?.readyState === 'open' && link.stateChannel?.readyState === 'open';
  }

  /** 房主在恢复后为每个在线客机重建 P2P；两条数据通道都活着才保留。 */
  private rebuildHostLinks() {
    for (const peer of this.peers) {
      if (peer.id === this.peerId || peer.offline) continue;
      this.scheduleHostOffer(peer.id);
    }
  }

  private scheduleHostOffer(peerId: string) {
    const link = this.links.get(peerId);
    if (link && this.linkFullyOpen(link)) return;
    this.dropLink(peerId);
    window.setTimeout(() => {
      if (this.closed || this.fatalClosed) return;
      const peer = this.peers.find((entry) => entry.id === peerId);
      if (!peer || peer.offline) return;
      void this.createHostOffer(peerId).catch(error => this.onRtcError(peerId, error));
    }, 200);
  }

  private makeLink(peerId: string) {
    this.log('make-link', peerId);
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const link: PeerLink = { id: peerId, pc, channel: null,stateChannel:null, pendingIce: [], remoteSet: false };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.log('ice-out', peerId, ev.candidate.type, ev.candidate.protocol, ev.candidate.candidate);
        this.signaling.signal(peerId, { kind: 'ice', candidate: ev.candidate.toJSON() });
      }
    };
    pc.oniceconnectionstatechange = () => this.log('ice-state', peerId, pc.iceConnectionState);
    pc.onconnectionstatechange = () => {
      this.log('pc-state', peerId, pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.emit({ type: 'status', message: `peer ${peerId.slice(0, 6)} ${pc.connectionState}` });
      }
    };
    this.links.set(peerId, link);
    return link;
  }

  private onRtcError(peerId: string, error: unknown) {
    this.log('rtc-failed; using signaling relay', peerId, error);
    this.dropLink(peerId);
  }

  private attachChannel(link: PeerLink, channel: RTCDataChannel) {
    if(channel.label==='state')link.stateChannel=channel;else link.channel=channel;
    channel.onopen = () => {
      this.log('dc-open', link.id);
      this.connected = true;
      this.emit({ type: 'connected', peerId: link.id });
      this.emit({ type: 'status', message: 'P2P connected' });
    };
    channel.onclose = () => {
      this.log('dc-close', link.id);
      this.connected = false;
      this.emit({ type: 'status', message: 'P2P closed' });
    };
    channel.onmessage = (ev) => {
      try {
        this.emit({ type: 'message', peerId: link.id, data: JSON.parse(String(ev.data)) });
      } catch { /* ignore */ }
    };
  }

  private async createHostOffer(peerId: string) {
    this.log('create-offer', peerId);
    // 同一个 peer 只保留一条 pc，避免重连时泄漏旧连接。
    if (this.links.has(peerId)) this.dropLink(peerId);
    const link = this.makeLink(peerId);
    const channel = link.pc.createDataChannel('game', { ordered: true });
    this.attachChannel(link, channel);
    this.attachChannel(link,link.pc.createDataChannel('state',{ordered:false,maxRetransmits:0}));
    const offer = await link.pc.createOffer();
    await link.pc.setLocalDescription(offer);
    this.log('offer-sent', peerId);
    this.signaling.signal(peerId, { kind: 'offer', sdp: link.pc.localDescription });
  }

  private async onPeerSignal(from: string, data: unknown) {
    const msg = data as { kind?: string; sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    if (!msg || !msg.kind) return;
    let link = this.links.get(from);
    this.log('peer-signal', from, msg.kind);
    if (msg.kind === 'offer' && this.role === 'guest') {
      // 重连后房主会重新发 offer：只有 game + state 两条 DC 都 open 才忽略，
      // 否则（connecting / 单通道 open / 旧链接已死）丢掉旧 link 重新协商。
      if (link && this.linkFullyOpen(link)) return;
      if (link) this.dropLink(from);
      link = this.makeLink(from);
      link.pc.ondatachannel = (ev) => this.attachChannel(link!, ev.channel);
      await link.pc.setRemoteDescription(msg.sdp!);
      link.remoteSet = true;
      for (const c of link.pendingIce.splice(0)) await this.addIce(link, c);
      const answer = await link.pc.createAnswer();
      await link.pc.setLocalDescription(answer);
      this.log('answer-sent', from);
      this.signaling.signal(from, { kind: 'answer', sdp: link.pc.localDescription });
      return;
    }
    if (msg.kind === 'answer' && link && this.role === 'host') {
      await link.pc.setRemoteDescription(msg.sdp!);
      link.remoteSet = true;
      for (const c of link.pendingIce.splice(0)) await this.addIce(link, c);
      return;
    }
    if (msg.kind === 'ice' && msg.candidate) {
      // An ICE candidate can be signaled before the SDP offer.
      if (!link && this.role === 'guest') link = this.makeLink(from);
      if (!link) return;
      if (link.remoteSet) await this.addIce(link, msg.candidate);
      else link.pendingIce.push(msg.candidate);
    }
  }

  private async addIce(link: PeerLink, candidate: RTCIceCandidateInit) {
    try { await link.pc.addIceCandidate(candidate); }
    catch (error) { this.log('ice-candidate-rejected', link.id, error); }
  }

  private dropLink(peerId: string) {
    const link = this.links.get(peerId);
    if (!link) return;
    try { link.stateChannel?.close();link.channel?.close(); } catch { /* ignore */ }
    try { link.pc.close(); } catch { /* ignore */ }
    this.links.delete(peerId);
  }
}
