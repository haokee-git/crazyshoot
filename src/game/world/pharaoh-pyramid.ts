import type {PharaohOps} from './pharaoh-structures';
import {PHARAOH_LAYOUT} from '../../maps/pharaoh/layout';

/**
 * 法老坟墓 · 阶梯金字塔（契约 §4.3 / §4.4）
 *
 * 只通过 `PharaohOps` 写体素 / 0.5 m detail / 静态灯：渲染、碰撞、支撑、导航、
 * 子弹 DDA 全部来自同一份数据。本文件不写 `heights`、不写 `primary`
 * （金字塔整体保持平台 +4，载具因此上不去）。
 *
 * 几何口径
 * - 中心 (330,690)，基座 132×132（x264..396 / z624..756），平台 +4，顶 +52。
 * - 24 级 2 m 台坎；每级水平内收 ≈2.5 m（132 → 12 只能 2.5，契约的"约 2.75"是估算）。
 *   第 i 级台坎面高 6+2i，半宽见 TIER_HALF，顶面 12×12 = x324..336 / z684..696。
 * - 外壳 80 石灰岩 2 层；内部 81 砂岩填实后挖空；墓室用 84 灰泥 / 85 浮雕 / 86 烟熏。
 * - 玩家 MAX_STEP=1.05：2 m 台坎不可徒步；内部楼梯 1 m/级，西南考古阶梯 0.5 m/级。
 * - 所有门洞 1 m 门槛（y=4 实体）：载具 `primary` 恒 +4，footprint 检测从
 *   primary+0.56 起扫，门槛那一格必然拦住任何尺寸载具（含 0.8 m 摩托）。
 */

/* ------------------------------------------------------------------ */
/* 布局常量（probe / Lead 其他 builder / QA 共用）                      */
/* ------------------------------------------------------------------ */

const LOCAL_CENTER: readonly [number, number] = [330, 690];
const LOCAL_BASE = {x0: 264, x1: 396, z0: 624, z1: 756} as const;
export const PYRAMID_PLATFORM = 4;
export const PYRAMID_APEX = 52;
const LOCAL_TOP = {x0: 324, x1: 336, z0: 684, z1: 696} as const;
/** 登顶梯打通顶平台的出口（顶面瓦片这里不重铺）。 */
const LOCAL_HATCH = {x0: 327, x1: 332, z0: 688, z1: 692} as const;

/** 第 i 级台坎（i=0 最外）的半宽（米）。台坎面高 = 6 + 2i，i=23 → +52。 */
export const TIER_HALF: readonly number[] = [
  66, 63, 61, 58, 56, 53, 50, 48, 45, 43, 40, 37, 35, 32, 29, 27, 24, 22, 19, 16, 14, 11, 9, 6,
];

/** 体素材质（契约 §5）。 */
const MAT = {
  casing: 80,    // limestone_shell  金字塔外壳
  sandstone: 81, // sandstone_block  砂岩砌块 / 内部填充
  strata: 82,    // rock_strata      层理岩 / 破损内芯
  granite: 83,   // granite_dark     石棺 / 残柱
  plaster: 84,   // tomb_plaster     墓室地面
  relief: 85,    // relief_fragment  浮雕残片
  soot: 86,      // stone_soot       烟熏石面
  wood: 90,      // palm_wood        北侧施工栈道铺板
  pottery: 91,   // terracotta       陶罐
  sand: 72,      // sand_fine        沙埋
} as const;

export interface PyramidRoom {
  id: string;
  label: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  /** 地面（可站立面）高度。 */
  floor: number;
  /** 空腔上沿（体素 carve 的 y1）。 */
  ceil: number;
}

/** 所有 authored 空间：probe 逐个测净空/地板，QA 也可直接复用。 */
const LOCAL_ROOMS: readonly PyramidRoom[] = [
  {id: 's-pylon-passage', label: '南门楼通道（主门 6×4）', x0: 327, x1: 333, z0: 615, z1: 627, floor: 5, ceil: 9},
  {id: 's-corridor', label: '南入口走廊（净高 4~5）', x0: 327, x1: 333, z0: 627, z1: 646, floor: 5, ceil: 10},
  {id: 's-antechamber', label: '南前厅', x0: 316, x1: 344, z0: 646, z1: 666, floor: 5, ceil: 13},
  {id: 's-approach', label: '墓室前廊', x0: 323, x1: 337, z0: 666, z1: 677, floor: 5, ceil: 12},
  {id: 'burial-chamber', label: '墓室 32×26（净高 9）', x0: 314, x1: 346, z0: 677, z1: 703, floor: 5, ceil: 14},
  {id: 'chamber-north-door', label: '墓室北门 10×4', x0: 322, x1: 332, z0: 703, z1: 705, floor: 5, ceil: 9},
  {id: 'n-gallery', label: '北雕像廊（净高 7，东西两端接环线门）', x0: 298, x1: 352, z0: 705, z1: 726, floor: 5, ceil: 12},
  {id: 'store-north-door', label: '储藏室↔北廊环线门（10 m）', x0: 298, x1: 308, z0: 699, z1: 707, floor: 5, ceil: 9},
  {id: 'collapse-north-door', label: '塌陷间↔北廊环线门（12 m）', x0: 343, x1: 355, z0: 699, z1: 707, floor: 5, ceil: 9},
  {id: 'w-store', label: '西陶罐储藏室', x0: 286, x1: 311, z0: 676, z1: 700, floor: 5, ceil: 11},
  {id: 'w-store-door', label: '储藏室门 4×4', x0: 311, x1: 314, z0: 684, z1: 688, floor: 5, ceil: 9},
  {id: 'w-entry', label: '西入口走廊（4×3.5）', x0: 264, x1: 286, z0: 685, z1: 689, floor: 5, ceil: 9},
  {id: 'e-collapse', label: '东塌陷间', x0: 349, x1: 379, z0: 680, z1: 700, floor: 5, ceil: 11},
  {id: 'e-door', label: '塌陷间门（6 m）', x0: 346, x1: 350, z0: 677, z1: 685, floor: 5, ceil: 9},
  {id: 'e-entry', label: '东入口走廊（净宽 6×3.5，接 A–B 墓道）', x0: 379, x1: 396, z0: 677, z1: 683, floor: 5, ceil: 9},
  {id: 'stair-a-entry', label: '南前厅→大楼梯口', x0: 312, x1: 316, z0: 656, z1: 660, floor: 5, ceil: 10},
  {id: 'upper-landing', label: '上层楼梯口（+20）', x0: 296, x1: 304, z0: 655, z1: 666, floor: 20, ceil: 26},
  {id: 'upper-west', label: '上层西廊（+20）', x0: 296, x1: 304, z0: 666, z1: 684, floor: 20, ceil: 26},
  {id: 'upper-lobby', label: '上层登顶梯口（+20）', x0: 296, x1: 300, z0: 684, z1: 696, floor: 20, ceil: 26},
  {id: 'upper-spine', label: '上层南北廊（+20）', x0: 296, x1: 302, z0: 696, z1: 718, floor: 20, ceil: 26},
  {id: 'upper-north', label: '上层北廊（+20）', x0: 296, x1: 348, z0: 718, z1: 722, floor: 20, ceil: 26},
  {id: 'north-gate-tunnel', label: '北门楼通道（+20，接施工栈道）', x0: 341, x1: 345, z0: 722, z1: 747, floor: 20, ceil: 24},
  {id: 'east-pylon-passage', label: '东门楼通道', x0: 394, x1: 403, z0: 677, z1: 683, floor: 5, ceil: 9},
  {id: 'west-pylon-passage', label: '西门楼通道', x0: 257, x1: 266, z0: 685, z1: 689, floor: 5, ceil: 9},
];

