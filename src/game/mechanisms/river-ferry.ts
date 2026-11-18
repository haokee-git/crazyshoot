/**
 * 权威缆索渡船状态机（纯逻辑，可单测；不依赖 THREE/DOM）。
 *
 * 相位：
 *   dockedWest / dockedEast         靠岸（8 s 靠岸停留，期间可 E 呼叫/出发）
 *   countdownWest / countdownEast    2 s 出发倒计时（不可倒转）
 *   movingEast / movingWest          40 m / 2.5 m/s = 16 s 航程
 *
 * 任何时刻只有 host 推进状态；客机只应用 snap 并做视觉插值。船不占点、不加分、
 * 不可摧毁；只有步兵能上船（由 engine 交互/载具分离保证）。
 */

export interface FerryConfig {
  id: string;
  z: number;
  westX: number;
  eastX: number;
  deckY: number;
  deckLength: number;
  deckWidth: number;
  speed: number;
  dwellSeconds: number;
  countdownSeconds: number;
  initialSide: 'west' | 'east';
}

export type FerryPhase = 'dockedWest' | 'dockedEast' | 'countdownWest' | 'countdownEast' | 'movingEast' | 'movingWest';

export interface FerrySnapshot {
  id: string;
  phase: FerryPhase;
  t: number;
  x: number;
  z: number;
  yaw: number;
}

interface Runtime {
  cfg: FerryConfig;
  phase: FerryPhase;
  t: number;
  /** moving 方向的起点相位侧：west -> movingEast。 */
  from: 'west' | 'east';
  x: number;
  yaw: number;
}

const isDocked = (phase: FerryPhase) => phase === 'dockedWest' || phase === 'dockedEast';
const isCountdown = (phase: FerryPhase) => phase === 'countdownWest' || phase === 'countdownEast';
const isMoving = (phase: FerryPhase) => phase === 'movingEast' || phase === 'movingWest';

export class FerrySystem {
  private readonly ferries: Runtime[] = [];

  constructor(configs: readonly FerryConfig[]) {
    for (const cfg of configs) {
      this.ferries.push({
        cfg,
        phase: cfg.initialSide === 'west' ? 'dockedWest' : 'dockedEast',
        t: 0,
        from: cfg.initialSide,
        x: cfg.initialSide === 'west' ? cfg.westX : cfg.eastX,
        yaw: cfg.initialSide === 'west' ? 0 : Math.PI,
      });
    }
  }

  get count() {
    return this.ferries.length;
  }

  get ids(): string[] {
    return this.ferries.map((f) => f.cfg.id);
  }

  state(id: string): FerrySnapshot | undefined {
    const f = this.ferries.find((q) => q.cfg.id === id);
    return f ? this.snapshot(f) : undefined;
  }

  snapshots(): FerrySnapshot[] {
    return this.ferries.map((f) => this.snapshot(f));
  }

  private snapshot(f: Runtime): FerrySnapshot {
    return { id: f.cfg.id, phase: f.phase, t: f.t, x: f.x, z: f.cfg.z, yaw: f.yaw };
  }

  private duration(f: Runtime): number {
    return Math.abs(f.cfg.eastX - f.cfg.westX) / Math.max(0.1, f.cfg.speed);
  }

  private heading(f: Runtime): 1 | -1 {
    return f.phase === 'movingEast' || f.phase === 'countdownWest' ? 1 : -1;
  }

