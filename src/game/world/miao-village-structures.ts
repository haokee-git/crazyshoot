/**
 * 千户苗寨 · 同源体素/半格世界生成器。
 *
 * 所有几何都通过 MapWorldOps 写进 buildVoxelMapData 的 TerrainData：
 * 渲染网格、碰撞 SolidIndex、支撑、导航、子弹 DDA 共用同一份数据。没有第二套
 * 碰撞清单，也没有“视觉窗洞 + 隐形墙”。
 *
 * 生成内容：
 * - 吊脚楼/棚舍（真实门窗洞、0.5 m 楼梯、阳台/美人靠、坡屋顶）
 * - 鼓藏堂公共木构（重檐、退檐、轻起翘）
 * - 三座桥（南桥/中央风雨廊桥/北桥石拱）与真实桥头限宽石墩
 * - 白水河堤岸、towpath、8 架河岸梯、桥侧梯、四座渡船坞
 * - 芦笙场石铺平台、祭祀坪、剧场舞台/后台、猪场围栏、14 块梯田浅水
 */
import type { MapDef } from '../../maps/types';
import type { MapWorldBuilder, MapWorldOps } from './map-structures';
import {
  MIAO_ENTRY_HALF_WIDTH, MIAO_ENTRY_TREAD, groundDoorAlong, MIAO_PLOTS, MIAO_THEATER, MIAO_PIG_FARM, MIAO_D_PLAZA, MIAO_A_PLAZA,
  MIAO_E_PLAZA, MIAO_LUSHENG_PLAZA, MIAO_PADDIES, MIAO_VEGETABLE_PATCHES, MIAO_SPAWNS, MIAO_SPAWN_EXITS,
  type MiaoPlot,
} from '../../maps/miao-village/layout';
import {
  MIAO_BRIDGES, MIAO_FERRIES, MIAO_FERRY_DOCKS, MIAO_RIVER_LADDERS, riverAt,
  type MiaoBridgeDef,
} from '../../maps/miao-village/river';
import type { LadderDef } from '../../maps/battlefield-design';
import { quayStreetY } from '../../maps/miao-village/river';
import { MIAO_PIG_FARM_DETAILS, MIAO_PIG_PENS, MIAO_IRRIGATION } from '../../maps/miao-village/props';

const MAT = {
  dark: 122, honey: 123, grey: 124, floor: 125, lattice: 126,
  tile: 127, tile2: 128, tileMoss: 129, rubble: 130, stone: 131,
  paving: 132, cobble: 133, wet: 134, water: 135, earth: 136, mud: 137,
  grass: 138, riceYoung: 139, riceGold: 140, vegetable: 141,
  bambooLeaf: 142, bambooCulm: 143, maple: 144, camphor: 145, reed: 146,
  thatch: 147, brick: 148, plaster: 149, wicker: 150, ceramic: 151,
  indigo: 152, madder: 153,
} as const;