export interface PyramidStairSpec {
  id: string;
  label: string;
  steps: number;
  riser: number;
  width: number;
  yBottom: number;
  yTop: number;
  from: readonly [number, number];
  to: readonly [number, number];
  exterior: boolean;
}

/** 2 部内部楼梯 + 3 条外部 0.5 m 级高坡道/阶梯（probe 校验级数与最大级高）。 */
const LOCAL_STAIRS: readonly PyramidStairSpec[] = [
  {id: 'stair-a', label: '南前厅 → 上层西廊 +20', steps: 15, riser: 1, width: 4, yBottom: 5, yTop: 20, from: [312, 658], to: [296, 658], exterior: false},
  {id: 'summit-stair', label: '+20 梯口 → 顶 +52（末 5 级穿顶）', steps: 32, riser: 1, width: 4, yBottom: 20, yTop: 52, from: [300, 690], to: [332, 690], exterior: false},
  {id: 'sw-stair', label: '西南考古阶梯（西面 4 m 宽径向，48×1.0 m）', steps: 48, riser: 1, width: 4, yBottom: 4, yTop: 52, from: [262, 694], to: [324, 694], exterior: true},
  {id: 'north-ramp-a', label: '北施工栈道第一段（外）', steps: 16, riser: 0.5, width: 3, yBottom: 4, yTop: 12, from: [360, 767], to: [314, 767], exterior: true},
  {id: 'north-ramp-b', label: '北施工栈道第二段（外）', steps: 16, riser: 0.5, width: 3, yBottom: 12, yTop: 20, from: [310, 757], to: [340, 757], exterior: true},
];

/* ------------------------------------------------------------------ */
/* 几何                                                                 */
/* ------------------------------------------------------------------ */

/** 列 (x,z) 的壳体表面高度（可站立顶面）。基座外沿 → +4（平台本身）。 */
function localPyramidSurface(x: number, z: number): number {
  const d = Math.max(Math.abs(x + 0.5 - LOCAL_CENTER[0]), Math.abs(z + 0.5 - LOCAL_CENTER[1]));
  for (let i = TIER_HALF.length - 1; i >= 0; i--) if (d < TIER_HALF[i]) return 6 + i * 2;
  return PYRAMID_PLATFORM;
}

/** 该列下方已有实体的顶面：金字塔解析面与地形面取高者（避免与地形整平结果脱空）。 */
function baseAt(ops: PharaohOps, x: number, z: number): number {
  return Math.max(localPyramidSurface(x, z), ops.ground(x, z));
}

function localInsidePyramidBase(x: number, z: number): boolean {
  return x >= LOCAL_BASE.x0 && x < LOCAL_BASE.x1 && z >= LOCAL_BASE.z0 && z < LOCAL_BASE.z1;
}

/* ------------------------------------------------------------------ */
/* ops 包装                                                            */
/* ------------------------------------------------------------------ */

function fill(ops: PharaohOps, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, id: number) {
  if (x1 > x0 && z1 > z0 && y1 > y0) ops.box(x0, z0, x1, z1, y0, y1, id);
}

function cut(ops: PharaohOps, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) {
  if (x1 > x0 && z1 > z0 && y1 > y0) ops.carve(x0, z0, x1, z1, y0, y1);
}

function detail(ops: PharaohOps, id: string, cx: number, cz: number, w: number, d: number, y: number, h: number, material: number, angle = 0) {
  if (h <= 0.001) return;
  ops.detail(id, cx, cz, w, d, y, h, material, angle, true);
}

/** 把一块方形地面填 / 凿到 y（折返平台、门楼体量共用）。 */
function plateau(ops: PharaohOps, x0: number, z0: number, x1: number, z1: number, y: number, mat: number) {
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const S = baseAt(ops, x, z);
    if (S < y) ops.column(x, z, S, y, mat);
    else if (S > y && S - y <= 3.5) ops.carve(x, z, x + 1, z + 1, y, S);
  }
}

/* ------------------------------------------------------------------ */
/* 1. 外壳 + 填实                                                       */
/* ------------------------------------------------------------------ */

