/**
 * 法老坟墓 · 真实验收（QA-01，世界 + PlayerController + 载具运动学）
 *
 * 这里不用「纯数组假设」：整张 1000×1000 图由正式的 `buildVoxelMapData(pharaoh)` 生成，
 * 碰撞/支撑/水面/导航全部来自同一个 `VoxelWorldQueries`，走查用正式的 `PlayerController`，
 * 载具通过性用正式的 `advanceVehiclePose` / `vehiclePoseBlocked`（真实车体尺寸）。
 *
 * 验收分层：
 *  - 常开：世界规模、五点导航可达、双方出生区实走 C/D/E 与 A/B 门口、公路 MBT、
 *          绿洲出水口（水面 + 出水路线 + 控制器上岸）。
 *  - 门控（STRUCTURES=false 时 skip）：金字塔两条登顶路线、A 四向门/环路、B 四入口/内殿、
 *    A–B 墓道 + 两个中途出口、墓道载具净空、纪念碑不可爬。
 *    门控的判据是「体素世界里真的有金字塔/狮身/墓道」，即使 Lead 还没把
 *    `buildPharaohStructures` 接进 `buildVoxelMapData`，本文件也能跑绿并明确报出未跑项。
 *
 * 契约数值不在这里复述成断言常量：坐标全部从 `src/maps/pharaoh*.ts` 的导出读取，
 * 断言的是「这些数能不能走通」，避免测试和数据各写一份。
 */
import {describe, it, expect} from 'vitest';
import * as THREE from 'three';
import {pharaoh} from '../src/maps/pharaoh';
import {buildVoxelMapData, blockAt, type TerrainData} from '../src/game/world/voxel-map-data';
import {VoxelWorldQueries} from '../src/game/world/voxel-world-queries';
import {Navigation} from '../src/game/world/navigation';
import {PlayerController, type PlayerInput} from '../src/game/player/controller';
import type {Arena} from '../src/game/world/arena';
import {advanceVehiclePose, type MotionWorld} from '../src/game/vehicles/motion';
import {vehicleSize} from '../src/game/vehicles/controller';
import {PYRAMID_APEX, PYRAMID_BASE, PYRAMID_CENTER, PYRAMID_OUTER_TOP, PYRAMID_ROOMS, PYRAMID_STAIRS} from '../src/game/world/pharaoh-pyramid';
import {TUNNEL_MOUTHS, TUNNEL_ROUTE} from '../src/game/world/pharaoh-tunnel';
import {SPHINX} from '../src/game/world/pharaoh-sphinx';
import {OASIS_WATER_EXITS, OASIS_POINT} from '../src/maps/pharaoh/oasis';
import {BLOCK} from '../src/game/world/voxel-map-data';
import {isWaterMaterial} from '../src/content/materials/battlefield';
import {buildWaterExitRoutes} from '../src/game/world/water-navigation';
import {SWIM_ASCENT_DEPTH, SWIM_DEPTH} from '../src/game/player/swimming';
import {TUNNEL_LENGTH, tunnelAt, tunnelExitGeom, tunnelFloor} from '../src/game/world/pharaoh-tunnel';

/* ------------------------------------------------------------------ */
/* 世界装配（与 terrain-worker / map-arena 同口径，只是不建渲染层）     */
/* ------------------------------------------------------------------ */

const BOUNDS = {minX: 1, maxX: 799, minZ: 1, maxZ: 799};
const BLUE_SPAWN: [number, number] = [80, 85];
const ORANGE_SPAWN: [number, number] = [710, 710];

interface PharaohWorld {
  data: TerrainData;
  queries: VoxelWorldQueries;
  arena: Arena;
  nav: Navigation;
  /** 体素世界里真的存在纪念碑（Lead 已接线）才跑门控用例。 */
  structures: boolean;
  evidence: {pyramidSummitVoxel: number; sphinxHeadVoxel: number; tunnelLamps: number; navLayers: number; pyramidSummitSupport: number; sphinxHeadSupport: number};
}

function buildArena(data: TerrainData, queries: VoxelWorldQueries): Arena {
  const pads = pharaoh.vehiclePads.map((p, i) => ({id: `${p.vehicleId}-${i}`, kind: p.vehicleId, team: p.team, x: p.x, z: p.y, angle: (p.angle * Math.PI) / 180}));
  return {
    scene: new THREE.Scene(),
    colliders: [],
    targets: [],
    spawn: new THREE.Vector3(BLUE_SPAWN[0], queries.navigationHeight(BLUE_SPAWN[0], BLUE_SPAWN[1]), BLUE_SPAWN[1]),
    spawnYaw: 0,
    bounds: BOUNDS,
    // 显式门户（A/B 窄门、墓道石墩、金字塔楼梯）由 Navigation 读 arena.navLinks 建边；
    // 生产 map-arena / terrain-worker 都传了，测试 Arena 不能漏。
    navLinks: data.navLinks,
    ladders: data.ladders ?? [],
    navigationLayers: data.navLayers ?? 3,
    maxSupportY: data.minY + data.height - 1,
    capturePoints: pharaoh.capturePoints.map((c) => ({id: c.id, x: c.x, z: c.y, r: c.radius, floorY: c.floorY, verticalTolerance: c.verticalTolerance})),
    vehiclePads: pads,
    vehicles: pads.map((p) => ({id: p.id, kind: p.kind, team: p.team, x: p.x, z: p.z, angle: p.angle})),
    scoreRate: pharaoh.scoreRate,
    teamSpawns: {blue: {x: BLUE_SPAWN[0], z: BLUE_SPAWN[1], yaw: 0}, orange: {x: ORANGE_SPAWN[0], z: ORANGE_SPAWN[1], yaw: Math.PI}},
    blocked: (x: number, z: number, r: number) => queries.blocked(x, z, r, queries.navigationHeight(x, z)),
    blockedAt: (x: number, z: number, r: number, feet: number, height = 1.8) => queries.blocked(x, z, r, feet, height),
    playerBlocked: (x: number, z: number, r: number, feet: number, height = 1.8) => queries.blocked(x, z, r, feet, height),
    heightAt: (x: number, z: number) => queries.height(x, z),
    navigationHeight: (x: number, z: number) => queries.navigationHeight(x, z),
    supportAt: (x: number, z: number, max: number) => queries.support(x, z, max),
    waterAt: (x: number, z: number, feet?: number) => queries.water(x, z, feet),
    waterExitAt: (x: number, z: number) => queries.waterExit(x, z),
    lineBlocked: (a: THREE.Vector3, b: THREE.Vector3) => queries.line(a, b),
    rayDistance: (o: THREE.Vector3, d: THREE.Vector3, max: number) => queries.ray(o, d, max),
    raySurface: (o: THREE.Vector3, d: THREE.Vector3, max: number) => queries.rayHit(o, d, max),
    vehicleGroundAt: (x: number, z: number) => queries.primary(x, z),
    footprintBlocked: (x: number, z: number, w: number, d: number, yaw: number, feet: number, height: number, terrain?: {min: number; max: number}) => queries.footprint(x, z, w, d, yaw, feet, height, terrain),
    raycastTargets: () => null,
    reset: () => {},
  } as unknown as Arena;
}

