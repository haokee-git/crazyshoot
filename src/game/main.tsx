import { BUILD_ID, MAP_REVISION } from '../version';
import { textureResolution } from '../content/materials/battlefield';
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { GameEngine, type HudState } from './engine';
import { GameSettings } from './ui/settings';
import { GameHud } from './ui/hud';
import { Lobby, RoomScreen, type RoomState, type Team } from './ui/lobby';
import { PrematchOverlay } from '../ui/prematch/PrematchOverlay';
import { DEFAULT_LOADOUT, type LoadoutSelection } from '../content/weapons/catalog';
import { NetworkSession, type NetEvent, type NetRole } from '../network/session';
import type { PeerInfo } from '../network/signaling';
import { MAPS } from '../maps';
import { DEFAULT_MATCH_SECONDS, clampMatchSeconds, matchMinutes, matchSecondsForMap } from './core/match-time';
import '../preview/prematch.css';
import './ui/game.css';
import { nextPaint, preloadWorld, prepareTerrain, type LoadProgress } from './core/loading';
import { checkWebGL2 } from './core/resources';

const initialHud: HudState = {
  phase: 'prep', canStart: false, multiplayer: false, ads: false, caliber: '5.56', vehicle: null,
  overlayOpen: true,
  prepSeconds: 20,
  armed: false,
  ammo: 30,
  reserve: 120,
  reloading: false,
  health: 100,
  protectionSeconds: 0,
  hurtFlash: 0,
  burnBlind: 0,
  paused: false,
  pointerLocked: false,
  score: 0,
  hitmarker: false,
  banner: false,
  weaponName: 'M16A4',
  message: '',
  team: 'blue',
  blueScore: 0,
  orangeScore: 0,
  killFeed: [],
  captures: [],
  scoreMax: 1000,
  mapName: '训练场',
  driving: false,
  vehiclePrompt: '',
  dead: false,
  respawnSeconds: 0,
  respawnChoice: 'base',
  respawnOptions: [],
  matchSeconds: DEFAULT_MATCH_SECONDS,
  winner: '',
  inWater: false,
  underwater: false,
  scope: 1,
  events: [],
  minimap: { x: 0, z: 24, yaw: 0, others: [], caps: [], vehicles: [], crates: [], worldSize: 64, minX: -32, minZ: -32 },
};

const MIN_PER_TEAM = 4;
const MAX_PER_TEAM = 100;
const DEFAULT_PER_TEAM = 8;

type Screen = 'lobby' | 'room' | 'game';

interface MatchMeta {
  map: string;
  maxPerTeam: number;
  aiFill: boolean;
  teams: Record<string, Team>;
  matchSeconds: number;
}

interface MatchStart {
  t: 'start';
  buildId: string;
  mapRevision: string;
  matchId: string;
  map: string;
  /** 每侧最大人数（4..30）。 */
  size: number;
  prep: number;
  bots: boolean;
  teams: Record<string, Team>;
  matchSeconds: number;
}

function toggleFullscreen() {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void; webkitRequestFullScreen?: () => void };
  try {
    const current = document.fullscreenElement || (document as any).webkitFullscreenElement;
    if (current) {
      (document.exitFullscreen?.() ?? (document as any).webkitExitFullscreen?.())?.catch?.(() => {});
      return;
    }
    if (el.requestFullscreen) void el.requestFullscreen().catch(() => {});
    else (el.webkitRequestFullscreen ?? el.webkitRequestFullScreen)?.call(el);
  } catch { /* Safari may refuse outside a gesture */ }
}

function newMatchId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function clampPerTeam(value: unknown) {
  const n = Number(value);
  return Math.max(MIN_PER_TEAM, Math.min(MAX_PER_TEAM, Math.floor(Number.isFinite(n) ? n : DEFAULT_PER_TEAM)));
}

function randomName() {
  return `PILOT-${Math.floor(100 + Math.random() * 900)}`;
}

function initialName() {
  const saved = localStorage.getItem('crazyshoot.name');
  if (saved) return saved;
  const name = randomName();
  try { localStorage.setItem('crazyshoot.name', name); } catch { /* ignore */ }
  return name;
}

/** 把信令/服务端的关闭原因翻成玩家能看懂的一句话。 */
function closedReasonText(reason?: string) {
  switch (reason) {
    case 'host-left': return '房主解散了房间';
    case 'host-timeout': return '房主长时间离线，房间已关闭';
    case 'idle-timeout': return '房间长时间无活动，已关闭';
    case 'server-shutdown': return '信令服务器重启，房间已关闭';
    default: return reason && reason !== 'closed' && reason !== 'signaling closed' ? reason : '房间已关闭或连接断开';
  }
}