function buildShell(ops: PharaohOps) {
  for (let z = LOCAL_BASE.z0; z < LOCAL_BASE.z1; z++) {
    for (let x = LOCAL_BASE.x0; x < LOCAL_BASE.x1; x++) {
      const top = localPyramidSurface(x, z);
      const base = Math.min(PYRAMID_PLATFORM, ops.ground(x, z));   // 地形低于 +4 时补到地面，不留缝
      if (top <= base) continue;
      // 内部填砂岩，表面两层石灰岩外壳 → 每 2 m 一道干净石阶。
      if (top - 2 > base) ops.column(x, z, base, top - 2, MAT.sandstone);
      ops.column(x, z, Math.max(base, top - 2), top, MAT.casing);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 2. 内部空间（挖空 + 地面）                                           */
/* ------------------------------------------------------------------ */

function carveRooms(ops: PharaohOps) {
  for (const r of LOCAL_ROOMS) cut(ops, r.x0, r.z0, r.x1, r.z1, r.floor, r.ceil);
  // 地面石面（只在壳体确实存在的高度上铺，避免悬空地板）
  const floors: [number, number, number, number, number][] = [
    [327, 333, 627, 646, MAT.plaster],
    [316, 344, 646, 666, MAT.plaster],
    [323, 337, 666, 677, MAT.plaster],
    [314, 346, 677, 703, MAT.plaster],
    [298, 352, 705, 726, MAT.sandstone],
    [298, 308, 699, 707, MAT.sandstone],
    [343, 355, 699, 707, MAT.sandstone],
    [286, 311, 676, 700, MAT.sandstone],
    [349, 379, 680, 700, MAT.sandstone],
    [264, 286, 685, 689, MAT.sandstone],
    [379, 396, 677, 683, MAT.sandstone],
  ];
  for (const [x0, x1, z0, z1, mat] of floors) {
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
      if (localPyramidSurface(x, z) > PYRAMID_PLATFORM) ops.put(x, PYRAMID_PLATFORM, z, mat);
    }
  }
  // 上层 +20 地板 = y19（同样只在壳体存在处铺）
  for (const r of LOCAL_ROOMS) {
    if (r.floor !== 20) continue;
    for (let z = r.z0; z < r.z1; z++) for (let x = r.x0; x < r.x1; x++) {
      if (localPyramidSurface(x, z) > 19) ops.put(x, 19, z, MAT.sandstone);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 3. 门楼（真实门洞 + 石墩窄门）                                       */
/* ------------------------------------------------------------------ */

/** 南主门楼：6 m 宽 × 4 m 高主门，1 m 门槛；门内两根石墩，两个净宽 2 m 的口。 */
function buildSouthPylon(ops: PharaohOps) {
  fill(ops, 320, 615, 340, 632, 4, 13, MAT.casing);   // 门楼压到台面 ≥12 处，门洞上方才有真实门楣
  cut(ops, 327, 615, 333, 632, 5, 9);
  detail(ops, 'pyr-s-pylon-lintel', 330, 623, 20, 18, 13, 1, MAT.casing);
  detail(ops, 'pyr-s-pylon-cornice', 330, 623, 22, 20, 14, 1.5, MAT.casing);
  detail(ops, 'pyr-s-pylon-jamb-w', 327, 623, 1, 18, 9, 4, MAT.relief);
  detail(ops, 'pyr-s-pylon-jamb-e', 333, 623, 1, 18, 9, 4, MAT.relief);
  for (const x of [327, 332]) fill(ops, x, 634, x + 1, 635, 5, 8, MAT.granite);   // 贴墙，中间 4 m 直行
  // 砂岩门框 + 门楣 + 台基：远景一眼能读出门
  detail(ops, 'pyr-s-pylon-frame-w', 326.6, 621, 1.2, 18, 5, 5.5, MAT.sandstone);
  detail(ops, 'pyr-s-pylon-frame-e', 333.4, 621, 1.2, 18, 5, 5.5, MAT.sandstone);
  detail(ops, 'pyr-s-pylon-band', 330, 621, 9.2, 18, 9, 1.4, MAT.sandstone);
  detail(ops, 'pyr-s-pylon-plinth', 330, 623, 22, 20, 4, 0.7, MAT.sandstone);
}

/** 西门楼：4 m 宽，3.5 m 净高（4 m 空腔 + 0.5 m 门楣压到 3.5）。 */
function buildWestPylon(ops: PharaohOps) {
  fill(ops, 257, 681, 270, 693, 4, 11, MAT.casing);
  cut(ops, 257, 685, 270, 689, 5, 9);
  detail(ops, 'pyr-w-pylon-lintel', 261, 687, 9, 4, 8.5, 0.5, MAT.casing);
  detail(ops, 'pyr-w-pylon-cornice', 263, 687, 14, 14, 11, 1, MAT.casing);
  for (const z of [685, 688]) fill(ops, 262, z, 263, z + 1, 5, 8, MAT.granite);   // 4 m 走廊：两根贴墙，中间 2 m
  detail(ops, 'pyr-w-pylon-frame-s', 261, 684.6, 13, 1.2, 5, 4.2, MAT.sandstone);
  detail(ops, 'pyr-w-pylon-frame-n', 261, 689.4, 13, 1.2, 5, 4.2, MAT.sandstone);
  detail(ops, 'pyr-w-pylon-band', 261, 687, 13, 5.4, 8.6, 0.9, MAT.sandstone);
  detail(ops, 'pyr-w-pylon-plinth', 263, 687, 14, 14, 4, 0.7, MAT.sandstone);
}

/** 东门楼：与 A–B 墓道 A 口 (391..396 / 677..683) 对齐，地面 +5，净空 3.5。 */
function buildEastPylon(ops: PharaohOps) {
  fill(ops, 389, 674, 403, 686, 4, 11, MAT.casing);
  cut(ops, 389, 677, 403, 683, 5, 9);
  detail(ops, 'pyr-e-pylon-lintel', 398, 680, 9, 6, 8.5, 0.5, MAT.casing);
  detail(ops, 'pyr-e-pylon-cornice', 396, 680, 15, 14, 11, 1, MAT.casing);
  // 石墩挪到 x=386（隧道会 carve x 391..395）：净宽 2+2 m，人可过、载具另有 1 m 门槛挡
  for (const z of [677, 682]) fill(ops, 386, z, 387, z + 1, 5, 8, MAT.granite);   // 6 m 走廊：两根贴墙，中间 4 m
  detail(ops, 'pyr-e-pylon-frame-s', 396, 676.6, 15, 1.2, 5, 4.2, MAT.sandstone);
  detail(ops, 'pyr-e-pylon-frame-n', 396, 683.4, 15, 1.2, 5, 4.2, MAT.sandstone);
  detail(ops, 'pyr-e-pylon-band', 396, 680, 15, 7.4, 8.6, 0.9, MAT.sandstone);
  detail(ops, 'pyr-e-pylon-plinth', 396, 680, 15, 14, 4, 0.7, MAT.sandstone);
}

/* ------------------------------------------------------------------ */
/* 4. 内部楼梯（1 m/级，逐级 carve + fill，不动壳体顶面）               */
/* ------------------------------------------------------------------ */

interface StairOptions {
  axis: 'x' | 'z';
  from: number;
  to: number;
  cross0: number;
  cross1: number;
  yFirstTop: number;
  steps: number;
  riser: number;
  fillFrom: number;
  mat: number;
  /** 从第几级起打通顶部平台（登顶梯出口）。 */
  breakThroughTop?: number;
}

function buildStair(ops: PharaohOps, o: StairOptions) {
  const tread = (o.to - o.from) / o.steps;
  for (let i = 0; i < o.steps; i++) {
    const a = o.from + tread * i, b = o.from + tread * (i + 1);
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const top = o.yFirstTop + o.riser * i;
    // 边界四舍五入到整列：floor/ceil 会让相邻两级共用一列，后一级把前一列抬成 2 m 台阶。
    const x0 = o.axis === 'x' ? Math.round(lo) : o.cross0;
    const x1 = o.axis === 'x' ? Math.max(x0 + 1, Math.round(hi)) : o.cross1;
    const z0 = o.axis === 'x' ? o.cross0 : Math.round(lo);
    const z1 = o.axis === 'x' ? o.cross1 : Math.max(z0 + 1, Math.round(hi));
    // 抬头空间 2.4 m，但绝不掀掉该列自己的壳体顶面（minSurface-1）。
    let minSurface = Infinity;
    for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) minSurface = Math.min(minSurface, localPyramidSurface(x, z));
    const cap = o.breakThroughTop !== undefined && top >= o.breakThroughTop
      ? PYRAMID_APEX + 1
      : Math.min(top + 2.4, minSurface - 1);
    cut(ops, x0, z0, x1, z1, top, Math.max(top, cap));
    fill(ops, x0, z0, x1, z1, o.fillFrom, top, o.mat);
  }
}

/* ------------------------------------------------------------------ */
/* 5. 外部倾斜踏步带（0.5 m 级高，绝不动 primary）                      */
/* ------------------------------------------------------------------ */

/**
 * 沿 p0→p1 的倾斜踏步带：宽 width，从 yBottom 抬到 yTop，每级 0.5 m。
 * 每级把脚下壳体填到踏面高（S<top）或把台坎凿到踏面高（S>top，≤3.5 m）——
 * 于是西南"考古阶梯"是切进台坎的实体台阶，北侧"施工栈道"是砌在台坎上的坡道。
 */
function buildInclinedBand(
  ops: PharaohOps,
  p0: readonly [number, number],
  p1: readonly [number, number],
  width: number,
  yBottom: number,
  yTop: number,
  riser: number,
  mat: number,
  idPrefix: string,
  landingSteps: readonly number[] = [],
  landingLength = 2.4,
  bodyMat = mat,
) {
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1];
  const length = Math.hypot(dx, dz);
  if (length < 0.5) return;
  const ux = dx / length, uz = dz / length;
  const px = -uz, pz = ux;
  const totalSteps = Math.max(1, Math.round((yTop - yBottom) / riser));
  const tread = (length - landingSteps.length * landingLength) / totalSteps;
  const angle = -Math.atan2(uz, ux);   // detail 的局部 w 轴 = (cos a, -sin a)
  let s = 0, step = 0, n = 0;

  const lay = (sMid: number, len: number, y: number, tag: string) => {
    const cx = p0[0] + ux * sMid, cz = p0[1] + uz * sMid;
    const top = Math.floor(y + 1e-6);
    const r = Math.hypot(len, width) / 2 + 1;
    for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const ddx = x + 0.5 - cx, ddz = z + 0.5 - cz;
        if (Math.abs(ddx * ux + ddz * uz) > len / 2) continue;
        if (Math.abs(ddx * px + ddz * pz) > width / 2) continue;
        const S = baseAt(ops, x, z);
        if (S < top) ops.column(x, z, S, top, bodyMat);
        else if (S > top && S - top <= 3.5) ops.carve(x, z, x + 1, z + 1, top, S);
      }
    }
    const frac = y - Math.floor(y + 1e-6);
    detail(ops, `${idPrefix}-${tag}`, cx, cz, len, width, top, frac > 0.001 ? 0.5 : 0, mat, angle);
  };

  const boundaries = [...landingSteps, totalSteps];
  for (const bound of boundaries) {
    while (step < bound) {
      lay(s + tread / 2, tread, yBottom + riser * (step + 1), `s${n}`);
      s += tread;
      step++;
      n++;
    }
    if (step < totalSteps) {
      lay(s + landingLength / 2, landingLength, yBottom + riser * step, `l${n}`);
      s += landingLength;
    }
  }
}


/* ------------------------------------------------------------------ */
/* 5b. 西南考古阶梯：贴着西南棱线外侧的 3 m 石阶（体量可见、浅色）      */
/* ------------------------------------------------------------------ */

/**
 * 旧做法把 3 m 带子「骑」在棱线上 → 一半埋进金字塔、只剩一条细线。
 * 现在整条带子里缘正好贴棱线、全部朝南面外侧展开：踏步 3 m（砂岩 81）+
 * 外侧 1 m 护缘（石灰岩 80，分段断开），96 级 × 0.5 m，3 个休息平台。
 */
const SW_STAIR = {
  /** 西面（z 692..696，4 m 宽）的径向大阶梯：平台 +4 直上顶平台西缘 +52。 */
  x0: 261.5,
  x1: 324,
  z0: 692,
  z1: 696,
  steps: 48,
  landings: [16, 32] as readonly number[],
  landingLen: 2.6,
  landingExtra: 1.0,
  yBottom: 4,
  yTop: 52,
} as const;

/**
 * 西南考古阶梯（西面径向、轴对齐）。48 级 ×1.0 m：1 m 体素世界里 0.5 m 踏步
 * 必然出现「两列共用一级」（detail 贴面被埋、远处碎块感），所以用整米级高，
 * 玩家 MAX_STEP=1.05 仍可正常步行。4 m 宽砂岩踏面 + 两侧 1 m 宽 0.6 m 矮护缘，
 * 每 16 级一处休息平台（3 段）。
 */
function buildSwStair(ops: PharaohOps) {
  const {x0, x1, z0, z1, steps, landings, landingLen, landingExtra, yBottom, yTop} = SW_STAIR;
  const riser = (yTop - yBottom) / steps;
  const tread = (x1 - x0 - landings.length * landingLen) / steps;
  const za0 = Math.round(z0 - landingExtra);

  /** 把 [xa,xb)×[za,zb) 铺到 y（含 0.5 贴面）。 */
  const lay = (xa: number, xb: number, za: number, zb: number, y: number, body: number) => {
    const top = Math.round(y);
    for (let z = za; z < zb; z++) {
      for (let x = xa; x < xb; x++) {
        const S = baseAt(ops, x, z);
        if (S < top) ops.column(x, z, S, top, body);
        else if (S > top && S - top <= 3.2) ops.carve(x, z, x + 1, z + 1, top, S);
      }
    }
    return top;
  };

  let x = x0, step = 0;
  const boundaries = [...landings, steps];
  for (const bound of boundaries) {
    while (step < bound) {
      const y = yBottom + riser * (step + 1);
      const xa = Math.round(x), xb = Math.max(xa + 1, Math.round(x + tread));
      lay(xa, xb, z0, z1, y, MAT.sandstone);
      // 两侧 1 m 宽、0.6 m 高的矮护缘（每 9 级断 2 级）
      if (step % 11 < 9) {
        lay(xa, xb, z0 - 1, z0, y + 0.6, MAT.casing);
        lay(xa, xb, z1, z1 + 1, y + 0.6, MAT.casing);
      }
      x += tread;
      step++;
    }
    if (step < steps) {
      const y = yBottom + riser * step;
      const xa = Math.round(x), xb = Math.max(xa + 1, Math.round(x + landingLen));
      lay(xa, xb, za0, z1, y, MAT.sandstone);
      for (const off of [0.35, 1.85] as const) {
        detail(ops, `pyr-sw-parapet-${step}-${off}`, xa + off + 0.6, za0 + 0.4, 1.2, 0.8, y, 0.9, MAT.casing);
      }
      x += landingLen;
    }
  }
  // 顶平台入口：两侧 1.6 m 残墙，把登顶缺口读出来
  detail(ops, 'pyr-sw-top-jamb-s', x1 + 1.1, z0 - 0.5, 2.2, 0.8, yTop - 1.6, 1.6, MAT.casing);
  detail(ops, 'pyr-sw-top-jamb-n', x1 + 1.1, z1 + 0.4, 2.2, 0.8, yTop - 1.6, 1.6, MAT.casing);
}

/* ------------------------------------------------------------------ */
/* 6. 顶平台 / 残缺女儿墙                                               */
/* ------------------------------------------------------------------ */

function buildSummit(ops: PharaohOps) {
  const {x0, x1, z0, z1} = LOCAL_TOP;
  const hatch = LOCAL_HATCH;
  // 12×12 顶面重铺一层石灰岩（登顶梯出口除外，否则楼梯会被平台盖住）。
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    if (x >= hatch.x0 && x < hatch.x1 && z >= hatch.z0 && z < hatch.z1) continue;
    ops.put(x, PYRAMID_APEX - 1, z, MAT.casing);
  }
  // 低矮残缺女儿墙：0.9 m，分段，梯口一侧留空——不形成完整堡垒。
  const segs: [number, number, number, number][] = [
    [328, 336, 684, 685],   // 南沿东半段（SW 角留给考古阶梯登顶）
    [334, 336, 685, 692],   // 东沿
    [324, 336, 695, 696],   // 北沿
    [324, 325, 684, 690],   // 西沿南半段（z690..696 留给大阶梯登顶口）
  ];
  for (const [sx0, sx1, sz0, sz1] of segs) {
    detail(ops, `pyr-parapet-${sx0}-${sz0}`, (sx0 + sx1) / 2, (sz0 + sz1) / 2, sx1 - sx0, sz1 - sz0, PYRAMID_APEX, 0.9, MAT.relief);
  }
  // 顶面残块
  detail(ops, 'pyr-top-block-a', 328.5, 694.0, 1.5, 1.0, 52, 0.5, MAT.strata);
  detail(ops, 'pyr-top-block-b', 334.5, 685.5, 1.0, 1.0, 52, 0.5, MAT.casing);
  detail(ops, 'pyr-top-block-c', 325.5, 691.5, 1.0, 0.5, 52, 0.5, MAT.relief);
}