  tick(dt: number): void {
    const step = Math.max(0, Math.min(0.25, dt));
    for (const f of this.ferries) {
      f.t += step;
      if (f.phase === 'dockedWest' || f.phase === 'dockedEast') {
        // 靠岸停留 8 s 后自动折返，形成持续的班次；期间 E 可提前出发。
        if (f.t >= f.cfg.dwellSeconds) {
          this.beginCountdown(f, f.phase === 'dockedWest' ? 'east' : 'west');
        }
        continue;
      }
      if (f.phase === 'countdownWest' || f.phase === 'countdownEast') {
        if (f.t >= f.cfg.countdownSeconds) {
          const east = f.phase === 'countdownWest';
          f.phase = east ? 'movingEast' : 'movingWest';
          f.from = east ? 'west' : 'east';
          f.t = 0;
        }
        continue;
      }
      if (f.phase === 'movingEast' || f.phase === 'movingWest') {
        const total = this.duration(f);
        const progress = Math.min(1, f.t / total);
        const fromX = f.from === 'west' ? f.cfg.westX : f.cfg.eastX;
        const toX = f.from === 'west' ? f.cfg.eastX : f.cfg.westX;
        f.x = fromX + (toX - fromX) * progress;
        f.yaw = f.phase === 'movingEast' ? Math.PI : 0;
        if (progress >= 1) {
          f.phase = f.phase === 'movingEast' ? 'dockedEast' : 'dockedWest';
          f.x = f.phase === 'dockedEast' ? f.cfg.eastX : f.cfg.westX;
          f.t = 0;
          f.yaw = f.phase === 'dockedEast' ? Math.PI : 0;
        }
      }
    }
  }

  private beginCountdown(f: Runtime, target: 'west' | 'east'): void {
    f.phase = target === 'east' ? 'countdownWest' : 'countdownEast';
    f.from = target === 'east' ? 'west' : 'east';
    f.t = 0;
  }

  /**
   * E 交互：呼叫/出发。只有靠岸时可受理；caller 在任一端都合法（同岸登船、对岸呼叫
   * 都让船驶向另一岸）。移动/倒计时中返回 false，不允许反复倒转。
   */
  request(_side: 'west' | 'east'): boolean {
    const f = this.ferries.find((q) => isDocked(q.phase));
    if (!f) return false;
    this.beginCountdown(f, f.phase === 'dockedWest' ? 'east' : 'west');
    return true;
  }

  requestById(id: string, _side: 'west' | 'east'): boolean {
    const f = this.ferries.find((q) => q.cfg.id === id);
    if (!f || !isDocked(f.phase)) return false;
    this.beginCountdown(f, f.phase === 'dockedWest' ? 'east' : 'west');
    return true;
  }

  canRequest(id: string): boolean {
    const f = this.ferries.find((q) => q.cfg.id === id);
    return !!f && isDocked(f.phase);
  }

  phaseOf(id: string): FerryPhase | undefined {
    return this.ferries.find((q) => q.cfg.id === id)?.phase;
  }

  reset(): void {
    for (const f of this.ferries) {
      f.phase = f.cfg.initialSide === 'west' ? 'dockedWest' : 'dockedEast';
      f.t = 0;
      f.from = f.cfg.initialSide;
      f.x = f.cfg.initialSide === 'west' ? f.cfg.westX : f.cfg.eastX;
      f.yaw = f.cfg.initialSide === 'west' ? 0 : Math.PI;
    }
  }

  /** Guests: adopt the host snapshot. Movement is not predicted; x/z are authoritative. */
  applySnapshot(snapshot: FerrySnapshot): void {
    const f = this.ferries.find((q) => q.cfg.id === snapshot.id);
    if (!f) return;
    if (!Number.isFinite(snapshot.x) || !Number.isFinite(snapshot.t)) return;
    f.phase = snapshot.phase;
    f.t = Math.max(0, Number(snapshot.t));
    f.x = snapshot.x;
    f.yaw = Number.isFinite(snapshot.yaw) ? snapshot.yaw : f.yaw;
  }

  /** Deck platform: axis-aligned 5 x 6 m; yaw is only visual (0/π). */
  contains(id: string, x: number, z: number, pad = 0.2): boolean {
    const f = this.ferries.find((q) => q.cfg.id === id);
    if (!f) return false;
    return Math.abs(x - f.x) <= f.cfg.deckLength / 2 + pad && Math.abs(z - f.cfg.z) <= f.cfg.deckWidth / 2 + pad;
  }

  configs(): readonly FerryConfig[] {
    return this.ferries.map((f) => f.cfg);
  }
}

export { isDocked, isCountdown, isMoving };
