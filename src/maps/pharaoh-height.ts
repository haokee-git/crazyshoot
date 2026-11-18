/**
 * CRAZYSHOOT · 法老坟墓（pharaoh）800×800 地形高度场 · 0.20.3 布局重构
 *
 * 坐标：x 向东、z 向北，可玩范围 0..800（体素数组的 32 m margin 仍由
 * voxel-map-data 统一处理，与本文件无关）。
 *
 * 设计口径：
 *   - 自然沙原基面 1–4 m；风成低沙丘相对高差 3–6 m，绝对高度 3–8 m，局部 ≤10 m。
 *     **没有**旧版的 12–22 m 大沙丘、规则 sin 波纹、棋盘或等距圆锥。
 *   - 九块场景台地（蓝/橙/A/B/C/D/E/F/G）按 layout.ts 的锚点整平：
 *       blue 2.4 / orange 8.0 / A 4.0 / B 4.0 / C 6.5 / D 0.6 / E 3.2 / F 4.0 / G 3.0
 *     台地之间是低沙丘、沙谷、岩脊与道路走廊，不再有“七个孤立道具 + 大片空白”。
 *   - 绿洲湖岸线唯一真相在 `pharaoh/oasis-shape.ts`（oasis.ts re-export）：
 *     湖心 (115,230)，水面 -2，湖底 -6；D 点东北干岸距水线约 17.7 m。
 *   - 道路全部来自 `pharaoh/network.ts` 的 PHARAOH_NETWORK；地形整平、铺装、
 *     平面图、导航与测试共用同一组点位/宽度/高程，纵坡逐段 ≤5%。
 *
 * 本模块是纯函数 + 启动时预计算（无 three / 无 world 依赖），Worker 与测试直接 import。
 */

import { PHARAOH_LAYOUT, PHARAOH_SITE_IDS, type PharaohSiteId } from './pharaoh/layout';
import {
  OASIS_LAKE_POLYGON,
  OASIS_LAKE_CENTER,
  OASIS_WATER_SURFACE,
  OASIS_LAKE_BED,
  lakeShoreDistance,
} from './pharaoh/oasis-shape';
import { PHARAOH_NETWORK, type PharaohRoadSpec } from './pharaoh/network';

export type { PharaohRoadSpec };
export type PharaohRoadKind = PharaohRoadSpec['kind'];

/* ------------------------------------------------------------------ *
 * 基础数学
 * ------------------------------------------------------------------ */

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ *
 * 确定性噪声
 * ------------------------------------------------------------------ */

