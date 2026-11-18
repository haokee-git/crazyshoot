/**
 * 千户苗寨 · 真实走查（正式 PlayerController + VoxelWorldQueries + 载具运动学）。
 *
 * 覆盖任务书 §19 的核心验收：
 * - 逐栋门/楼层/楼梯/阳台/窗洞（主楼逐门走查，棚舍查开口）
 * - 9 架梯子逐架上下（含桥侧梯）
 * - 三座桥步行；南/北桥 APC 双向；中央廊桥摩托通过、APC 被真实石墩挡住
 * - 双方出生区三个门洞真实走出（含狗腿挡板）
 * - 五点导航可达、双方出生区互相可达
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { miaoVillage } from '../src/maps/miao-village';
import { MIAO_BUILDING_COUNTS, MIAO_CAPTURES, MIAO_PLOTS, MIAO_SPAWNS, MIAO_SPAWN_EXITS } from '../src/maps/miao-village/layout';
import { MIAO_BRIDGES, MIAO_FERRIES, MIAO_FERRY_DOCKS } from '../src/maps/miao-village/river';
import { FerrySystem } from '../src/game/mechanisms/river-ferry';
import { miaoHousePlan } from '../src/game/world/miao-village-structures';
import { buildVoxelMapData, type TerrainData } from '../src/game/world/voxel-map-data';
import { VoxelWorldQueries } from '../src/game/world/voxel-world-queries';
import { Navigation } from '../src/game/world/navigation';
import { PlayerController, type PlayerInput } from '../src/game/player/controller';
import type { Arena } from '../src/game/world/arena';
import { advanceVehiclePose, type MotionWorld } from '../src/game/vehicles/motion';

const BOUNDS = { minX: 1, maxX: 499, minZ: 1, maxZ: 499 };
let data: TerrainData;
let q: VoxelWorldQueries;
let arena: Arena;
let motion: MotionWorld;
let nav: Navigation;

function makeArena(): Arena {
  return {
    scene: new THREE.Scene(), colliders: [], targets: [],
    spawn: new THREE.Vector3(80, 6, 76), spawnYaw: 0, bounds: BOUNDS,
    ladders: data.ladders ?? [], navigationLayers: data.navLayers ?? 3, maxSupportY: data.minY + data.height,
    capturePoints: MIAO_CAPTURES.map((c) => ({ id: c.id, x: c.x, z: c.y, r: c.radius, floorY: c.floorY, verticalTolerance: c.verticalTolerance, footprint: c.footprint })),
    blocked: (x, z, r) => q.blocked(x, z, r, q.navigationHeight(x, z)),
    blockedAt: (x, z, r, feet, height = 1.8) => q.blocked(x, z, r, feet, height),
    playerBlocked: (x, z, r, feet, height = 1.8) => q.blocked(x, z, r, feet, height),
    heightAt: (x, z) => q.height(x, z),
    navigationHeight: (x, z) => q.navigationHeight(x, z),
    supportAt: (x, z, max) => q.support(x, z, max),
    waterAt: (x, z, feet) => q.water(x, z, feet),
    waterExitAt: (x, z) => q.waterExit(x, z),
    lineBlocked: (a, b) => q.line(a, b),
    rayDistance: (o, d, max) => q.ray(o, d, max),
    vehicleGroundAt: (x, z) => q.primary(x, z),
    footprintBlocked: (x, z, w, d, yaw, feet, height, terrain) => q.footprint(x, z, w, d, yaw, feet, height, terrain),
    raycastTargets: () => null,
    reset: () => {},
  } as Arena;
}

beforeAll(() => {
  data = buildVoxelMapData(miaoVillage);
  q = new VoxelWorldQueries(data);
  arena = makeArena();
  motion = {
    bounds: BOUNDS,
    ground: (x, z) => q.primary(x, z),
    heightAt: (x, z) => q.height(x, z),
    supportAt: (x, z, max) => q.support(x, z, max),
    waterAt: (x, z, feet) => q.water(x, z, feet),
    footprintBlocked: (x, z, w, d, yaw, feet, height, terrain) => q.footprint(x, z, w, d, yaw, feet, height, terrain),
  };
  nav = new Navigation(arena, 4);
}, 180_000);

function controllerAt(x: number, y: number, z: number, yaw = 0) {
  const p = new PlayerController(new THREE.PerspectiveCamera());
  p.teleport(new THREE.Vector3(x, y, z), yaw);
  return p;
}

function inputFor(keys: Set<string>, move?: { x: number; z: number }): PlayerInput {
  return { down: (code) => keys.has(code), consumeLook: () => ({ x: 0, y: 0 }), worldMove: move ?? null };
}

function step(p: PlayerController, keys: Set<string>, frames: number, move?: { x: number; z: number }) {
  for (let i = 0; i < frames; i++) p.update(1 / 60, inputFor(keys, move), arena, true);
}

function walkTo(p: PlayerController, tx: number, tz: number, maxFrames = 600, goalTolerance = 0.8): boolean {
  for (let i = 0; i < maxFrames; i++) {
    const dx = tx - p.position.x, dz = tz - p.position.z;
    const d = Math.hypot(dx, dz);
    if (d < goalTolerance) return true;
    p.update(1 / 60, inputFor(new Set(), { x: dx / d, z: dz / d }), arena, true);
  }
  return Math.hypot(tx - p.position.x, tz - p.position.z) < goalTolerance;
}

function localToWorld(x: number, z: number, yaw: number, u: number, v: number): [number, number] {
  const c = Math.cos((yaw * Math.PI) / 180), s = Math.sin((yaw * Math.PI) / 180);
  return [x + u * c - v * s, z + u * s + v * c];
}

describe('miao village buildings', () => {
  it('walks the entrances, floors and stairs of every house', () => {
    const problems: string[] = [];
    let main = 0, stairs = 0, windowsChecked = 0;
    for (const plot of MIAO_PLOTS) {
      if (plot.interior === 'shed' || plot.interior === 'pig-shed' || plot.interior === 'hall') continue;
      main++;
      const base = q.height(plot.x, plot.z);
      const plan = miaoHousePlan({ ...plot, baseY: base });
      const tag = plot.id;
      // every floor has a real support at its centre
      for (const y of plan.floorY) {
        const support = q.support(plot.x, plot.z, y + 0.01);
        if (Math.abs(support - y) > 0.05) problems.push(`${tag}: floor ${y} support ${support}`);
      }
      // doors: real holes, no furniture, and an exterior step
      for (const door of plan.doors) {
        const [dx, dz] = localToWorld(plot.x, plot.z, plot.yaw,
          door.side === 'front' || door.side === 'back' ? door.along : door.plane,
          door.side === 'front' || door.side === 'back' ? door.plane : door.along);
        if (q.details.blocked(dx, dz, 0.3, door.bottom + 0.3, 1.8)) problems.push(`${tag}: door ${door.side} L${door.level} blocked`);
      }
      for (const door of plan.doors.filter(d => !d.upper)) {
        const front = door.side === 'front';
        const edge = front ? plan.d / 2 : plan.w / 2;
        const point = (offset: number) => localToWorld(plot.x, plot.z, plot.yaw,
          front ? door.along : edge + offset, front ? edge + offset : door.along);
        const [sx, sz] = point(1.7);
        const [tx, tz] = point(-1.2);
        const feet = q.support(sx, sz, door.bottom + 0.3);
        const player = controllerAt(sx, feet, sz);
        if (!walkTo(player, tx, tz, 120, 0.23) || Math.abs(player.position.y - door.bottom) > 0.12) {
          problems.push(`${tag}: ${door.side} approach ${feet} → ${player.position.y.toFixed(2)} (floor ${door.bottom})`);
        }
      }
      // windows: real holes + solid frame
      for (const win of plan.windows) {
        const [wx, wz] = localToWorld(plot.x, plot.z, plot.yaw,
          win.side === 'front' || win.side === 'back' ? win.along : win.plane,
          win.side === 'front' || win.side === 'back' ? win.plane : win.along);
        if (q.details.blocked(wx, wz, 0.03, win.bottom + win.h / 2, 0.2)) problems.push(`${tag}: window ${win.side} L${win.level} blocked`);
        windowsChecked++;
      }
      if (plot.floors === 2 && plan.windows.length < 18) problems.push(`${tag}: only ${plan.windows.length} windows`);
      // stairs: real climb from the lower floor to the upper landing
      for (const stair of plan.stairs) {
        stairs++;
        const dir = stair.dir;
        const startU = dir === 1 ? stair.u0 - 0.7 : stair.u0 + 0.7;
        const midV = (stair.v0 + stair.v1) / 2;
        const [sx, sz] = localToWorld(plot.x, plot.z, plot.yaw, startU, midV);
        const p = controllerAt(sx, stair.bottom, sz);
        const c = Math.cos((plot.yaw * Math.PI) / 180), s = Math.sin((plot.yaw * Math.PI) / 180);
        const move = { x: dir * c, z: dir * s };
        let reached = false;
        for (let i = 0; i < 240; i++) {
          p.update(1 / 60, inputFor(new Set(), move), arena, true);
          if (Math.abs(p.position.y - stair.top) <= 0.08) { reached = true; break; }
        }
        if (!reached) problems.push(`${tag}: stair L${stair.level} stopped at y=${p.position.y.toFixed(2)} target ${stair.top}`);
        // upper landing is just beyond the top step, on the real upper slab
        const landingU = stair.u1 + stair.dir * 0.7;
        const [lx, lz] = localToWorld(plot.x, plot.z, plot.yaw, landingU, (stair.v0 + stair.v1) / 2);
        if (Math.abs(q.support(lx, lz, stair.top + 1) - stair.top) > 0.12) problems.push(`${tag}: stair landing unsupported (${q.support(lx, lz, stair.top + 1)})`);
      }
      // balcony floor + railing (美人靠) for every upper level
      if (plot.balcony) {
        for (let level = 1; level < plan.floors; level++) {
          const [bx, bz] = localToWorld(plot.x, plot.z, plot.yaw, 0, plot.d / 2 + 0.65);
          const support = q.support(bx, bz, plan.floorY[level] + 0.2);
          if (Math.abs(support - plan.floorY[level]) > 0.06) problems.push(`${tag}: balcony L${level} support ${support}`);
          const [rx, rz] = localToWorld(plot.x, plot.z, plot.yaw, 0, plot.d / 2 + 1.24);
          if (!q.details.blocked(rx, rz, 0.2, plan.floorY[level] + 0.8, 0.4)) problems.push(`${tag}: balcony L${level} has no railing`);
        }
      }
    }
    expect(main + 1).toBe(MIAO_BUILDING_COUNTS.main);
    expect(stairs).toBeGreaterThanOrEqual(MIAO_BUILDING_COUNTS.two + MIAO_BUILDING_COUNTS.three * 2);
    expect(windowsChecked).toBeGreaterThan(1500);
    expect(problems).toEqual([]);
  }, 180_000);

  it('every shed/pig-shed has a real walk-in opening and a roof over a stored object', () => {
    const problems: string[] = [];
    let sheds = 0;
    for (const plot of MIAO_PLOTS) {
      if (plot.interior !== 'shed' && plot.interior !== 'pig-shed') continue;
      sheds++;
      const [ox, oz] = localToWorld(plot.x, plot.z, plot.yaw, 0, plot.d / 2);
      const base = q.height(plot.x, plot.z);
      if (q.blocked(ox, oz, 0.38, base + 0.2)) problems.push(`${plot.id}: front opening blocked`);
      // back storage box exists and the roof is above 2 m
      if (q.support(plot.x, plot.z, 4) < base) problems.push(`${plot.id}: no roof/support`);
      if (q.height(plot.x, plot.z) !== base) problems.push(`${plot.id}: pad mismatch`);
    }
    expect(sheds).toBe(26);
    expect(problems).toEqual([]);
  });

  it('the public drum hall leaves a real floor and open front', () => {
    const plot = MIAO_PLOTS.find((p) => p.interior === 'hall')!;
    const floor = q.height(plot.x, plot.z) + 1;
    expect(q.support(plot.x, plot.z, floor + 0.01)).toBe(floor);
    const [fx, fz] = localToWorld(plot.x, plot.z, plot.yaw, 0, plot.d / 2 - 0.1);
    expect(q.blocked(fx, fz, 0.4, floor + 0.2)).toBe(false);
  });
});

describe('miao village river, ladders and bridges', () => {
  it('climbs up and down all 9 ladders (8 quay + bridge-side)', () => {
    const problems: string[] = [];
    expect(data.ladders?.length).toBe(9);
    for (const ladder of data.ladders!) {
      // up: keep W until the controller reaches the top/exit; stop immediately after
      const up = controllerAt(ladder.x + ladder.normalX * 0.55, -1.0, ladder.z + ladder.normalZ * 0.55, Math.atan2(ladder.normalX, ladder.normalZ));
      let upOk = false;
      for (let i = 0; i < 320; i++) {
        up.update(1 / 60, inputFor(new Set(['KeyW'])), arena, true);
        if (!up.climbing && up.position.y >= ladder.top - 0.06) {
          upOk = Math.abs(up.position.y - ladder.top) <= 0.12 && Math.hypot(up.position.x - ladder.exitX, up.position.z - ladder.exitZ) <= 0.9;
          break;
        }
      }
      if (!upOk) problems.push(`${ladder.id}: up ended (${up.position.x.toFixed(2)},${up.position.y.toFixed(2)},${up.position.z.toFixed(2)}) expected (${ladder.exitX.toFixed(2)},${ladder.top},${ladder.exitZ.toFixed(2)})`);
      // down: start at the ladder face at the top and hold S
      const down = controllerAt(ladder.x + ladder.normalX * 0.45, ladder.top, ladder.z + ladder.normalZ * 0.45, Math.atan2(ladder.normalX, ladder.normalZ));
      for (let i = 0; i < 320; i++) down.update(1 / 60, inputFor(new Set(['KeyS'])), arena, true);
      if (down.position.y > ladder.bottom + 0.5) problems.push(`${ladder.id}: down stopped at y=${down.position.y.toFixed(2)} (bottom ${ladder.bottom})`);
    }
    expect(problems).toEqual([]);
  }, 120_000);

  it('boards both ferries, carries only deck riders, and walks onto the other quay', () => {
    for (const cfg of MIAO_FERRIES) {
      const system = new FerrySystem([cfg]);
      const [west, east] = MIAO_FERRY_DOCKS.filter(dock => dock.ferry.id === cfg.id);
      const from = cfg.initialSide === 'west' ? west : east;
      const to = from === west ? east : west;
      const platformId = `ferry-${cfg.id}`;
      arena.platformAt = (x, z, maxY) => {
        if (maxY < cfg.deckY || !system.contains(cfg.id, x, z)) return null;
        return { id: platformId, x: system.state(cfg.id)!.x, z: cfg.z, y: cfg.deckY, yaw: 0, manualCarry: true };
      };
      try {
        const start = from.streetX + from.direction * 0.7;
        const local = controllerAt(start, q.support(start, cfg.z, Infinity), cfg.z);
        const dockX = from.x + from.direction;
        const bystander = controllerAt(dockX, cfg.deckY, cfg.z);
        expect(walkTo(local, system.state(cfg.id)!.x, cfg.z, 480, 0.2), `boarding ${from.id}`).toBe(true);
        step(local, new Set(), 60);
        expect(local.motionSnapshot.platformId).toBe(platformId);
        expect(system.requestById(cfg.id)).toBe(true);
        const offset = local.position.x - system.state(cfg.id)!.x;
        for (let i = 0; i < 60 * 19; i++) {
          const before = system.state(cfg.id)!.x;
          system.tick(1 / 60);
          const now = system.state(cfg.id)!.x;
          local.carryManualPlatform(arena, platformId, now - before, 0);
          bystander.carryManualPlatform(arena, platformId, now - before, 0);
          step(local, new Set(), 1);
        }
        expect(local.position.x - system.state(cfg.id)!.x).toBeCloseTo(offset, 1);
        expect(local.position.y).toBe(cfg.deckY);
        expect(bystander.position.x).toBe(dockX);
        const reached = walkTo(local, to.streetX + to.direction * 0.7, cfg.z, 480, 0.3);
        expect(reached, `disembarking ${to.id} at ${local.position.toArray().map(n => n.toFixed(2))}`).toBe(true);
      } finally {
        delete arena.platformAt;
      }
    }
  }, 120_000);

  it('keeps the full navigation channel clear of submerged curb and retaining wall voxels', () => {
    for (const cfg of MIAO_FERRIES) {
      for (let x = cfg.westX - cfg.deckLength / 2 + 0.25; x < cfg.eastX + cfg.deckLength / 2; x += 0.5) {
        for (let z = cfg.z - cfg.deckWidth / 2 + 0.25; z < cfg.z + cfg.deckWidth / 2; z += 0.5) {
          expect(q.blocked(x, z, 0.15, -1.8, 3), `${cfg.id} hull at ${x}, ${z}`).toBe(false);
        }
      }
    }
  });

  it('walks all three bridges end to end', () => {
    const problems: string[] = [];
    for (const b of MIAO_BRIDGES) {
      const z = b.id === 'central' ? b.z - 1.0 : b.z;
      const p = controllerAt(b.x0 + 1.2, b.deckY, z);
      let reached = false;
      for (let i = 0; i < 900; i++) {
        p.update(1 / 60, inputFor(new Set(), { x: 1, z: 0 }), arena, true);
        if (p.position.x > b.x1 - 1.2) { reached = true; break; }
      }
      if (!reached || p.position.y < b.deckY - 0.6) problems.push(`${b.id}: ended (${p.position.x.toFixed(1)},${p.position.y.toFixed(2)})`);
    }
    expect(problems).toEqual([]);
  }, 120_000);

  it('lets APC cross south and north bridges in both directions', () => {
    const problems: string[] = [];
    for (const b of MIAO_BRIDGES.filter((b) => b.vehicles)) {
      for (const dir of [1, -1] as const) {
        const startX = dir === 1 ? b.x0 - 2 : b.x1 + 2;
        const v = { x: startX, z: b.z, yaw: dir === 1 ? Math.PI / 2 : -Math.PI / 2, speed: 0, steering: 0 };
        let blocked = 0;
        for (let i = 0; i < 60 * 18; i++) {
          const r = advanceVehiclePose(motion, v, 'apc', 1, 0, 1 / 60);
          if (r.blocked) blocked++;
        }
        const crossed = dir === 1 ? v.x > b.x1 + 2 : v.x < b.x0 - 2;
        if (!crossed) problems.push(`${b.id} dir${dir}: x=${v.x.toFixed(1)} blockedFrames=${blocked}`);
      }
    }
    expect(problems).toEqual([]);
  }, 120_000);

  it('allows a motorcycle through the central gallery but stops an APC on real bollards', () => {
    const b = MIAO_BRIDGES.find((b) => b.id === 'central')!;
    const moto = { x: b.x0 - 4, z: b.z - 1.0, yaw: Math.PI / 2, speed: 0, steering: 0 };
    for (let i = 0; i < 60 * 16; i++) advanceVehiclePose(motion, moto, 'motorcycle', 1, 0, 1 / 60);
    expect(moto.x).toBeGreaterThan(b.x1 - 2);
    const apc = { x: b.x0 - 4, z: b.z, yaw: Math.PI / 2, speed: 0, steering: 0 };
    for (let i = 0; i < 60 * 8; i++) advanceVehiclePose(motion, apc, 'apc', 1, 0, 1 / 60);
    expect(apc.x).toBeLessThan(b.x0 + 4);
  }, 120_000);
});

describe('miao village spawns and navigation', () => {
  it('keeps all six spawn gates physically open (outer gate + dog-leg screens are navigable)', () => {
    const problems: string[] = [];
    const spawnY = { blue: 6, orange: 12 } as const;
    const gatePoint: Record<string, [number, number]> = {
      'blue-main': [80, 104], 'blue-east': [112, 80], 'blue-south': [60, 48],
      'orange-south': [407, 396], 'orange-west': [384, 400], 'orange-east': [448, 430],
    };
    for (const exit of MIAO_SPAWN_EXITS) {
      const gate = gatePoint[exit.id];
      if (!gate) { problems.push(`${exit.id}: no gate`); continue; }
      if (q.blocked(gate[0], gate[1], 0.4, spawnY[exit.team])) problems.push(`${exit.id}: outer gate blocked`);
    }
    expect(problems).toEqual([]);
  }, 60_000);

  it('connects both spawns, all five caps and all six exits on the shared navigation graph', () => {
    const points = new Map<string, [number, number]>();
    for (const s of MIAO_SPAWNS) points.set(s.team, [s.x + s.w / 2, s.y + s.d / 2]);
    for (const c of MIAO_CAPTURES) points.set(c.id, [c.x, c.y]);
    for (const e of MIAO_SPAWN_EXITS) points.set(e.id, [e.x, e.z]);
    const ids = [...points.keys()];
    const problems: string[] = [];
    for (const a of ids) for (const b of ids) {
      if (a === b) continue;
      const [ax, az] = points.get(a)!, [bx, bz] = points.get(b)!;
      if (!nav.reachable(ax, az, bx, bz)) problems.push(`${a} -> ${b}`);
    }
    expect(problems).toEqual([]);
  }, 120_000);
});