const DEG = Math.PI / 180;
const hash = (x: number, z: number, salt = 0) => {
  let h = Math.imul(Math.floor(x * 7.31) + salt * 977 + 1013, 374761393) ^ Math.imul(Math.floor(z * 5.17) - 97, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};
const roofMat = (h: number) => (h % 5 === 0 ? MAT.tileMoss : h % 2 ? MAT.tile : MAT.tile2);

/** Local frame: (u,v) in the plot's facade coordinates -> world. */
class Frame {
  private readonly c: number;
  private readonly s: number;
  constructor(private readonly ops: MapWorldOps, private readonly p: MiaoPlot) {
    this.c = Math.cos(p.yaw * DEG);
    this.s = Math.sin(p.yaw * DEG);
  }
  private world(u: number, v: number): [number, number] {
    return [this.p.x + u * this.c - v * this.s, this.p.z + u * this.s + v * this.c];
  }
  box(id: string, u0: number, v0: number, u1: number, v1: number, y0: number, y1: number, material: number, solid = true) {
    const w = Math.abs(u1 - u0), d = Math.abs(v1 - v0);
    if (w < 0.02 || d < 0.02 || y1 - y0 < 0.02) return;
    const [x, z] = this.world((u0 + u1) / 2, (v0 + v1) / 2);
    this.ops.detail(`${this.p.id}:${id}`, x, z, w, d, y0, y1 - y0, material, this.p.yaw * DEG, solid);
  }
  column(id: string, u: number, v: number, y0: number, y1: number, material: number, solid = true) {
    this.box(id, u - 0.15, v - 0.15, u + 0.15, v + 0.15, y0, y1, material, solid);
  }
}

/* ------------------------------------------------------------------ *
 * House plan (pure data; builder + tests read the same plan)
 * ------------------------------------------------------------------ */

export type WallSideLocal = 'front' | 'back' | 'left' | 'right';
export interface MiaoWindowPlan {
  level: number;
  side: WallSideLocal;
  /** center coordinate along the wall (u for front/back, v for left/right). */
  along: number;
  /** wall plane coordinate (v for front/back, u for left/right). */
  plane: number;
  w: number;
  h: number;
  bottom: number;
}
export interface MiaoDoorPlan {
  level: number;
  side: WallSideLocal;
  along: number;
  plane: number;
  w: number;
  h: number;
  bottom: number;
  upper: boolean;
}
export interface MiaoStairPlan {
  level: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  bottom: number;
  top: number;
  /** +1 = rising toward +u, -1 = rising toward -u. */
  dir: 1 | -1;
  steps: number;
}
export interface MiaoHousePlan {
  w: number;
  d: number;
  floors: number;
  floorY: number[];
  eaveY: number;
  ridgeY: number;
  windows: MiaoWindowPlan[];
  doors: MiaoDoorPlan[];
  stairs: MiaoStairPlan[];
}

const T = 0.4; // wall thickness
const FLOOR_RISE = 4;

/** Pure plan shared by the world builder and the walk-through tests. */
export function miaoHousePlan(plot: MiaoPlot): MiaoHousePlan {
  const base = plot.baseY;
  const floors = plot.floors;
  const floorY = Array.from({ length: floors }, (_, k) => base + 1 + k * FLOOR_RISE);
  const eaveY = floorY[floors - 1] + FLOOR_RISE;
  const ridgeY = eaveY + 3;
  const W = plot.w;
  const D = plot.d;
  const windows: MiaoWindowPlan[] = [];
  const doors: MiaoDoorPlan[] = [];
  const stairs: MiaoStairPlan[] = [];
  for (let level = 0; level < floors; level++) {
    const y = floorY[level];
    // back wall: 2 windows clear of the stair band (u -2.6..+2.6)
    for (const along of [-W * 0.34, W * 0.34]) {
      windows.push({ level, side: 'back', along, plane: -D / 2 + T / 2, w: 1.4, h: 1.6, bottom: y + 0.9 });
    }
    // front: level 0 has two windows + a high clerestory above the door; upper levels 3 windows.
    const frontCenters = level === 0 ? [-W * 0.375, -W * 0.125, W * 0.375] : [-W * 0.38, -W * 0.02, W * 0.44];
    for (const along of frontCenters) {
      windows.push({ level, side: 'front', along, plane: D / 2 - T / 2, w: 1.3, h: 1.55, bottom: y + 0.9 });
    }
    // gable walls: 2 windows per side per level
    for (const side of ['left', 'right'] as const) {
      const plane = (side === 'left' ? -W / 2 : W / 2) + (side === 'left' ? T / 2 : -T / 2);
      for (const along of [-1.5, 1.5]) {
        windows.push({ level, side, along, plane, w: 1.2, h: 1.5, bottom: y + 0.9 });
      }
    }
    // doors
    if (level === 0) {
      doors.push({ level, side: 'front', along: groundDoorAlong(plot, 'front'), plane: D / 2 - T / 2, w: 1.7, h: 2.4, bottom: y, upper: false });
      doors.push({ level, side: 'right', along: groundDoorAlong(plot, 'right'), plane: W / 2 - T / 2, w: 1.3, h: 2.2, bottom: y, upper: false });
    } else {
      doors.push({ level, side: 'front', along: W * 0.24, plane: D / 2 - T / 2, w: 1.6, h: 2.2, bottom: y, upper: true });
    }
  }
  for (let level = 0; level < floors - 1; level++) {
    // Switchback: the ground flight runs along the back wall; a third-storey
    // flight runs along the FRONT wall so its underside cannot cap the first
    // flight's headroom.
    const back = level === 0;
    const dir: 1 | -1 = back ? 1 : -1;
    const u0 = back ? -2.6 : 2.6;
    const u1 = back ? 1.4 : -1.4;
    stairs.push({
      level, u0, u1,
      v0: back ? -D / 2 + 0.55 : D / 2 - 2.35,
      v1: back ? -D / 2 + 2.35 : D / 2 - 0.55,
      bottom: floorY[level],
      top: floorY[level + 1],
      dir,
      steps: 8,
    });
  }
  return { w: W, d: D, floors, floorY, eaveY, ridgeY, windows, doors, stairs };
}

/* ------------------------------------------------------------------ *
 * Geometry helpers
 * ------------------------------------------------------------------ */

function wallWithHoles(
  f: Frame,
  id: string,
  side: WallSideLocal,
  wallLen: number,
  y0: number,
  y1: number,
  holes: { a0: number; a1: number; b0: number; b1: number }[],
  material: number,
  plane: number,
  thick: number,
) {
  const horizontal = side === 'front' || side === 'back';
  const sorted = [...holes].sort((a, b) => a.a0 - b.a0);
  let cursor = -wallLen / 2;
  const emit = (a0: number, a1: number, b0: number, b1: number) => {
    if (a1 - a0 < 0.02 || b1 - b0 < 0.02) return;
    if (horizontal) f.box(id, a0, plane - thick / 2, a1, plane + thick / 2, b0, b1, material);
    else f.box(id, plane - thick / 2, a0, plane + thick / 2, a1, b0, b1, material);
  };
  for (const hole of sorted) {
    if (hole.a0 > cursor) emit(cursor, hole.a0, y0, y1);
    if (hole.b0 > y0) emit(Math.max(cursor, hole.a0), hole.a1, y0, hole.b0);
    if (hole.b1 < y1) emit(Math.max(cursor, hole.a0), hole.a1, hole.b1, y1);
    cursor = Math.max(cursor, hole.a1);
  }
  if (cursor < wallLen / 2) emit(cursor, wallLen / 2, y0, y1);
}

function addWindowFrame(f: Frame, id: string, side: WallSideLocal, along: number, plane: number, w: number, h: number, bottom: number) {
  const horizontal = side === 'front' || side === 'back';
  const jamb = 0.1, sill = 0.12;
  const put = (suffix: string, a0: number, a1: number, b0: number, b1: number) => {
    if (horizontal) f.box(`${id}:${suffix}`, a0, plane - T / 2 - 0.05, a1, plane + T / 2 + 0.05, b0, b1, MAT.dark);
    else f.box(`${id}:${suffix}`, plane - T / 2 - 0.05, a0, plane + T / 2 + 0.05, a1, b0, b1, MAT.dark);
  };
  put('sill', along - w / 2, along + w / 2, bottom - sill, bottom);
  put('head', along - w / 2, along + w / 2, bottom + h, bottom + h + jamb);
  put('jamb-l', along - w / 2, along - w / 2 + jamb, bottom, bottom + h);
  put('jamb-r', along + w / 2 - jamb, along + w / 2, bottom, bottom + h);
}

function addDoorFrameOuter(f: Frame, id: string, side: WallSideLocal, along: number, plane: number, w: number, h: number, bottom: number) {
  // The door hole is real; only the timber threshold and side posts are solid.
  const horizontal = side === 'front' || side === 'back';
  const out = plane + (side === 'front' ? 0.06 : side === 'back' ? -0.06 : 0);
  const jamb = 0.14;
  const put = (suffix: string, a0: number, a1: number, b0: number, b1: number) => {
    if (horizontal) f.box(`${id}:${suffix}`, a0, out - 0.08, a1, out + 0.08, b0, b1, MAT.dark);
    else f.box(`${id}:${suffix}`, out - 0.08, a0, out + 0.08, a1, b0, b1, MAT.dark);
  };
  put('post-l', along - w / 2 - jamb, along - w / 2, bottom, bottom + h + jamb);
  put('post-r', along + w / 2, along + w / 2 + jamb, bottom, bottom + h + jamb);
  put('lintel', along - w / 2 - jamb, along + w / 2 + jamb, bottom + h, bottom + h + jamb);
}

/* ------------------------------------------------------------------ *
 * House
 * ------------------------------------------------------------------ */

function buildHouse(ops: MapWorldOps, plot: MiaoPlot) {
  const base = ops.ground(plot.x, plot.z);
  const f = new Frame(ops, plot);
  const plan = miaoHousePlan({ ...plot, baseY: base });
  const { w: W, d: D, floors } = plan;
  const F0 = plan.floorY[0];
  const seed = hash(plot.x, plot.z, 7);

  // Each foot follows its own terrain cell, including the downhill pair.
  // Use half-grid feet, beams and piers so they share visible/collision surfaces.
  const postU = [-W / 2 + 0.75, 0, W / 2 - 0.75];
  const postV = [-D / 2 + 0.75, D / 2 - 0.75];
  for (const [i, u] of postU.entries()) {
    for (const [j, v] of postV.entries()) {
      const [x, z] = worldOf(plot, u, v);
      const bottom = Math.min(base, ...[-0.35, 0.35].flatMap(dx =>
        [-0.35, 0.35].map(dz => ops.ground(x + dx, z + dz))));
      f.box(`foot-${i}-${j}`, u - 0.35, v - 0.35, u + 0.35, v + 0.35, bottom - 0.5, bottom + 0.5, MAT.stone);
      f.box(`post-${i}-${j}`, u - 0.25, v - 0.25, u + 0.25, v + 0.25, bottom + 0.5, F0 - 0.5, MAT.dark);
    }
  }
  for (const [i, v] of postV.entries()) {
    f.box(`under-beam-${i}`, -W / 2 + 0.5, v - 0.25, W / 2 - 0.5, v + 0.25, F0 - 1, F0 - 0.5, MAT.dark);
  }

  // --- floors -------------------------------------------------------------------
  const slab = (level: number, opening: MiaoStairPlan | null) => {
    const y = plan.floorY[level];
    const u0 = -W / 2, u1 = W / 2, v0 = -D / 2, v1 = D / 2;
    if (!opening) {
      f.box(`slab-${level}`, u0, v0, u1, v1, y - 0.5, y, MAT.floor);
      return;
    }
    // Enlarge the stairwell by 0.45/0.55 m so the 0.38 m capsule has real head
    // clearance at the sides of the half-metre steps.
    const a0 = Math.max(-W / 2, Math.min(opening.u0, opening.u1) - 0.45), a1 = Math.min(W / 2, Math.max(opening.u0, opening.u1) + 0.45);
    const b0 = Math.max(-D / 2, Math.min(opening.v0, opening.v1) - 0.55), b1 = Math.min(D / 2, Math.max(opening.v0, opening.v1) + 0.55);
    // west / east / south / north pieces around the stairwell opening
    f.box(`slab-${level}-w2`, u0, v0, Math.min(u1, a0), v1, y - 0.5, y, MAT.floor);
    f.box(`slab-${level}-e2`, Math.max(u0, a1), v0, u1, v1, y - 0.5, y, MAT.floor);
    f.box(`slab-${level}-s`, Math.max(u0, a0), v0, Math.min(u1, a1), Math.max(v0, b0), y - 0.5, y, MAT.floor);
    f.box(`slab-${level}-n`, Math.max(u0, a0), Math.min(v1, b1), Math.min(u1, a1), v1, y - 0.5, y, MAT.floor);
  };
  slab(0, null);
  for (let level = 1; level < floors; level++) slab(level, plan.stairs[level - 1]);
  // Ceiling under the roof (solid, so the top floor reads as a room).
  f.box('ceiling', -W / 2, -D / 2, W / 2, D / 2, plan.eaveY - 0.22, plan.eaveY, MAT.floor);

  // --- stairs -------------------------------------------------------------------
  for (const stair of plan.stairs) {
    const steps = stair.steps;
    for (let i = 0; i < steps; i++) {
      // u0 is the bottom of the flight; steps progress toward u1 in `dir` direction.
      // 0.75 m tread with 0.25 m nosing overlap: half-grid sampling still finds the
      // next step before the capsule is blocked by its riser (real 0.5 m rise).
      const a0 = stair.u0 + stair.dir * (i * 0.5 - 1.0);
      const a1 = stair.u0 + stair.dir * (i * 0.5 + 0.5);
      const top = stair.bottom + (i + 1) * (stair.top - stair.bottom) / steps;
      f.box(`stair-${stair.level}-${i}`, Math.min(a0, a1), stair.v0, Math.max(a0, a1), stair.v1, stair.bottom, top, MAT.floor);
    }
    // a real top landing beyond the last step (also fills any half-grid seam)
    f.box(`stair-landing-${stair.level}`, Math.min(stair.u1, stair.u1 + stair.dir * 1.25), stair.v0, Math.max(stair.u1, stair.u1 + stair.dir * 1.25), stair.v1, stair.top - 0.3, stair.top, MAT.floor);
    // side handrail against the back wall
    f.box(`stair-rail-${stair.level}`, Math.min(stair.u0, stair.u1), stair.v0 - 0.08, Math.max(stair.u0, stair.u1), stair.v0, stair.top - 0.8, stair.top + 0.9, MAT.dark, false);
  }

  // --- walls per level ----------------------------------------------------------
  for (let level = 0; level < floors; level++) {
    const y0 = plan.floorY[level];
    const y1 = y0 + FLOOR_RISE;
    const win = plan.windows.filter((q) => q.level === level);
    const door = plan.doors.filter((q) => q.level === level);

    const frontHoles = [
      ...win.filter((q) => q.side === 'front').map((q) => ({ a0: q.along - q.w / 2, a1: q.along + q.w / 2, b0: q.bottom, b1: q.bottom + q.h })),
      ...door.filter((q) => q.side === 'front').map((q) => ({ a0: q.along - q.w / 2, a1: q.along + q.w / 2, b0: q.bottom, b1: q.bottom + q.h })),
    ];
    const backHoles = win.filter((q) => q.side === 'back').map((q) => ({ a0: q.along - q.w / 2, a1: q.along + q.w / 2, b0: q.bottom, b1: q.bottom + q.h }));
    wallWithHoles(f, `wall-front-${level}`, 'front', W, y0, y1, frontHoles, level % 2 ? MAT.grey : MAT.dark, D / 2 - T / 2, T);
    wallWithHoles(f, `wall-back-${level}`, 'back', W, y0, y1, backHoles, level % 2 ? MAT.dark : MAT.grey, -D / 2 + T / 2, T);
    const leftHoles = win.filter((q) => q.side === 'left').map((q) => ({ a0: q.along - q.w / 2, a1: q.along + q.w / 2, b0: q.bottom, b1: q.bottom + q.h }));
    const rightHoles = [
      ...win.filter((q) => q.side === 'right').map((q) => ({ a0: q.along - q.w / 2, a1: q.along + q.w / 2, b0: q.bottom, b1: q.bottom + q.h })),
      ...door.filter((q) => q.side === 'right').map((q) => ({ a0: q.along - q.w / 2, a1: q.along + q.w / 2, b0: q.bottom, b1: q.bottom + q.h })),
    ];
    wallWithHoles(f, `wall-left-${level}`, 'left', D - T * 2, y0, y1, leftHoles, MAT.grey, -W / 2 + T / 2, T);
    wallWithHoles(f, `wall-right-${level}`, 'right', D - T * 2, y0, y1, rightHoles, MAT.grey, W / 2 - T / 2, T);
    // timber frame: posts + floor/eave beams, visible from both sides
    // Only corner posts: intermediate posts would cross authored window/door
    // openings. The horizontal floor/eave beams carry the visible timber frame.
    for (const u of [-W / 2 + 0.25, W / 2 - 0.25]) {
      f.box(`frame-post-f-${level}-${u}`, u - 0.09, D / 2 - T - 0.05, u + 0.09, D / 2 + 0.05, y0, y1, MAT.dark);
      f.box(`frame-post-b-${level}-${u}`, u - 0.09, -D / 2 - 0.05, u + 0.09, -D / 2 + T + 0.05, y0, y1, MAT.dark);
    }
    f.box(`frame-beam-f-${level}`, -W / 2 - 0.1, D / 2 - T - 0.12, W / 2 + 0.1, D / 2 + 0.12, y0 - 0.5, y0, MAT.dark);
    f.box(`frame-beam-b-${level}`, -W / 2 - 0.1, -D / 2 - 0.12, W / 2 + 0.1, -D / 2 + T + 0.12, y0 - 0.5, y0, MAT.dark);
    // windows and doors frames
    for (const q of win) addWindowFrame(f, `win-${level}-${q.side}-${q.along.toFixed(2)}`, q.side, q.along, q.plane, q.w, q.h, q.bottom);
    for (const q of door) addDoorFrameOuter(f, `door-${level}-${q.side}`, q.side, q.along, q.plane, q.w, q.h, q.bottom);
  }

  // One continuous landing at the threshold and a lower tread away from it.
  // The bottom extends to the local terrain so neither end hangs over a slope.
  for (const door of plan.doors.filter((q) => q.level === 0)) {
    const front = door.side === 'front';
    const edge = front ? D / 2 : W / 2;
    const a0 = door.along - MIAO_ENTRY_HALF_WIDTH;
    const a1 = door.along + MIAO_ENTRY_HALF_WIDTH;
    for (let step = 0; step < 2; step++) {
      const b0 = edge + step * MIAO_ENTRY_TREAD, b1 = b0 + MIAO_ENTRY_TREAD;
      const [x, z] = worldOf(plot, front ? door.along : b0, front ? b0 : door.along);
      const bottom = Math.min(base, ops.ground(x, z)) - 0.5;
      const top = F0 - step * 0.5;
      if (front) f.box(`entry-${door.side}-${step}`, a0, b0, a1, b1, bottom, top, MAT.stone);
      else f.box(`entry-${door.side}-${step}`, b0, a0, b1, a1, bottom, top, MAT.stone);
    }
  }

  // --- balcony + 美人靠 -----------------------------------------------------------
  if (plot.balcony) {
    for (let level = 1; level < floors; level++) {
      const y = plan.floorY[level];
      const u0 = -W / 2 + 0.55;
      const u1 = W / 2 - 0.55;
      f.box(`balcony-${level}-floor`, u0, D / 2, u1, D / 2 + 1.3, y - 0.2, y, MAT.floor);
      for (const u of [u0 + 0.4, 0, u1 - 0.4]) {
        f.box(`balcony-bracket-${level}-${u}`, u - 0.12, D / 2 - 0.05, u + 0.12, D / 2 + 1.3, y - 1.1, y - 0.2, MAT.dark);
      }
      for (let u = u0; u <= u1; u += 1.6) {
        f.box(`balcony-post-${level}-${u.toFixed(1)}`, u - 0.06, D / 2 + 1.18, u + 0.06, D / 2 + 1.3, y, y + 1.05, MAT.dark);
      }
      f.box(`balcony-rail-${level}`, u0, D / 2 + 1.18, u1, D / 2 + 1.3, y + 0.95, y + 1.1, MAT.dark);
      f.box(`balcony-mid-${level}`, u0, D / 2 + 1.2, u1, D / 2 + 1.28, y + 0.45, y + 0.55, MAT.dark, false);
      // 美人靠 seat + slanted-look back slats
      f.box(`meiren-seat-${level}`, u0 + 0.15, D / 2 + 1.02, u1 - 0.15, D / 2 + 1.2, y + 0.42, y + 0.5, MAT.honey);
      f.box(`meiren-back-${level}`, u0 + 0.15, D / 2 + 1.22, u1 - 0.15, D / 2 + 1.3, y + 0.52, y + 0.95, MAT.honey);
      for (const u of [u0, u1]) {
        f.box(`balcony-side-${level}-${u}`, u - 0.06, D / 2, u + 0.06, D / 2 + 1.3, y + 0.45, y + 1.05, MAT.dark);
      }
    }
  }

  // --- furniture / interiors ----------------------------------------------------
  const useful = plot.interior === 'shop' || plot.interior === 'inn' || plot.interior === 'workshop';
  for (let level = 0; level < floors; level++) {
    const y = plan.floorY[level];
    // bed / sleeping platform
    if (level > 0 || floors === 1) {
      f.box(`bed-${level}`, -W / 2 + 0.5, -0.3, -W / 2 + 2.6, 1.15, y, y + 0.5, MAT.honey);
    }
    // cabinet
    f.box(`cabinet-${level}`, -W / 2 + 0.6, -D / 2 + 2.6, -W / 2 + 1.7, -D / 2 + 3.6, y, y + 1.25, MAT.honey);
    if (useful && level === 0) {
      // Keep both approaches and the middle of the room open.
      f.box('side-counter', -W / 2 + 0.55, 0.4, -W / 2 + 1.3, 2.4, y, y + 1, MAT.honey);
    }
    if (plot.interior === 'workshop') {
      f.box(`loom-${level}`, -W / 2 + 0.7, 0.2, -W / 2 + 2.5, 1.7, y, y + 1.4, MAT.honey);
      f.box(`loom-bar-${level}`, -W / 2 + 1.2, 0.6, -W / 2 + 2.0, 1.3, y + 1.4, y + 1.55, MAT.dark);
    }

  }

  // Continuous roof courses follow the 0.5 m grid. Adjacent risers share an
  // edge, with a solid gable and a restrained cantilever at the eaves.
  const mat = roofMat(seed);
  const overhang = 1;
  const halfSpan = D / 2 + overhang;
  const rise = 2.5;
  const bands = Math.round(halfSpan * 2);
  for (const sign of [-1, 1] as const) {
    for (let j = 0; j < bands; j++) {
      const v0 = sign * j * 0.5, v1 = sign * (j + 1) * 0.5;
      const y = plan.eaveY + Math.round(rise * (1 - j / (bands - 1)) * 2) / 2;
      const lo = Math.min(v0, v1), hi = Math.max(v0, v1);
      f.box(`roof-${sign}-${j}`, -W / 2 - overhang, lo, W / 2 + overhang, hi, y - 0.5, y, mat);
      if (y > plan.eaveY) for (const u of [-W / 2 + 0.25, W / 2 - 0.25]) {
        f.box(`gable-${u}-${sign}-${j}`, u - 0.25, lo, u + 0.25, hi, plan.eaveY - 0.5, y - 0.5, MAT.grey);
      }
    }
  }
  f.box('ridge', -W / 2 - overhang, -0.25, W / 2 + overhang, 0.25, plan.eaveY + rise - 0.5, plan.eaveY + rise + 0.5, mat);

}

function worldOf(p: MiaoPlot, u: number, v: number): [number, number] {
  const c = Math.cos(p.yaw * DEG), s = Math.sin(p.yaw * DEG);
  return [p.x + u * c - v * s, p.z + u * s + v * c];
}

/* ------------------------------------------------------------------ *
 * Sheds / pig sheds
 * ------------------------------------------------------------------ */

function buildShed(ops: MapWorldOps, plot: MiaoPlot) {
  const base = ops.ground(plot.x, plot.z);
  const f = new Frame(ops, plot);
  const W = plot.w, D = plot.d;
  const eave = base + (plot.interior === 'pig-shed' ? 2.4 : 2.9);
  const ridge = eave + 1.4;
  const postH = eave;
  for (const [i, u] of [-W / 2 + 0.25, W / 2 - 0.25].entries()) {
    for (const [j, v] of [-D / 2 + 0.25, D / 2 - 0.25, 0].entries()) {
      ops.detail(`${plot.id}:post-${i}-${j}`, ...worldOf(plot, u, v), 0.3, 0.3, base, postH, MAT.dark, plot.yaw * DEG);
    }
  }
  // back + side half walls
  f.box('back-wall', -W / 2, -D / 2, W / 2, -D / 2 + 0.25, base, base + (plot.interior === 'pig-shed' ? 1.1 : 2.2), MAT.grey);
  f.box('side-w', -W / 2, -D / 2, -W / 2 + 0.25, D / 2, base, base + 1.1, MAT.grey);
  f.box('side-e', W / 2 - 0.25, -D / 2, W / 2, D / 2, base, base + 1.1, MAT.grey);
  // roof
  const bands = 4;
  for (const sign of [-1, 1] as const) {
    for (let j = 0; j < bands; j++) {
      const v0 = sign * (D / 2 + 0.9) * j / bands;
      const v1 = sign * (D / 2 + 0.9) * (j + 1) / bands;
      const y = ridge - (ridge - eave) * j / (bands - 1);
      f.box(`roof-${sign}-${j}`, -W / 2 - 0.9, Math.min(v0, v1), W / 2 + 0.9, Math.max(v0, v1), y - 0.2, y, sign > 0 ? MAT.tile : MAT.tile2);
    }
  }
  f.box('ridge', -W / 2 - 0.9, -0.18, W / 2 + 0.9, 0.18, ridge - 0.05, ridge + 0.18, MAT.dark);
  // storage / troughs at the back
  f.box('store', -W / 2 + 0.4, -D / 2 + 0.4, -W / 2 + 1.6, -D / 2 + 1.5, base, base + 1.1, MAT.wicker, false);
  if (plot.interior === 'pig-shed') {
    f.box('trough', -1.1, -0.2, 1.1, 0.2, base, base + 0.35, MAT.stone);
  } else {
    f.box('crate', W / 2 - 1.4, -D / 2 + 0.4, W / 2 - 0.4, -D / 2 + 1.4, base, base + 0.9, MAT.honey);
  }
}

/* ------------------------------------------------------------------ *
 * Public hall (drum hall)
 * ------------------------------------------------------------------ */

function buildHall(ops: MapWorldOps, plot: MiaoPlot) {
  const base = ops.ground(plot.x, plot.z);
  const f = new Frame(ops, plot);
  const W = plot.w, D = plot.d;
  const floor = base + 1;
  const eaveLow = base + 5;
  const eaveHigh = base + 8;
  const ridge = base + 11.2;
  // stone plinth and wooden floor
  f.box('plinth', -W / 2, -D / 2, W / 2, D / 2, base - 0.2, base + 0.6, MAT.stone);
  f.box('floor', -W / 2 + 0.2, -D / 2 + 0.2, W / 2 - 0.2, D / 2 - 0.2, base + 0.6, floor, MAT.floor);
  // columns on a 6 x 3 grid
  for (const u of [-W / 2 + 1.1, -W / 6, W / 6, W / 2 - 1.1]) {
    for (const v of [-D / 2 + 1.2, 0, D / 2 - 1.2]) {
      ops.detail(`${plot.id}:col-${u}-${v}`, ...worldOf(plot, u, v), 0.45, 0.45, floor, eaveLow - floor, MAT.dark, plot.yaw * DEG);
      f.box(`col-base-${u}-${v}`, u - 0.45, v - 0.45, u + 0.45, v + 0.45, floor, floor + 0.3, MAT.stone);
    }
  }
  // back and side walls with restrained lattice windows
  f.box('back-low', -W / 2, -D / 2, W / 2, -D / 2 + 0.35, floor, floor + 1.0, MAT.honey);
  for (let u = -W / 2 + 2; u < W / 2 - 1; u += 3.2) {
    f.box(`back-window-${u}`, u, -D / 2, u + 1.4, -D / 2 + 0.36, floor + 1.0, floor + 2.2, MAT.lattice, false);
    f.box(`back-post-${u}`, u - 0.15, -D / 2, u, -D / 2 + 0.4, floor, eaveLow - 0.2, MAT.dark);
  }
  f.box('back-top', -W / 2, -D / 2, W / 2, -D / 2 + 0.35, floor + 2.2, eaveLow - 0.2, MAT.honey);
  for (const u of [-W / 2, W / 2 - 0.35]) {
    for (let v = -D / 2 + 2; v < D / 2 - 1; v += 3.0) {
      f.box(`side-window-${u}-${v}`, u, v, u + 0.36, v + 1.3, floor + 1.1, floor + 2.2, MAT.lattice, false);
    }
  }
  // front opening: low rail only, 3 wide doors (public gathering)
  // 6 m central opening: the hall is a public gathering space, not a sealed box.
  f.box('front-rail-w', -W / 2 + 0.4, D / 2 - 0.4, -3, D / 2, floor + 0.15, floor + 1.0, MAT.honey);
  f.box('front-rail-e', 3, D / 2 - 0.4, W / 2 - 0.4, D / 2, floor + 0.15, floor + 1.0, MAT.honey);
  for (let u = -W / 2 + 2; u <= W / 2 - 2; u += 4) {
    f.box(`front-post-${u}`, u - 0.15, D / 2 - 0.5, u + 0.15, D / 2, floor, eaveLow - 0.2, MAT.dark);
  }
  // interior: benches, drum stand, open span
  for (const v of [-2.4, 2.4]) {
    f.box(`bench-${v}`, -6, v - 0.3, 6, v + 0.3, floor + 0.4, floor + 0.5, MAT.honey, false);
  }
  f.box('drum-stand', -1.2, -0.8, 1.2, 0.8, floor + 0.9, floor + 1.1, MAT.dark);
  f.box('drum', -0.7, -0.5, 0.7, 0.5, floor + 1.1, floor + 1.75, MAT.ceramic);
  // lower eave roof
  const buildRoof = (eave: number, ridgeY: number, overhang: number, bands: number, mat: number, tag: string) => {
    for (const sign of [-1, 1] as const) {
      for (let j = 0; j < bands; j++) {
        const half = D / 2 + overhang;
        const v0 = sign * half * j / bands, v1 = sign * half * (j + 1) / bands;
        const y = ridgeY - (ridgeY - eave) * j / (bands - 1);
        f.box(`${tag}-${sign}-${j}`, -W / 2 - overhang, Math.min(v0, v1), W / 2 + overhang, Math.max(v0, v1), y - 0.24, y, mat);
      }
      for (const u of [-W / 2 - overhang + 0.3, W / 2 + overhang - 0.3]) {
        f.box(`${tag}-tip-${sign}-${u}`, u - 0.3, sign * (D / 2 + overhang) - 0.25, u + 0.3, sign * (D / 2 + overhang) + 0.25, eave - 0.1, eave + 0.48, MAT.grey);
      }
    }
    f.box(`${tag}-ridge`, -W / 2 - overhang, -0.3, W / 2 + overhang, 0.3, ridgeY - 0.05, ridgeY + 0.25, MAT.dark);
  };
  buildRoof(eaveLow, base + 7.2, 2.2, 5, MAT.tile, 'roof-low');
  // clerestory
  for (const sign of [-1, 1]) f.box(`clerestory-${sign}`, -W / 2 + 1, sign * (D / 2 - 0.6) - 0.15, W / 2 - 1, sign * (D / 2 - 0.6) + 0.15, base + 7.2, eaveHigh, MAT.honey);
  buildRoof(eaveHigh, ridge, 1.5, 6, MAT.tile2, 'roof-high');
}

/* ------------------------------------------------------------------ *
 * Plaza surfaces, theater, pig farm
 * ------------------------------------------------------------------ */

function buildPlazas(ops: MapWorldOps) {
  // Lusheng plaza: 0.5 m stone platform with concentric rings (real support height 3.5)
  const L = MIAO_LUSHENG_PLAZA;
  const x0 = L.x - L.w / 2, x1 = L.x + L.w / 2, z0 = L.z - L.d / 2, z1 = L.z + L.d / 2;
  ops.detail('lusheng-platform', L.x, L.z, L.w, L.d, 3.0, 0.5, MAT.paving, 0);
  // concentric rings in 0.5 m cells, alternating stone finishes
  for (let r = 3; r <= 15; r += 3) {
    for (let a = 0; a < 96; a++) {
      const t = a / 96 * Math.PI * 2;
      const x = L.x + Math.cos(t) * r, z = L.z + Math.sin(t) * r;
      if (x < x0 + 0.6 || x > x1 - 0.6 || z < z0 + 0.6 || z > z1 - 0.6) continue;
      ops.detail(`lusheng-ring-${r}-${a}`, x, z, 0.55, 0.55, 3.5, 0.06, r % 2 ? MAT.cobble : MAT.stone, 0);
    }
  }
  // A / D / E plazas: 0.1 m authored stone cap over the terrain top.
  for (const [tag, P] of [['a', MIAO_A_PLAZA], ['d', MIAO_D_PLAZA], ['e', MIAO_E_PLAZA]] as const) {
    const y = P.y;
    for (let z = Math.floor(P.z - P.d / 2); z < Math.ceil(P.z + P.d / 2); z += 4) {
      for (let x = Math.floor(P.x - P.w / 2); x < Math.ceil(P.x + P.w / 2); x += 4) {
        const w = Math.min(4, P.x + P.w / 2 - x), d = Math.min(4, P.z + P.d / 2 - z);
        if (w <= 0.2 || d <= 0.2) continue;
        const cx = x + w / 2, cz = z + d / 2;
        const h = ops.ground(cx, cz);
        if (Math.abs(h - y) > 0.6) continue;
        ops.detail(`plaza-${tag}-${x}-${z}`, cx, cz, w, d, h, 0.1, (hash(x, z) % 5 === 0 ? MAT.cobble : MAT.paving), 0, false);
      }
    }
  }
}

function buildTheater(ops: MapWorldOps) {
  const th = MIAO_THEATER;
  const base = ops.ground(th.stageX, th.stageZ);
  const x0 = th.stageX - th.stageW / 2, x1 = th.stageX + th.stageW / 2;
  const z0 = th.stageZ - th.stageD / 2, z1 = th.stageZ + th.stageD / 2;
  // stone plinth from ground to stage deck (11.5), with front and side steps.
  ops.box(x0, z0, x1, z1, base - 0.2, th.stageY - 0.35, MAT.stone);
  ops.box(x0 - 0.3, z0 - 0.3, x1 + 0.3, z1 + 0.3, th.stageY - 0.35, th.stageY, MAT.floor);
  // front steps (south side, facing the audience plaza)
  for (let i = 0; i < 5; i++) {
    const top = base + (i + 1) * (th.stageY - base) / 5;
    ops.detail(`stage-step-front-${i}`, th.stageX, z0 - 2.6 + i * 0.6, 20, 1.0, base, top - base, MAT.stone, 0);
  }
  // side steps
  for (const sx of [x0 - 3, x1 + 3]) {
    for (let i = 0; i < 5; i++) {
      const top = base + (i + 1) * (th.stageY - base) / 5;
      ops.detail(`stage-step-side-${sx}-${i}`, sx, th.stageZ + 2, 2.2, 4.2, base, top - base, MAT.stone, 0);
    }
  }
  // stage posts, roof, back wall, backdrop
  const eave = th.stageY + 4.6;
  const ridge = th.stageY + 7.6;
  for (const x of [x0 + 3, th.stageX, x1 - 3]) {
    for (const z of [z0 + 2, z1 - 2]) {
      ops.detail(`stage-post-${x}-${z}`, x, z, 0.4, 0.4, th.stageY, eave - th.stageY, MAT.dark, 0);
    }
  }
  // back wall
  ops.box(x0 + 1, z1 - 0.4, x1 - 1, z1, th.stageY, eave, MAT.honey);
  // authored festival textile backdrop (indigo centre, madder side banners)
  ops.detail('stage-backdrop-centre', th.stageX, z1 - 0.95, 16, 0.3, th.stageY + 1.0, 5.2, MAT.indigo, 0, true);
  ops.detail('stage-backdrop-centre-band-a', th.stageX, z1 - 1.12, 16, 0.12, th.stageY + 2.2, 0.28, MAT.madder, 0, true);
  ops.detail('stage-backdrop-centre-band-b', th.stageX, z1 - 1.12, 16, 0.12, th.stageY + 4.3, 0.22, MAT.madder, 0, true);
  for (const x of [x0 + 4.8, x1 - 4.8]) {
    ops.detail(`stage-banner-${x}`, x, z1 - 0.98, 4.2, 0.28, th.stageY + 1.1, 3.8, MAT.madder, 0, true);
    ops.detail(`stage-banner-band-${x}`, x, z1 - 0.8, 4.2, 0.08, th.stageY + 3.0, 0.22, MAT.indigo, 0, false);
  }
  // timber leaves over the two backstage openings (the openings stay real behind them)
  for (const [i, x] of [x0 + 8.5, x1 - 8.5].entries()) {
    ops.detail(`stage-door-${i}`, x, z1 - 0.72, 2.0, 0.22, th.stageY, 2.5, MAT.dark, 0, true);
    ops.detail(`stage-door-frame-${i}`, x, z1 - 0.65, 2.4, 0.18, th.stageY, 2.7, MAT.honey, 0);
  }
  ops.detail('stage-apron', th.stageX, z0 + 0.35, 18, 0.5, th.stageY, 0.22, MAT.madder, 0, false);
  for (let x = x0 + 4; x < x1 - 3; x += 3.4) {
    ops.detail(`stage-lattice-${x}`, x + 0.55, z1 - 0.21, 1.0, 0.1, th.stageY + 1.6, 1.2, MAT.lattice, 0, false);
  }
  // roof: ridge along x
  for (const sign of [-1, 1]) {
    for (let j = 0; j < 6; j++) {
      const half = th.stageD / 2 + 2.0;
      const v0 = th.stageZ + sign * half * j / 6, v1 = th.stageZ + sign * half * (j + 1) / 6;
      const y = ridge - (ridge - eave) * j / 5;
      ops.detail(`stage-roof-${sign}-${j}`, (x0 + x1) / 2, (v0 + v1) / 2, th.stageW + 4, Math.abs(v1 - v0), y - 0.22, 0.22, sign > 0 ? MAT.tile : MAT.tile2, 0);
    }
  }
  ops.detail('stage-ridge', (x0 + x1) / 2, th.stageZ, th.stageW + 4, 0.6, ridge - 0.05, 0.28, MAT.dark, 0);
  // side wings / backstage
  const bz0 = z1 + 0.5, bz1 = z1 + 14;
  ops.box(x0 + 4, bz0, x1 - 4, bz1, base - 0.1, base + 0.4, MAT.stone);
  const bh = base + 6.5;
  for (const x of [x0 + 5, x1 - 5]) ops.detail(`backstage-post-${x}`, x, bz0 + 7, 0.45, 0.45, base + 0.4, bh - base, MAT.dark, 0);
  ops.box(x0 + 4, bz0 + 13, x1 - 4, bz1, base + 0.4, bh, MAT.honey);
  ops.box(x0 + 4, bz0, x0 + 4.4, bz1, base + 0.4, bh, MAT.honey);
  ops.box(x1 - 4.4, bz0, x1 - 4, bz1, base + 0.4, bh, MAT.honey);
  for (const sign of [-1, 1]) {
    for (let j = 0; j < 4; j++) {
      const half = 8.2;
      const v0 = (bz0 + bz1) / 2 + sign * half * j / 4, v1 = (bz0 + bz1) / 2 + sign * half * (j + 1) / 4;
      const y = bh + 2.4 - 2.4 * j / 3;
      ops.detail(`backstage-roof-${sign}-${j}`, (x0 + x1) / 2, (v0 + v1) / 2, x1 - x0 + 1.2, Math.abs(v1 - v0), y - 0.2, 0.2, sign > 0 ? MAT.tile2 : MAT.tile, 0);
    }
  }
  // A solid stage back wall carries the festival textile; backstage is entered from
  // its rear/side doors instead of two black voids on the performance wall.
  ops.carve(x0 + 15, bz1 - 0.4, x0 + 18, bz1 + 0.1, base + 0.4, base + 3.0);
  ops.carve(x0 + 4, bz0 + 6, x0 + 4.4, bz0 + 9, base + 0.4, base + 3.0);
}

/**
 * Spawn compounds: a real 4.5 m stone/wood perimeter wall with three exits and a
 * dog-leg screen behind each gate. This is also the authored answer to the LoS
 * contract: no cap / 3F window / balcony / observation deck can see the spawn
 * interior, even from the high halls and the bridge pavilion.
 */
function buildSpawnWalls(ops: MapWorldOps) {
  for (const spawn of MIAO_SPAWNS) {
    const pad = spawn.team === 'blue' ? 6 : 12;
    const heightFor = (side: 'north' | 'south' | 'east' | 'west') => {
      if (spawn.team !== 'orange') return 4.5;
      if (side === 'north') return 12;
      if (side === 'south' || side === 'west') return 8;
      return 4.5;
    };
    const x0 = spawn.x, x1 = spawn.x + spawn.w, z0 = spawn.y, z1 = spawn.y + spawn.d;
    const exits = MIAO_SPAWN_EXITS.filter((e) => e.team === spawn.team);
    const gapFor = (side: 'north' | 'south' | 'east' | 'west') => {
      if (spawn.team === 'blue') {
        if (side === 'north') return 80;
        if (side === 'east') return 80;
        if (side === 'south') return 60;
        return undefined;
      }
      if (side === 'south') return 407;
      if (side === 'west') return 400;
      if (side === 'east') return 430;
      return undefined;
    };
    const wallSeg = (id: string, ax: number, az: number, bx: number, bz: number, h: number) => {
      const cx = (ax + bx) / 2, cz = (az + bz) / 2;
      const w = Math.max(0.8, Math.abs(bx - ax)), d = Math.max(0.8, Math.abs(bz - az));
      ops.detail(`${spawn.team}-spawn-wall-${id}`, cx, cz, w, d, pad, h, MAT.rubble, 0);
      ops.detail(`${spawn.team}-spawn-wall-cap-${id}`, cx, cz, w + 0.25, d + 0.25, pad + h, 0.22, MAT.stone, 0);
      // tile-capped timber band so the compound reads as a built village wall, not a concrete box
      ops.detail(`${spawn.team}-spawn-wall-band-${id}`, cx, cz, w + 0.18, d + 0.18, pad + h - 0.55, 0.28, MAT.dark, 0);
      ops.detail(`${spawn.team}-spawn-wall-tile-${id}`, cx, cz, w + 0.9, d + 0.9, pad + h + 0.22, 0.16, MAT.tile, 0);
    };
    const gapHalf = 4;
    // continuous walls; gate passages are carved as covered tunnels (4.0 m high),
    // so no sightline can enter over a gate.
    for (const side of ['north', 'south'] as const) {
      const z = side === 'north' ? z1 : z0;
      const gap = gapFor(side);
      const h = heightFor(side);
      if (gap === undefined) wallSeg(`${side}`, x0, z, x1, z, h);
      else {
        wallSeg(`${side}-w`, x0, z, gap - gapHalf, z, h);
        wallSeg(`${side}-e`, gap + gapHalf, z, x1, z, h);
        // lintel above a real 4 m gate tunnel: keeps the top wall continuous
        ops.detail(`${spawn.team}-spawn-gate-lintel-${side}`, gap, z, gapHalf * 2, 0.9, pad + 4.0, Math.max(0.1, h - 4.0), MAT.rubble, 0);
      }
    }
    for (const side of ['east', 'west'] as const) {
      const x = side === 'east' ? x1 : x0;
      const gap = gapFor(side);
      const h = heightFor(side);
      if (gap === undefined) wallSeg(`${side}`, x, z0, x, z1, h);
      else {
        wallSeg(`${side}-s`, x, z0, x, gap - gapHalf, h);
        wallSeg(`${side}-n`, x, gap + gapHalf, x, z1, h);
        ops.detail(`${spawn.team}-spawn-gate-lintel-${side}`, x, gap, 0.9, gapHalf * 2, pad + 4.0, Math.max(0.1, h - 4.0), MAT.rubble, 0);
      }
    }
    // Dog-leg screens 2.2 m inside each gate; offset opening forces a turn.
    for (const side of ['north', 'south'] as const) {
      const gap = gapFor(side);
      if (gap === undefined) continue;
      const sx0 = gap - 5, sx1 = gap + 5;
      const z1s = (side === 'north' ? z1 - 2.2 : z0 + 2.2);
      const z2s = (side === 'north' ? z1 - 3.9 : z0 + 3.9);
      // Two staggered 4.4 m screens: west opening, then east opening. A straight
      // sightline through the gate cannot pass both; players zig-zag through.
      ops.detail(`${spawn.team}-spawn-screen-${side}-1`, (sx0 + 2.2 + sx1) / 2, z1s, sx1 - sx0 - 2.2, 0.7, pad, 4.4, MAT.rubble, 0);
      ops.detail(`${spawn.team}-spawn-screen-${side}-2`, (sx0 + sx1 - 2.2) / 2, z2s, sx1 - sx0 - 2.2, 0.7, pad, 4.4, MAT.rubble, 0);
      void exits;
    }
    for (const side of ['east', 'west'] as const) {
      const gap = gapFor(side);
      if (gap === undefined) continue;
      const x1s = (side === 'east' ? x1 - 2.2 : x0 + 2.2);
      const x2s = (side === 'east' ? x1 - 3.9 : x0 + 3.9);
      ops.detail(`${spawn.team}-spawn-screen-${side}-1`, x1s, (gap - 2.8 + gap + 5) / 2, 0.7, 7.8, pad, 4.4, MAT.rubble, 0);
      ops.detail(`${spawn.team}-spawn-screen-${side}-2`, x2s, (gap - 5 + gap + 2.8) / 2, 0.7, 7.8, pad, 4.4, MAT.rubble, 0);
    }
  }
}

function buildPigFarm(ops: MapWorldOps) {
  const farm = MIAO_PIG_FARM;
  const fenceH = 1.15;
  const x0 = farm.x - farm.w / 2, x1 = farm.x + farm.w / 2;
  const z0 = farm.z - farm.d / 2, z1 = farm.z + farm.d / 2;
  const base = ops.ground(farm.x, farm.z);
  // perimeter fence with a 3 m gate on the south side
  const post = (x: number, z: number) => ops.detail(`pig-fence-post-${x}-${z}`, x, z, 0.22, 0.22, base, fenceH, MAT.dark, 0);
  const rail = (ax: number, az: number, bx: number, bz: number) => {
    const cx = (ax + bx) / 2, cz = (az + bz) / 2;
    const w = Math.abs(bx - ax) || 0.18, d = Math.abs(bz - az) || 0.18;
    ops.detail(`pig-fence-rail-${ax}-${az}`, cx, cz, w, d, base + 0.45, 0.18, MAT.honey, 0);
    ops.detail(`pig-fence-rail2-${ax}-${az}`, cx, cz, w, d, base + 0.85, 0.14, MAT.honey, 0);
  };
  for (let x = x0; x <= x1; x += 2.6) { post(x, z0); post(x, z1); }
  for (let z = z0; z <= z1; z += 2.6) { post(x0, z); post(x1, z); }
  // south fence with a real 3 m gate at the centre
  rail(x0, z0, farm.x - 1.6, z0); rail(farm.x + 1.6, z0, x1, z0);
  rail(x0, z1, x1, z1); rail(x0, z0, x0, z1); rail(x1, z0, x1, z1);
  // 3 pens, 2.2 m internal fences
  for (const pen of MIAO_PIG_PENS) {
    const px0 = pen.x - pen.w / 2, px1 = pen.x + pen.w / 2, pz0 = pen.y - pen.d / 2, pz1 = pen.y + pen.d / 2;
    for (let x = px0; x <= px1; x += 2) { ops.detail(`pen-post-${pen.id}-${x}`, x, pz0, 0.18, 0.18, base, 1.1, MAT.dark, 0); ops.detail(`pen-post2-${pen.id}-${x}`, x, pz1, 0.18, 0.18, base, 1.1, MAT.dark, 0); }
    ops.detail(`pen-rail-${pen.id}-s`, pen.x, pz0, pen.w, 0.16, base + 0.5, 0.14, MAT.honey, 0);
    ops.detail(`pen-rail-${pen.id}-n`, pen.x, pz1, pen.w, 0.16, base + 0.5, 0.14, MAT.honey, 0);
    ops.detail(`pen-rail-${pen.id}-w`, px0, pen.y, 0.16, pen.d, base + 0.5, 0.14, MAT.honey, 0);
    ops.detail(`pen-rail-${pen.id}-e`, px1, pen.y, 0.16, pen.d, base + 0.5, 0.14, MAT.honey, 0);
    // gate gap on the south side: leave 1.4 m between x=pen.x-0.7..+0.7
  }
  // troughs
  for (const t of MIAO_PIG_FARM_DETAILS.troughs) {
    ops.detail(`pig-trough-${t.x}`, t.x, t.y, t.w, t.d, base, 0.32, MAT.stone, 0);
  }
}


/* ------------------------------------------------------------------ *
 * Paddies / vegetable rows / irrigation
 * ------------------------------------------------------------------ */

function buildFields(ops: MapWorldOps) {
  for (const p of MIAO_PADDIES) {
    const base = Math.floor(p.levelY);
    const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, z0 = p.z - p.d / 2, z1 = p.z + p.d / 2;
    // mud base up to the authored level, then a 0.28 m water sheet.
    ops.detail(`paddy-mud-${p.id}`, p.x, p.z, p.w - 1.4, p.d - 1.4, base - 0.05, Math.max(0.05, p.levelY - base + 0.05), MAT.mud, 0);
    ops.detail(`paddy-water-${p.id}`, p.x, p.z, p.w - 1.6, p.d - 1.6, p.levelY, 0.28, MAT.water, 0, false);
    // bunds (田埂) 0.8 m wide, 0.5 m above the water; gaps for the irrigation channel.
    const gapZ = p.z - p.d / 2;
    const bund = (cx: number, cz: number, w: number, d: number) => ops.detail(`paddy-bund-${p.id}-${cx}-${cz}`, cx, cz, w, d, base, 0.8, MAT.earth, 0);
    bund(p.x, z0 + 0.4, p.w, 0.8);
    bund(p.x, z1 - 0.4, p.w, 0.8);
    bund(x0 + 0.4, p.z, 0.8, p.d);
    bund(x1 - 0.4, p.z, 0.8, p.d);
    // rice rows: 0.12 m stems, explicitly non-colliding; 1.1 m spacing.
    for (let z = z0 + 1.4; z < z1 - 1.0; z += 1.1) {
      for (let x = x0 + 1.2; x < x1 - 0.8; x += 1.1) {
        const jitter = (hash(x, z) % 7) / 20 - 0.15;
        ops.detail(`rice-${p.id}-${x.toFixed(1)}-${z.toFixed(1)}`, x + jitter, z, 0.14, 0.14, p.levelY + 0.28, 0.62 + (hash(x, z) % 3) * 0.08, p.rice === 'young' ? MAT.riceYoung : MAT.riceGold, 0, false);
      }
    }
    void gapZ;
  }
  for (const patch of MIAO_VEGETABLE_PATCHES) {
    const base = ops.ground(patch.x, patch.z);
    ops.detail(`veg-soil-${patch.id}`, patch.x, patch.z, patch.w, patch.d, base + 0.02, 0.18, MAT.mud, 0, false);
    for (let z = patch.z - patch.d / 2 + 1; z < patch.z + patch.d / 2 - 0.6; z += 0.9) {
      for (let x = patch.x - patch.w / 2 + 0.8; x < patch.x + patch.w / 2 - 0.6; x += 0.8) {
        ops.detail(`veg-${patch.id}-${x.toFixed(1)}-${z.toFixed(1)}`, x, z, 0.4, 0.4, base + 0.2, 0.28, MAT.vegetable, 0, false);
      }
    }
  }
  for (const canal of MIAO_IRRIGATION) {
    const points = canal.points;
    for (let i = 1; i < points.length; i++) {
      const [ax, az] = points[i - 1], [bx, bz] = points[i];
      const length = Math.hypot(bx - ax, bz - az);
      const nx = (bz - az) / (length || 1), nz = -(bx - ax) / (length || 1);
      const base = ops.ground((ax + bx) / 2, (az + bz) / 2);
      const angle = Math.atan2(bz - az, bx - ax);
      ops.detail(`canal-${canal.id}-${i}`, (ax + bx) / 2, (az + bz) / 2, length, canal.width, base - 0.15, 0.17, MAT.water, angle, false);
      ops.detail(`canal-edge-${canal.id}-${i}`, (ax + bx) / 2 + nx * canal.width * 0.6, (az + bz) / 2 + nz * canal.width * 0.6, length, 0.25, base, 0.3, MAT.stone, angle);
    }
  }
}

/* ------------------------------------------------------------------ *
 * Bridges
 * ------------------------------------------------------------------ */

function buildBridgeDeck(ops: MapWorldOps, bridge: MiaoBridgeDef) {
  const halfW = bridge.width / 2;
  const thickness = bridge.kind === 'covered' ? 0.45 : 0.5;
  const deckMat = bridge.kind === 'stone-arch' ? MAT.stone : MAT.floor;
  ops.detail(`bridge-${bridge.id}-deck`, (bridge.x0 + bridge.x1) / 2, bridge.z, bridge.x1 - bridge.x0, bridge.width, bridge.deckY - thickness, thickness, deckMat, 0);
  for (let x = Math.floor(bridge.x0); x < Math.ceil(bridge.x1); x++) {
    for (let z = Math.floor(bridge.z - halfW); z < Math.ceil(bridge.z + halfW); z++) ops.setPrimary(x, z, bridge.deckY);
  }
  // approach curbs
  ops.detail(`bridge-${bridge.id}-curb-s`, (bridge.x0 + bridge.x1) / 2, bridge.z - halfW + 0.15, bridge.x1 - bridge.x0, 0.3, bridge.deckY, 0.18, MAT.stone, 0);
  ops.detail(`bridge-${bridge.id}-curb-n`, (bridge.x0 + bridge.x1) / 2, bridge.z + halfW - 0.15, bridge.x1 - bridge.x0, 0.3, bridge.deckY, 0.18, MAT.stone, 0);
  if (bridge.kind !== 'open-wood') {
    // Masonry spans spring from shared piers. Each arch fills up to the deck
    // and leaves an actual opening above the waterline.
    const river = riverAt(bridge.z);
    const betweenPiers = bridge.kind === 'covered' ? [river.x - 4.5, river.x + 4.5] : [];
    const piers = [river.waterWest - 1, ...betweenPiers, river.waterEast + 1].map(x => Math.round(x * 2) / 2);
    const spandrelTop = Math.floor(bridge.deckY - thickness);
    for (const x of piers) {
      ops.detail(`bridge-${bridge.id}-pier-${x}`, x, bridge.z, 2, bridge.width + 0.5, -6, spandrelTop + 6, MAT.rubble);
    }
    for (let i = 1; i < piers.length; i++) {
      const start = piers[i - 1] + 1;
      const end = piers[i] - 1;
      for (let x = start; x < end; x += 0.5) {
        const span = (2 * (x + 0.25 - start)) / (end - start) - 1;
        const bottom = Math.round((-1.5 + (spandrelTop + 1) * Math.sqrt(1 - span * span)) * 2) / 2;
        ops.detail(`bridge-${bridge.id}-arch-${i}`, x + 0.25, bridge.z, 0.5, bridge.width - 0.5,
          bottom, bridge.deckY - bottom - 0.5, MAT.stone);
      }
    }
    return;
  }
  for (const x of [216, 228, 240]) {
    ops.box(x - 0.9, bridge.z - halfW + 0.6, x + 0.9, bridge.z + halfW - 0.6, -6, bridge.deckY - 1, MAT.rubble);
    ops.detail(`bridge-${bridge.id}-pier-cap-${x}`, x, bridge.z, 2.5, bridge.width - 0.5, bridge.deckY - 1.2, 0.7, MAT.stone);
  }
  for (const side of [-1, 0, 1]) {
    ops.detail(`bridge-${bridge.id}-beam-${side}`, (bridge.x0 + bridge.x1) / 2, bridge.z + side * (halfW - 1),
      bridge.x1 - bridge.x0, 0.5, bridge.deckY - 1, 0.5, MAT.dark);
  }
}


function buildBridgeRailings(ops: MapWorldOps, bridge: MiaoBridgeDef) {
  const halfW = bridge.width / 2;
  const deck = bridge.deckY;
  const covered = bridge.kind === 'covered';
  for (const sign of [-1, 1] as const) {
    const z = bridge.z + sign * (halfW - 0.18);
    // end blocks: leave the road opening clear
    const from = bridge.x0 + 1.0, to = bridge.x1 - 1.0;
    for (let x = from; !covered && x <= to; x += 2.2) {
      ops.detail(`bridge-${bridge.id}-rail-post-${sign}-${x.toFixed(1)}`, x, z, 0.2, 0.2, deck, 1.05, MAT.dark, 0);
    }
    if (covered) {
      // long gallery rail with real window openings: lower 0.45, upper 1.15, posts every 2.2
      ops.detail(`bridge-${bridge.id}-rail-low-${sign}`, (from + to) / 2, z, to - from, 0.16, deck + 0.35, 0.15, MAT.honey, 0);
      ops.detail(`bridge-${bridge.id}-rail-high-${sign}`, (from + to) / 2, z, to - from, 0.16, deck + 1.05, 0.18, MAT.honey, 0);
      // benches inside the gallery
      ops.detail(`bridge-${bridge.id}-bench-${sign}`, (from + to) / 2, z - sign * 0.55, to - from - 2, 0.45, deck + 0.42, 0.12, MAT.honey, 0);
      ops.detail(`bridge-${bridge.id}-bench-back-${sign}`, (from + to) / 2, z - sign * 0.75, to - from - 2, 0.1, deck + 0.55, 0.5, MAT.honey, 0);
    } else {
      ops.detail(`bridge-${bridge.id}-rail-${sign}`, (from + to) / 2, z, to - from, 0.14, deck + 0.95, 0.14, MAT.dark, 0);
      ops.detail(`bridge-${bridge.id}-rail-mid-${sign}`, (from + to) / 2, z, to - from, 0.1, deck + 0.5, 0.1, MAT.dark, 0);
    }
  }
  if (covered) {
    const gallerySpan = bridge.x1 - bridge.x0 - 1;
    const centre = (bridge.x0 + bridge.x1) / 2;
    for (const sign of [-1, 1]) {
      const z = bridge.z + sign * (halfW - 0.3);
      ops.detail(`bridge-${bridge.id}-eave-beam-${sign}`, centre, z, gallerySpan, 0.5, deck + 3.5, 0.5, MAT.dark);
      for (let x = bridge.x0 + 2; x <= bridge.x1 - 2; x += 4) {
        ops.detail(`bridge-${bridge.id}-gallery-post-${sign}-${x}`, x, z, 0.5, 0.5, deck, 4, MAT.honey);
      }
    }
    for (const sign of [-1, 1]) {
      const z = bridge.z + sign * (halfW - 0.65);
      for (let x = bridge.x0 + 6; x < bridge.x1 - 4; x += 8) {
        ops.detail(`bridge-${bridge.id}-lantern-${sign}-${x}`, x, z, 0.5, 0.5, deck + 2.5, 0.5, MAT.madder, 0, false);
      }
    }
    const roof = (id: string, x: number, length: number, halfSpan: number, eave: number, rise: number, hip: number) => {
      const courses = halfSpan * 2;
      for (const sign of [-1, 1]) {
        for (let i = 0; i < courses; i++) {
          const face = 1 - i / (courses - 1);
          const y = eave + Math.round(rise * face ** 1.45 * 2) / 2;
          const inset = Math.round(hip * face * 2) / 2;
          ops.detail(`bridge-${bridge.id}-${id}-${sign}-${i}`, x, bridge.z + sign * (i * 0.5 + 0.25),
            length - inset * 2, 0.5, y - 0.5, 1, MAT.tile);
        }
      }
      ops.detail(`bridge-${bridge.id}-${id}-ridge`, x, bridge.z, length - hip * 2 + 1, 0.5, eave + rise, 0.5, MAT.tile2);
      for (const side of [-1, 1]) for (const end of [-1, 1]) {
        ops.detail(`bridge-${bridge.id}-${id}-tip-${side}-${end}`, x + end * (length / 2 - 0.25),
          bridge.z + side * (halfSpan - 0.25), 0.5, 0.5, eave + 0.5, 0.5, MAT.tile2);
      }
    };
    roof('gallery', centre, gallerySpan, halfW + 1, deck + 3.5, 2, 1.5);
    // Three hipped pavilions rise from the covered gallery, each supported by
    // posts and a raised timber drum between the two tiers of dark tile.
    for (const [i, x] of [bridge.x0 + 7.5, centre, bridge.x1 - 7.5].entries()) {
      const rise = i === 1 ? 3 : 2.5;
      for (const side of [-1, 1]) for (const end of [-1, 1]) {
        ops.detail(`bridge-${bridge.id}-tower-post-${i}-${side}-${end}`, x + end * 3, bridge.z + side * 3.5,
          0.5, 0.5, deck, 6.5, MAT.dark);
      }
      for (const side of [-1, 1]) {
        ops.detail(`bridge-${bridge.id}-tower-frieze-${i}-${side}`, x, bridge.z + side * 3.5,
          8, 0.5, deck + 4.5, 1.5, MAT.grey);
      }
      roof(`tower-${i}`, x, i === 1 ? 13 : 11, halfW + 0.5, deck + 6, rise, 3);
    }
    // real stone bollards at both heads: 2.0 m clear motorcycle lane, nothing bigger
    for (const hx of [bridge.x0 + 1.4, bridge.x1 - 1.4]) {
      for (const dz of [-3.6, -2.2, 0, 2.2, 3.6]) {
        ops.detail(`bridge-${bridge.id}-bollard-${hx}-${dz}`, hx, bridge.z + dz, 0.55, 0.55, deck, 1.0, MAT.stone, 0);
      }
    }
  }
}

/* ------------------------------------------------------------------ *
 * Quay, towpath, ferry slips, ladders
 * ------------------------------------------------------------------ */

function buildQuay(ops: MapWorldOps) {
  for (let z = 0; z < 500; z++) {
    const r = riverAt(z + 0.5);
    const ferryOpening = MIAO_FERRIES.some((f) => Math.abs(f.z - z - 0.5) < f.deckWidth / 2 + 1);
    if (ferryOpening) continue;
    for (const side of ['west', 'east'] as const) {
      const streetY = quayStreetY(z + 0.5, side);
      const wallX = side === 'west' ? r.towWest - 1 : r.towEast + 1;
      const waterEdge = side === 'west' ? r.waterWest - 1 : r.waterEast + 1;
      const inner = side === 'west' ? wallX : waterEdge;
      const outer = side === 'west' ? waterEdge : wallX;
      const span = Math.abs(outer - inner);
      if (span > 0.5) {
        // towpath deck at -1.2 (terrain floors -2, this 0.8 m slab is the walkable surface)
        ops.detail(`towpath-${side}-${z}`, (inner + outer) / 2, z + 0.5, span, 1.0, -2, 0.8, MAT.stone, 0);
      }
      // quay wall (skip ferry slips): 1 m thick, towY -> street
      const bridgeGap = MIAO_BRIDGES.some((b) => Math.abs(b.z - z) < b.width / 2 + 3);
      if (!bridgeGap) {
        ops.column(Math.floor(wallX), z, -2, streetY, MAT.rubble);
        ops.put(Math.floor(wallX), streetY - 1, z, MAT.paving);
      }
      // water-edge stone lip
      ops.column(Math.floor(waterEdge), z, -5.5, -1.2, MAT.rubble);
      // parapet on the river side with gaps at ladders, bridges, ferry slips
      const ladderGap = MIAO_RIVER_LADDERS.some((l) => l.side === side && Math.abs(l.z - z) < 2.4);
      const ferryGap = MIAO_FERRIES.some((f) => Math.abs(f.z - z) < 6);
      const gap = ladderGap || bridgeGap || ferryGap;
      if (z % 4 === 0 && !gap) {
        const x = side === 'west' ? wallX + 0.55 : wallX - 0.55;
        ops.detail(`quay-rail-${side}-${z}`, x, z + 2, 0.28, 4, streetY, 0.95, MAT.stone, 0);
      }
    }
  }
}

/** Flush landings with a walkable stone stair directly up to the quay street. */
function buildFerryDocks(ops: MapWorldOps) {
  for (const dock of MIAO_FERRY_DOCKS) {
    const { x, direction, halfWidth, landingLength, stairRun, steps, ferry } = dock;
    const deckY = ferry.deckY;
    ops.detail(dock.id, x + direction * landingLength / 2, ferry.z, landingLength, halfWidth * 2, -3, deckY + 3, MAT.floor);
    for (let i = 0; i < steps; i++) {
      const centre = x + direction * (landingLength + (i + 0.5) * stairRun);
      ops.detail(`${dock.id}-step-${i}`, centre, ferry.z, stairRun, halfWidth * 2, -2, deckY + 2 + (i + 1) * 0.5, MAT.stone);
    }
  }
}

const smooth01 = (v: number) => {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
};

function buildLadders(ops: MapWorldOps) {
  for (const plan of MIAO_RIVER_LADDERS) {
    if (plan.id === 'central-bridge-side-ladder') {
      const bridge = MIAO_BRIDGES.find((b) => b.id === 'central')!;
      ops.addLadder({
        id: plan.id, x: 228, z: bridge.z + bridge.width / 2, normalX: 0, normalZ: 1,
        bottom: -1.4, top: bridge.deckY,
        exitX: 228, exitZ: bridge.z + bridge.width / 2 - 1.4,
        variant: plan.variant,
      });
      ops.detail(`${plan.id}-top-post-a`, 226.9, bridge.z + bridge.width / 2 - 0.1, 0.25, 0.25, bridge.deckY, 1.0, MAT.stone, 0);
      ops.detail(`${plan.id}-top-post-b`, 229.1, bridge.z + bridge.width / 2 - 0.1, 0.25, 0.25, bridge.deckY, 1.0, MAT.stone, 0);
      continue;
    }
    const side = plan.side;
    const r = riverAt(plan.z);
    const wallX = side === 'west' ? r.wallWest + 1 : r.wallEast - 1;
    const normal = side === 'west' ? 1 : -1;
    const streetY = quayStreetY(plan.z, side);
    const ladder: LadderDef = {
      id: plan.id,
      x: wallX,
      z: plan.z,
      normalX: normal,
      normalZ: 0,
      bottom: -1.4,
      top: streetY,
      exitX: wallX - normal * 1.7,
      exitZ: plan.z,
      variant: plan.variant,
    };
    ops.addLadder(ladder);
    // handrail posts at the top, framed in stone; leave the exit lane open
    ops.detail(`${plan.id}-top-post-a`, wallX, plan.z - 0.75, 0.25, 0.25, streetY, 1.0, MAT.stone, 0);
    ops.detail(`${plan.id}-top-post-b`, wallX, plan.z + 0.75, 0.25, 0.25, streetY, 1.0, MAT.stone, 0);
  }

}

/* ------------------------------------------------------------------ *
 * Builder entry
 * ------------------------------------------------------------------ */

export const miaoVillageBuilder: MapWorldBuilder = {
  id: 'miao_village',
  handlesBuildings: true,
  build(map: MapDef, ops: MapWorldOps) {
    if (map.id !== 'miao_village') return;
    buildQuay(ops);
    buildFerryDocks(ops);
    for (const bridge of MIAO_BRIDGES) {
      buildBridgeDeck(ops, bridge);
      buildBridgeRailings(ops, bridge);
    }
    buildLadders(ops);
    buildPlazas(ops);
    buildTheater(ops);
    buildPigFarm(ops);
    buildFields(ops);
    buildSpawnWalls(ops);
    for (const plot of MIAO_PLOTS) {
      if (plot.interior === 'hall') buildHall(ops, plot);
      else if (plot.interior === 'shed' || plot.interior === 'pig-shed') buildShed(ops, plot);
      else buildHouse(ops, plot);
    }
  },
};
