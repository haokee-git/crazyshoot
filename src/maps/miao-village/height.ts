/**
 * 千户苗寨 · 地形预计算场。
 *
 * 一次栅格化（1 m，含 32 m 边界余量）后，battlefieldHeight / 方块生成 / 覆盖统计 /
 * 平坦度检查都读同一个 Float32Array。顺序：
 *   基础河谷群山 → 建筑台地 → 据点/广场/出生区整平 → 梯田 → 道路 → 河槽/堤岸
 * 这样道路不会被建筑台地抬起来，河槽也不会被道路填掉。
 */
import {
  MIAO_A_PLAZA, MIAO_CAPTURES, MIAO_D_PLAZA, MIAO_E_PLAZA, MIAO_LUSHENG_PLAZA,
  MIAO_PADDIES, MIAO_PIG_FARM, MIAO_PLOTS, MIAO_SITE_HEIGHTS,
  MIAO_SPAWNS, MIAO_THEATER, MIAO_ENTRY_HALF_WIDTH, MIAO_ENTRY_TREAD, groundDoorAlong, plotPolygon,
} from './layout';
import { MIAO_ROADS } from './network';
import { miaoBaseHeight } from './height-base';
import { MIAO_BRIDGES, MIAO_FERRY_BASINS, MIAO_FERRY_DOCKS, quayStreetY, riverAt, towWidthAt } from './river';

export const MIAO_SIZE = 500;
export const MIAO_MARGIN = 32;
export const MIAO_FIELD_WIDTH = MIAO_SIZE + MIAO_MARGIN * 2;
export const MIAO_MIN_Y = -8;
export const MIAO_MAX_Y = 88;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const smooth = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a || 1), 0, 1);
  return t * t * (3 - 2 * t);
};

const field = new Float32Array(MIAO_FIELD_WIDTH * MIAO_FIELD_WIDTH);

/** Small deterministic jitter for the mountain shoulders (breaks the analytic smoothness). */
function shoulderJitter(x: number, z: number): number {
  const n = Math.sin(x * 0.31 + z * 0.17) * Math.sin(x * 0.13 - z * 0.23 + 2.1);
  return n * 0.55;
}

function index(x: number, z: number): number {
  const ix = Math.floor(x) + MIAO_MARGIN;
  const iz = Math.floor(z) + MIAO_MARGIN;
  if (ix < 0 || iz < 0 || ix >= MIAO_FIELD_WIDTH || iz >= MIAO_FIELD_WIDTH) return -1;
  return iz * MIAO_FIELD_WIDTH + ix;
}

/** Pad with an axis-aligned target and a soft blend; `weight` is 1 inside. */
function pad(x0: number, z0: number, x1: number, z1: number, target: number, blend: number, hard = false) {
  const bx0 = Math.floor(x0 - blend), bx1 = Math.ceil(x1 + blend);
  const bz0 = Math.floor(z0 - blend), bz1 = Math.ceil(z1 + blend);
  for (let z = bz0; z <= bz1; z++) {
    for (let x = bx0; x <= bx1; x++) {
      const k = index(x, z);
      if (k < 0) continue;
      const cx = x + 0.5, cz = z + 0.5;
      const outside = Math.hypot(Math.max(0, x0 - cx, cx - x1), Math.max(0, z0 - cz, cz - z1));
      const t = hard ? (outside <= 0 ? 1 : 0) : 1 - smooth(0, blend, outside);
      if (t <= 0) continue;
      field[k] = field[k] + (target - field[k]) * t;
    }
  }
}

/** Rasterize a rotated plot footprint into its AABB pad. */
function plotPad(p: (typeof MIAO_PLOTS)[number]) {
  const poly = plotPolygon(p);
  const x0 = Math.min(...poly.map((q) => q[0])) - 0.6;
  const x1 = Math.max(...poly.map((q) => q[0])) + 0.6;
  const z0 = Math.min(...poly.map((q) => q[1])) - 0.6;
  const z1 = Math.max(...poly.map((q) => q[1])) + 0.6;
  pad(x0, z0, x1, z1, p.baseY, 4.5);
}

