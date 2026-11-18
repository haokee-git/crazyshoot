import { VERSION, BUILD_ID } from '../../version';
import { useEffect, useState } from 'preact/hooks';
import type { NetRole } from '../../network/session';
import { MAX_MATCH_MINUTES, MIN_MATCH_MINUTES, matchMinutes, matchSecondsForMap } from '../core/match-time';

export type Team = 'blue' | 'orange';

export interface RoomPlayer {
  id: string;
  name: string;
  team: Team;
  host: boolean;
}

/** host 权威的房间状态；客机只读，靠 room 广播实时同步。 */
export interface RoomState {
  code: string;
  hostId: string;
  map: string;
  /** 每侧最大人数 4..30（总容量 = ×2，server 上限 60）。 */
  maxPerTeam: number;
  /** 单局时限（秒，60..3600）；默认跟随地图。 */
  matchSeconds: number;
  aiFill: boolean;
  players: RoomPlayer[];
  phase: 'room' | 'started';
}

export interface MapOption {
  id: string;
  name: string;
  nameEn: string;
}

export interface LobbyProps {
  connected: boolean;
  status: string;
  error: string;
  onName: (name: string) => void;
  onCreate: (name: string) => void;
  onJoin: (name: string, code: string) => void;
  onSettings: () => void;
  /** 兼容官方审计脚本：仅 URL 带 audit=1 时挂载 .lobby-solo。 */
  auditMode?: boolean;
  onSolo?: () => void;
}

export interface RoomProps {
  role: NetRole;
  room: RoomState | null;
  maps: MapOption[];
  connected: boolean;
  status: string;
  error: string;
  onMap: (id: string) => void;
  onMax: (value: number) => void;
  onTime: (seconds: number) => void;
  onAi: (value: boolean) => void;
  onMove: (id: string, team: Team) => void;
  onStart: () => void;
  onLeave: () => void;
  onDissolve: () => void;
  onSettings: () => void;
}

const MAX_PER_TEAM = 100;
const MIN_PER_TEAM = 4;

function randomName() {
  return `PILOT-${Math.floor(100 + Math.random() * 900)}`;
}

function savedName() {
  const saved = localStorage.getItem('crazyshoot.name');
  if (saved) return saved;
  const name = randomName();
  try { localStorage.setItem('crazyshoot.name', name); } catch { /* ignore */ }
  return name;
}

function clampPerTeam(value: number) {
  const n = Number.isFinite(value) ? Math.floor(value) : MIN_PER_TEAM;
  return Math.max(MIN_PER_TEAM, Math.min(MAX_PER_TEAM, n));
}

/* ------------------------------------------------------------------ */
/* 入口：只有房间码 + 创建/加入（玩家名自动生成/沿用 localStorage）      */
/* ------------------------------------------------------------------ */

