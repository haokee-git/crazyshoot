/**
 * 载具刷新管理器（纯逻辑，可单测）。
 *
 * 只负责「车位 ↔ 载具」的绑定与计时，不接触 THREE、DOM、Arena：
 * - 引擎按帧把当前载具位置/毁损状态同步进来（update 的 vehicles 快照）；
 * - 引擎提供精确车位净空检测（玩家/建筑/其他车/水/坡度），本模块绝不自己扫地图；
 * - 本模块只返回 spawn/remove 指令，由引擎真正建模型、广播、清理。
 *
 * 规则（docs/map-pharaoh/CONTRACT.md §6）：
 * - 车位载具离开 24 m 持续 20 s → 15 s 倒计时；期间回到 24 m 内取消；
 * - 车位载具被毁 → 45 s 后刷新；
 * - 净空被占用 → 每 2 s 重试；
 * - 全图未摧毁载具上限 40；每车位同一时间最多 1 个待刷新（天然单计时器）；
 * - 刷新成功时新车绑定车位，旧车解绑（仍在世界里，计入车辆对象数）；
 * - 车辆对象总数上限 56，超出时优先清理最老残骸；
 * - 新一局 reset：清动态车、恢复初始车位载具；
 * - 客机不构造本管理器（只收 vehSpawn/vehReset/snap）。
 */

export type PadTeam = 'blue' | 'orange' | 'neutral';
export type PadPhase = 'ready' | 'respawning' | 'occupied';

export interface VehiclePadSpec {
  /** 稳定车位 id（引擎用 arena.vehicles[i].id 派生）。 */
  id: string;
  /** 引用内容目录 vehicleId；刷新出来就是这一类车。 */
  kind: string;
  team: PadTeam;
  /** 车位中心（世界 X/Z，米）。 */
  x: number;
  z: number;
  /** 车位朝向（弧度）。 */
  angle: number;
}

export interface ManagedVehicleInit {
  id: string;
  kind: string;
  team: PadTeam;
  /** 初始车辆绑定的车位；动态车为 null。 */
  padId: string | null;
  x: number;
  z: number;
}

/** 引擎每帧同步的权威载具状态（位置 + 是否毁损）。 */
export interface VehicleSync {
  id: string;
  x: number;
  z: number;
  destroyed: boolean;
}

export interface PadState {
  id: string;
  team: PadTeam;
  state: PadPhase;
  /** 倒计时秒数：respawning = 距离刷新；occupied = 距离弃车判定或下次重试。 */
  seconds?: number;
  /** 车位坐标，仅用于小地图标注。 */
  x?: number;
  z?: number;
}

export type SpawnAction =
  | {
    type: 'spawn';
    vehicleId: string;
    padId: string;
    kind: string;
    team: PadTeam;
    x: number;
    z: number;
    angle: number;
  }
  | {
    type: 'remove';
    vehicleId: string;
    /** respawn = 车位刷新覆盖旧残骸；limit = 56 对象上限清理；reset = 新一局清动态车。 */
    reason: 'respawn' | 'limit' | 'reset';
  };

export interface SpawnResult {
  actions: SpawnAction[];
  pads: PadState[];
}

export interface SpawnManagerConfig {
  pads: VehiclePadSpec[];
  initial: ManagedVehicleInit[];
  /** 离开车位多远算「开走」，米。默认 24。 */
  abandonDistance?: number;
  /** 开走持续多久才开始刷新倒计时，毫秒。默认 20_000。 */
  abandonDelayMs?: number;
  /** 弃车/空位刷新倒计时，毫秒。默认 15_000。 */
  respawnDelayMs?: number;
  /** 毁损后刷新倒计时，毫秒。默认 45_000；可按载具类型给不同值。 */
  destroyedDelayMs?: number | ((kind: string) => number);
  /** 净空/上限不满足时的重试间隔，毫秒。默认 2_000。 */
  retryMs?: number;
  /** 全图未摧毁载具上限。默认 40。 */
  liveLimit?: number;
  /** 车辆对象（含残骸）保留上限。默认 56。 */
  objectLimit?: number;
  /** 动态车 id 前缀。默认 'dyn'。 */
  idPrefix?: string;
}