function hash2(ix: number, iz: number, seed: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function noise2(x: number, z: number, seed: number): number {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash2(x0, z0, seed);
  const b = hash2(x0 + 1, z0, seed);
  const c = hash2(x0, z0 + 1, seed);
  const d = hash2(x0 + 1, z0 + 1, seed);
  const ab = a + (b - a) * u;
  const cd = c + (d - c) * u;
  return ab + (cd - ab) * v;
}

/* ------------------------------------------------------------------ *
 * 多边形工具
 * ------------------------------------------------------------------ */

type Poly = readonly [number, number][];
interface PolyBounds {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

function polyBounds(poly: Poly): PolyBounds {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const [x, z] of poly) {
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (z < z0) z0 = z;
    if (z > z1) z1 = z;
  }
  return { x0, z0, x1, z1 };
}

function insidePoly(poly: Poly, x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function edgeDistance(poly: Poly, x: number, z: number): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const ax = poly[j][0];
    const az = poly[j][1];
    const bx = poly[i][0];
    const bz = poly[i][1];
    const dx = bx - ax;
    const dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ddx = x - ax - t * dx;
    const ddz = z - az - t * dz;
    const d = ddx * ddx + ddz * ddz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/* ------------------------------------------------------------------ *
 * 场景距离 / 沙丘宁静度
 * ------------------------------------------------------------------ */

function distanceToSites(x: number, z: number): number {
  let best = Infinity;
  for (const id of PHARAOH_SITE_IDS) {
    const s = PHARAOH_LAYOUT[id];
    const dx = Math.max(s.x0 - x, 0, x - s.x1);
    const dz = Math.max(s.z0 - z, 0, z - s.z1);
    const d = Math.hypot(dx, dz);
    if (d < best) best = d;
  }
  return best;
}

/** 风成沙丘振幅：场景包络内压到 0，离开 90 m 后才完全恢复。 */
function duneCalm(x: number, z: number): number {
  return 0.12 + 0.88 * smooth(28, 95, distanceToSites(x, z));
}

/* ------------------------------------------------------------------ *
 * 自然沙原 + 低沙丘群
 * ------------------------------------------------------------------ */

const WIND = 0.42;

interface HandDune {
  x: number;
  z: number;
  len: number;
  wid: number;
  peak: number;
  angle: number;
  cos: number;
  sin: number;
  r2: number;
}

/**
 * 手工低沙丘：全部落在场景之间的走廊里，peak 4.5–8.5 m（相对周围 3–6 m），
 * 错列、蜿蜒、断续；不放在任何场景包络的核心内。旧图的 12–22 m 大沙丘全部删除。
 */
const HAND_DUNES: HandDune[] = (
  [
    { x: 305, z: 305, len: 82, wid: 30, peak: 5.0, angle: 18 },
    { x: 520, z: 205, len: 92, wid: 34, peak: 4.8, angle: -8 },
    { x: 690, z: 400, len: 92, wid: 38, peak: 6.4, angle: -25 },
    { x: 610, z: 585, len: 72, wid: 30, peak: 5.5, angle: 12 },
    { x: 340, z: 555, len: 66, wid: 27, peak: 5.0, angle: 30 },
    { x: 35, z: 500, len: 74, wid: 30, peak: 6.2, angle: 8 },
    { x: 400, z: 770, len: 118, wid: 44, peak: 5.4, angle: 5 },
    { x: 580, z: 760, len: 98, wid: 39, peak: 6.0, angle: -18 },
    { x: 765, z: 560, len: 108, wid: 42, peak: 6.8, angle: 16 },
    { x: 760, z: 240, len: 98, wid: 37, peak: 5.8, angle: -10 },
    { x: 770, z: 90, len: 84, wid: 31, peak: 4.8, angle: 22 },
    { x: 350, z: 745, len: 82, wid: 30, peak: 4.6, angle: -20 },
    { x: 790, z: 700, len: 86, wid: 33, peak: 6.2, angle: 4 },
    { x: 790, z: 400, len: 76, wid: 30, peak: 5.6, angle: -14 },
    // 东部车辆走廊两侧的低沙脊：把主路藏在沙谷里，切断中央高地到走廊的长枪线。
    { x: 700, z: 280, len: 70, wid: 26, peak: 7.4, angle: 10 },
    { x: 705, z: 360, len: 80, wid: 28, peak: 7.8, angle: -10 },
    { x: 705, z: 450, len: 85, wid: 30, peak: 8.0, angle: 6 },
    { x: 705, z: 540, len: 80, wid: 28, peak: 7.8, angle: -8 },
    { x: 785, z: 390, len: 90, wid: 30, peak: 8.6, angle: -12 },
    { x: 785, z: 520, len: 85, wid: 28, peak: 8.4, angle: 10 },
    { x: 70, z: 30, len: 70, wid: 27, peak: 4.2, angle: 12 },
  ] as const
).map((d) => {
  const a = (d.angle * Math.PI) / 180;
  const r = Math.max(d.len, d.wid) * 1.7;
  return {...d, cos: Math.cos(a), sin: Math.sin(a), r2: r * r};
});

/** 覆盖统计/平面图用：手工低沙丘的脊线椭圆（不是规则圆锥）。 */
export const PHARAOH_DUNE_ZONES = HAND_DUNES.map((d) => ({
  x: d.x, z: d.z, len: d.len, wid: d.wid, angle: d.angle, peak: d.peak,
}));

function naturalHeight(x: number, z: number): number {
  // 低沙原基面：低频起伏 + 微起伏，普通沙地约 1–4 m。
  const swell = (noise2(x / 250, z / 225, 51) - 0.5) * 3.0;
  const micro = (noise2(x / 62, z / 56, 52) - 0.5) * 0.9;
  let h = 2.35 + swell + micro;

  // 绿洲外围的宽浅盆地：离湖越近越接近 1 m，随后交还沙原。
  const ecoD = Math.hypot(x - OASIS_LAKE_CENTER[0], z - OASIS_LAKE_CENTER[1]);
  const basin = (1 - smooth(75, 190, ecoD)) * 0.55;
  if (basin > 0.001) h += (1.0 - h) * basin;

  // 风成长条沙丘带：高频 domain warp，避免直条纹；振幅 3.4 m。
  const field = noise2(x / 360, z / 320, 21);
  const fieldMask = smooth(0.42, 0.72, field);
  if (fieldMask > 0.02) {
    const wx = x + (noise2(x / 200, z / 200, 11) - 0.5) * 38 + (noise2(x / 84, z / 84, 12) - 0.5) * 14;
    const wz = z + (noise2(x / 200, z / 200, 13) - 0.5) * 38 + (noise2(x / 84, z / 84, 14) - 0.5) * 14;
    const c = Math.cos(WIND);
    const s = Math.sin(WIND);
    const u = wx * c + wz * s;
    const v = -wx * s + wz * c;
    const rn = noise2(u / 235, v / 58, 31);
    const ridge = Math.pow(1 - Math.abs(rn * 2 - 1), 2.1);
    h += 3.4 * ridge * fieldMask * duneCalm(x, z);
    h += 0.8 * (noise2(u / 110, v / 40, 41) - 0.5) * fieldMask;
  }

  // 手工低沙丘：绝对峰值 4.5–8.5 m，坡长 60–120 m。
  for (let i = 0; i < HAND_DUNES.length; i++) {
    const d = HAND_DUNES[i];
    const dx = x - d.x;
    const dz = z - d.z;
    if (dx * dx + dz * dz > d.r2) continue;
    const u = dx * d.cos + dz * d.sin;
    const v = -dx * d.sin + dz * d.cos;
    const t = (u * u) / (d.len * d.len) + (v * v) / (d.wid * d.wid);
    if (t > 1.55) continue;
    const g = Math.exp(-1.8 * t) * (0.55 + 0.45 * duneCalm(x, z));
    if (g <= 0.002) continue;
    h += (d.peak - h) * g;
  }
  return clamp(h, 0.3, 9.6);
}

/* ------------------------------------------------------------------ *
 * 绿洲湖盆
 * ------------------------------------------------------------------ */

export const PHARAOH_WATER_SURFACE = OASIS_WATER_SURFACE;
export { OASIS_LAKE_BED };

export const PHARAOH_LAKE_POLYGON: [number, number][] = OASIS_LAKE_POLYGON as [number, number][];
export const PHARAOH_WATER_POLYGONS: [number, number][][] = [PHARAOH_LAKE_POLYGON];

const LAKE_BOUNDS = polyBounds(PHARAOH_LAKE_POLYGON);

/** 湖盆剖面：岸线比水面低 5 cm，向心 26 m 内下切到 -6。 */
function lakeBedShape(sd: number): number {
  return sd >= 0 ? -2.05 - 3.95 * smooth(0, 26, sd) : -2.05;
}

/**
 * 岸外滩坡：D 点所在的东北岸是石质岸台（水线距 D 约 17.7 m），
 * 用 9–18 m 缓滩 + 1.15 m 滩脊；远处交还自然沙原/生态盆地。
 */
function beachProfile(d: number): number {
  // 岸外不允许出现低于水面的“干沟”：0 m 处略高于水面，10.6 m 内升到 +0.6，
  // 再缓慢并入自然沙原。坡度约 1:4–1:6，步兵/摩托都能下水上岸。
  return -2.05 + 0.07 * smooth(0, 0.6, d) + 2.51 * smooth(0, 10.6, d) + 0.35 * smooth(10.6, 24, d);
}

/* ------------------------------------------------------------------ *
 * 场景台地
 * ------------------------------------------------------------------ */

interface TerraceDef {
  id: string;
  target: number;
  blend: number;
  wobble: number;
  seed: number;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  corner: number;
  bulge: number;
}

function sdRoundRect(px: number, pz: number, hx: number, hz: number, r: number): number {
  const dx = Math.abs(px) - hx + r;
  const dz = Math.abs(pz) - hz + r;
  const ox = Math.max(dx, 0);
  const oz = Math.max(dz, 0);
  return Math.sqrt(ox * ox + oz * oz) + Math.min(Math.max(dx, dz), 0) - r;
}

/**
 * 顺序有意义：A 金字塔最后应用，压住与 G 采石场北缘的重叠带，
 * 让采石场北端自然收成通往金字塔前庭的 1 m 缓坡。
 */
const TERRACES: TerraceDef[] = [
  {id: 'blue-base', target: PHARAOH_LAYOUT.blue.ground, blend: 24, wobble: 6, seed: 101, cx: PHARAOH_LAYOUT.blue.x, cz: PHARAOH_LAYOUT.blue.z, rx: 58, rz: 58, corner: 12, bulge: 5},
  {id: 'orange-base', target: PHARAOH_LAYOUT.orange.ground, blend: 26, wobble: 6, seed: 102, cx: PHARAOH_LAYOUT.orange.x, cz: PHARAOH_LAYOUT.orange.z, rx: 58, rz: 58, corner: 12, bulge: 5},
  {id: 'oasis-point', target: PHARAOH_LAYOUT.D.ground, blend: 18, wobble: 4, seed: 106, cx: PHARAOH_LAYOUT.D.x, cz: PHARAOH_LAYOUT.D.z, rx: 26, rz: 24, corner: 10, bulge: 3},
  {id: 'service-shelf', target: PHARAOH_LAYOUT.E.ground, blend: 18, wobble: 4, seed: 107, cx: PHARAOH_LAYOUT.E.x, cz: PHARAOH_LAYOUT.E.z, rx: 82, rz: 58, corner: 12, bulge: 4},
  {id: 'temple-shelf', target: PHARAOH_LAYOUT.F.ground, blend: 20, wobble: 4, seed: 108, cx: PHARAOH_LAYOUT.F.x, cz: PHARAOH_LAYOUT.F.z, rx: 90, rz: 80, corner: 14, bulge: 5},
  {id: 'bazaar-shelf', target: PHARAOH_LAYOUT.C.ground, blend: 22, wobble: 5, seed: 105, cx: PHARAOH_LAYOUT.C.x, cz: PHARAOH_LAYOUT.C.z, rx: 150, rz: 150, corner: 16, bulge: 6},
  {id: 'sphinx-shelf', target: PHARAOH_LAYOUT.B.ground, blend: 20, wobble: 4, seed: 104, cx: PHARAOH_LAYOUT.B.x, cz: PHARAOH_LAYOUT.B.z, rx: 112, rz: 82, corner: 14, bulge: 4},
  {id: 'quarry-shelf', target: PHARAOH_LAYOUT.G.ground, blend: 18, wobble: 5, seed: 109, cx: PHARAOH_LAYOUT.G.x, cz: PHARAOH_LAYOUT.G.z, rx: 90, rz: 70, corner: 12, bulge: 5},
  {id: 'pyramid-shelf', target: PHARAOH_LAYOUT.A.ground, blend: 22, wobble: 5, seed: 103, cx: PHARAOH_LAYOUT.A.x, cz: PHARAOH_LAYOUT.A.z, rx: 132, rz: 142, corner: 18, bulge: 6},
];

interface LevelArea extends TerraceDef {
  poly: [number, number][];
  bounds: PolyBounds;
}

function terraceRange(def: TerraceDef, cos: number, sin: number): number {
  const hx = def.rx + def.corner;
  const hz = def.rz + def.corner;
  let lo = 0;
  let hi = Math.hypot(hx, hz) + 1;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2;
    if (sdRoundRect(cos * mid, sin * mid, hx, hz, def.corner) < 0) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function terracePoly(def: TerraceDef): [number, number][] {
  const count = 34;
  const out: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const base = terraceRange(def, cos, sin);
    const n1 = noise2(cos * 2.2 + 10, sin * 2.2 + 20, def.seed) - 0.5;
    const n2 = noise2(cos * 5.4 + 30, sin * 5.4 + 40, def.seed + 7) - 0.5;
    const out_ = def.bulge * (0.55 + n1) + def.bulge * 0.45 * (0.5 + n2);
    const r = base + Math.max(0, out_);
    out.push([Math.round((def.cx + cos * r) * 100) / 100, Math.round((def.cz + sin * r) * 100) / 100]);
  }
  return out;
}

const LEVEL_AREAS: LevelArea[] = TERRACES.map((def) => {
  const poly = terracePoly(def);
  return {...def, poly, bounds: polyBounds(poly)};
});

function areaWeight(area: LevelArea, x: number, z: number): number {
  const b = area.bounds;
  const pad = area.blend + area.wobble + 3;
  if (x < b.x0 - pad || x > b.x1 + pad || z < b.z0 - pad || z > b.z1 + pad) return 0;
  if (insidePoly(area.poly, x, z)) return 1;
  let d = edgeDistance(area.poly, x, z);
  if (d > area.blend + area.wobble) return 0;
  d += (noise2(x * 0.035, z * 0.035, area.seed) - 0.5) * area.wobble * 2;
  if (d < 0) d = 0;
  return 1 - smooth(0, area.blend, d);
}

/* ------------------------------------------------------------------ *
 * 关键点钉高
 * ------------------------------------------------------------------ */

export interface PharaohKeyPoint {
  id: string;
  label: string;
  x: number;
  z: number;
  y: number;
  pin: number;
}

export const PHARAOH_KEY_POINTS: PharaohKeyPoint[] = (
  [
    ['blue', '蓝队出生', PHARAOH_LAYOUT.blue, 10],
    ['orange', '橙队出生', PHARAOH_LAYOUT.orange, 12],
    ['A', '金字塔墓室', PHARAOH_LAYOUT.A, 14],
    ['B', '狮身人面像内殿', PHARAOH_LAYOUT.B, 12],
    ['C', '集市街心', PHARAOH_LAYOUT.C, 12],
    ['D', '绿洲湖畔', PHARAOH_LAYOUT.D, 9],
    ['E', '公路驿站', PHARAOH_LAYOUT.E, 10],
    ['F', '卡纳克神庙', PHARAOH_LAYOUT.F, 10],
    ['G', '帝王谷采石场', PHARAOH_LAYOUT.G, 10],
  ] as const
).map(([id, label, site, pin]) => ({id, label, x: site.x, z: site.z, y: site.ground, pin}));

/* ------------------------------------------------------------------ *
 * 公路几何预计算（与铺装同源：PHARAOH_NETWORK）
 * ------------------------------------------------------------------ */

export const PHARAOH_ROADS: PharaohRoadSpec[] = PHARAOH_NETWORK;

interface RoadSegment {
  s0: number;
  y0: number;
  y1: number;
  ax: number;
  az: number;
  bx: number;
  bz: number;
  dx: number;
  dz: number;
  l2: number;
  infl: number;
  hw: number;
  feather: number;
}

const ROAD_CELL = 48;
const ROAD_COLS = 20;
const ROAD_ORIGIN = -64;

function roadFeather(kind: PharaohRoadKind): number {
  return kind === 'main' ? 6 : kind === 'secondary' ? 5 : 4;
}

const ROAD_BUCKETS: RoadSegment[][] = Array.from({length: ROAD_COLS * ROAD_COLS}, () => []);
const ROAD_SEGMENT_COUNT = (() => {
  let count = 0;
  for (const spec of PHARAOH_ROADS) {
    const feather = roadFeather(spec.kind);
    let s = 0;
    for (let i = 1; i < spec.points.length; i++) {
      const [ax, az] = spec.points[i - 1];
      const [bx, bz] = spec.points[i];
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz;
      const len = Math.sqrt(l2) || 1e-6;
      const y0 = spec.elevations[i - 1] ?? 0;
      const y1 = spec.elevations[i] ?? y0;
      const halfWidth = spec.width / 2;
      const infl = halfWidth + feather;
      const seg: RoadSegment = {s0: s, y0, y1, ax, az, bx, bz, dx, dz, l2, infl, hw: halfWidth, feather};
      s += len;
      count++;
      const cx0 = clamp(Math.floor((Math.min(ax, bx) - infl - ROAD_ORIGIN) / ROAD_CELL), 0, ROAD_COLS - 1);
      const cx1 = clamp(Math.floor((Math.max(ax, bx) + infl - ROAD_ORIGIN) / ROAD_CELL), 0, ROAD_COLS - 1);
      const cz0 = clamp(Math.floor((Math.min(az, bz) - infl - ROAD_ORIGIN) / ROAD_CELL), 0, ROAD_COLS - 1);
      const cz1 = clamp(Math.floor((Math.max(az, bz) + infl - ROAD_ORIGIN) / ROAD_CELL), 0, ROAD_COLS - 1);
      for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) ROAD_BUCKETS[cz * ROAD_COLS + cx].push(seg);
    }
  }
  return count;
})();

export const PHARAOH_GRADED_ROAD_SEGMENTS = ROAD_SEGMENT_COUNT;

interface RoadSample {
  h: number;
  w: number;
}

function segmentInfo(seg: RoadSegment, x: number, z: number): {d: number; t: number} {
  let t = ((x - seg.ax) * seg.dx + (z - seg.az) * seg.dz) / (seg.l2 || 1);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = x - seg.ax - t * seg.dx;
  const dz = z - seg.az - t * seg.dz;
  return {d: Math.sqrt(dx * dx + dz * dz), t};
}

function roadGradeAt(x: number, z: number): RoadSample | null {
  const cx = clamp(Math.floor((x - ROAD_ORIGIN) / ROAD_CELL), 0, ROAD_COLS - 1);
  const cz = clamp(Math.floor((z - ROAD_ORIGIN) / ROAD_CELL), 0, ROAD_COLS - 1);
  const bucket = ROAD_BUCKETS[cz * ROAD_COLS + cx];
  if (!bucket.length) return null;

  let minD = Infinity;
  let best: RoadSegment | null = null;
  for (let i = 0; i < bucket.length; i++) {
    const seg = bucket[i];
    const info = segmentInfo(seg, x, z);
    if (info.d < minD) {
      minD = info.d;
      best = seg;
    }
  }
  if (!best || minD > best.infl) return null;

  let t = ((x - best.ax) * best.dx + (z - best.az) * best.dz) / (best.l2 || 1);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const h = best.y0 + (best.y1 - best.y0) * t;
  return {h, w: 1 - smooth(best.hw, best.hw + best.feather, minD)};
}

/* ------------------------------------------------------------------ *
 * 高度函数
 * ------------------------------------------------------------------ */

export function pharaohHeight(x: number, z: number): number {
  let h = naturalHeight(x, z);

  // 场景台地：核心区直接赋值，避免浮点下取整产生 1 m 假台阶。
  for (let i = 0; i < LEVEL_AREAS.length; i++) {
    const area = LEVEL_AREAS[i];
    const w = areaWeight(area, x, z);
    if (w >= 1) h = area.target;
    else if (w > 0) h += (area.target - h) * w;
  }

  // 湖盆最后切开陆地；岸外 26 m 内做滩坡。
  const lakeB = LAKE_BOUNDS;
  if (x >= lakeB.x0 - 30 && x <= lakeB.x1 + 30 && z >= lakeB.z0 - 30 && z <= lakeB.z1 + 30) {
    const inside = insidePoly(PHARAOH_LAKE_POLYGON, x, z);
    if (inside) {
      h = lakeBedShape(edgeDistance(PHARAOH_LAKE_POLYGON, x, z));
    } else {
      const d = edgeDistance(PHARAOH_LAKE_POLYGON, x, z);
      if (d < 26) {
        const w = 1 - smooth(0, 26, d);
        if (w > 0) h += (beachProfile(d) - h) * w;
      }
    }
  }

  // 公路整平：铺装带内完全等于剖面高度，肩带外 4–6 m 过渡。
  const road = roadGradeAt(x, z);
  if (road && road.w > 0) h += (road.h - h) * road.w;

  // 关键点钉高：最后 9–14 m 内收束到契约数值。
  for (let i = 0; i < PHARAOH_KEY_POINTS.length; i++) {
    const p = PHARAOH_KEY_POINTS[i];
    const dx = x - p.x;
    const dz = z - p.z;
    if (dx * dx + dz * dz > p.pin * p.pin) continue;
    const d = Math.sqrt(dx * dx + dz * dz);
    const w = 1 - smooth(0, p.pin, d);
    h = w >= 1 ? p.y : h + (p.y - h) * w;
  }

  return clamp(Math.round(h * 1e6) / 1e6, -6.2, 22);
}

/** 预测体素水覆盖：地面（取整前）低于 −2 就会进水；本图只有绿洲湖盆。 */
export function pharaohWaterSurface(x: number, z: number): boolean {
  return pharaohHeight(x, z) < PHARAOH_WATER_SURFACE;
}

/** 湖岸线：湖内为正，湖外为负（供 zero-margin 测试/平面图使用）。 */
export function pharaohLakeDistance(x: number, z: number): number {
  return lakeShoreDistance(x, z);
}

/** 场景锚点便捷导出（测试/场景作者数据）。 */
export const PHARAOH_SITE_ANCHORS = PHARAOH_LAYOUT;
export type PharaohSite = PharaohSiteId;

/** @internal debug helper for layout probes (kept for diagnostics). */
export function __pharaohRoadSample(x: number, z: number) {
  return roadGradeAt(x, z);
}