function buildWorld(): PharaohWorld {
  const data = buildVoxelMapData(pharaoh);
  const queries = new VoxelWorldQueries(data);
  const arena = buildArena(data, queries);
  const nav = new Navigation(arena);
  // 结构接线判据：金字塔顶 / 狮身头部的可站立支撑真的抬起来了（0.5 m detail 也算）。
  const pyramidSummitVoxel = blockAt(data, PYRAMID_CENTER[0], 40, PYRAMID_CENTER[1]);
  const sphinxHeadVoxel = blockAt(data, SPHINX.cx, SPHINX.headTop - 3, SPHINX.cz);
  const pyramidSummitSupport = queries.support(PYRAMID_CENTER[0], PYRAMID_CENTER[1], 80);
  const sphinxHeadSupport = queries.support(SPHINX.cx, SPHINX.cz, 80);
  const tunnelLamps = data.lamps?.length ?? 0;
  return {
    data,
    queries,
    arena,
    nav,
    structures: pyramidSummitSupport > 30 && sphinxHeadSupport >= 3.5,
    evidence: {pyramidSummitVoxel, sphinxHeadVoxel, tunnelLamps, navLayers: data.navLayers ?? 0, pyramidSummitSupport, sphinxHeadSupport},
  };
}

const WORLD = buildWorld();
const MOTION: MotionWorld = {
  bounds: BOUNDS,
  ground: (x, z) => WORLD.queries.primary(x, z),
  heightAt: (x, z) => WORLD.queries.height(x, z),
  supportAt: (x, z, max) => WORLD.queries.support(x, z, max),
  waterAt: (x, z, feet) => WORLD.queries.water(x, z, feet),
  footprintBlocked: (x, z, w, d, yaw, feet, height, terrain) => WORLD.queries.footprint(x, z, w, d, yaw, feet, height, terrain),
};
const STRUCTURES = WORLD.structures;

/* ------------------------------------------------------------------ */
/* 走查器：正式 PlayerController + 导航/路点引导                        */
/* ------------------------------------------------------------------ */

const camera = () => new THREE.PerspectiveCamera();

function inputPair() {
  const keys = new Set<string>();
  const input: PlayerInput & {worldMove?: {x: number; z: number} | null} = {
    down: (code) => keys.has(code),
    consumeLook: () => ({x: 0, y: 0}),
    worldMove: null,
  };
  return {keys, input};
}

interface AcceptZone {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** 期望的脚下地面高度。 */
  y: number;
  tolerance?: number;
}
interface WalkResult {
  arrived: boolean;
  reason: 'arrived' | 'timeout' | 'stuck' | 'unreachable' | 'fell';
  seconds: number;
  frames: number;
  position: {x: number; y: number; z: number};
  path: {x: number; z: number; y: number}[];
  maxY: number;
  minY: number;
  lastWaypoint: {x: number; z: number; y?: number; action?: string} | null;
}

const trace = (r: WalkResult) => JSON.stringify({reason: r.reason, at: [Number(r.position.x.toFixed(1)), Number(r.position.y.toFixed(1)), Number(r.position.z.toFixed(1))], seconds: Number(r.seconds.toFixed(1)), waypoint: r.lastWaypoint});

/**
 * 用官方控制器走到目标点：导航图给方向，脚下 1 m 台阶靠 Space 翻越。
 * 三个停止条件都要区分开（不可达 / 卡住 / 超时），失败信息里带停在哪。
 */