export const SPAWN_DEFAULTS = {
  abandonDistance: 24,
  abandonDelayMs: 20_000,
  respawnDelayMs: 15_000,
  destroyedDelayMs: 45_000,
  retryMs: 2_000,
  liveLimit: 40,
  objectLimit: 56,
  /** 引擎建议的 update 节流；计时精度 0.2 s 足够，省每帧分配。 */
  tickMs: 200,
} as const;

interface VehicleRecord {
  id: string;
  kind: string;
  team: PadTeam;
  padId: string | null;
  x: number;
  z: number;
  destroyed: boolean;
  destroyedAt: number | null;
  initial: boolean;
}

interface PadRuntime {
  spec: VehiclePadSpec;
  /** 当前绑定在该车位上的载具 id（至多一个）。 */
  occupantId: string | null;
  /** 载具开走（> abandonDistance）的起始时刻；回到范围内清零。 */
  departedSince: number | null;
  /** 刷新倒计时到期的绝对时刻（15 s / 45 s / 空位）。 */
  countdownAt: number | null;
  /** 净空/上限占用后的下次尝试时刻。 */
  retryAt: number | null;
  state: PadPhase;
  seconds?: number;
}

export class VehicleSpawnManager {
  private readonly pads: PadRuntime[];
  private readonly initial: ManagedVehicleInit[];
  private readonly abandonDistance: number;
  private readonly abandonDelayMs: number;
  private readonly respawnDelayMs: number;
  private readonly destroyedDelayMs: number | ((kind: string) => number);
  private readonly retryMs: number;
  private readonly liveLimit: number;
  private readonly objectLimit: number;
  private readonly idPrefix: string;
  private records = new Map<string, VehicleRecord>();
  private serial = 0;

  constructor(config: SpawnManagerConfig) {
    this.abandonDistance = Math.max(1, config.abandonDistance ?? SPAWN_DEFAULTS.abandonDistance);
    this.abandonDelayMs = Math.max(0, config.abandonDelayMs ?? SPAWN_DEFAULTS.abandonDelayMs);
    this.respawnDelayMs = Math.max(0, config.respawnDelayMs ?? SPAWN_DEFAULTS.respawnDelayMs);
    this.destroyedDelayMs = typeof config.destroyedDelayMs === 'function' ? config.destroyedDelayMs : Math.max(0, config.destroyedDelayMs ?? SPAWN_DEFAULTS.destroyedDelayMs);
    this.retryMs = Math.max(1, config.retryMs ?? SPAWN_DEFAULTS.retryMs);
    this.liveLimit = Math.max(1, config.liveLimit ?? SPAWN_DEFAULTS.liveLimit);
    this.objectLimit = Math.max(1, config.objectLimit ?? SPAWN_DEFAULTS.objectLimit);
    this.idPrefix = config.idPrefix ?? 'dyn';
    this.pads = config.pads.map((spec) => ({
      spec: {...spec},
      occupantId: null,
      departedSince: null,
      countdownAt: null,
      retryAt: null,
      state: 'ready' as PadPhase,
    }));
    this.initial = config.initial.map((v) => ({...v}));
    this.restoreInitial(0);
  }

  /** 只读车位数量（HUD/测试用）。 */
  get padCount() {
    return this.pads.length;
  }

  /** 当前车辆对象数（含残骸），测试与诊断用。 */
  get objectCount() {
    return this.records.size;
  }

  /** 当前记录里的动态车 id（reset 返回值之外的诊断用）。 */
  dynamicIds(): string[] {
    return [...this.records.values()].filter((v) => !v.initial).map((v) => v.id);
  }