function gradeHouseEntries(p: (typeof MIAO_PLOTS)[number]) {
  if (p.interior === 'shed' || p.interior === 'pig-shed' || p.interior === 'hall') return;
  const angle = p.yaw * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle);
  const half = MIAO_ENTRY_HALF_WIDTH + 0.3;
  for (const side of ['front', 'right'] as const) {
    const front = side === 'front';
    const edge = front ? p.d / 2 : p.w / 2;
    const along = groundDoorAlong(p, side);
    const xs: number[] = [], zs: number[] = [];
    for (const a of [along - half, along + half]) for (const b of [edge, edge + MIAO_ENTRY_TREAD * 2 + 0.85]) {
      const [u, v] = front ? [a, b] : [b, a];
      xs.push(p.x + u * c - v * s);
      zs.push(p.z + u * s + v * c);
    }
    pad(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), p.baseY, 1.25);
  }
}

/** Road corridor: centre line target elevation, width + 3 m shoulder blend. */
function roadPad() {
  for (const road of MIAO_ROADS) {
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz || 1;
      const length = Math.sqrt(l2);
      const half = road.width / 2;
      const blend = 3;
      const bx0 = Math.floor(Math.min(a.x, b.x) - half - blend);
      const bx1 = Math.ceil(Math.max(a.x, b.x) + half + blend);
      const bz0 = Math.floor(Math.min(a.z, b.z) - half - blend);
      const bz1 = Math.ceil(Math.max(a.z, b.z) + half + blend);
      for (let z = bz0; z <= bz1; z++) {
        for (let x = bx0; x <= bx1; x++) {
          const k = index(x, z);
          if (k < 0) continue;
          const cx = x + 0.5, cz = z + 0.5;
          const t = clamp(((cx - a.x) * dx + (cz - a.z) * dz) / l2, 0, 1);
          const distance = Math.hypot(cx - a.x - dx * t, cz - a.z - dz * t);
          if (distance > half + blend) continue;
          const target = a.y + (b.y - a.y) * t;
          const w = distance <= half ? 1 : 1 - smooth(half, half + blend, distance);
          if (w <= 0) continue;
          field[k] = field[k] + (target - field[k]) * w;
        }
      }
    }
  }
}

/** River channel / towpath / quay wall / riverside street strip. */
function riverPad() {
  for (let z = -MIAO_MARGIN; z < MIAO_SIZE + MIAO_MARGIN; z++) {
    const r = riverAt(z + 0.5);
    const tow = towWidthAt(z + 0.5);
    const westStreet = quayStreetY(z + 0.5, 'west');
    const eastStreet = quayStreetY(z + 0.5, 'east');
    for (let x = -MIAO_MARGIN; x < MIAO_SIZE + MIAO_MARGIN; x++) {
      const k = index(x, z);
      if (k < 0) continue;
      const cx = x + 0.5;
      const dx = cx - r.x;
      const ad = Math.abs(dx);
      const waterEdge = r.halfWidth;
      const wallOffset = waterEdge + tow;
      const streetTarget = dx < 0 ? westStreet : eastStreet;
      const target = (() => {
        if (ad <= waterEdge) return r.bedY;
        if (ad <= wallOffset) return r.towY;
        // 1 m thick quay wall then a 6 m flat riverside street.
        if (ad <= wallOffset + 1) return streetTarget;
        if (ad <= wallOffset + 7) return streetTarget;
        return null;
      })();
      if (target === null) {
        // Softly return to the base terrain 7–16 m behind the wall.
        const behind = ad - (wallOffset + 7);
        if (behind < 9) {
          const t = 1 - smooth(0, 9, behind);
          field[k] = field[k] + (streetTarget - field[k]) * t;
        }
        continue;
      }
      field[k] = target;
    }
  }
}