/** 北施工栈道的可见构件：外侧木立柱 + 扶手 + 转角沙袋堆（不占 3 m 通行面）。 */
function rampHardware(
  ops: PharaohOps,
  p0: readonly [number, number],
  p1: readonly [number, number],
  width: number,
  y0: number,
  y1: number,
  side: number,
  tag: string,
) {
  const dx = p1[0] - p0[0], dz = p1[1] - p0[1], len = Math.hypot(dx, dz);
  if (len < 2) return;
  const ux = dx / len, uz = dz / len;
  const px = -uz * side, pz = ux * side;
  const across = width / 2 + 0.3;
  const yAt = (s: number) => y0 + (y1 - y0) * (s / len);
  const spacing = 4.6;
  let k = 0;
  for (let s = 2.2; s <= len - 1.5; s += spacing, k++) {
    const cx = p0[0] + ux * s + px * across, cz = p0[1] + uz * s + pz * across;
    const y = yAt(s);
    detail(ops, `${tag}-post-${k}`, cx, cz, 0.4, 0.4, y - 0.4, 1.7, MAT.wood);              // 立柱
    const s2 = Math.min(len - 0.6, s + spacing);
    if (s2 - s > 1.2) {
      const mx = p0[0] + ux * (s + s2) / 2 + px * across, mz = p0[1] + uz * (s + s2) / 2 + pz * across;
      detail(ops, `${tag}-rail-${k}`, mx, mz, s2 - s + 0.5, 0.22, yAt((s + s2) / 2) + 1.02, 0.22, MAT.wood);  // 扶手
    }
  }
}