  /**
   * 新一局：清掉所有动态车、恢复初始车位载具与全部计时器。
   * 返回需要引擎从场景/载具表里移除的动态车（引擎按 id 清理模型）。
   */
  reset(now: number): SpawnAction[] {
    const removed: SpawnAction[] = [];
    for (const record of [...this.records.values()]) {
      if (record.initial) continue;
      removed.push({type: 'remove', vehicleId: record.id, reason: 'reset'});
    }
    this.records.clear();
    this.serial = 0;
    this.restoreInitial(now);
    return removed;
  }

  /** 车位状态快照（供 HudState / snap；不含 x/z 之外的动态数据）。 */
  states(now = 0): PadState[] {
    // 计时秒数以调用方传入的 now 为准；引擎通常直接复用 update() 的返回值。
    return this.pads.map((pad) => this.describe(pad, now));
  }

  /**
   * 推进一步。
   * @param vehicles 引擎权威载具快照（含初始车与动态车，残骸 destroyed=true）。
   * @param canSpawn 精确车位净空检测：false 时按 retryMs 重试；ignoreIds 是本轮会被
   *   移除/覆盖的载具（例如车位自己的旧残骸），净空检测应忽略它们。
   */
  update(
    now: number,
    vehicles: readonly VehicleSync[],
    canSpawn: (pad: VehiclePadSpec, ignoreIds: readonly string[]) => boolean,
  ): SpawnResult {
    const actions: SpawnAction[] = [];
    this.syncVehicles(now, vehicles);
    let liveCount = 0;
    const seen = new Set<string>();
    for (const v of vehicles) {
      if (!v || typeof v.id !== 'string' || seen.has(v.id)) continue;
      seen.add(v.id);
      if (!v.destroyed) liveCount++;
    }

    for (const pad of this.pads) {
      // 1) 解析当前占用者；绑定失效则解绑。
      if (pad.occupantId && !this.records.has(pad.occupantId)) pad.occupantId = null;
      let occupant = pad.occupantId ? this.records.get(pad.occupantId) : undefined;
      if (occupant && occupant.padId !== pad.spec.id) {
        pad.occupantId = null;
        occupant = undefined;
      }

      // 2) 占用者健在且已回到车位范围 → 取消一切倒计时/重试。
      if (occupant && !occupant.destroyed) {
        const distance = Math.hypot(occupant.x - pad.spec.x, occupant.z - pad.spec.z);
        if (distance <= this.abandonDistance) {
          pad.departedSince = null;
          pad.countdownAt = null;
          pad.retryAt = null;
          pad.state = 'ready';
          pad.seconds = undefined;
          continue;
        }
        // 3) 健在但开走：先计「持续离开」时间，够 20 s 才起 15 s 刷新倒计时。
        if (pad.departedSince === null) pad.departedSince = now;
        if (pad.countdownAt === null) {
          if (now - pad.departedSince < this.abandonDelayMs) {
            pad.state = 'occupied';
            pad.seconds = Math.max(0, Math.ceil((this.abandonDelayMs - (now - pad.departedSince)) / 1000));
            continue;
          }
          pad.countdownAt = now + this.respawnDelayMs;
        }
        // 倒计时期间若车又回来了，第 2 步会取消；这里只负责到点刷新。
        if (pad.countdownAt > now) {
          pad.state = 'respawning';
          pad.seconds = Math.max(0, Math.ceil((pad.countdownAt - now) / 1000));
          continue;
        }
        this.trySpawn(now, pad, occupant, liveCount, canSpawn, actions);
        if (this.lastSpawnedFrom(pad, actions)) liveCount++;
        continue;
      }

      // 4) 占用者被毁：从毁损时刻起 45 s。
      if (occupant && occupant.destroyed) {
        if (pad.countdownAt === null) {
          pad.countdownAt = (occupant.destroyedAt ?? now) + this.destroyedDelay(occupant.kind);
        }
        if (pad.countdownAt > now) {
          pad.state = 'respawning';
          pad.seconds = Math.max(0, Math.ceil((pad.countdownAt - now) / 1000));
          continue;
        }
        this.trySpawn(now, pad, occupant, liveCount, canSpawn, actions);
        if (this.lastSpawnedFrom(pad, actions)) liveCount++;
        continue;
      }

      // 5) 车位为空（外部移除/初始配置缺失）：15 s 后补一辆。
      if (pad.countdownAt === null) pad.countdownAt = now + this.respawnDelayMs;
      if (pad.countdownAt > now) {
        pad.state = 'respawning';
        pad.seconds = Math.max(0, Math.ceil((pad.countdownAt - now) / 1000));
        continue;
      }
      this.trySpawn(now, pad, undefined, liveCount, canSpawn, actions);
      if (this.lastSpawnedFrom(pad, actions)) liveCount++;
    }

    return {actions, pads: this.states(now)};
  }