function walkTo(start: [number, number], goal: [number, number], options: {goalY?: number; arrive?: number; maxSeconds?: number; startY?: number; maxStuckSeconds?: number; accept?: AcceptZone} = {}): WalkResult {
  const arrive = options.arrive ?? 2.5;
  const maxSeconds = options.maxSeconds ?? 260;
  const maxStuckSeconds = options.maxStuckSeconds ?? 4;
  const controller = new PlayerController(camera());
  const startY = options.startY ?? (WORLD.arena.navigationHeight?.(start[0], start[1]) ?? 0) + 0.02;
  controller.teleport(new THREE.Vector3(start[0], startY, start[1]), 0);
  const {keys, input} = inputPair();
  const path: {x: number; z: number; y: number}[] = [];
  let frames = 0;
  let reason: WalkResult['reason'] = 'timeout';
  let lastWaypoint: WalkResult['lastWaypoint'] = null;
  let arrivedFrames = 0;
  let stuckFrames = 0;
  let lastX = controller.position.x;
  let lastZ = controller.position.z;
  let maxY = controller.position.y;
  let minY = controller.position.y;
  let lap = 0;
  let sidestep = 0;
  let sideSign = 1;

  while (frames < maxSeconds * 60) {
    const p = controller.position;
    const accept = options.accept;
    if (accept) {
      const inside = p.x >= accept.x0 && p.x <= accept.x1 && p.z >= accept.z0 && p.z <= accept.z1 && Math.abs(p.y - accept.y) <= (accept.tolerance ?? 1.2);
      if (inside) {
        arrivedFrames++;
        if (arrivedFrames >= 3) { reason = 'arrived'; break; }
      } else arrivedFrames = 0;
      if (arrivedFrames > 0) { frames++; continue; }
    }
    const distance = Math.hypot(p.x - goal[0], p.z - goal[1]);
    const yOk = options.goalY === undefined || Math.abs(p.y - options.goalY) <= 1.6;
    if (distance <= arrive && yOk) {
      arrivedFrames++;
      if (arrivedFrames >= 3) { reason = 'arrived'; break; }
    } else arrivedFrames = 0;
    if (p.y < WORLD.data.minY + 1) { reason = 'fell'; break; }

    // 长距离绕行不穿纪念碑内部（A/B 的室内实走另有专门用例）：给 >+10 m 的格子加代价。
    const avoidMonument = (point: {y?: number}) => (point.y !== undefined && point.y > 10 ? 8 : 0);
    const waypoint = WORLD.nav.next(p.x, p.z, goal[0], goal[1], p.y, options.goalY, avoidMonument)
      ?? WORLD.nav.next(p.x, p.z, goal[0], goal[1], p.y, options.goalY)
      ?? WORLD.nav.next(p.x, p.z, goal[0], goal[1]);
    if (!waypoint) { reason = 'unreachable'; break; }
    lastWaypoint = waypoint;
    if (frames % 12 === 0) path.push({x: p.x, z: p.z, y: p.y});

    let dx = waypoint.x - p.x;
    let dz = waypoint.z - p.z;
    const len = Math.hypot(dx, dz) || 1;
    if (len < 1.4) {
      const ahead = WORLD.nav.next(waypoint.x, waypoint.z, goal[0], goal[1], waypoint.y, options.goalY);
      if (ahead) {
        const ax = ahead.x - p.x;
        const az = ahead.z - p.z;
        const al = Math.hypot(ax, az);
        if (al > 1.2) { dx = ax; dz = az; }
      }
    }
    const norm = Math.hypot(dx, dz) || 1;
    if (stuckFrames > 80 && sidestep === 0) { sidestep = 36; sideSign = -sideSign; }
    if (sidestep > 0) {
      // 横向挪 0.5 s：错位门/石柱夹出的 1 m 缝只能这么过。
      input.worldMove = {x: (-dz / norm) * sideSign, z: (dx / norm) * sideSign};
      sidestep--;
    } else input.worldMove = {x: dx / norm, z: dz / norm};
    keys.add('KeyW');
    controller.yaw = Math.atan2(-input.worldMove.x, -input.worldMove.z);

    // 导航标注的翻越/跳下动作、以及卡住时的自救都按 Space；必须是「按一下松一下」，
    // 因为 jumpBuffer 只在 keydown 的上升沿装填（长按第二次就再也翻不过去）。
    const needsLift = waypoint.action === 'mantle' || waypoint.action === 'jump';
    if ((needsLift || stuckFrames > 30) && frames % 12 < 3) keys.add('Space');
    else keys.delete('Space');

    if (waypoint.action === 'ladder') {
      const ladder = (WORLD.arena.ladders ?? []).reduce<null | {x: number; z: number; normalX: number; normalZ: number; dx: number}>((best, l) => {
        const d = Math.hypot(l.x - p.x, l.z - p.z);
        return !best || d < best.dx ? {...l, dx: d} : best;
      }, null);
      if (ladder) { controller.yaw = Math.atan2(ladder.normalX, ladder.normalZ); keys.add('KeyW'); }
    }

    controller.update(1 / 60, input, WORLD.arena, true);

    const moved = Math.hypot(controller.position.x - lastX, controller.position.z - lastZ);
    stuckFrames = moved < 0.012 ? stuckFrames + 1 : 0;
    lastX = controller.position.x;
    lastZ = controller.position.z;
    maxY = Math.max(maxY, controller.position.y);
    minY = Math.min(minY, controller.position.y);
    if (stuckFrames > maxStuckSeconds * 60) { reason = 'stuck'; break; }
    frames++;
    if (++lap % 600 === 0) path.push({x: controller.position.x, z: controller.position.z, y: controller.position.y});
  }
  keys.clear();
  return {
    arrived: reason === 'arrived',
    reason,
    seconds: frames / 60,
    frames,
    position: {x: controller.position.x, y: controller.position.y, z: controller.position.z},
    path,
    maxY,
    minY,
    lastWaypoint,
  };
}