/* ------------------------------------------------------------------ *
 * Build once
 * ------------------------------------------------------------------ */

for (let iz = 0; iz < MIAO_FIELD_WIDTH; iz++) {
  const z = iz - MIAO_MARGIN + 0.5;
  for (let ix = 0; ix < MIAO_FIELD_WIDTH; ix++) {
    const x = ix - MIAO_MARGIN + 0.5;
    let h = miaoBaseHeight(x, z);
    // 山肩的碎岩起伏：只在陡坡上，不改变道路/建筑/据点。
    if (Math.min(x, z, MIAO_SIZE - x, MIAO_SIZE - z) < 70) h += shoulderJitter(x, z) * smooth(0.6, 1.06, 0);
    field[iz * MIAO_FIELD_WIDTH + ix] = h;
  }
}

// 1) 建筑台地。先按 AABB 落台，再由街道/据点整平切过去。
for (const plot of MIAO_PLOTS) plotPad(plot);

// 2) 据点与公共空间整平（建筑不在圆内，见 miao-village.test 的断言）。
for (const cap of MIAO_CAPTURES) {
  // C 是桥面据点：地面高度由桥体 geometry 提供，不能把河床整平到 3 m。
  if (cap.footprint) continue;
  const y = cap.floorY ?? MIAO_SITE_HEIGHTS.A;
  const r = cap.radius;
  pad(cap.x - r, cap.y - r, cap.x + r, cap.y + r, y, 9);
}
pad(MIAO_A_PLAZA.x - MIAO_A_PLAZA.w / 2, MIAO_A_PLAZA.z - MIAO_A_PLAZA.d / 2, MIAO_A_PLAZA.x + MIAO_A_PLAZA.w / 2, MIAO_A_PLAZA.z + MIAO_A_PLAZA.d / 2, MIAO_A_PLAZA.y, 8);
pad(MIAO_D_PLAZA.x - MIAO_D_PLAZA.w / 2, MIAO_D_PLAZA.z - MIAO_D_PLAZA.d / 2, MIAO_D_PLAZA.x + MIAO_D_PLAZA.w / 2, MIAO_D_PLAZA.z + MIAO_D_PLAZA.d / 2, MIAO_D_PLAZA.y, 8);
pad(MIAO_E_PLAZA.x - MIAO_E_PLAZA.w / 2, MIAO_E_PLAZA.z - MIAO_E_PLAZA.d / 2, MIAO_E_PLAZA.x + MIAO_E_PLAZA.w / 2, MIAO_E_PLAZA.z + MIAO_E_PLAZA.d / 2, MIAO_E_PLAZA.y, 8);
pad(MIAO_LUSHENG_PLAZA.x - MIAO_LUSHENG_PLAZA.w / 2, MIAO_LUSHENG_PLAZA.z - MIAO_LUSHENG_PLAZA.d / 2, MIAO_LUSHENG_PLAZA.x + MIAO_LUSHENG_PLAZA.w / 2, MIAO_LUSHENG_PLAZA.z + MIAO_LUSHENG_PLAZA.d / 2, MIAO_LUSHENG_PLAZA.y, 8);
pad(MIAO_PIG_FARM.x - MIAO_PIG_FARM.w / 2, MIAO_PIG_FARM.z - MIAO_PIG_FARM.d / 2, MIAO_PIG_FARM.x + MIAO_PIG_FARM.w / 2, MIAO_PIG_FARM.z + MIAO_PIG_FARM.d / 2, MIAO_PIG_FARM.y, 6);
pad(MIAO_THEATER.stageX - 26, MIAO_THEATER.stageZ - 18, MIAO_THEATER.stageX + 26, MIAO_THEATER.stageZ + 20, MIAO_THEATER.groundY, 8);
for (const spawn of MIAO_SPAWNS) {
  const y = spawn.team === 'blue' ? MIAO_SITE_HEIGHTS.blue : MIAO_SITE_HEIGHTS.orange;
  pad(spawn.x, spawn.y, spawn.x + spawn.w, spawn.y + spawn.d, y, 14);
}