  // ---------------------------------------------------------------- internal

  private restoreInitial(now: number) {
    for (const v of this.initial) {
      this.records.set(v.id, {
        id: v.id,
        kind: v.kind,
        team: v.team,
        padId: v.padId,
        x: v.x,
        z: v.z,
        destroyed: false,
        destroyedAt: null,
        initial: true,
      });
    }
    for (const pad of this.pads) {
      const owner = this.initial.find((v) => v.padId === pad.spec.id);
      pad.occupantId = owner?.id ?? null;
      pad.departedSince = null;
      pad.countdownAt = null;
      pad.retryAt = null;
      pad.state = 'ready';
      pad.seconds = undefined;
    }
  }

  private syncVehicles(now: number, vehicles: readonly VehicleSync[]) {
    const present = new Set<string>();
    for (const sync of vehicles) {
      if (!sync || typeof sync.id !== 'string') continue;
      present.add(sync.id);
      const record = this.records.get(sync.id);
      if (!record) {
        // 引擎里出现但管理器不认识的载具（客机不会发生）：按动态车登记，避免计时错乱。
        this.records.set(sync.id, {
          id: sync.id,
          kind: '',
          team: 'neutral',
          padId: null,
          x: sync.x,
          z: sync.z,
          destroyed: !!sync.destroyed,
          destroyedAt: sync.destroyed ? now : null,
          initial: false,
        });
        continue;
      }
      record.x = sync.x;
      record.z = sync.z;
      if (sync.destroyed && !record.destroyed) {
        record.destroyed = true;
        record.destroyedAt = now;
      } else if (!sync.destroyed) {
        record.destroyed = false;
        record.destroyedAt = null;
      }
    }
    // 引擎已经移除的载具：记录也丢掉（不会重复下发 remove）。
    for (const id of [...this.records.keys()]) if (!present.has(id)) this.records.delete(id);
  }