export function Lobby(props: LobbyProps) {
  const [name] = useState(savedName);
  const [joinCode, setJoinCode] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { props.onName(name); }, []);
  useEffect(() => { if (props.error) setBusy(false); }, [props.error]);
  const error = props.error
    ? (props.error.includes('满') ? '无法加入：房间已满' : props.error)
    : '';
  return (
    <div class="lobby">
      <div class="lobby-grid" aria-hidden="true" />
      <header class="lobby-head">
        <div>
          <div class="lobby-kicker">CRAZYSHOOT // BATTLEFIELD</div>
          <h1>全面战场</h1>
        </div>
        <div class="lobby-header-actions">
          <button class="lobby-settings" onClick={props.onSettings}>设置</button>
          <div class="lobby-build">PRE-ALPHA <span>{VERSION}</span><small style={{ display: 'block', marginTop: 6 }}>BUILD {BUILD_ID.slice(0, 8)}</small></div>
        </div>
      </header>

      <main class="lobby-main lobby-main-entry">
        <section class="lobby-panel lobby-copy lobby-entry-copy">
          <div class="lobby-overline">CONQUEST / 占点积分</div>
          <h2>建立房间<br />拉上战友。</h2>
          <p>房主创建房间并设置地图、每侧人数与 AI 补位；客机输入四位房间码加入。4v4–100v100，房主权威、P2P 失败自动中继。</p>
          <div class="lobby-facts">
            <div><span>人数</span><b>4v4–100v100</b></div>
            <div><span>网络</span><b>WebRTC / 443 信令</b></div>
            <div><span>模式</span><b>房主设置 · AI 补位</b></div>
          </div>
          <div class="lobby-statusline">
            <i class={props.connected ? 'on' : ''} />
            {props.status || '输入房间码加入，或创建新房间'}
          </div>
          {error && <div class="lobby-error">{error}</div>}
          {props.auditMode && props.onSolo && (
            <button class="lobby-solo lobby-audit-solo" onClick={props.onSolo}>
              <span>本机测试（audit=1）</span>
              <small>仅自动审计 deep-link 使用</small>
              <b>→</b>
            </button>
          )}
        </section>

        <section class="lobby-panel lobby-actions lobby-entry-actions">
          <div class="lobby-section-label">ROOM</div>
          <button
            class="lobby-primary"
            disabled={busy}
            onClick={() => { setBusy(true); props.onCreate(name); }}
          >
            <span>创建房间</span>
            <small>你是房主，进入房间设置</small>
          </button>

          <div class="lobby-sep"><span>或加入现有房间</span></div>

          <div class="lobby-joinrow">
            <input
              class="lobby-input code"
              placeholder="四位数字房间码"
              value={joinCode}
              inputMode="numeric"
              maxLength={4}
              onInput={(event) => {
                const field = event.currentTarget;
                field.value = field.value.normalize('NFKC').replace(/[^0-9]/g, '');
                setJoinCode(field.value.slice(0, 4));
              }}
              aria-label="房间码"
            />
            <button
              class="lobby-secondary"
              disabled={joinCode.length !== 4 || busy}
              onClick={() => { setBusy(true); props.onJoin(name, joinCode.trim()); }}
            >
              加入房间
            </button>
          </div>

          <div class="lobby-footnote">
            玩家名自动沿用本机记录（{name}）· 4v4–100v100 · 房主可设置每侧 4–100 人
          </div>
        </section>
      </main>

      <footer class="lobby-foot">
        <span>CRAZYSHOOT.HAOKEE.ORG</span>
        <span>WEBRTC DATA · HOST-STAR</span>
        <span>ESC 退出全屏</span>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 房间设置：host 可改地图/人数/AI、拖拽换队；客机只读实时同步          */
/* ------------------------------------------------------------------ */

export function RoomScreen(props: RoomProps) {
  const isHost = props.role === 'host';
  const room = props.room;
  const [dragId, setDragId] = useState<string | null>(null);
  const [overTeam, setOverTeam] = useState<Team | null>(null);
  const [copied, setCopied] = useState(false);
  const copyCode = async () => {
    const value = room?.code;
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch { /* ignore */ }
  };
  if (!room) {
    return (
      <div class="lobby room-screen">
        <div class="lobby-grid" aria-hidden="true" />
        <header class="lobby-head">
          <div><div class="lobby-kicker">CRAZYSHOOT // ROOM</div><h1>房间</h1></div>
          <div class="lobby-header-actions"><button class="lobby-settings" onClick={props.onSettings}>设置</button></div>
        </header>
        <main class="lobby-main lobby-main-entry">
          <section class="lobby-panel room-sync">
            <div class="lobby-section-label">SYNCING ROOM</div>
            <p>正在等待房主同步房间状态…</p>
            <div class="lobby-statusline"><i class={props.connected ? 'on' : ''} />{props.status || '已加入，等待房主设置'}</div>
            {props.error && <div class="lobby-error">{props.error}</div>}
            <button class="lobby-leave" onClick={props.onLeave}>退出房间</button>
          </section>
        </main>
      </div>
    );
  }

  const human = (team: Team) => room.players.filter((player) => player.team === team).length;
  const perTeam = room.maxPerTeam;
  const minutes = matchMinutes(room.matchSeconds);
  const defaultMinutes = Math.round(matchSecondsForMap(room.map) / 60);
  const move = (id: string, team: Team) => {
    const player = room.players.find((entry) => entry.id === id);
    if (!player || player.team === team) return;
    if (human(team) >= perTeam) { return; }
    props.onMove(id, team);
  };
  const teamColumn = (team: Team) => (
    <section
      class={`team-col ${team}${overTeam === team ? ' drag-over' : ''}`}
      onDragOver={(event) => {
        if (!isHost) return;
        event.preventDefault();
        setOverTeam(team);
      }}
      onDragLeave={() => setOverTeam(null)}
      onDrop={(event) => {
        if (!isHost) return;
        event.preventDefault();
        setOverTeam(null);
        const id = dragId || event.dataTransfer?.getData('text/player') || '';
        setDragId(null);
        if (id) move(id, team);
      }}
    >
      <header>
        <b>{team === 'blue' ? '蓝队 BLUE' : '橙队 ORANGE'}</b>
        <span>{human(team)} / {perTeam} 玩家{room.aiFill ? ` · AI 补至 ${perTeam}` : ''}</span>
      </header>
      <div class="team-list">
        {room.players.filter((player) => player.team === team).map((player) => (
          <div
            class={`player-chip${dragId === player.id ? ' dragging' : ''}`}
            draggable={isHost}
            onDragStart={(event) => {
              if (!isHost) return;
              setDragId(player.id);
              try { event.dataTransfer?.setData('text/player', player.id); } catch { /* ignore */ }
            }}
            onDragEnd={() => { setDragId(null); setOverTeam(null); }}
          >
            <span class={`p-dot ${player.team}`} />
            <b>{player.name}</b>
            {player.host && <em>HOST</em>}
            {isHost && (
              <span class="chip-actions">
                <button
                  title={team === 'blue' ? '移到橙队' : '移到蓝队'}
                  disabled={human(team === 'blue' ? 'orange' : 'blue') >= perTeam}
                  onClick={() => move(player.id, team === 'blue' ? 'orange' : 'blue')}
                >⇄</button>
              </span>
            )}
          </div>
        ))}
        {room.players.filter((player) => player.team === team).length === 0 && <div class="lobby-empty">拖拽玩家到这里…</div>}
      </div>
    </section>
  );

  return (
    <div class="lobby room-screen">
      <div class="lobby-grid" aria-hidden="true" />
      <header class="lobby-head room-head">
        <div>
          <div class="lobby-kicker">{isHost ? 'YOUR ROOM / 房主' : 'JOINED ROOM / 客机'}</div>
          <div class="room-code-row">
            <button class="lobby-code" onClick={copyCode} title="点击复制房间码">{room.code || '----'}</button>
            <span class="room-code-hint">{copied ? '已复制' : '点击复制房间码'}</span>
          </div>
        </div>
        <div class="lobby-header-actions">
          <button class="lobby-settings" onClick={props.onSettings}>设置</button>
          {isHost
            ? <button class="lobby-leave danger" onClick={props.onDissolve}>解散房间</button>
            : <button class="lobby-leave" onClick={props.onLeave}>退出房间</button>}
        </div>
      </header>

      <main class="room-main">
        <aside class="room-config">
          <div class="lobby-section-label">ROOM SETTINGS</div>
          <div class="room-field">
            <span>每侧最大人数</span>
            <div class="room-stepper room-players">
              <button disabled={!isHost || room.maxPerTeam <= MIN_PER_TEAM} onClick={() => props.onMax(clampPerTeam(room.maxPerTeam - 1))}>−</button>
              <b>{room.maxPerTeam}</b>
              <button disabled={!isHost || room.maxPerTeam >= MAX_PER_TEAM} onClick={() => props.onMax(clampPerTeam(room.maxPerTeam + 1))}>+</button>
            </div>
            <small>4–100 任意整数 · 总容量 {room.maxPerTeam * 2} 人（信令上限 200）</small>
          </div>

          <div class="room-field">
            <span>单局时长（分钟）</span>
            <div class="room-stepper room-time">
              <button disabled={!isHost || minutes <= MIN_MATCH_MINUTES} onClick={() => props.onTime((minutes - 1) * 60)}>−</button>
              <b>{minutes}</b>
              <button disabled={!isHost || minutes >= MAX_MATCH_MINUTES} onClick={() => props.onTime((minutes + 1) * 60)}>+</button>
            </div>
            <small>1–60 分钟 · 当前地图默认 {defaultMinutes} 分钟</small>
          </div>

          <div class="room-field">
            <span>地图</span>
            <div class="room-mapgrid">
              {props.maps.map((option) => (
                <button
                  class={room.map === option.id ? 'on' : ''}
                  disabled={!isHost}
                  onClick={() => props.onMap(option.id)}
                >
                  {option.name}<small>{option.nameEn}</small>
                </button>
              ))}
            </div>
          </div>

          <label class={`room-ai${isHost ? '' : ' disabled'}`}>
            <input
              type="checkbox"
              checked={room.aiFill}
              disabled={!isHost}
              onChange={(event) => props.onAi(event.currentTarget.checked)}
            />
            <span>AI 补位</span>
            <small>{room.aiFill ? `开始后每侧补到 ${room.maxPerTeam} 人` : '只使用真人玩家'}</small>
          </label>

          <div class="room-capacity">
            房间人数 <b>{room.players.length} / {room.maxPerTeam * 2}</b>
            <span class="lobby-statusline"><i class={props.connected ? 'on' : ''} />{props.status || (isHost ? '等待玩家加入…' : '已连接房主')}</span>
          </div>
          {props.error && <div class="lobby-error">{props.error}</div>}
        </aside>

        <section class="room-teams">
          <div class="room-teams-head">
            <div class="lobby-section-label">PLAYERS</div>
            <span>{isHost ? '拖动玩家到蓝/橙阵营，或点 ⇄' : '房主分配阵营，实时同步'}</span>
          </div>
          <div class="team-grid">
            {teamColumn('blue')}
            {teamColumn('orange')}
          </div>
        </section>
      </main>

      <footer class="room-foot">
        {isHost ? (
          <button class="lobby-primary start" onClick={props.onStart}>
            <span>开始比赛</span>
            <small>每侧最多 {room.maxPerTeam} 人 · {minutes} 分钟 · AI 补位{room.aiFill ? '开' : '关'} · 无需其他玩家确认</small>
          </button>
        ) : (
          <div class="lobby-waiting">
            <i class={props.connected ? 'on' : ''} />
            {props.connected ? '等待房主开始比赛…（客机不能开始）' : '已进入房间 · 等待房主'}
          </div>
        )}
        <div class="room-foot-note">房主权威 · 开赛后客机只接收快照/输入回放；赛后 5 秒自动返回本房间。</div>
      </footer>
    </div>
  );
}