// 3) 梯田：每一块自己的泥面高度。
for (const p of MIAO_PADDIES) pad(p.x - p.w / 2, p.z - p.d / 2, p.x + p.w / 2, p.z + p.d / 2, p.levelY, 2.6);

// 4) 道路（压过台地，保证车辆纵坡）。
roadPad();
// 5) 河道 / towpath / 挡土墙 / 滨河街。
riverPad();
// Seal each plot's footprint while keeping the adjacent road grades in place.
for (const plot of MIAO_PLOTS) plotPad(plot);
for (const plot of MIAO_PLOTS) gradeHouseEntries(plot);
// Clear the swept hull and cut access into both banks after shaping the plots.
for (const basin of MIAO_FERRY_BASINS) pad(basin.x0, basin.z0, basin.x1, basin.z1, basin.bedY, 0, true);
for (const dock of MIAO_FERRY_DOCKS) {
  const { x, streetX, direction, steps, halfWidth, apronLength, ferry } = dock;
  const apronEnd = streetX + direction * apronLength;
  pad(Math.min(streetX, apronEnd), ferry.z - halfWidth - 0.5, Math.max(streetX, apronEnd),
    ferry.z + halfWidth + 0.5, ferry.deckY + steps / 2, 5);
  const cutEnd = streetX - direction * 0.01;
  pad(Math.min(x, cutEnd), ferry.z - halfWidth - 0.5, Math.max(x, cutEnd),
    ferry.z + halfWidth + 0.5, ferry.deckY - 1, 0, true);
}
// 8) 桥头/桥面跨越的陆地整平到桥面标高（不碰河床）：车辆才能从引道开上桥。
for (const bridge of MIAO_BRIDGES) {
  const half = bridge.width / 2 + 1;
  const x0 = bridge.x0 - 5, x1 = bridge.x1 + 5;
  const z0 = bridge.z - half, z1 = bridge.z + half;
  for (let z = Math.floor(z0); z <= Math.ceil(z1); z++) {
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      const k = index(x, z);
      if (k < 0) continue;
      const h = field[k];
      if (h < bridge.deckY - 2.5) continue; // river bed / towpath below the deck
      const outside = Math.hypot(
        Math.max(0, x0 - (x + 0.5), x + 0.5 - x1),
        Math.max(0, z0 - (z + 0.5), z + 0.5 - z1),
      );
      const t = Math.max(0, 1 - smooth(0, 2.5, outside));
      field[k] = field[k] + (bridge.deckY - field[k]) * t;
    }
  }
}

// 最终吸附到 0.5 m 半格：设计标高（5/4/16/9…）不被道路混合后的 15.99 截成 15。
for (let i = 0; i < field.length; i++) field[i] = Math.round(field[i] * 2) / 2;

/** Final height lookup (already integer-clamped by the voxel generator). */
export function miaoHeight(x: number, z: number): number {
  const k = index(x, z);
  if (k < 0) return miaoBaseHeight(x, z);
  return clamp(field[k], MIAO_MIN_Y, MIAO_MAX_Y);
}

export function miaoHeightAtCell(ix: number, iz: number): number {
  return field[iz * MIAO_FIELD_WIDTH + ix] ?? 0;
}

export function miaoField(): Float32Array {
  return field;
}

/** 建筑/据点验收：某块 pad 内基础高度与目标的最大偏差（不含建筑本身）。 */
export function miaoPadFlatness(x0: number, z0: number, x1: number, z1: number): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (let z = Math.floor(z0); z <= Math.ceil(z1); z++) {
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      const h = miaoHeight(x + 0.5, z + 0.5);
      min = Math.min(min, h);
      max = Math.max(max, h);
    }
  }
  return { min, max };
}