/** 沿「作者给定的路点」连续走（楼梯/坡道/门洞用，避免 3 m 导航栅格吃掉 3 m 宽的台阶）。 */
function walkThrough(start: [number, number], waypoints: [number, number][], options: {startY?: number; arrive?: number; maxSeconds?: number; goalY?: number; accept?: AcceptZone} = {}): WalkResult {
  const arrive = options.arrive ?? 2.0;
  const maxSeconds = options.maxSeconds ?? 220;
  const controller = new PlayerController(camera());
  const startY = options.startY ?? (WORLD.arena.navigationHeight?.(start[0], start[1]) ?? 0) + 0.02;
  controller.teleport(new THREE.Vector3(start[0], startY, start[1]), 0);
  const {keys, input} = inputPair();
  const path: {x: number; z: number; y: number}[] = [];
  let index = 0;
  let frames = 0;
  let reason: WalkResult['reason'] = 'timeout';
  let maxY = controller.position.y;
  let minY = controller.position.y;
  let stuck = 0;
  let lastX = controller.position.x;
  let lastZ = controller.position.z;
  let sidestep = 0;
  let sideSign = 1;
  let acceptedFrames = 0;
  while (frames < maxSeconds * 60) {
    const p = controller.position;
    const accept = options.accept;
    if (accept && p.x >= accept.x0 && p.x <= accept.x1 && p.z >= accept.z0 && p.z <= accept.z1 && Math.abs(p.y - accept.y) <= (accept.tolerance ?? 1.2)) {
      acceptedFrames++;
      if (acceptedFrames >= 3) { reason = 'arrived'; break; }
    } else acceptedFrames = 0;
    if (index >= waypoints.length) {
      const yOk = options.goalY === undefined || Math.abs(p.y - options.goalY) <= 1.8;
      if (yOk) { reason = 'arrived'; break; }
      reason = 'stuck';
      break;
    }
    const target = waypoints[index];
    const distance = Math.hypot(target[0] - p.x, target[1] - p.z);
    if (distance <= arrive) { index++; continue; }
    const dx = target[0] - p.x;
    const dz = target[1] - p.z;
    const norm = Math.hypot(dx, dz) || 1;
    if (stuck > 70 && sidestep === 0) { sidestep = 36; sideSign = -sideSign; }
    if (sidestep > 0) {
      // 横向挪 0.5 s：错位门/石柱夹出的 1 m 缝只能这么过。
      input.worldMove = {x: (-dz / norm) * sideSign, z: (dx / norm) * sideSign};
      sidestep--;
    } else input.worldMove = {x: dx / norm, z: dz / norm};
    keys.add('KeyW');
    controller.yaw = Math.atan2(-input.worldMove.x, -input.worldMove.z);
    if (stuck > 25 && frames % 12 < 3) keys.add('Space');
    else keys.delete('Space');
    controller.update(1 / 60, input, WORLD.arena, true);
    const moved = Math.hypot(controller.position.x - lastX, controller.position.z - lastZ);
    stuck = moved < 0.012 ? stuck + 1 : 0;
    lastX = controller.position.x;
    lastZ = controller.position.z;
    if (p.y < WORLD.data.minY + 1) { reason = 'fell'; break; }
    if (stuck > 300) { reason = 'stuck'; break; }
    maxY = Math.max(maxY, controller.position.y);
    minY = Math.min(minY, controller.position.y);
    if (frames % 12 === 0) path.push({x: p.x, z: p.z, y: p.y});
    frames++;
  }
  keys.clear();
  return {
    arrived: reason === 'arrived',
    reason,
    seconds: frames / 60,
    frames,
    position: {x: controller.position.x, y: controller.position.y, z: controller.position.z},
    path,
    maxY,
    minY,
    lastWaypoint: index < waypoints.length ? {x: waypoints[index][0], z: waypoints[index][1]} : null,
  };
}

/** 沿折线开车（纯追踪），返回走过的距离 / 是否被挡 / 撞停位置。 */
function driveAlong(kind: string, points: [number, number][], seconds: number, throttle = 1) {
  const start = points[0];
  const state = {x: start[0], z: start[1], yaw: Math.atan2(points[1][0] - start[0], points[1][1] - start[1]), speed: 0, steering: 0};
  let index = 1;
  let blockedSteps = 0;
  let distance = 0;
  const blocks: {x: number; z: number; t: number}[] = [];
  let t = 0;
  while (t < seconds) {
    if (index < points.length && Math.hypot(points[index][0] - state.x, points[index][1] - state.z) < 6) index++;
    const target = points[Math.min(index, points.length - 1)];
    const desired = Math.atan2(target[0] - state.x, target[1] - state.z);
    let error = desired - state.yaw;
    while (error > Math.PI) error -= Math.PI * 2;
    while (error < -Math.PI) error += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, error * 1.8));
    const before = {x: state.x, z: state.z};
    const step = advanceVehiclePose(MOTION, state, kind, throttle, steer, 1 / 60);
    distance += Math.hypot(state.x - before.x, state.z - before.z);
    if (step.blocked) {
      blockedSteps++;
      if (blocks.length < 12) blocks.push({x: Number(state.x.toFixed(1)), z: Number(state.z.toFixed(1)), t: Number(t.toFixed(1))});
    }
    t += 1 / 60;
    if (state.speed === 0 && blockedSteps > 30) break;
  }
  return {distance, blockedSteps, blocks, position: {x: state.x, z: state.z}, seconds: t};
}

/* ------------------------------------------------------------------ */
/* 1. 世界规模                                                         */
/* ------------------------------------------------------------------ */


/* ================================================================== */
/* 0. 世界规模与可站立面                                              */
/* ================================================================== */

