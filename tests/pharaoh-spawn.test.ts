/**
 * 法老坟墓 · 载具刷新验收（QA-01）
 *
 * 这一层不测引擎的 THREE/网络，而是把「法老图的 32 个真实车位」喂给正式的
 * `VehicleSpawnManager`，按契约 §6 的时序逐条验证：
 *  - 初始 32（双方各 8 + 中立 16）；
 *  - 离开 24 m 持续 20 s → 15 s 倒计时；回到 24 m 内取消；
 *  - 毁损 45 s 后刷新；
 *  - 净空被占用每 2 s 重试，且同一车位最多 1 个排队；
 *  - 全图 40 辆未摧毁上限 / 56 个车辆对象上限（清最老残骸）；
 *  - 新一局 reset 清动态车、恢复 32；
 *  - 客机不生成：管理器只由 host 构造，且不碰网络。
 *
 * 时间全部用逻辑时钟（不 sleep）。正式的引擎接线（vehSpawn/vehReset、客机 snap）
 * 由 `tools/game/audit/pharaoh-walk.ts` 在浏览器里跑。
 */
import {describe, it, expect} from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {pharaoh} from '../src/maps/pharaoh';
import {
  SPAWN_DEFAULTS,
  VehicleSpawnManager,
  type ManagedVehicleInit,
  type SpawnAction,
  type SpawnResult,
  type VehiclePadSpec,
  type VehicleSync,
} from '../src/game/vehicles/spawn-manager';

/* ------------------------------------------------------------------ */
/* 用真实车位装配（id 规则与 map-arena.ts 一致：`${kind}-${index}`）    */
/* ------------------------------------------------------------------ */

const PADS: VehiclePadSpec[] = pharaoh.vehiclePads.map((p, index) => ({
  id: `${p.vehicleId}-${index}`,
  kind: p.vehicleId,
  team: p.team,
  x: p.x,
  z: p.y,
  angle: (p.angle * Math.PI) / 180,
}));
const INITIAL: ManagedVehicleInit[] = PADS.map((p) => ({id: p.id, kind: p.kind, team: p.team, padId: p.id, x: p.x, z: p.z}));
const TICK = SPAWN_DEFAULTS.tickMs;

interface Driver {
  manager: VehicleSpawnManager;
  vehicles: VehicleSync[];
  spawns: Extract<SpawnAction, {type: 'spawn'}>[];
  removes: {id: string; reason: string}[];
  step: (now: number, allow?: boolean) => SpawnResult;
  move: (id: string, x: number, z: number) => void;
  destroy: (id: string, destroyed?: boolean) => void;
  padState: (now: number, padId?: string) => SpawnResult['pads'][number];
}

function driver(options: {vehicles?: VehicleSync[]; canSpawn?: boolean} = {}): Driver {
  const manager = new VehicleSpawnManager({pads: PADS, initial: INITIAL});
  let allow = options.canSpawn ?? true;
  const state = {
    manager,
    vehicles: options.vehicles ? options.vehicles.map((v) => ({...v})) : INITIAL.map((v): VehicleSync => ({id: v.id, x: v.x, z: v.z, destroyed: false})),
    spawns: [] as Extract<SpawnAction, {type: 'spawn'}>[],
    removes: [] as {id: string; reason: string}[],
  };
  const step = (now: number, nextAllow?: boolean): SpawnResult => {
    if (nextAllow !== undefined) allow = nextAllow;
    const result = manager.update(now, state.vehicles, () => allow);
    for (const action of result.actions) {
      if (action.type === 'spawn') {
        state.spawns.push(action);
        state.vehicles.push({id: action.vehicleId, x: action.x, z: action.z, destroyed: false});
      } else {
        state.removes.push({id: action.vehicleId, reason: action.reason});
        const index = state.vehicles.findIndex((v) => v.id === action.vehicleId);
        if (index >= 0) state.vehicles.splice(index, 1);
      }
    }
    return result;
  };
  const move = (id: string, x: number, z: number) => {
    const vehicle = state.vehicles.find((v) => v.id === id);
    if (!vehicle) throw new Error(`missing vehicle ${id}`);
    vehicle.x = x;
    vehicle.z = z;
  };
  const destroy = (id: string, destroyed = true) => {
    const vehicle = state.vehicles.find((v) => v.id === id);
    if (!vehicle) throw new Error(`missing vehicle ${id}`);
    vehicle.destroyed = destroyed;
  };
  const padState = (now: number, padId = PADS[0].id) => {
    step(now);
    return manager.states(now).find((pad) => pad.id === padId)!;
  };
  return {...state, step, move, destroy, padState};
}