  private trySpawn(
    now: number,
    pad: PadRuntime,
    occupant: VehicleRecord | undefined,
    liveCount: number,
    canSpawn: (pad: VehiclePadSpec, ignoreIds: readonly string[]) => boolean,
    actions: SpawnAction[],
  ) {
    if (pad.retryAt !== null && now < pad.retryAt) {
      pad.state = 'occupied';
      pad.seconds = Math.max(0, Math.ceil((pad.retryAt - now) / 1000));
      return;
    }
    if (liveCount >= this.liveLimit) {
      pad.retryAt = now + this.retryMs;
      pad.state = 'respawning';
      pad.seconds = Math.max(0, Math.ceil(this.retryMs / 1000));
      return;
    }
    // 车位自己的旧残骸会占住净空：刷新前先清掉（引擎先执行 remove 再执行 spawn）。
    const replacesWreck = !!occupant && occupant.destroyed;
    if (replacesWreck && occupant) {
      actions.push({type: 'remove', vehicleId: occupant.id, reason: 'respawn'});
      this.records.delete(occupant.id);
      pad.occupantId = null;
    }
    // 56 个车辆对象上限：刷新前清理最老残骸，腾不出位置就等下一轮。
    if (this.records.size >= this.objectLimit) {
      const wreck = this.oldestWreck();
      if (!wreck) {
        pad.retryAt = now + this.retryMs;
        pad.state = 'respawning';
        pad.seconds = Math.max(0, Math.ceil(this.retryMs / 1000));
        return;
      }
      actions.push({type: 'remove', vehicleId: wreck.id, reason: 'limit'});
      this.dropRecord(wreck.id);
    }
    const ignoreIds = replacesWreck && occupant ? [occupant.id] : [];
    if (!canSpawn(pad.spec, ignoreIds)) {
      pad.retryAt = now + this.retryMs;
      pad.state = 'occupied';
      pad.seconds = Math.max(0, Math.ceil(this.retryMs / 1000));
      return;
    }
    // 新车绑定车位，旧车（若健在）解绑但保留在世界里。
    if (pad.occupantId) {
      const old = this.records.get(pad.occupantId);
      if (old) old.padId = null;
    }
    const vehicleId = this.nextVehicleId(pad.spec);
    this.records.set(vehicleId, {
      id: vehicleId,
      kind: pad.spec.kind,
      team: pad.spec.team,
      padId: pad.spec.id,
      x: pad.spec.x,
      z: pad.spec.z,
      destroyed: false,
      destroyedAt: null,
      initial: false,
    });
    pad.occupantId = vehicleId;
    pad.departedSince = null;
    pad.countdownAt = null;
    pad.retryAt = null;
    pad.state = 'ready';
    pad.seconds = undefined;
    actions.push({
      type: 'spawn',
      vehicleId,
      padId: pad.spec.id,
      kind: pad.spec.kind,
      team: pad.spec.team,
      x: pad.spec.x,
      z: pad.spec.z,
      angle: pad.spec.angle,
    });
  }

  /** 本轮是否真的给这个车位下发了 spawn（liveCount 需要 +1）。 */
  private lastSpawnedFrom(pad: PadRuntime, actions: SpawnAction[]) {
    for (let i = actions.length - 1; i >= 0; i--) {
      const action = actions[i];
      if (action.type === 'spawn' && action.padId === pad.spec.id) return true;
    }
    return false;
  }

  private destroyedDelay(kind: string): number {
    const delay = typeof this.destroyedDelayMs === 'function' ? this.destroyedDelayMs(kind) : this.destroyedDelayMs;
    return Math.max(0, Number.isFinite(delay) ? delay : SPAWN_DEFAULTS.destroyedDelayMs);
  }

  private describe(pad: PadRuntime, now: number): PadState {
    const state: PadState = {id: pad.spec.id, team: pad.spec.team, state: pad.state, x: pad.spec.x, z: pad.spec.z};
    if (pad.seconds !== undefined) state.seconds = pad.seconds;
    else if (pad.state === 'respawning' && pad.countdownAt !== null) {
      state.seconds = Math.max(0, Math.ceil((pad.countdownAt - now) / 1000));
    }
    return state;
  }

  private oldestWreck(): VehicleRecord | undefined {
    let oldest: VehicleRecord | undefined;
    for (const record of this.records.values()) {
      if (!record.destroyed) continue;
      if (!oldest) {
        oldest = record;
        continue;
      }
      const a = record.destroyedAt ?? Infinity;
      const b = oldest.destroyedAt ?? Infinity;
      // 先清动态残骸，再清初始残骸；同一时刻按 id 稳定排序。
      if (a < b) oldest = record;
      else if (a === b) {
        const dynamic = Number(record.initial) - Number(oldest.initial);
        if (dynamic < 0 || (dynamic === 0 && record.id < oldest.id)) oldest = record;
      }
    }
    return oldest;
  }

  private dropRecord(id: string) {
    const record = this.records.get(id);
    if (!record) return;
    if (record.padId) {
      const pad = this.pads.find((p) => p.spec.id === record.padId);
      if (pad && pad.occupantId === id) pad.occupantId = null;
    }
    this.records.delete(id);
  }

  private nextVehicleId(pad: VehiclePadSpec) {
    let id: string;
    do {
      id = `${this.idPrefix}-${pad.id}-${++this.serial}`;
    } while (this.records.has(id));
    return id;
  }
}