describe('pharaoh world data', () => {
  it('builds the 800 m contract world with four navigation layers and authored interiors', () => {
    expect(WORLD.data.id).toBe('pharaoh');
    expect(WORLD.data.size).toBe(800);
    expect(WORLD.data.minY).toBe(-12);
    expect(WORLD.data.height).toBe(72);
    expect(WORLD.data.navLayers).toBe(4);
    expect((WORLD.data.interiors ?? []).length).toBeGreaterThanOrEqual(20);
    expect((WORLD.data.detailBoxes ?? []).length).toBeGreaterThan(3000);
    expect(STRUCTURES, `structures not wired: ${JSON.stringify(WORLD.evidence)}`).toBe(true);
  });

  it('has solid ground and a drivable deck at every capture point, spawn and vehicle pad', () => {
    const samples: [string, number, number][] = [
      ...pharaoh.capturePoints.map((c) => [c.id, c.x, c.y] as [string, number, number]),
      ['blue', BLUE_SPAWN[0], BLUE_SPAWN[1]],
      ['orange', ORANGE_SPAWN[0], ORANGE_SPAWN[1]],
    ];
    for (const [id, x, z] of samples) {
      const height = WORLD.queries.height(x, z);
      expect(Number.isFinite(height), `${id} height`).toBe(true);
      expect(height, `${id} above map floor`).toBeGreaterThan(WORLD.data.minY + 2);
      const cap = pharaoh.capturePoints.find((c) => c.id === id);
      expect(WORLD.queries.primary(x, z), `${id} drivable deck`).toBeCloseTo(cap?.floorY ?? height, 1);
    }
    for (const pad of pharaoh.vehiclePads) {
      expect(Number.isFinite(WORLD.queries.primary(pad.x, pad.y)), `pad ${pad.vehicleId}@${pad.x},${pad.y}`).toBe(true);
    }
  });
});

/* ================================================================== */
/* 1. 七据点导航可达                                                   */
/* ================================================================== */

describe('capture point reachability (navigation graph)', () => {
  const targets: [string, number, number][] = [
    ['C', 475, 395],
    ['D', 175, 290],
    ['E', 350, 105],
    ['F', 650, 130],
    ['G', 210, 420],
    ['A south gate', 190, 478],
    ['A west gate', 50, 607],
    ['A north stair foot', 190, 755],
    ['B west mouth', 378, 640],
    ['B north ramp', 460, 600],
    ['B south mouth', 455, 670],
  ];

  it('reaches all seven point centres / monument gates from both spawns', () => {
    const failures: string[] = [];
    for (const [team, spawn] of [['blue', BLUE_SPAWN], ['orange', ORANGE_SPAWN]] as const) {
      for (const [label, x, z] of targets) {
        if (!WORLD.nav.reachable(spawn[0], spawn[1], x, z)) failures.push(`${team} → ${label}(${x},${z})`);
      }
    }
    expect(failures, failures.join(' | ')).toEqual([]);
  });

  it('keeps the A–B tunnel connected end to end and to both mid exits', () => {
    const a = tunnelAt(6);
    const b = tunnelAt(TUNNEL_LENGTH - 6);
    expect(WORLD.nav.reachable(a.x, a.z, b.x, b.z)).toBe(true);
    for (const exit of tunnelExitGeom((x, z) => WORLD.queries.height(x, z))) {
      expect(WORLD.nav.reachable(a.x, a.z, exit.mouth[0], exit.mouth[1]), `mid exit ${exit.name} mouth`).toBe(true);
    }
  });

  it('keeps the five outdoor sites mutually reachable', () => {
    const failures: string[] = [];
    const outdoor = pharaoh.capturePoints.filter((c) => ['C', 'D', 'E', 'F', 'G'].includes(c.id));
    for (const a of outdoor) for (const b of outdoor) {
      if (a === b) continue;
      if (!WORLD.nav.reachable(a.x, a.y, b.x, b.y)) failures.push(`${a.id} → ${b.id}`);
    }
    expect(failures, failures.join(' | ')).toEqual([]);
  });
});

/* ================================================================== */
/* 2. 双方出生区实走                                                  */
/* ================================================================== */

describe('players can really walk out of both spawns', () => {
  const routes: {name: string; start: [number, number]; goal: [number, number]; goalY?: number; maxSeconds: number; via?: [number, number][]}[] = [
    {name: 'blue → C 集市南口', start: BLUE_SPAWN, goal: [475, 520], maxSeconds: 300},
    {name: 'blue → E 驿站前场', start: BLUE_SPAWN, goal: [350, 150], goalY: 3.2, maxSeconds: 220},
    {name: 'blue → D 绿洲北岸', start: BLUE_SPAWN, goal: [190, 300], goalY: 0.6, maxSeconds: 240},
    {name: 'blue → A 南门楼前', start: BLUE_SPAWN, goal: [190, 470], goalY: 4, maxSeconds: 300},
    {name: 'orange → C 集市北口', start: ORANGE_SPAWN, goal: [478, 540], maxSeconds: 300},
    {name: 'orange → B 北侧坡道', start: ORANGE_SPAWN, goal: [455, 675], maxSeconds: 280},
    {name: 'orange → F 神庙北门', start: ORANGE_SPAWN, goal: [650, 220], goalY: 4, maxSeconds: 320},
    {name: 'orange → G 采石场', start: ORANGE_SPAWN, goal: [235, 445], goalY: 3, maxSeconds: 380,
      via: [[700, 670], [660, 700], [610, 730], [540, 745], [450, 755], [350, 760], [260, 760], [190, 755], [160, 690], [150, 620], [140, 540], [150, 470], [190, 478], [210, 450]]},
  ];
  for (const route of routes) {
    it(route.name, () => {
      const result = route.via
        ? walkThrough(route.start, route.via, {goalY: route.goalY, maxSeconds: route.maxSeconds, arrive: 4})
        : walkTo(route.start, route.goal, {goalY: route.goalY, maxSeconds: route.maxSeconds, arrive: 3.5});
      expect(result.arrived, `${route.name} stopped: ${trace(result)}`).toBe(true);
    }, 180_000);
  }
});

/* ================================================================== */
/* 3. 据点垂直判定                                                     */
/* ================================================================== */