/** 把一列车位里的某一辆开出 40 m（超过 24 m 判定），按 0.2 s 步进到 `seconds`。 */
function runUntil(d: Driver, from: number, seconds: number, allow?: boolean) {
  let now = from;
  const end = from + seconds * 1000;
  while (now <= end) {
    d.step(now, allow);
    now += TICK;
  }
  return end;
}

const padById = (id: string) => PADS.find((p) => p.id === id)!;
const BLUE_JEEP = 'jeep-2'; // pharaoh.vehiclePads[2] 是蓝队吉普
const NEUTRAL_JEEP = PADS.find((p) => p.team === 'neutral')!.id;

describe('pharaoh spawn manager: initial fleet', () => {
  it('starts with all 32 pads taken and no spawn instructions', () => {
    const d = driver();
    const result = d.step(0);
    expect(d.manager.padCount).toBe(32);
    expect(d.manager.objectCount).toBe(32);
    expect(result.actions).toEqual([]);
    expect(result.pads.length).toBe(32);
    expect(result.pads.every((pad) => pad.state === 'ready')).toBe(true);
    expect(result.pads.every((pad) => typeof pad.x === 'number' && typeof pad.z === 'number')).toBe(true);
  });

  it('uses the contract timings', () => {
    expect(SPAWN_DEFAULTS).toMatchObject({
      abandonDistance: 24,
      abandonDelayMs: 20_000,
      respawnDelayMs: 15_000,
      destroyedDelayMs: 45_000,
      retryMs: 2_000,
      liveLimit: 40,
      objectLimit: 56,
    });
  });

  it('covers every team/pad combination from the map definition', () => {
    const counts = PADS.reduce<Record<string, number>>((acc, pad) => {
      acc[`${pad.team}:${pad.kind}`] = (acc[`${pad.team}:${pad.kind}`] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts['blue:motorcycle']).toBe(2);
    expect(counts['orange:motorcycle']).toBe(2);
    expect(counts['neutral:motorcycle']).toBe(9);
    expect(counts['neutral:jeep']).toBe(7);
    expect(Object.keys(counts).length).toBe(14); // 双方各 6 种 + 中立 2 种
  });
});

describe('pharaoh spawn manager: leaving a pad', () => {
  it('waits 20 s after the hull leaves 24 m, then counts down 15 s', () => {
    const d = driver();
    const pad = padById(BLUE_JEEP);
    d.move(BLUE_JEEP, pad.x + 40, pad.z);
    let result = d.step(0);
    // 刚开走：还在 20 s 观察期
    expect(result.pads.find((p) => p.id === BLUE_JEEP)?.state).toBe('occupied');
    result = d.step(19_800);
    expect(result.actions.filter((a) => a.type === 'spawn')).toEqual([]);
    result = d.step(20_200);
    const state = result.pads.find((p) => p.id === BLUE_JEEP)!;
    expect(state.state).toBe('respawning');
    expect(state.seconds).toBeLessThanOrEqual(15);
    // 15 s 后刷新
    result = d.step(20_200 + 15_200);
    const spawned = result.actions.filter((a) => a.type === 'spawn');
    expect(spawned.length).toBe(1);
    expect(spawned[0]).toMatchObject({type: 'spawn', padId: BLUE_JEEP, kind: 'jeep', team: 'blue'});
    expect(result.pads.find((p) => p.id === BLUE_JEEP)?.state).toBe('ready');
  });

  it('cancels the countdown when the vehicle comes back inside 24 m', () => {
    const d = driver();
    const pad = padById(BLUE_JEEP);
    d.move(BLUE_JEEP, pad.x + 40, pad.z);
    d.step(0);
    d.step(25_000); // 已进入 15 s 倒计时
    expect(d.manager.states(25_000).find((p) => p.id === BLUE_JEEP)?.state).toBe('respawning');
    d.move(BLUE_JEEP, pad.x + 6, pad.z);
    const result = d.step(25_200);
    expect(result.actions).toEqual([]);
    expect(result.pads.find((p) => p.id === BLUE_JEEP)?.state).toBe('ready');
    // 再推 30 s 也不会刷（车一直在）
    expect(d.step(55_000).actions).toEqual([]);
  });

  it('does not refresh a pad whose vehicle is only 20 m away', () => {
    const d = driver();
    const pad = padById(NEUTRAL_JEEP);
    d.move(NEUTRAL_JEEP, pad.x + 20, pad.z);
    d.step(0);
    d.step(60_000);
    expect(d.spawns).toEqual([]);
  });
});

describe('pharaoh spawn manager: destroyed hulls', () => {
  it('waits exactly 45 s after destruction', () => {
    const d = driver();
    d.destroy(BLUE_JEEP);
    d.step(0);
    const early = d.step(44_800);
    expect(early.actions.filter((a) => a.type === 'spawn')).toEqual([]);
    expect(early.pads.find((p) => p.id === BLUE_JEEP)?.state).toBe('respawning');
    const late = d.step(45_200);
    const spawned = late.actions.filter((a) => a.type === 'spawn');
    expect(spawned.length).toBe(1);
    expect(spawned[0]).toMatchObject({padId: BLUE_JEEP, kind: 'jeep'});
    // 旧残骸被同一次刷新替换掉（reason = respawn）
    expect(d.removes.some((r) => r.id === BLUE_JEEP && r.reason === 'respawn')).toBe(true);
  });

  it('retries every 2 s while the pad is occupied, and spawns once it clears', () => {
    const d = driver();
    d.destroy(BLUE_JEEP);
    d.step(0);
    let calls = 0;
    const attempts: number[] = [];
    const original = d.manager.update.bind(d.manager);
    let now = 45_200;
    // 45 s 后用 canSpawn=false 走 10 s：每次 update 只允许一次「占用」重试
    for (let i = 0; i < 50; i++) {
      const result = original(now, d.vehicles, () => {
        calls++;
        attempts.push(now);
        return false;
      });
      expect(result.actions.filter((a) => a.type === 'spawn')).toEqual([]);
      expect(result.pads.find((p) => p.id === BLUE_JEEP)?.state).toBe('occupied');
      now += TICK;
    }
    expect(calls, 'one retry per 2 s, not one per tick').toBeLessThanOrEqual(6);
    expect(calls, 'and it must actually retry').toBeGreaterThanOrEqual(4);
    const retry = d.step(now, true);
    expect(retry.actions.filter((a) => a.type === 'spawn').length).toBe(1);
  });

  it('keeps at most one queued spawn per pad', () => {
    const d = driver();
    d.destroy(BLUE_JEEP);
    d.step(0);
    const until = runUntil(d, 45_200, 30, false);
    expect(d.spawns, 'no spawn while the pad is blocked').toEqual([]);
    expect(d.manager.states(until).filter((p) => p.id === BLUE_JEEP).length).toBe(1);
    // 占用重试每 2 s 一次，所以要让过 retryAt 才会真的补车
    d.step(until + 2_100, true);
    expect(d.spawns.length).toBe(1);
    // 再推一分钟，同一车位不会又冒第二辆
    runUntil(d, until + 2_100, 60, true);
    expect(d.spawns.filter((s) => s.padId === BLUE_JEEP).length).toBe(1);
  });
});

describe('pharaoh spawn manager: fleet limits', () => {
  it('holds refreshes at 40 live vehicles', () => {
    const d = driver();
    // 再塞 9 辆活着的动态车：32 + 9 = 41 辆未摧毁
    for (let i = 0; i < 9; i++) d.vehicles.push({id: `dyn-live-${i}`, x: 0, z: 0, destroyed: false});
    d.destroy(BLUE_JEEP); // 31 活 + 9 动态 = 40 活
    let result = d.step(0);
    expect(result.actions.filter((a) => a.type === 'spawn')).toEqual([]);
    result = d.step(45_200);
    expect(result.actions.filter((a) => a.type === 'spawn'), 'at the 40 live cap the spawn must wait').toEqual([]);
    // 一辆动态车被打掉 → 39 活，车位才能补
    d.destroy('dyn-live-0');
    result = d.step(47_400);
    expect(result.actions.filter((a) => a.type === 'spawn').length).toBe(1);
  });

  it('recycles the oldest wreck when 56 vehicle objects are alive', () => {
    const vehicles: VehicleSync[] = INITIAL.filter((v) => v.id !== NEUTRAL_JEEP).map((v) => ({id: v.id, x: v.x, z: v.z, destroyed: false}));
    for (let i = 0; i < 25; i++) vehicles.push({id: `dyn-wreck-${i}`, x: 0, z: 0, destroyed: true});
    const d = driver({vehicles});
    // 空车位 15 s 后尝试补车：records 已到 56 → 先清最老残骸
    d.step(0);
    let result = d.step(15_200);
    expect(result.actions.filter((a) => a.type === 'remove' && a.reason === 'limit').length).toBe(1);
    expect(result.actions.filter((a) => a.type === 'spawn').length).toBe(1);
    result = d.step(15_600);
    expect(result.actions, 'only one recycle + spawn per cycle').toEqual([]);
  });

  it('restores the full 32-vehicle fleet on reset', () => {
    const d = driver();
    d.destroy(BLUE_JEEP);
    d.step(0);
    d.step(45_200);
    expect(d.spawns.length).toBe(1);
    const dynamic = d.spawns[0].vehicleId;
    expect(d.manager.objectCount).toBe(32);
    const removed = d.manager.reset(1_000);
    expect(removed.filter((a) => a.type === 'remove' && a.reason === 'reset').map((a) => a.type === 'remove' && a.vehicleId)).toContain(dynamic);
    expect(d.manager.objectCount).toBe(32);
    expect(d.manager.padCount).toBe(32);
    const states = d.manager.states(1_000);
    expect(states.every((p) => p.state === 'ready' && p.seconds === undefined)).toBe(true);
    // 重置后第一个 tick 不会凭空补车
    d.vehicles = INITIAL.map((v): VehicleSync => ({id: v.id, x: v.x, z: v.z, destroyed: false}));
    expect(d.step(1_200).actions).toEqual([]);
  });
});

describe('pharaoh spawn manager: host authority', () => {
  it('never spawns without an explicit host update', () => {
    const manager = new VehicleSpawnManager({pads: PADS, initial: INITIAL});
    // 构造不产生任何动作；只有 host 每帧 update() 才可能下发刷新。
    expect(manager.objectCount).toBe(32);
    expect(manager.dynamicIds()).toEqual([]);
    expect(manager.states(60_000).every((pad) => pad.state === 'ready')).toBe(true);
  });

  it('is constructed only on the host side of the engine', () => {
    const file = fs.readFileSync(path.join(process.cwd(), 'src/game/engine.ts'), 'utf8');
    const index = file.indexOf('new VehicleSpawnManager(');
    expect(index, 'engine must own the manager').toBeGreaterThan(0);
    const before = file.slice(Math.max(0, index - 400), index);
    expect(before, 'manager construction must sit behind this.isHost').toMatch(/isHost/);
  });

  it('has no network or rendering dependency (guests only receive snapshots)', () => {
    const file = fs.readFileSync(path.join(process.cwd(), 'src/game/vehicles/spawn-manager.ts'), 'utf8');
    expect(file).not.toMatch(/from ['"][^'"]*network/i);
    expect(file).not.toMatch(/from ['"]three['"]/);
    expect(file).not.toMatch(/document\.|window\./);
  });
});