/* ------------------------------------------------------------------ */
/* 7. 风化 / 沙埋 / 残块                                                */
/* ------------------------------------------------------------------ */

function weatherShell(ops: PharaohOps) {
  // 南面中段坍缺：凿掉几级台坎面层，露层理岩内芯（x 方向 3–4 段，避免规则缺口）。
  const scars: [number, number, number, number][] = [
    [356, 372, 4, 5],
    [362, 368, 5, 6],
    [352, 378, 3, 4],
    [300, 310, 5, 7],
    [372, 382, 6, 7],
  ];
  for (const [x0, x1, tier, depth] of scars) {
    const faceZ = Math.round(LOCAL_CENTER[1] - TIER_HALF[tier]) + 1;
    const yTop = 6 + tier * 2;
    cut(ops, x0, faceZ - depth, x1, faceZ + 1, yTop - 2, yTop);
    for (let x = x0; x < x1; x++) for (let z = faceZ - depth; z < faceZ; z++) {
      if (localPyramidSurface(x, z) > yTop - 1) ops.put(x, yTop - 2, z, MAT.strata);
    }
  }
  // 东北角冲沟
  cut(ops, 352, 690, 360, 712, 10, 12);
  cut(ops, 356, 696, 364, 706, 12, 14);
  // 台坎外沿散落残块（≤1 m，不形成连续可攀爬台阶）
  const rubble: [number, number][] = [
    [268, 630], [272, 634], [392, 748], [388, 744], [330, 618],
    [286, 620], [374, 750], [300, 752], [362, 748], [274, 700],
  ];
  for (let i = 0; i < rubble.length; i++) {
    const [x, z] = rubble[i];
    const y = localPyramidSurface(x, z);   // 贴各自台面，不悬空
    detail(ops, `pyr-rubble-${i}`, x, z, 1.5, 1.0, y, 0.5, i % 3 === 0 ? MAT.relief : MAT.strata);
  }
  // 沙埋：基座脚下一层 0.5 m 薄沙（detail 只占 0.5 m，不做 1 m 体素台，避免叠出 1.5 m 台阶）
  const drift: [number, number, number, number][] = [
    [322, 604, 340, 613], [344, 620, 362, 624], [286, 616, 306, 622], [394, 688, 404, 700],
  ];
  for (let i = 0; i < drift.length; i++) {
    const [x0, z0, x1, z1] = drift[i];
    detail(ops, `pyr-drift-${i}`, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, PYRAMID_PLATFORM, 0.5, MAT.sand);
  }
}

/* ------------------------------------------------------------------ */
/* 8. 室内陈设                                                          */
/* ------------------------------------------------------------------ */