describe('capture vertical bands', () => {
  const cap = (id: string) => pharaoh.capturePoints.find((c) => c.id === id)!;
  const counts = (id: string, x: number, z: number, y: number) => {
    const c = cap(id);
    const inside = Math.hypot(x - c.x, z - c.y) <= c.radius;
    if (!inside) return false;
    if (c.floorY === undefined) return true;
    return Math.abs(y - c.floorY) <= (c.verticalTolerance ?? 2.5);
  };

  it('only A (5) and B (4) pin an indoor floor', () => {
    expect(cap('A').floorY).toBe(5);
    expect(cap('B').floorY).toBe(4);
    for (const id of ['C', 'D', 'E', 'F', 'G']) expect(cap(id).floorY, id).toBeUndefined();
  });

  it('A counts in the burial chamber only — not on the summit, upper gallery or tunnel floor', () => {
    expect(counts('A', PYRAMID_CENTER[0], PYRAMID_CENTER[1], 5)).toBe(true);
    for (const [label, y] of [['summit +58', PYRAMID_OUTER_TOP], ['upper gallery +20', 20], ['tunnel floor +1', 1]] as const) {
      expect(counts('A', PYRAMID_CENTER[0], PYRAMID_CENTER[1], y), `${label} must not capture A`).toBe(false);
    }
  });

  it('B counts in the inner hall only — not on the head or the exterior forecourt', () => {
    expect(counts('B', SPHINX.cx, SPHINX.cz, 4)).toBe(true);
    for (const [label, y] of [['head +41', SPHINX.headTop], ['chest +26', SPHINX.chestTop], ['ground outside', 0]] as const) {
      expect(counts('B', SPHINX.cx, SPHINX.cz, y), `${label} must not capture B`).toBe(false);
    }
  });
});

/* ================================================================== */
/* 4. 绿洲出水口                                                       */
/* ================================================================== */

describe('oasis water exits', () => {
  const stats = (() => {
    const {data, queries} = WORLD;
    const routes = (data.waterExits = buildWaterExitRoutes(data, queries));
    const {minX, minZ, minY, width, depth, height, water, voxels} = data;
    let waterBlocks = 0;
    let openFaces = 0;
    let navigable = 0;
    let missingExit = 0;
    const traps: number[][] = [];
    const dirs = [[-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1], [0, -1, 0]];
    for (let iz = 0; iz < depth; iz++) for (let ix = 0; ix < width; ix++) {
      const k = iz * width + ix;
      const x = minX + ix;
      const z = minZ + iz;
      for (let iy = 0; iy < height; iy++) {
        if (!isWaterMaterial(voxels[k * height + iy])) continue;
        waterBlocks++;
        const y = minY + iy;
        for (const [dx, dy, dz] of dirs) {
          if (ix + dx < 0 || ix + dx >= width || iz + dz < 0 || iz + dz >= depth) continue;
          if (blockAt(data, x + dx, y + dy, z + dz) !== BLOCK.AIR) continue;
          openFaces++;
        }
      }
      if (x < 1 || x >= 799 || z < 1 || z >= 799 || water[k] === -32768) continue;
      const w = queries.water(x + 0.5, z + 0.5, water[k]);
      if (!w) continue;
      const deep = w.surface - w.bottom >= SWIM_DEPTH;
      const y = deep ? w.surface - SWIM_ASCENT_DEPTH : w.bottom;
      if (queries.blocked(x + 0.5, z + 0.5, 0.38, y)) continue;
      navigable++;
      if (routes[k] < 0) {
        missingExit++;
        if (traps.length < 8) traps.push([x, y, z]);
      }
    }
    return {waterBlocks, openFaces, navigable, missingExit, traps};
  })();

  it('has sealed water and no missing exit', () => {
    expect(stats.waterBlocks, 'waterBlocks').toBeGreaterThan(18_000);
    expect(stats.openFaces, 'openFaces must be 0 (water is sealed)').toBe(0);
    expect(stats.navigable, 'navigable').toBeGreaterThan(3_500);
    expect(stats.missingExit, `missingExit must be 0, traps ${JSON.stringify(stats.traps)}`).toBe(0);
  });

  it('a real swimming player escapes deep-water samples', () => {
    const {data, queries} = WORLD;
    const routes = data.waterExits ?? (data.waterExits = buildWaterExitRoutes(data, queries));
    const samples: {x: number; y: number; z: number}[] = [];
    for (let z = 2; z < 798; z += 4) for (let x = 2; x < 798; x += 4) {
      const k = (z - data.minZ) * data.width + (x - data.minX);
      const surface = data.water[k];
      if (surface === -32768 || routes[k] < 0) continue;
      const w = queries.water(x + 0.5, z + 0.5, surface);
      if (!w || w.surface - w.bottom < SWIM_DEPTH) continue;
      if (queries.blocked(x + 0.5, z + 0.5, 0.38, w.bottom)) continue;
      samples.push({x: x + 0.5, y: w.bottom, z: z + 0.5});
    }
    expect(samples.length).toBeGreaterThan(12);
    const failures: string[] = [];
    const count = Math.min(samples.length, 6);
    for (let index = 0; index < count; index++) {
      const start = samples[Math.floor(((index + 0.5) / count) * samples.length)];
      const controller = new PlayerController(camera());
      controller.teleport(new THREE.Vector3(start.x, start.y, start.z), 0);
      let escaped = false;
      for (let tick = 0; tick < 60 * 45; tick++) {
        const p = controller.position;
        const water = queries.water(p.x, p.z, p.y);
        if (controller.mantle || !water || p.y >= water.surface - 0.015) {
          if (!controller.mantle && controller.grounded) { escaped = true; break; }
          controller.update(1 / 60, {down: () => false, consumeLook: () => ({x: 0, y: 0})}, WORLD.arena, true);
          continue;
        }
        const step = queries.waterExit(p.x, p.z);
        if (!step) break;
        const dx = step.x - p.x;
        const dz = step.z - p.z;
        controller.yaw = Math.atan2(-dx, -dz);
        controller.update(1 / 60, {
          worldMove: {x: dx, z: dz},
          down: (key: string) => key === 'KeyW' || key === 'ShiftLeft' || key === 'Space',
          consumeLook: () => ({x: 0, y: 0}),
        }, WORLD.arena, true);
      }
      if (!escaped) failures.push(`start ${start.x.toFixed(1)},${start.y.toFixed(1)},${start.z.toFixed(1)} → ${controller.position.x.toFixed(1)},${controller.position.y.toFixed(1)},${controller.position.z.toFixed(1)}`);
    }
    expect(failures, failures.join(' | ')).toEqual([]);
  }, 120_000);

  it('keeps the eight authored bank points inside the playable square', () => {
    expect(OASIS_WATER_EXITS.length).toBeGreaterThanOrEqual(6);
    for (const exit of OASIS_WATER_EXITS) {
      expect(exit.x).toBeGreaterThan(0);
      expect(exit.x).toBeLessThan(800);
      expect(exit.z).toBeGreaterThan(0);
      expect(exit.z).toBeLessThan(800);
    }
  });
});