function sanitizeRoom(raw: any): RoomState | null {
  if (!raw || typeof raw !== 'object') return null;
  const players: RoomState['players'] = Array.isArray(raw.players)
    ? raw.players
      .filter((player: any) => player && typeof player.id === 'string' && typeof player.name === 'string'
        && (player.team === 'blue' || player.team === 'orange'))
      .slice(0, 60)
      .map((player: any) => ({ id: player.id, name: String(player.name).slice(0, 24), team: player.team as Team, host: !!player.host }))
    : [];
  if (!players.length) return null;
  return {
    code: typeof raw.code === 'string' ? raw.code : '',
    hostId: typeof raw.hostId === 'string' ? raw.hostId : '',
    map: typeof raw.map === 'string' ? raw.map : 'docks',
    maxPerTeam: clampPerTeam(raw.maxPerTeam),
    matchSeconds: clampMatchSeconds(raw.matchSeconds, typeof raw.map === 'string' ? raw.map : 'docks'),
    aiFill: raw.aiFill !== false,
    players,
    phase: raw.phase === 'started' ? 'started' : 'room',
  };
}

function GameApp() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const netRef = useRef<NetworkSession | null>(null);
  const [screen, setScreen] = useState<Screen>('lobby');
  const screenRef = useRef<Screen>('lobby');
  const [hud, setHud] = useState<HudState>(initialHud);
  const [selection, setSelection] = useState<LoadoutSelection>(DEFAULT_LOADOUT);
  const [role, setRole] = useState<NetRole | null>(null);
  const roleRef = useRef<NetRole | null>(null);
  const [code, setCode] = useState('');
  const codeRef = useRef('');
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const peersRef = useRef<PeerInfo[]>([]);
  const [room, setRoom] = useState<RoomState | null>(null);
  const roomRef = useRef<RoomState | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<LoadProgress>({ percent: 0, stage: '准备加载', completed: 0, total: 1 });
  const [attempt, setAttempt] = useState(0);
  const [postMatchSeconds, setPostMatchSeconds] = useState<number | null>(null);
  const matchRef = useRef('solo');
  const matchStartRef = useRef<MatchStart | null>(null);
  const matchMetaRef = useRef<MatchMeta | null>(null);
  const pendingRef = useRef<{ data: unknown; peerId?: string }[]>([]);
  const retryTimer = useRef(0);
  const leavingRef = useRef(false);
  const nameRef = useRef(initialName());
  const [fault, setFault] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mapId, setMapId] = useState<string>(() => new URLSearchParams(location.search).get('map') || 'docks');
  const mapIdRef = useRef(mapId);
  const [maxPerTeam, setMaxPerTeam] = useState<number>(() => clampPerTeam(Number(new URLSearchParams(location.search).get('size')) || DEFAULT_PER_TEAM));
  const maxPerTeamRef = useRef(maxPerTeam);
  const [aiFill, setAiFill] = useState<boolean>(() => new URLSearchParams(location.search).get('bots') !== '0');
  const aiFillRef = useRef(aiFill);
  const [matchSeconds, setMatchSeconds] = useState<number>(() => matchSecondsForMap(new URLSearchParams(location.search).get('map') || 'docks'));
  const matchSecondsRef = useRef(matchSeconds);
  const teamsRef = useRef<Record<string, Team>>({});
  const auditMode = new URLSearchParams(location.search).get('audit') === '1';
  const mapOptions = MAPS.map((entry) => ({ id: entry.id, name: entry.name, nameEn: entry.nameEn }));
  const returnToRoomRef = useRef<() => void>(() => {});

  useEffect(() => {
    const onErr = (event: ErrorEvent) => setFault(String(event.message || '脚本错误'));
    const onRej = (event: PromiseRejectionEvent) => setFault(String((event.reason as any)?.message || event.reason || '异步错误'));
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRej);
    return () => { window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onRej); };
  }, []);

  const setScreenSafe = (next: Screen) => { screenRef.current = next; setScreen(next); };
  const setMapSafe = (id: string) => { mapIdRef.current = id; setMapId(id); };
  const setMaxSafe = (value: number) => { const next = clampPerTeam(value); maxPerTeamRef.current = next; setMaxPerTeam(next); };
  const setAiSafe = (value: boolean) => { aiFillRef.current = value; setAiFill(value); };
  const setMatchSecondsSafe = (value: number) => { const next = clampMatchSeconds(value); matchSecondsRef.current = next; setMatchSeconds(next); };
  const setRoomSafe = (next: RoomState | null) => { roomRef.current = next; setRoom(next); };

  /* ----------------------------- 房间状态（host 权威） ----------------------------- */

  const hostRoster = () => {
    const session = netRef.current;
    if (!session) return [] as RoomState['players'];
    const hostId = session.peerId;
    return [
      { id: hostId, name: nameRef.current, host: true },
      ...peersRef.current.filter((peer) => peer.id !== hostId).map((peer) => ({ id: peer.id, name: peer.name, host: false })),
    ];
  };

  const ensureTeams = (roster: { id: string }[]) => {
    const teams = teamsRef.current;
    const ids = new Set(roster.map((player) => player.id));
    for (const id of Object.keys(teams)) if (!ids.has(id)) delete teams[id];
    for (const player of roster) {
      if (teams[player.id] === 'blue' || teams[player.id] === 'orange') continue;
      const blue = roster.filter((entry) => teams[entry.id] === 'blue').length;
      const orange = roster.filter((entry) => teams[entry.id] === 'orange').length;
      teams[player.id] = blue <= orange ? 'blue' : 'orange';
    }
  };

  const buildHostRoom = (phase: 'room' | 'started' = 'room'): RoomState | null => {
    const session = netRef.current;
    if (!session || session.role !== 'host') return null;
    const roster = hostRoster();
    ensureTeams(roster);
    const players = roster.map((player) => ({ ...player, team: teamsRef.current[player.id] as Team }));
    return {
      code: session.code || codeRef.current,
      hostId: session.peerId,
      map: mapIdRef.current,
      maxPerTeam: maxPerTeamRef.current,
      matchSeconds: matchSecondsRef.current,
      aiFill: aiFillRef.current,
      players,
      phase,
    };
  };

  /** 比赛中不广播 room（否则客机会被判回房）；其他时间 host 全量广播。 */
  const publishRoom = (phase: 'room' | 'started' = 'room') => {
    if (roleRef.current !== 'host') return;
    if (screenRef.current === 'game') return;
    const next = buildHostRoom(phase);
    if (!next) return;
    setRoomSafe(next);
    netRef.current?.send({ t: 'room', room: next });
  };

  const applyGuestRoom = (next: RoomState) => {
    setRoomSafe(next);
    setMatchSecondsSafe(next.matchSeconds);
    setStatus(`房间 ${next.code} · ${next.players.length}/${next.maxPerTeam * 2} 人`);
    setError('');
    if (screenRef.current === 'game' && next.phase === 'room') { returnToRoom(); return; }
    if (screenRef.current === 'lobby') setScreenSafe('room');
  };

  const syncWorldUrl = (meta: MatchMeta) => {
    const url = new URL(location.href);
    if (meta.map === 'training') url.searchParams.delete('map');
    else url.searchParams.set('map', meta.map);
    url.searchParams.set('size', String(meta.maxPerTeam));
    url.searchParams.set('bots', meta.aiFill ? '1' : '0');
    const prep = Math.max(2, Number(new URLSearchParams(location.search).get('prep') || 20));
    url.searchParams.set('prep', String(prep));
    if (meta.matchSeconds !== matchSecondsForMap(meta.map)) url.searchParams.set('time', String(matchMinutes(meta.matchSeconds)));
    else url.searchParams.delete('time');
    history.replaceState(null, '', url);
  };

  /* ----------------------------- 网络事件 ----------------------------- */

  const dropToLobby = (message: string) => {
    window.clearInterval(retryTimer.current);
    pendingRef.current = [];
    leavingRef.current = true;
    try { netRef.current?.leave(); } catch { /* ignore */ }
    netRef.current = null;
    roleRef.current = null;
    setRole(null);
    codeRef.current = '';
    setCode('');
    peersRef.current = [];
    setPeers([]);
    setConnected(false);
    setRoomSafe(null);
    teamsRef.current = {};
    setError(message);
    setStatus('');
    setLoading(false);
    setFault('');
    setHud(initialHud);
    setPostMatchSeconds(null);
    matchStartRef.current = null;
    setScreenSafe('lobby');
  };

  const handleNet = (event: NetEvent) => {
    switch (event.type) {
      case 'code': {
        codeRef.current = event.code || '';
        setCode(codeRef.current);
        setError('');
        if (roleRef.current === 'host') {
          netRef.current?.setCapacity(maxPerTeamRef.current * 2);
          setScreenSafe('room');
          setStatus('房间已创建，等待玩家加入…');
          publishRoom();
        } else {
          setScreenSafe('room');
          setStatus('已加入房间，等待房主同步…');
          netRef.current?.send({ t: 'roomAsk' });
        }
        break;
      }
      case 'peers': {
        const next = event.peers ?? [];
        peersRef.current = next;
        setPeers(next);
        engineRef.current?.syncPeers(next);
        if (roleRef.current === 'host') {
          if (screenRef.current === 'room') publishRoom();
          else if (screenRef.current === 'game') {
            if (matchStartRef.current) netRef.current?.send(matchStartRef.current);
          } else {
            ensureTeams(hostRoster());
          }
        }
        break;
      }
      case 'connected':
        setConnected(true);
        setStatus('P2P 已连接');
        if (roleRef.current === 'host') {
          if (screenRef.current === 'room') publishRoom();
          else if (screenRef.current === 'game' && matchStartRef.current) netRef.current?.send(matchStartRef.current);
        } else if (roleRef.current === 'guest' && screenRef.current === 'room') {
          netRef.current?.send({ t: 'roomAsk' });
        }
        break;
      case 'status':
        setStatus(event.message || '');
        break;
      case 'reconnecting':
        // 信令断线/后台冻结：保留房间与 P2P，只在状态栏提示，不回大厅。
        setConnected(false);
        setError('');
        setStatus(event.message || '信令连接中断，正在重连…');
        break;
      case 'error': {
        const message = String(event.message || '网络错误');
        setError(message.includes('满') ? '无法加入：房间已满' : message);
        setStatus('连接失败');
        if (roleRef.current === 'guest' && !codeRef.current) {
          try { netRef.current?.close(); } catch { /* ignore */ }
          netRef.current = null;
          roleRef.current = null;
          setRole(null);
          setScreenSafe('lobby');
        }
        break;
      }
      case 'closed': {
        setConnected(false);
        if (leavingRef.current) { leavingRef.current = false; break; }
        dropToLobby(closedReasonText(event.message));
        break;
      }
      case 'message': {
        const msg = event.data as any;
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'room') {
          if (roleRef.current !== 'guest' || event.peerId !== netRef.current?.hostId) return;
          const next = sanitizeRoom(msg.room);
          if (next) applyGuestRoom(next);
          return;
        }
        if (msg.t === 'roomClosed') {
          if (roleRef.current === 'guest') dropToLobby(typeof msg.reason === 'string' ? msg.reason : '房主解散了房间');
          return;
        }
        if (msg.t === 'roomAsk') {
          if (roleRef.current === 'host') publishRoom();
          return;
        }
        if (msg.t === 'start') {
          if (roleRef.current !== 'guest' || event.peerId !== netRef.current?.hostId) return;
          if (msg.buildId !== BUILD_ID || msg.mapRevision !== MAP_REVISION) {
            setError('房主与本机的游戏资源版本不同，请双方刷新后重新创建房间。');
            setLoading(false);
            return;
          }
          if (typeof msg.matchId !== 'string' || matchRef.current === msg.matchId) return;
          const teams: Record<string, Team> = {};
          if (msg.teams && typeof msg.teams === 'object') {
            for (const [id, team] of Object.entries(msg.teams)) if (team === 'blue' || team === 'orange') teams[id] = team;
          }
          const meta: MatchMeta = {
            map: typeof msg.map === 'string' ? msg.map : 'docks',
            maxPerTeam: clampPerTeam(msg.size),
            aiFill: !!msg.bots,
            teams,
            matchSeconds: clampMatchSeconds(msg.matchSeconds, typeof msg.map === 'string' ? msg.map : 'docks'),
          };
          matchMetaRef.current = meta;
          matchRef.current = msg.matchId;
          setMapSafe(meta.map);
          setMaxSafe(meta.maxPerTeam);
          setAiSafe(meta.aiFill);
          syncWorldUrl(meta);
          setHud(initialHud);
          setLoading(true);
          setFault('');
          setProgress({ percent: 0, stage: '准备加载', completed: 0, total: 1 });
          setPostMatchSeconds(null);
          setStatus('比赛开始');
          setScreenSafe('game');
          setAttempt((n) => n + 1);
          return;
        }
        if (engineRef.current) engineRef.current.receiveNet(event.data, event.peerId);
        else {
          if (pendingRef.current.length >= 100) pendingRef.current.shift();
          pendingRef.current.push({ data: event.data, peerId: event.peerId });
        }
        break;
      }
    }
  };

  const makeSession = (opts: { role: NetRole; name: string; code?: string }) => {
    leavingRef.current = false;
    netRef.current?.close();
    const useTurn = new URLSearchParams(location.search).get('turn') === '1';
    const iceServers = useTurn
      ? [{ urls: 'turn:127.0.0.1:3478', username: 'crazyshoot', credential: 'test' }]
      : [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
    const session = new NetworkSession({
      ...opts,
      iceServers,
      maxPeers: opts.role === 'host' ? maxPerTeamRef.current * 2 : undefined,
    }, handleNet);
    netRef.current = session;
    roleRef.current = opts.role;
    setRole(opts.role);
    codeRef.current = '';
    setCode('');
    peersRef.current = [];
    setPeers([]);
    setConnected(false);
    setRoomSafe(null);
    teamsRef.current = {};
    setError('');
    setStatus(opts.role === 'host' ? '创建房间…' : '连接房间…');
    setScreenSafe('lobby');
    session.start().catch((err) => {
      setError(String(err?.message || err));
      setStatus('信令连接失败');
    });
  };

  /* ----------------------------- 开始/返回 ----------------------------- */

  const startMatch = () => {
    if (roleRef.current !== 'host') return;
    const session = netRef.current;
    if (!session) return;
    const current = buildHostRoom('room');
    if (!current) return;
    const teams: Record<string, Team> = {};
    for (const player of current.players) teams[player.id] = player.team;
    const meta: MatchMeta = {
      map: mapIdRef.current,
      maxPerTeam: maxPerTeamRef.current,
      aiFill: aiFillRef.current,
      teams,
      matchSeconds: matchSecondsRef.current,
    };
    matchMetaRef.current = meta;
    matchRef.current = newMatchId();
    const prep = Math.max(2, Number(new URLSearchParams(location.search).get('prep') || 20));
    const startMsg: MatchStart = {
      t: 'start', buildId: BUILD_ID, mapRevision: MAP_REVISION, matchId: matchRef.current,
      map: meta.map, size: meta.maxPerTeam, bots: meta.aiFill, teams, prep, matchSeconds: meta.matchSeconds,
    };
    matchStartRef.current = startMsg;
    session.send(startMsg);
    syncWorldUrl(meta);
    setHud(initialHud);
    setLoading(true);
    setFault('');
    setProgress({ percent: 0, stage: '准备加载', completed: 0, total: 1 });
    setPostMatchSeconds(null);
    setStatus('比赛开始');
    setScreenSafe('game');
    setAttempt((n) => n + 1);
    window.clearInterval(retryTimer.current);
    retryTimer.current = window.setInterval(() => {
      if ((engineRef.current as any)?.worldReady) { window.clearInterval(retryTimer.current); return; }
      session.send(startMsg);
    }, 500);
  };

  const startSolo = () => {
    leavingRef.current = false;
    window.clearInterval(retryTimer.current);
    try { netRef.current?.close(); } catch { /* ignore */ }
    netRef.current = null;
    roleRef.current = null;
    setRole(null);
    peersRef.current = [];
    setPeers([]);
    setRoomSafe(null);
    const params = new URLSearchParams(location.search);
    const meta: MatchMeta = {
      map: params.get('map') || 'training',
      maxPerTeam: clampPerTeam(Number(params.get('size')) || DEFAULT_PER_TEAM),
      aiFill: params.get('bots') !== '0',
      teams: {},
      matchSeconds: (() => {
        const minutes = Number(params.get('time'));
        return Number.isFinite(minutes) && minutes > 0 ? clampMatchSeconds(minutes * 60) : matchSecondsForMap(params.get('map') || 'training');
      })(),
    };
    matchMetaRef.current = meta;
    matchRef.current = 'solo';
    matchStartRef.current = null;
    syncWorldUrl(meta);
    setHud(initialHud);
    setLoading(true);
    setFault('');
    setProgress({ percent: 0, stage: '准备加载', completed: 0, total: 1 });
    setPostMatchSeconds(null);
    setScreenSafe('game');
    setAttempt((n) => n + 1);
  };

  /** 赛后/中途返回房间：销毁本局 engine（由 screen 切换触发 cleanup），保留 session 与房间状态。 */
  const returnToRoom = () => {
    window.clearInterval(retryTimer.current);
    pendingRef.current = [];
    matchStartRef.current = null;
    setLoading(false);
    setFault('');
    setHud(initialHud);
    setPostMatchSeconds(null);
    setStatus(roleRef.current === 'host' ? '已返回房间，可再次开始' : '已返回房间，等待房主');
    setScreenSafe('room');
    publishRoom();
  };
  returnToRoomRef.current = returnToRoom;

  /** 回大厅：host 先广播 roomClosed 再断开；客机直接离房。 */
  const returnToLobby = () => {
    window.clearInterval(retryTimer.current);
    pendingRef.current = [];
    leavingRef.current = true;
    const session = netRef.current;
    if (session) {
      try {
        if (session.role === 'host') session.send({ t: 'roomClosed', reason: '房主解散了房间' });
      } catch { /* ignore */ }
      // 留一点时间把 roomClosed 发出去，再断开信令/房间。
      window.setTimeout(() => { try { session.leave(); } catch { /* ignore */ } }, session.role === 'host' ? 150 : 0);
    }
    netRef.current = null;
    roleRef.current = null;
    setRole(null);
    codeRef.current = '';
    setCode('');
    peersRef.current = [];
    setPeers([]);
    setConnected(false);
    setRoomSafe(null);
    teamsRef.current = {};
    setLoading(false);
    setFault('');
    setHud(initialHud);
    setPostMatchSeconds(null);
    setError('');
    setStatus('');
    matchStartRef.current = null;
    matchMetaRef.current = null;
    setScreenSafe('lobby');
  };

  /* ----------------------------- 房间设置操作（host） ----------------------------- */

  const changeMap = (id: string) => {
    if (roleRef.current !== 'host') return;
    // Default follows the map. If the host explicitly customized the duration,
    // keep it across map switches instead of silently resetting their choice.
    const wasDefault = matchSecondsRef.current === matchSecondsForMap(mapIdRef.current);
    setMapSafe(id);
    if (wasDefault) setMatchSecondsSafe(matchSecondsForMap(id));
    setError('');
    publishRoom();
  };
  const changeTime = (seconds: number) => {
    if (roleRef.current !== 'host') return;
    setMatchSecondsSafe(seconds);
    setError('');
    publishRoom();
  };
  const changeMax = (value: number) => {
    if (roleRef.current !== 'host') return;
    setMaxSafe(value);
    netRef.current?.setCapacity(maxPerTeamRef.current * 2);
    setError('');
    publishRoom();
  };
  const changeAi = (value: boolean) => {
    if (roleRef.current !== 'host') return;
    setAiSafe(value);
    publishRoom();
  };
  const movePlayer = (id: string, team: Team) => {
    if (roleRef.current !== 'host') return;
    const current = roomRef.current;
    const player = current?.players.find((entry) => entry.id === id);
    if (!current || !player || player.team === team) return;
    if (current.players.filter((entry) => entry.team === team).length >= current.maxPerTeam) {
      setError('该阵营已满，无法移动');
      return;
    }
    teamsRef.current[id] = team;
    setError('');
    publishRoom();
  };

  /* ----------------------------- 引擎装载 ----------------------------- */

  useEffect(() => {
    if (screen !== 'game' || !hostRef.current) return;
    let cancelled = false;
    let engine: GameEngine | undefined;
    const abort = new AbortController();
    setLoading(true);
    setFault('');
    setProgress({ percent: 0, stage: '准备加载', completed: 0, total: 1 });
    setHud(initialHud);
    void (async () => {
      try {
        await nextPaint(); if (cancelled) return; checkWebGL2();
        const params = new URLSearchParams(location.search);
        const res = textureResolution(params.get('res') ?? localStorage.getItem('crazyshoot.textureRes'));
        const sky = params.get('sky') || 'noon';
        const meta = matchMetaRef.current;
        const mapProfile = meta?.map ?? (params.get('map') || 'training');
        const definition = MAPS.find((entry) => entry.id === mapProfile);
        const teamSize = meta?.maxPerTeam ?? clampPerTeam(Number(params.get('size')) || DEFAULT_PER_TEAM);
        const aiFill = meta?.aiFill ?? (params.get('bots') !== '0');
        const matchSeconds = meta?.matchSeconds ?? matchSecondsForMap(mapProfile);
        await preloadWorld(res, sky, (p) => { if (!cancelled) setProgress(p); }, !!definition, definition?.assetBundle);
        if (cancelled) return;
        let terrain;
        if (definition) {
          setProgress({ percent: 62, stage: '生成 Minecraft 方块场景', completed: 0, total: 1 });
          terrain = await prepareTerrain(definition, abort.signal, (p) => { if (!cancelled) setProgress(p); });
          if (cancelled) return;
          setProgress({ percent: 70, stage: '地形数据已就绪', completed: 1, total: 1 });
          (window as any).__terrainStats = {
            buildMs: terrain?.buildMs ?? null,
            voxels: terrain?.voxels?.byteLength ?? null,
            chunks: terrain?.chunks?.length ?? null,
            navLayers: terrain?.navLayers ?? null,
          };
        }
        await nextPaint(); if (cancelled) return;
        engine = new GameEngine(hostRef.current!, { onHud: setHud, onError: setFault, onLoading: setProgress }, {
          net: netRef.current ?? undefined,
          bots: aiFill,
          name: nameRef.current,
          matchId: matchRef.current,
          terrain,
          teamSize,
          teams: meta?.teams,
          aiFill,
          matchSeconds,
        });
        engine.setLoadout(selection);
        engineRef.current = engine;
        (window as any).__game = engine;
        for (const event of pendingRef.current.splice(0)) engine.receiveNet(event.data, event.peerId);
        await engine.ready; if (cancelled) return;
        setProgress({ percent: 100, stage: '场景已就绪', completed: 1, total: 1 });
        await nextPaint();
        if (!cancelled) { setLoading(false); engine.activate(); }
      } catch (err) {
        if (!cancelled) setFault(String((err as Error)?.message || err));
      }
    })();
    return () => {
      cancelled = true;
      abort.abort();
      engine?.dispose();
      engineRef.current = null;
      (window as any).__game = undefined;
    };
  }, [screen, attempt]);

  useEffect(() => {
    if (screen !== 'game') return;
    const onFullscreen = () => {
      if (!document.fullscreenElement && !(document as Document & { webkitFullscreenElement?: Element }).webkitFullscreenElement) {
        engineRef.current?.pauseAfterFullscreenExit();
      }
    };
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('webkitfullscreenchange', onFullscreen);
    return () => { document.removeEventListener('fullscreenchange', onFullscreen); document.removeEventListener('webkitfullscreenchange', onFullscreen); };
  }, [screen]);

  useEffect(() => {
    if (screen !== 'game') return;
    // 只做“退出确认”：默认键位保持原样（静步/下潜仍是 Ctrl）。
    // Ctrl/Cmd+W 是浏览器保留快捷键，页面无法可靠拦截，因此不抢键盘事件。
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (auditMode) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [screen, auditMode]);

  // 真正关闭/刷新标签页时主动 leave：服务端的 3 分钟断线宽限是给“切后台”用的，
  // 不能让一个已经退出的玩家在房主名单里挂 3 分钟。pagehide 不区分后台切换。
  useEffect(() => {
    const onPageHide = (event: PageTransitionEvent) => {
      if (event.persisted || leavingRef.current) return;
      const session = netRef.current;
      if (!session || !roleRef.current) return;
      try { session.leave(); } catch { /* ignore */ }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.code !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault(); event.stopImmediatePropagation(); setSettingsOpen(false);
    };
    window.addEventListener('keydown', close, true);
    return () => window.removeEventListener('keydown', close, true);
  }, [settingsOpen]);

  // 赛后：5s 自动返回房间（客机跟房主 room 广播；这里作为兜底）。
  useEffect(() => {
    if (screen !== 'game' || !hud.winner) { setPostMatchSeconds(null); return; }
    setPostMatchSeconds(5);
    const timer = window.setInterval(() => {
      setPostMatchSeconds((seconds) => {
        if (seconds === null) return null;
        if (seconds <= 1) { window.clearInterval(timer); returnToRoomRef.current(); return null; }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [screen, hud.winner]);

  const retryGame = () => {
    const session = netRef.current;
    if (session?.role === 'host') {
      const meta = matchMetaRef.current;
      if (meta) {
        matchRef.current = newMatchId();
        const prep = Math.max(2, Number(new URLSearchParams(location.search).get('prep') || 20));
        const msg: MatchStart = {
          t: 'start', buildId: BUILD_ID, mapRevision: MAP_REVISION, matchId: matchRef.current,
          map: meta.map, size: meta.maxPerTeam, bots: meta.aiFill, teams: meta.teams, prep, matchSeconds: meta.matchSeconds,
        };
        matchStartRef.current = msg;
        session.send(msg);
        window.clearInterval(retryTimer.current);
        retryTimer.current = window.setInterval(() => {
          if ((engineRef.current as any)?.worldReady) { window.clearInterval(retryTimer.current); return; }
          session.send(msg);
        }, 500);
      }
    }
    setAttempt((n) => n + 1);
  };

  const onChange = (next: LoadoutSelection) => {
    setSelection(next);
    engineRef.current?.setLoadout(next);
  };
  const openSettings = () => setSettingsOpen(true);
  const settings = settingsOpen && <div class="pause-backdrop settings-backdrop"><GameSettings
    lightingStatus={() => engineRef.current?.lightingStatus ?? ''}
    onClose={() => setSettingsOpen(false)}
    onGraphics={() => engineRef.current?.applyGraphics()}
    onTexture={async (res) => { await engineRef.current?.setTextureResolution(res); }}
    onFullscreen={toggleFullscreen}
    onBindings={() => engineRef.current?.reloadBindings()}
  /></div>;

  if (screen === 'lobby') {
    return (
      <>
        <Lobby
          connected={connected}
          status={status}
          error={error}
          auditMode={auditMode}
          onSolo={auditMode ? startSolo : undefined}
          onName={(name) => { nameRef.current = name; try { localStorage.setItem('crazyshoot.name', name); } catch { /* ignore */ } }}
          onCreate={(name) => makeSession({ role: 'host', name })}
          onJoin={(name, joinCode) => makeSession({ role: 'guest', name, code: joinCode })}
          onSettings={openSettings}
        />
        {settings}
      </>
    );
  }

  if (screen === 'room') {
    return (
      <>
        <RoomScreen
          role={role ?? 'guest'}
          room={room}
          maps={mapOptions}
          connected={connected}
          status={status}
          error={error}
          onMap={changeMap}
          onMax={changeMax}
          onAi={changeAi}
          onTime={changeTime}
          onMove={movePlayer}
          onStart={startMatch}
          onLeave={returnToLobby}
          onDissolve={returnToLobby}
          onSettings={openSettings}
        />
        {settings}
      </>
    );
  }

  return (
    <>
      <div id="game-host" ref={hostRef} />
      {loading && <div class="game-loading"><div class="game-loading-mark">CRAZYSHOOT</div><div>{progress.stage} · {progress.completed}/{progress.total}</div><strong>{progress.percent}%</strong><progress max="100" value={progress.percent} /></div>}
      {fault && <div class="game-fault"><p>{fault}</p><button onClick={retryGame}>重试本局</button><button onClick={openSettings}>设置</button><button onClick={() => returnToLobby()}>返回大厅</button></div>}
      {!loading && !fault && hud.paused && !settingsOpen && (
        <div class="pause-backdrop">
          <section class="settings-panel pause-menu" role="dialog" aria-modal="true" aria-label="暂停菜单">
            <small>对局仍在进行 · Safari 全屏中可按 P 打开菜单</small>
            <h2>暂停菜单</h2>
            <button onClick={() => engineRef.current?.resumeLocal()}>继续游戏</button>
            <button onClick={() => setSettingsOpen(true)}>设置</button>
            {hud.phase === 'prep' && hud.canStart && <button onClick={() => { engineRef.current?.forceStart(); engineRef.current?.resumeLocal(); }}>跳过整备</button>}
            {hud.phase === 'live' && !hud.dead && !hud.winner && <button onClick={() => engineRef.current?.suicide()}>自杀并重新部署</button>}
            <button onClick={() => returnToLobby()}>退出比赛（回大厅）</button>
          </section>
        </div>
      )}
      {!loading && <GameHud onSettings={openSettings} hud={hud} onRespawnPoint={(id) => engineRef.current?.setRespawnPoint(id)} onOpenLoadout={() => engineRef.current?.openOverlay()} onRespawnNow={() => engineRef.current?.respawnNow()} onExit={() => returnToLobby()} />}
      {screen === 'game' && hud.winner && !loading && (
        <div class="post-match" role="dialog" aria-modal="true" aria-label="赛后返回房间">
          <small>MATCH OVER · {hud.mapName}</small>
          <b>{hud.winner === 'draw' ? '平局' : hud.winner === 'blue' ? '蓝队胜利' : '橙队胜利'}</b>
          <span>BLUE {Math.floor(hud.blueScore)} / ORANGE {Math.floor(hud.orangeScore)}</span>
          <div class="post-match-actions">
            <button class="post-match-room" onClick={() => returnToRoom()}>
              返回房间{postMatchSeconds !== null ? `（${postMatchSeconds}s 后自动）` : ''}
            </button>
            <button onClick={() => returnToLobby()}>返回大厅</button>
          </div>
          <em>返回房间会销毁本局引擎，保留房间名单/阵营/地图设置；房主可再次开始。</em>
        </div>
      )}
      <PrematchOverlay
        open={!loading && hud.overlayOpen && (hud.phase === 'prep' || hud.dead)}
        mode={hud.dead ? 'respawn' : 'prep'}
        seconds={hud.dead ? hud.respawnSeconds : hud.prepSeconds}
        selection={selection}
        onChange={onChange}
        onClose={() => engineRef.current?.closeOverlay()}
        onSettings={openSettings}
        mapName={hud.mapName}
        mapNameEn={mapOptions.find((entry) => entry.id === mapId)?.nameEn ?? ''}
        team={hud.team}
      />
      {settings}
    </>
  );
}

window.addEventListener('pageshow', (event) => { if (event.persisted) window.location.reload(); });
render(<GameApp />, document.getElementById('game-root')!);