function buildChamberFurniture(ops: PharaohOps) {
  // 中央低石台 + 残破石棺（花岗岩）：12×14 台面 1 m，可跨上去，不堵 r12 占点环。
  fill(ops, 324, 683, 336, 697, 5, 6, MAT.sandstone);
  detail(ops, 'pyr-sarc-plinth', 330, 690, 12, 14, 6, 0.5, MAT.relief);
  fill(ops, 327, 686, 333, 694, 6, 8, MAT.granite);
  cut(ops, 330, 686, 333, 690, 7, 8);
  detail(ops, 'pyr-sarc-lid-a', 328.5, 692.0, 3.0, 4.0, 8, 0.5, MAT.granite);
  detail(ops, 'pyr-sarc-lid-b', 331.5, 692.5, 3.0, 3.0, 7.5, 0.5, MAT.granite);
  detail(ops, 'pyr-sarc-lid-fallen', 337.5, 690.5, 2.0, 2.0, 5, 0.5, MAT.granite);
  // 4 根不等距残柱（2×2 截面，断口高度各异）
  const columns: [number, number, number][] = [
    [318, 680, 5], [341, 690, 7], [317, 698, 4], [340, 700, 6],
  ];
  for (let i = 0; i < columns.length; i++) {
    const [x, z, h] = columns[i];
    fill(ops, x, z, x + 2, z + 2, 5, 5 + h, MAT.granite);
    detail(ops, `pyr-col-cap-${i}`, x + 1, z + 1, 2, 2, 5 + h, 0.5, MAT.relief);
    detail(ops, `pyr-col-base-${i}`, x + 1, z + 1, 2.5, 2.5, 5, 0.5, MAT.strata);
  }
  // 两段断墙（避开前廊 → 墓室 → 北门的三条主通道）
  fill(ops, 320, 695, 329, 698, 5, 8, MAT.sandstone);
  detail(ops, 'pyr-breakwall-a', 324.5, 696.5, 9, 3, 8, 0.5, MAT.relief);
  fill(ops, 336, 698, 344, 701, 5, 7, MAT.strata);
  detail(ops, 'pyr-breakwall-b', 340, 699.5, 8, 3, 7, 0.5, MAT.strata);
  // 墙面浮雕残片 + 灯位上方烟熏顶板
  detail(ops, 'pyr-relief-n', 330, 702.5, 12, 1, 9, 3, MAT.relief);
  detail(ops, 'pyr-relief-s', 330, 677.5, 10, 1, 9, 2.5, MAT.relief);
  detail(ops, 'pyr-soot-n', 330, 700, 14, 6, 13.5, 0.5, MAT.soot);
  detail(ops, 'pyr-soot-s', 328, 684, 10, 6, 13.5, 0.5, MAT.soot);
  // 北雕像廊：4 尊残像贴北墙，中间留 ≥4 m 通道
  for (let i = 0; i < 4; i++) {
    const x = 316 + i * 8;
    fill(ops, x, 720, x + 2, 723, 5, 6, MAT.granite);
    fill(ops, x, 721, x + 2, 723, 6, 10 + (i % 2), MAT.sandstone);
    detail(ops, `pyr-statue-head-${i}`, x + 1, 721.5, 2, 2, 10 + (i % 2), 1, MAT.relief);
  }
  // 西储藏室：陶罐阵列 + 两块矮货架
  const jars: [number, number, number][] = [
    [289, 679, 1.0], [292, 679, 0.8], [295, 679, 1.2], [298, 679, 0.9],
    [289, 697, 0.9], [293, 698, 1.1], [297, 697, 0.8], [301, 698, 1.0],
    [307, 680, 0.8], [309, 692, 1.2], [287, 679, 0.7], [305, 678, 0.9],
  ];
  for (let i = 0; i < jars.length; i++) {
    const [x, z, h] = jars[i];
    detail(ops, `pyr-jar-${i}`, x, z, 0.9, 0.9, 5, h, MAT.pottery);
  }
  fill(ops, 296, 692, 306, 694, 5, 6, MAT.sandstone);   // 矮货架移到房间中南部，不挡西门→北门
  fill(ops, 287, 676, 289, 683, 5, 7, MAT.sandstone);   // 靠西墙南段，避开 z685..689 的西门通道
  // 东塌陷间：崩塌岩堆 + 盗洞竖井（通到 +16 台坎面，可掉下去）
  fill(ops, 357, 689, 360, 692, 5, 8, MAT.strata);
  fill(ops, 358, 690, 360, 692, 8, 9, MAT.strata);
  detail(ops, 'pyr-collapse-a', 359, 691, 4, 4, 10, 0.5, MAT.relief);
  cut(ops, 370, 690, 373, 693, 11, 24);
  fill(ops, 370, 690, 373, 693, 5, 6, MAT.sand);
  detail(ops, 'pyr-looter-rim', 371.5, 691.5, 3, 3, 24, 0.5, MAT.strata);
  // 东廊道 4×4 碎石堆曾形成 1.5 m 坎并把 primary=4 与地面 +5 错开；
  // 移到塌陷间北墙脚，只保留 0.5 m 装饰块。
  detail(ops, 'pyr-rubble-a', 371.5, 697.5, 2.4, 1.2, 5, 0.5, MAT.relief);
  // 两条内部环线门的砂岩门框（门洞本身由 LOCAL_ROOMS 的 carve 打开）
  for (const [id, cx, cz, w, d] of [
    ['pyr-store-n-eye-w', 297.2, 703, 1.2, 8],
    ['pyr-store-n-eye-e', 308.8, 703, 1.2, 8],
    ['pyr-collapse-eye-w', 342.2, 703, 1.2, 8],
    ['pyr-collapse-eye-e', 355.8, 703, 1.2, 8],
  ] as const) {
    detail(ops, id, cx, cz, w, d, 5, 4.2, MAT.sandstone);
  }
  detail(ops, 'pyr-store-n-lintel', 303, 703, 12.8, 8, 9, 0.8, MAT.sandstone);
  detail(ops, 'pyr-collapse-n-lintel', 349, 703, 14.8, 8, 9, 0.8, MAT.sandstone);
  // 南前厅倾倒石板
  detail(ops, 'pyr-slab-a', 322, 652, 3, 2, 5, 0.5, MAT.relief);
  detail(ops, 'pyr-slab-b', 338, 660, 2, 3, 5, 0.5, MAT.strata);
}

/* ------------------------------------------------------------------ */
/* 9. 静态灯（低对比暖光，不做动态灯）                                  */
/* ------------------------------------------------------------------ */

const LAMPS: readonly [number, number, number][] = [
  [316, 8, 680], [344, 8, 680], [316, 8, 700], [344, 8, 700],   // 墓室
  [320, 8, 650], [340, 8, 650],                                  // 南前厅
  [330, 7, 636],                                                 // 南走廊
  [292, 8, 682], [306, 8, 694],                                  // 西储藏室
  [356, 8, 686], [373, 8, 694],                                  // 东塌陷间
  [318, 8, 709], [342, 8, 709], [330, 8, 721],                   // 北雕像廊
  [299, 23, 659],                                                // 大楼梯顶
  [298, 24, 690],                                                // 上层梯口
  [340, 23, 720],                                                // 上层北廊
  [343, 22, 738],                                                // 北门楼通道
];

