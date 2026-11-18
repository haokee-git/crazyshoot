/**
 * 千户苗寨 · 市场/田园/猪场/祭祀/剧场陈设与植被数据。
 *
 * 大规模可碰撞物件走 Cover/detail（同源世界），只有不参与碰撞的布棚/招牌/纹样
 * 走 decor atlas；两者不混用。
 */
import type { Cover, DecorPlane } from '../types';
import {
  MIAO_A_PLAZA, MIAO_CAPTURES, MIAO_D_PLAZA, MIAO_E_PLAZA, MIAO_LUSHENG_PLAZA,
  MIAO_PADDIES, MIAO_PIG_FARM, MIAO_PLOTS, MIAO_PLOT_FOOTPRINTS,
  MIAO_SPAWNS, MIAO_THEATER, MIAO_VEGETABLE_PATCHES, distanceToRoads, plotPolygon,
} from './layout';
import { MIAO_BRIDGES, MIAO_FERRY_DOCKS, riverAt } from './river';
import { miaoHeight } from './height';

const hash = (x: number, z: number) => {
  let h = Math.imul(Math.floor(x * 7.13) + 1013, 374761393) ^ Math.imul(Math.floor(z * 5.71) - 97, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

function insideAnyPlot(x: number, z: number, margin = 2.5): boolean {
  for (const f of MIAO_PLOT_FOOTPRINTS) {
    if (x > f.x0 - margin && x < f.x1 + margin && z > f.z0 - margin && z < f.z1 + margin) return true;
  }
  return false;
}

function nearCap(x: number, z: number, margin = 4): boolean {
  return MIAO_CAPTURES.some((c) => Math.hypot(x - c.x, z - c.y) < c.radius + margin);
}

function inSpawn(x: number, z: number, margin = 4): boolean {
  return MIAO_SPAWNS.some((s) => x > s.x - margin && x < s.x + s.w + margin && z > s.y - margin && z < s.y + s.d + margin);
}

function onBridge(x: number, z: number, margin = 3): boolean {
  return MIAO_BRIDGES.some((b) => x > b.x0 - margin && x < b.x1 + margin && Math.abs(z - b.z) < b.width / 2 + margin);
}

function inField(x: number, z: number, margin = 3): boolean {
  if (MIAO_PADDIES.some((p) => Math.abs(x - p.x) < p.w / 2 + margin && Math.abs(z - p.z) < p.d / 2 + margin)) return true;
  if (MIAO_VEGETABLE_PATCHES.some((p) => Math.abs(x - p.x) < p.w / 2 + margin && Math.abs(z - p.z) < p.d / 2 + margin)) return true;
  if (Math.abs(x - MIAO_PIG_FARM.x) < MIAO_PIG_FARM.w / 2 + margin && Math.abs(z - MIAO_PIG_FARM.z) < MIAO_PIG_FARM.d / 2 + margin) return true;
  return false;
}

function nearRiver(x: number, z: number, margin = 5): boolean {
  const r = riverAt(z);
  const dx = Math.abs(x - r.x);
  return dx < r.halfWidth + r.towWidth + margin;
}

function nearFerryApproach(x: number, z: number, margin: number): boolean {
  return MIAO_FERRY_DOCKS.some((dock) => {
    const apronEnd = dock.streetX + dock.direction * dock.apronLength;
    return Math.abs(z - dock.ferry.z) <= dock.halfWidth + margin
      && x >= Math.min(dock.x, apronEnd) - margin && x <= Math.max(dock.x, apronEnd) + margin;
  });
}

function freeForVegetation(x: number, z: number, margin = 3): boolean {
  if (distanceToRoads(x, z) < margin) return false;
  if (insideAnyPlot(x, z, 4)) return false;
  if (nearCap(x, z, 5)) return false;
  if (inSpawn(x, z, 4)) return false;
  if (onBridge(x, z, 4)) return false;
  if (inField(x, z, 4)) return false;
  if (nearRiver(x, z, 4) || nearFerryApproach(x, z, 5)) return false;
  if (x < 6 || z < 6 || x > 494 || z > 494) return false;
  return true;
}

/* ------------------------------------------------------------------ *
 * 市集摊位/货物（A）
 * ------------------------------------------------------------------ */

const MARKET_STALLS: Cover[] = [
  { kind: 'stall', x: 136, y: 158, w: 4.5, d: 2.6, height: 2.6, variant: 'dye' },
  { kind: 'stall', x: 147, y: 157, w: 4.5, d: 2.6, height: 2.6, variant: 'tea' },
  { kind: 'stall', x: 158, y: 157, w: 4.5, d: 2.6, height: 2.6, variant: 'produce' },
  { kind: 'stall', x: 170, y: 160, w: 4.5, d: 2.6, height: 2.6, variant: 'pottery' },
  { kind: 'stall', x: 140, y: 182, w: 4.5, d: 2.6, height: 2.6, variant: 'pottery' },
  { kind: 'stall', x: 154, y: 184, w: 4.5, d: 2.6, height: 2.6, variant: 'dye' },
  { kind: 'stall', x: 166, y: 182, w: 4.5, d: 2.6, height: 2.6, variant: 'tea' },
  { kind: 'pottery', x: 128, y: 170, w: 2.4, d: 2.2 },
  { kind: 'pots', x: 172, y: 174, w: 2.6, d: 2.6 },
  { kind: 'sack', x: 132, y: 166, w: 2.4, d: 1.8 },
  { kind: 'sack', x: 176, y: 156, w: 2.4, d: 1.8 },
  { kind: 'table', x: 162, y: 190, w: 2.8, d: 1.4 },
  { kind: 'table', x: 144, y: 150, w: 2.8, d: 1.4 },
  { kind: 'well', x: 150, y: 172, w: 2.4, d: 2.4, height: 1.2 },
  // 窄巷摊位/竹筐
  { kind: 'basket', x: 118, y: 162, w: 1.4, d: 1.2 },
  { kind: 'crate', x: 126, y: 196, w: 1.4, d: 1.4, height: 1.2 },
  { kind: 'crate', x: 138, y: 196, w: 1.4, d: 1.4, height: 1.2 },
  { kind: 'pots', x: 96, y: 176, w: 2.2, d: 2.2 },
  { kind: 'table', x: 206, y: 196, w: 2.4, d: 1.2 },
];

/* ------------------------------------------------------------------ *
 * 芦笙场/祭祀坪/剧场
 * ------------------------------------------------------------------ */

const PLAZA_PROPS: Cover[] = [
  // 芦笙场：芦笙柱、石凳、低石台
  { kind: 'column', x: 176, y: 250, w: 1.4, d: 1.4, height: 7, variant: 'lusheng' },
  { kind: 'bench', x: 166, y: 242, w: 3.2, d: 0.7, height: 0.45 },
  { kind: 'bench', x: 186, y: 242, w: 3.2, d: 0.7, height: 0.45 },
  { kind: 'bench', x: 166, y: 258, w: 3.2, d: 0.7, height: 0.45 },
  { kind: 'bench', x: 186, y: 258, w: 3.2, d: 0.7, height: 0.45 },
  // 祭祀坪：铜鼓架、枫木（鼓藏堂前）
  { kind: 'drum', x: 150, y: 370, w: 1.6, d: 1.6, height: 1.2 },
  { kind: 'drum', x: 160, y: 370, w: 1.6, d: 1.6, height: 1.2 },
  { kind: 'tree', x: 172, y: 372, w: 6, d: 6, variant: 'maple' },
  { kind: 'column', x: 140, y: 362, w: 1.1, d: 1.1, height: 6, variant: 'lusheng' },
  { kind: 'bench', x: 148, y: 356, w: 3, d: 0.7 },
  { kind: 'bench', x: 162, y: 356, w: 3, d: 0.7 },
  // 剧场观众坪：木长凳
  { kind: 'bench', x: 360, y: 322, w: 4.2, d: 0.7 },
  { kind: 'bench', x: 360, y: 330, w: 4.2, d: 0.7 },
  { kind: 'bench', x: 372, y: 322, w: 4.2, d: 0.7 },
  { kind: 'bench', x: 372, y: 330, w: 4.2, d: 0.7 },
  { kind: 'column', x: 356, y: 332, w: 0.8, d: 0.8, height: 4.5, variant: 'lantern' },
];

/* ------------------------------------------------------------------ *
 * 猪场：围栏/食槽/猪（猪走装饰网格，不参与碰撞）
 * ------------------------------------------------------------------ */

export const MIAO_PIG_PENS = [
  { id: 'pen-1', x: 365, y: 124, w: 8, d: 8 },
  { id: 'pen-2', x: 375, y: 124, w: 8, d: 8 },
  { id: 'pen-3', x: 385, y: 124, w: 8, d: 8 },
] as const;

export interface MiaoPig {
  id: string;
  pen: string;
  x: number;
  z: number;
  yaw: number;
  phase: number;
  color: number;
}

export const MIAO_PIGS: readonly MiaoPig[] = (() => {
  const out: MiaoPig[] = [];
  const colors = [0xd9b8a0, 0xc99c84, 0xe4c8b2, 0x8d6f60];
  let i = 0;
  for (const pen of MIAO_PIG_PENS) {
    for (let k = 0; k < 4; k++) {
      const h = hash(pen.x + k * 3.1, pen.y + k * 1.7);
      out.push({
        id: `pig-${++i}`,
        pen: pen.id,
        x: pen.x + ((h % 50) / 50 - 0.5) * (pen.w - 2.4),
        z: pen.y + (((h >> 5) % 50) / 50 - 0.5) * (pen.d - 2.4),
        yaw: ((h >> 9) % 360) * Math.PI / 180,
        phase: ((h >> 3) % 100) / 100 * Math.PI * 2,
        color: colors[i % colors.length],
      });
    }
  }
  return out;
})();

export const MIAO_PIG_FARM_DETAILS = {
  fence: 1.15,
  troughs: [
    { x: 365, y: 128, w: 2.4, d: 0.6 },
    { x: 375, y: 128, w: 2.4, d: 0.6 },
    { x: 385, y: 128, w: 2.4, d: 0.6 },
  ],
} as const;

/* ------------------------------------------------------------------ *
 * 田园：稻秧/菜垄/灌溉沟（装饰，非碰撞）
 * ------------------------------------------------------------------ */

export const MIAO_IRRIGATION = [
  { id: 'canal-1', points: [[400, 60], [400, 176]] as [number, number][], width: 1.2 },
  { id: 'canal-2', points: [[400, 92], [432, 92]] as [number, number][], width: 1.0 },
  { id: 'canal-3', points: [[400, 136], [432, 136]] as [number, number][], width: 1.0 },
  { id: 'canal-4', points: [[400, 176], [430, 176]] as [number, number][], width: 1.0 },
] as const;

/* ------------------------------------------------------------------ *
 * 植被：按 authored zone 栅格化，不在建筑/道路/水里撒点
 * ------------------------------------------------------------------ */

const FOREST_ZONES = [
  { id: 'west-forest', x0: 12, x1: 124, z0: 110, z1: 486, density: 11, variant: 'camphor' },
  { id: 'east-forest', x0: 416, x1: 488, z0: 64, z1: 420, density: 12, variant: 'maple' },
  { id: 'north-ridge', x0: 84, x1: 420, z0: 444, z1: 494, density: 13, variant: 'maple' },
  { id: 'south-hills', x0: 116, x1: 396, z0: 8, z1: 56, density: 14, variant: 'camphor' },
  { id: 'river-bamboo', x0: 190, x1: 310, z0: 300, z1: 380, density: 17, variant: 'bamboo' },
] as const;

const VEGETATION: Cover[] = (() => {
  const out: Cover[] = [];
  for (const zone of FOREST_ZONES) {
    for (let z = zone.z0; z <= zone.z1; z += zone.density) {
      for (let x = zone.x0; x <= zone.x1; x += zone.density) {
        const h = hash(x, z);
        const px = x + ((h % 100) / 100 - 0.5) * zone.density * 0.8;
        const pz = z + (((h >> 8) % 100) / 100 - 0.5) * zone.density * 0.8;
        if (!freeForVegetation(px, pz, 3)) continue;
        if (h % 100 < 46) continue;
        out.push({ kind: 'tree', x: px, y: pz, w: 3.6 + (h % 5) * 0.45, d: 3.6 + (h % 5) * 0.45, variant: zone.variant });
      }
    }
  }
  // 竹丛：河岸台地/寨边，非树林主区
  for (let i = 0; i < 34; i++) {
    const h = hash(900 + i * 7, 1200 + i * 13);
    const x = 60 + (h % 400);
    const z = 80 + ((h >> 7) % 360);
    if (!freeForVegetation(x, z, 3)) continue;
    out.push({ kind: 'bush', x, y: z, w: 2.4, d: 2.4, variant: 'bamboo', height: 2.8 });
  }
  // 河边芦苇：贴着 towpath 外沿，留出梯子/渡口/桥头
  for (const z of [96, 104, 132, 140, 168, 176, 218, 222, 262, 270, 300, 342, 350, 404, 418, 446, 460]) {
    const r = riverAt(z);
    for (const side of [-1, 1]) {
      const x = r.x + side * (r.halfWidth + 1.4);
      if (onBridge(x, z, 5)) continue;
      out.push({ kind: 'reeds', x, y: z, w: 2.2, d: 2.2, height: 1.8, variant: 'river' });
    }
  }
  // 山脚裸岩（真实碰撞，不做纯装饰）
  for (let i = 0; i < 46; i++) {
    const h = hash(3000 + i * 11, 4000 + i * 17);
    const x = 20 + (h % 460);
    const z = 20 + ((h >> 9) % 460);
    if (!freeForVegetation(x, z, 6)) continue;
    const ground = miaoHeight(x, z);
    if (ground < 18) continue;
    out.push({ kind: 'rock', x, y: z, w: 2.4 + (h % 4) * 0.8, d: 2.2 + (h % 3) * 0.7, height: 1.6, variant: 'miao-stone' });
  }
  return out;
})();

/* ------------------------------------------------------------------ *
 * 装饰 atlas 平面（招牌/布棚/纹样；不参与碰撞）
 * ------------------------------------------------------------------ */

const SIGN_NAMES = ['苗绣', '蜡染', '银饰坊', '酸汤鱼', '竹编', '米酒', '客栈', '糍粑', '腊肉', '茶叶', '药材', '茶舍', '绣坊', '酒坊', '布庄', '油坊'];

const signIndex = (name: string | undefined) => {
  if (!name) return 0;
  const index = SIGN_NAMES.indexOf(name);
  return index >= 0 ? index : 0;
};

const signUv = (index: number): [number, number, number, number] => {
  const col = index % 4;
  const row = Math.floor(index / 4);
  return [col / 4, 1 - (row + 1) / 4, 1 / 4, 1 / 4];
};

function plotFacadePoint(plot: (typeof MIAO_PLOTS)[number], out: number): { x: number; z: number; rot: number } {
  const yaw = (plot.yaw * Math.PI) / 180;
  // local +z facade direction
  const fx = -Math.sin(yaw);
  const fz = Math.cos(yaw);
  return { x: plot.x + fx * (plot.d / 2 + out), z: plot.z + fz * (plot.d / 2 + out), rot: -plot.yaw };
}

export const MIAO_DECOR: DecorPlane[] = (() => {
  const out: DecorPlane[] = [];
  for (const plot of MIAO_PLOTS) {
    if (!plot.sign || plot.interior === 'shed' || plot.interior === 'pig-shed') continue;
    const p = plotFacadePoint(plot, 0.06);
    out.push({
      atlas: 'miao_atlas_signs',
      x: p.x,
      // map-arena treats decor Y as height above the local ground (pharaoh convention).
      y: 2.65,
      z: p.z,
      w: 1.7,
      h: 0.46,
      rot: p.rot,
      uv: signUv(signIndex(plot.sign)),
    });
  }
  // 市集布棚：挂在摊位上方（薄片，不碰撞）
  const awnings: { x: number; z: number; rot: number }[] = [
    { x: 136, z: 158, rot: 0 }, { x: 147, z: 157, rot: 0 }, { x: 158, z: 157, rot: 0 },
    { x: 170, z: 160, rot: 0 }, { x: 140, z: 182, rot: 0 }, { x: 154, z: 184, rot: 0 },
    { x: 166, z: 182, rot: 0 },
  ];
  for (const [i, a] of awnings.entries()) {
    out.push({
      atlas: 'miao_atlas_textile', x: a.x, y: 2.6, z: a.z, w: 4.4, h: 2.2, rot: a.rot,
      uv: signUv(i % 16),
    });
  }
  // 芦笙场节庆纹样条幅
  for (const [i, p] of [[162, 246], [190, 246], [162, 254], [190, 254]].entries()) {
    out.push({ atlas: 'miao_atlas_festival', x: p[0], y: 1.8, z: p[1], w: 1.2, h: 2.4, rot: 0, uv: signUv(i * 3) });
  }
  // 剧场舞台背景（两张大幅纹样，面向观众）
  for (const [i, x] of [372, 396].entries()) {
    out.push({ atlas: 'miao_atlas_festival', x, y: 5.7, z: MIAO_THEATER.stageZ + 8.2, w: 8, h: 5.6, rot: Math.PI, uv: signUv(4 + i * 5) });
  }
  return out;
})();

/* ------------------------------------------------------------------ *
 * 汇总
 * ------------------------------------------------------------------ */

export const MIAO_COVERS: Cover[] = [
  ...[...MARKET_STALLS, ...PLAZA_PROPS].filter((c) => {
    // A full-size tree includes overhanging canopy voxels; leave a clear doorway
    // approach even when the footprint centre itself is outside the house.
    const margin = Math.hypot(c.w, c.d) / 2;
    return !insideAnyPlot(c.x, c.y, margin + 1.5) && !nearFerryApproach(c.x, c.y, margin)
      && (c.kind !== 'tree' || distanceToRoads(c.x, c.y) >= margin);
  }),
  ...VEGETATION,
];

/** 剧场/祭祀/猪场结构锚点（体素生成器读同一份）。 */
export const MIAO_STRUCTURE_ANCHORS = {
  theater: MIAO_THEATER,
  pigFarm: MIAO_PIG_FARM,
  pigPens: MIAO_PIG_PENS,
  aPlaza: MIAO_A_PLAZA,
  dPlaza: MIAO_D_PLAZA,
  ePlaza: MIAO_E_PLAZA,
  lusheng: MIAO_LUSHENG_PLAZA,
  paddy: MIAO_PADDIES,
  vegetables: MIAO_VEGETABLE_PATCHES,
  irrigation: MIAO_IRRIGATION,
} as const;

/** 供地图 def 使用的 plot polygon 重新导出（避免工具复制）。 */
export { plotPolygon };