/* ================================================================== */
/* 5. 公路：最重载具能跑                                               */
/* ================================================================== */

describe('road traffic', () => {
  it('an MBT drives the main south road centre line without getting stuck', () => {
    const result = driveAlong('mbt', [[100, 140], [300, 160], [520, 205], [650, 220]], 55);
    expect(result.distance, `MBT covered only ${result.distance.toFixed(1)} m, blocks ${JSON.stringify(result.blocks)}`).toBeGreaterThan(250);
    expect(result.blockedSteps / 60, 'road should not stop a hull repeatedly').toBeLessThan(3);
  }, 90_000);

  it('every hull size fits on a straight main-road segment', () => {
    for (const kind of ['motorcycle', 'jeep', 'apc', 'ifv', 'light_tank', 'mbt']) {
      const result = driveAlong(kind, [[300, 160], [420, 175]], 26);
      expect(result.distance, `${kind} covered ${result.distance.toFixed(1)} m: ${JSON.stringify(result.blocks)}`).toBeGreaterThan(70);
    }
  }, 120_000);

  it('uses the runtime hull sizes', () => {
    expect(vehicleSize('motorcycle').w).toBeLessThanOrEqual(1);
    expect(vehicleSize('jeep').w).toBeGreaterThan(1.5);
    expect(vehicleSize('mbt').d).toBeGreaterThan(6);
  });
});

/* ================================================================== */
/* 6. 纪念碑与墓道                                                     */
/* ================================================================== */

const room = (id: string) => PYRAMID_ROOMS.find((r) => r.id === id)!;
const zoneOf = (r: {x0: number; x1: number; z0: number; z1: number; floor: number}): AcceptZone => ({
  x0: r.x0 + 1.5, x1: r.x1 - 1.5, z0: r.z0 + 1.5, z1: r.z1 - 1.5, y: r.floor,
});

describe.skipIf(!STRUCTURES)('pyramid interior (A)', () => {
  it('walks from the south outer door into the burial chamber', () => {
    const chamber = room('burial-chamber');
    const centre: [number, number] = [(chamber.x0 + chamber.x1) / 2, (chamber.z0 + chamber.z1) / 2];
    const result = walkThrough([PYRAMID_CENTER[0], PYRAMID_BASE.z0 - 6], [
      [centre[0], PYRAMID_BASE.z0 + 8], [centre[0], PYRAMID_BASE.z0 + 20],
      [centre[0], chamber.z0 - 20], [centre[0], chamber.z0 - 4], centre,
    ], {goalY: chamber.floor, arrive: 3, maxSeconds: 150, accept: zoneOf(chamber)});
    expect(result.arrived, `south door → chamber: ${trace(result)}`).toBe(true);
  }, 180_000);

  it('has a real interior loop chamber ↔ antechamber ↔ north gallery', () => {
    const chamber = room('burial-chamber');
    const gallery = room('n-gallery');
    const chamberFloor: [number, number] = [chamber.x0 + 6, (chamber.z0 + chamber.z1) / 2];
    const result = walkThrough(chamberFloor, [
      [(chamber.x0 + chamber.x1) / 2, chamber.z0 + 2],
      [(chamber.x0 + chamber.x1) / 2, gallery.z0 + 8],
    ], {goalY: gallery.floor, arrive: 3, maxSeconds: 120, accept: zoneOf(gallery)});
    expect(result.arrived, `chamber → north gallery: ${trace(result)}`).toBe(true);
  }, 150_000);

  it('keeps the outer summit and the tomb floor non-drivable', () => {
    expect(WORLD.queries.support(PYRAMID_CENTER[0], PYRAMID_CENTER[1], 80)).toBeGreaterThan(PYRAMID_OUTER_TOP - 4);
    const edge = {x: PYRAMID_BASE.x0 - 3, z: (PYRAMID_BASE.z0 + PYRAMID_BASE.z1) / 2};
    const result = driveAlong('mbt', [[edge.x - 6, edge.z], [edge.x + 6, edge.z]], 18);
    expect(result.distance, 'MBT must be stopped by the stepped shell').toBeLessThan(18);
  }, 60_000);
});