/* ------------------------------------------------------------------ */
/* 主入口                                                              */
/* ------------------------------------------------------------------ */


export const PYRAMID_OUTER_BASE = {x0: 58, x1: 322, z0: 478, z1: 742, half: 132} as const;
export const PYRAMID_OUTER_TOP = 58;

/**
 * 大金字塔外层（用户要求“边长起码加倍”）。保留原 132×132 内核/墓室/墓道，
 * 在外面再套一层 264×264、顶 +58 的逐层收分壳体；外观是完整大金字塔，
 * 三条外廊道连到原南/西/东门，西/北两面各一条 108 级外部大阶梯。
 * 仍是同一份体素数据，shell 只加真实碰撞。
 */
function buildOuterCasing(ops: PharaohOps) {
  const cx = LOCAL_CENTER[0], cz = LOCAL_CENTER[1];
  const base = PYRAMID_PLATFORM, top = PYRAMID_OUTER_TOP, half0 = 132, topHalf = 6;
  // 2 m 级高、约 2.35 m 内收：每级都是 >1.05 m 的直坎，玩家只能走外面的阶梯。
  for (let y = base; y < top; y += 1) {
    const half = Math.round(half0 - (y - base) * (half0 - topHalf) / (top - base));
    // 1 m 一级：玩家可直接沿坡面跑上去，不再需要每 2 m 跳一次。
    // 整层填实；旧内核/墓室在后续 carveRooms 里重新挖开。
    ops.box(cx - half, cz - half, cx + half, cz + half, y, Math.min(y + 1, top), MAT.casing);
  }
  // 顶平台，略高于原内塔顶。
  ops.box(cx - 6, cz - 6, cx + 6, cz + 6, top, top + 1, MAT.casing);
  ops.box(cx - 5, cz - 5, cx + 5, cz + 5, top - 1, top, MAT.casing);

  // 三条外围入口廊道：从 264 m 外表面通到原 132 m 门洞；实体顶板，绝不露天。
  const tunnels: readonly [number, number, number, number, number][] = [
    [327, 558, 333, 624, 5],   // 南主廊
    [198, 685, 264, 689, 5],   // 西廊
    [396, 677, 462, 683, 5],   // 东廊（接 A–B 墓道）
  ];
  for (const [x0, z0, x1, z1] of tunnels) {
    ops.carve(x0, z0, x1, z1, 4, 9);
    ops.box(x0, z0, x1, z1, 9, 10, MAT.casing);
  }
  // 西面外部大阶梯：4 m 宽，108 级 ×0.5 m，贴在新壳体表面外侧。
  for (let i = 0; i < 108; i++) {
    // 从壳体外侧起步，整条阶梯始终露在收分面之外；每级 0.5 m。
    const x = 185 + i * 1.3;
    const y = 4.5 + i * 0.5;
    ops.detail(`pyr-outer-w-stair-${i}`, x, 694, 1.3, 4, y - 1.5, 1.5, MAT.sandstone, 0);
    if (i % 13 < 10) ops.detail(`pyr-outer-w-kerb-${i}`, x, 691.7, 1.3, 0.5, y - 1.5, 2.0, MAT.casing, 0);
  }
  // 北面外部大阶梯：从北面 z822 上行到顶，作为第二条登顶路线。
  for (let i = 0; i < 108; i++) {
    const z = 835 - i * 1.3;
    const y = 4.5 + i * 0.5;
    ops.detail(`pyr-outer-n-stair-${i}`, 330, z, 4, 1.3, y - 1.5, 1.5, MAT.sandstone, 0);
    if (i % 13 < 10) ops.detail(`pyr-outer-n-kerb-${i}`, 332.3, z, 0.5, 1.3, y - 1.5, 2.0, MAT.casing, 0);
  }
  // 三条外围门框（砂岩，远景可读）。门框只在门洞两侧，不能横在坡面上：
  // 南/北门是 X 向门洞，门柱沿 Z 厚 1.2；东/西门是 Z 向门洞，门柱沿 X 厚 1.2。
  ops.detail('pyr-outer-s-door-l', 325.2, 558, 1.2, 3, 4, 5, MAT.sandstone, 0);
  ops.detail('pyr-outer-s-door-r', 334.8, 558, 1.2, 3, 4, 5, MAT.sandstone, 0);
  ops.detail('pyr-outer-w-door-l', 198, 682.2, 3, 1.2, 4, 5, MAT.sandstone, 0);
  ops.detail('pyr-outer-w-door-r', 198, 691.8, 3, 1.2, 4, 5, MAT.sandstone, 0);
  ops.detail('pyr-outer-e-door-l', 462, 675.2, 3, 1.2, 4, 5, MAT.sandstone, 0);
  ops.detail('pyr-outer-e-door-r', 462, 684.8, 3, 1.2, 4, 5, MAT.sandstone, 0);
}
function buildPyramidLocal(ops: PharaohOps) {
  buildOuterCasing(ops);           // 0) 264×264 外层大金字塔
  buildShell(ops);                 // 1) 台坎外壳 + 填实
  buildSummit(ops);                // 2) 顶平台 + 残缺女儿墙（须在楼梯/阶梯之前，否则会盖住顶面出口）
  carveRooms(ops);                 // 3) 墓室 / 前厅 / 储藏 / 塌陷 / 雕像廊 / +20 廊道
  // 3b) 入口外侧接近段：清掉可能压到门的沙丘/岩体（carve 到 y4..8，不动门槛）
  cut(ops, 320, 602, 340, 615, 4, 9);       // 南门前 z602..615
  cut(ops, 246, 682, 257, 692, 4, 9);       // 西门外侧 x246..257
  buildSouthPylon(ops);            // 4) 三座门楼（南主门 6×4、西 4×3.5、东 6×3.5 接墓道）
  buildWestPylon(ops);
  buildEastPylon(ops);
  buildStair(ops, {                // 5) 南前厅 → +20
    axis: 'x', from: 312, to: 296, cross0: 656, cross1: 660,
    yFirstTop: 6, steps: 15, riser: 1, fillFrom: 5, mat: MAT.sandstone,
  });
  buildStair(ops, {                //    +20 → 顶 +52（末 5 级穿顶）
    axis: 'x', from: 300, to: 332, cross0: 688, cross1: 692,
    yFirstTop: 21, steps: 32, riser: 1, fillFrom: 19, mat: MAT.sandstone, breakThroughTop: 48,
  });
  buildSwStair(ops);               // 6) 西南考古阶梯（贴南面、浅色石阶带 + 护缘 + 3 休息平台）
  buildInclinedBand(ops, [360, 767.5], [314, 767.5], 3, 4, 12, 0.5, MAT.wood, 'pyr-north-ramp-a', [], 2.4, MAT.sandstone); // 7) 北侧施工栈道（石砌道身 + 木铺板）
  buildInclinedBand(ops, [310, 757.5], [340, 757.5], 3, 12, 20, 0.5, MAT.wood, 'pyr-north-ramp-b', [], 2.4, MAT.sandstone);
  rampHardware(ops, [360, 767.5], [314, 767.5], 3, 4, 12, -1, 'pyr-ramp-a');
  rampHardware(ops, [310, 757.5], [340, 757.5], 3, 12, 20, +1, 'pyr-ramp-b');
  plateau(ops, 306, 756, 314, 770, 12, MAT.sandstone);   // 折返平台
  plateau(ops, 340, 744, 352, 762, 20, MAT.sandstone);   // 门楼前场（+20），坡道顶外侧，不与坡道重叠
  plateau(ops, 336, 727, 350, 746, 27, MAT.casing);      // 北门楼体量
  cut(ops, 341, 722, 345, 747, 20, 24);                  //   门洞（4×4）
  detail(ops, 'pyr-north-gate-lintel', 343, 746.5, 6, 1, 24, 0.5, MAT.casing);
  detail(ops, 'pyr-north-gate-cornice', 343, 736.5, 16, 21, 27, 1.5, MAT.casing);
  detail(ops, 'pyr-north-gate-jamb', 341, 746.5, 1, 1, 20, 4, MAT.relief);
  buildChamberFurniture(ops);       // 8a) 陈设
  weatherShell(ops);                // 8b) 风化 / 沙埋
  for (const [x, y, z] of LAMPS) ops.addLamp(x, y, z);   // 9) 18 盏静态灯
  // 低层房间地面真实高度为 +5；primary 同步，避免导航从 +4 起扫（碎石/台阶分层错位）。
  // 门洞/通道房间**不同步**：那里必须留 +4 + 1 m 门槛，否则载具能顺着 primary 开进墓室。
  const isPassage = (id: string) => /door|passage|entry|corridor/.test(id);
  for (const room of LOCAL_ROOMS) {
    if (room.floor >= 10 || isPassage(room.id)) continue;
    for (let z = room.z0; z < room.z1; z++) for (let x = room.x0; x < room.x1; x++) ops.setPrimary(x, z, room.floor);
  }
}


/* ------------------------------------------------------------------ */
/* 800 图世界放置：内部仍用旧 132 m 设计坐标，通过 ops 包装整体平移     */
/* ------------------------------------------------------------------ */

/** 旧设计中心 (330,690) → 新 A 锚点 (190,610)。只平移，不缩放、不重排内部空间。 */
export const PYRAMID_WORLD_OFFSET: readonly [number, number] = [
  PHARAOH_LAYOUT.A.x - LOCAL_CENTER[0],
  PHARAOH_LAYOUT.A.z - LOCAL_CENTER[1],
];
const SHIFT_X = PYRAMID_WORLD_OFFSET[0];
const SHIFT_Z = PYRAMID_WORLD_OFFSET[1];

function shiftedOps(ops: PharaohOps): PharaohOps {
  return {
    ground: (x, z) => ops.ground(x + SHIFT_X, z + SHIFT_Z),
    put: (x, y, z, id) => ops.put(x + SHIFT_X, y, z + SHIFT_Z, id),
    column: (x, z, y0, y1, id) => ops.column(x + SHIFT_X, z + SHIFT_Z, y0, y1, id),
    box: (x0, z0, x1, z1, y0, y1, id) => ops.box(x0 + SHIFT_X, z0 + SHIFT_Z, x1 + SHIFT_X, z1 + SHIFT_Z, y0, y1, id),
    carve: (x0, z0, x1, z1, y0, y1) => ops.carve(x0 + SHIFT_X, z0 + SHIFT_Z, x1 + SHIFT_X, z1 + SHIFT_Z, y0, y1),
    detail: (id, cx, cz, w, d, y, h, material, angle, solid) =>
      ops.detail(id, cx + SHIFT_X, cz + SHIFT_Z, w, d, y, h, material, angle, solid),
    setPrimary: (x, z, y) => ops.setPrimary(x + SHIFT_X, z + SHIFT_Z, y),
    addLamp: (x, y, z) => ops.addLamp(x + SHIFT_X, y, z + SHIFT_Z),
  };
}

export function buildPyramid(ops: PharaohOps) {
  buildPyramidLocal(shiftedOps(ops));
}

/* 对外导出统一为 800 图世界坐标（测试/平面图/墓道/导航共用）。 */
export const PYRAMID_CENTER: readonly [number, number] = [
  LOCAL_CENTER[0] + SHIFT_X,
  LOCAL_CENTER[1] + SHIFT_Z,
];
export const PYRAMID_BASE = {
  x0: LOCAL_BASE.x0 + SHIFT_X,
  x1: LOCAL_BASE.x1 + SHIFT_X,
  z0: LOCAL_BASE.z0 + SHIFT_Z,
  z1: LOCAL_BASE.z1 + SHIFT_Z,
} as const;
export const PYRAMID_TOP = {
  x0: LOCAL_TOP.x0 + SHIFT_X,
  x1: LOCAL_TOP.x1 + SHIFT_X,
  z0: LOCAL_TOP.z0 + SHIFT_Z,
  z1: LOCAL_TOP.z1 + SHIFT_Z,
} as const;
export const PYRAMID_SUMMIT_HATCH = {
  x0: LOCAL_HATCH.x0 + SHIFT_X,
  x1: LOCAL_HATCH.x1 + SHIFT_X,
  z0: LOCAL_HATCH.z0 + SHIFT_Z,
  z1: LOCAL_HATCH.z1 + SHIFT_Z,
} as const;

const shiftRoom = (r: PyramidRoom): PyramidRoom => ({
  ...r,
  x0: r.x0 + SHIFT_X,
  x1: r.x1 + SHIFT_X,
  z0: r.z0 + SHIFT_Z,
  z1: r.z1 + SHIFT_Z,
});
export const PYRAMID_ROOMS: readonly PyramidRoom[] = LOCAL_ROOMS.map(shiftRoom);
export const PYRAMID_STAIRS: readonly PyramidStairSpec[] = LOCAL_STAIRS.map((s) => ({
  ...s,
  from: [s.from[0] + SHIFT_X, s.from[1] + SHIFT_Z] as const,
  to: [s.to[0] + SHIFT_X, s.to[1] + SHIFT_Z] as const,
}));

export function pyramidSurface(x: number, z: number): number {
  return localPyramidSurface(x - SHIFT_X, z - SHIFT_Z);
}

export function insidePyramidBase(x: number, z: number): boolean {
  return localInsidePyramidBase(x - SHIFT_X, z - SHIFT_Z);
}