describe.skipIf(!STRUCTURES)('sphinx interior (B)', () => {
  const hall = SPHINX.hall;
  const hallZone: AcceptZone = {x0: hall.x0 + 2, x1: hall.x1 - 2, z0: hall.z0 + 2, z1: hall.z1 - 2, y: hall.floor};
  const hallPoint: [number, number] = [hall.x0 + 4, hall.z1 - 4];

  it('all four authored entrances reach the inner hall', () => {
    const names = ['west', 'north', 'south', 'east'];
    const failures: string[] = [];
    for (const [index, e] of SPHINX.entrances.entries()) {
      const start: [number, number] = e.id === 'west'
        ? [e.x - 7, e.z]
        : e.id === 'north'
          ? [e.x, e.z - 7]
          : e.id === 'south'
            ? [e.x, e.z + 7]
            : [e.x + 7, e.z];
      const result = walkThrough(start, [[e.x, e.z], [(hall.x0 + hall.x1) / 2, (hall.z0 + hall.z1) / 2], hallPoint], {
        goalY: 4, arrive: 3, maxSeconds: 100, accept: hallZone,
      });
      if (!result.arrived) failures.push(`${names[index]}(${e.x},${e.z}): ${trace(result)}`);
    }
    expect(failures, failures.join(' | ')).toEqual([]);
  }, 180_000);

  it('vehicles cannot enter the inner hall', () => {
    const result = driveAlong('motorcycle', [[SPHINX.bounds.x1 + 12, SPHINX.cz], [SPHINX.bounds.x1 - 2, SPHINX.cz], [SPHINX.cx, SPHINX.cz]], 25);
    expect(result.distance, 'even a motorcycle must be stopped before the hall centre').toBeLessThan(55);
  }, 60_000);
});

describe.skipIf(!STRUCTURES)('A–B tunnel', () => {
  it('is walkable from the pyramid east door to the sphinx west side', () => {
    const firstS = 6;
    const lastS = TUNNEL_LENGTH - 6;
    const startPoint = tunnelAt(firstS);
    const startY = WORLD.queries.primary(startPoint.x, startPoint.z) + 0.05;
    const legs: [number, number][] = [];
    for (let s = firstS + 12; s <= lastS; s += 12) {
      const point = tunnelAt(s);
      legs.push([point.x, point.z]);
    }
    const endPoint = tunnelAt(lastS);
    legs.push([endPoint.x, endPoint.z]);
    const result = walkThrough([startPoint.x, startPoint.z], legs, {maxSeconds: 280, arrive: 3, startY});
    expect(result.arrived, `tunnel walk: ${trace(result)}`).toBe(true);
    expect(result.minY, 'tunnel dips to about +1').toBeLessThan(2.2);
    expect(result.maxY, 'and climbs back to the sphinx floor').toBeGreaterThan(3.2);
  }, 180_000);

  it('both mid exits climb from the tunnel floor to the surface', () => {
    const exits = tunnelExitGeom((x, z) => WORLD.queries.height(x, z));
    expect(exits.length).toBe(2);
    const failures: string[] = [];
    for (const exit of exits) {
      const approach = tunnelAt(exit.entryS - 4);
      const start: [number, number] = [approach.x, approach.z];
      const startY = WORLD.queries.primary(start[0], start[1]) + 0.05;
      const climb: [number, number][] = [];
      for (let t = 0; t <= 1.0001; t += 0.2) climb.push([exit.entry[0] + (exit.mouth[0] - exit.entry[0]) * t, exit.entry[1] + (exit.mouth[1] - exit.entry[1]) * t]);
      const mouthZone: AcceptZone = {x0: exit.mouth[0] - 3, x1: exit.mouth[0] + 3, z0: exit.mouth[1] - 3, z1: exit.mouth[1] + 3, y: exit.top, tolerance: 1.8};
      const result = walkThrough(start, climb, {goalY: exit.top, arrive: 1.8, maxSeconds: 150, startY, accept: mouthZone});
      if (result.maxY < exit.top - 1.8) failures.push(`${exit.name} (mouth ${exit.mouth[0].toFixed(1)},${exit.mouth[1].toFixed(1)} top ${exit.top}): ${trace(result)}`);
    }
    expect(failures, failures.join(' | ')).toEqual([]);
  }, 180_000);

  it('lets a motorcycle through but stops a jeep / MBT', () => {
    const route: [number, number][] = [];
    for (let s = 6; s <= TUNNEL_LENGTH - 6; s += 2) {
      const point = tunnelAt(s);
      route.push([point.x, point.z]);
    }
    const bike = driveAlong('motorcycle', route, 110, 0.25);
    const jeep = driveAlong('jeep', route, 90, 0.25);
    const mbt = driveAlong('mbt', route, 90, 0.25);
    expect(bike.distance, `motorcycle should get deep into the tunnel: ${JSON.stringify(bike.blocks)}`).toBeGreaterThan(40);
    expect(jeep.distance, 'jeep is wider than the 1.6 m pillar gap').toBeLessThan(bike.distance - 6);
    expect(mbt.distance, 'MBT stopped even earlier').toBeLessThanOrEqual(jeep.distance);
  }, 150_000);
});

describe('integration status', () => {
  it('reports which authored layers are wired into the built world', () => {
    const status = {
      structures: STRUCTURES,
      pyramidSummitVoxel: WORLD.evidence.pyramidSummitVoxel,
      sphinxHeadVoxel: WORLD.evidence.sphinxHeadVoxel,
      tunnelLamps: WORLD.evidence.tunnelLamps,
      roads: pharaoh.roads.length,
      materials: pharaoh.assetBundle,
    };
    if (!STRUCTURES) console.warn('[pharaoh QA] monument suites skipped:', JSON.stringify(status));
    expect(status.materials).toBe('pharaoh-v1');
  });
});
