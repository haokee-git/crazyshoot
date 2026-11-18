/**
 * 法老坟墓 · 场景/内容覆盖率统计（800×800，1 m 栅格 union）
 *
 * 目的：不再用“巨大矩形包络 - 空白沙地”冒充内容。这里把七场景的真实不规则场地、
 * 道路/街道/小径走廊、绿洲生态过渡、有形低沙丘/岩脊分别栅格化，然后取**并集**，
 * 重叠区域只算一次；同时单独报告建筑/实体 footprint，避免把“场景覆盖”和
 * “房屋铺满”混为一谈。
 *
 * 口径：
 *   - 分母 800² = 640,000㎡。
 *   - 不计 baseTerrain:'sand'、纯噪声沙地、场景包络内没有设计的空隙。
 *   - 设计目标 62%–70%，中心约 66%。
 *
 * 纯数据 + 一次性 800×800 Uint8Array；可在 Node 测试/工具里直接跑。
 */
import type { MapDef, Polygon, Vec2 } from '../types';
import { PHARAOH_LAYOUT, PHARAOH_SIZE } from './layout';
import { PHARAOH_NETWORK } from './network';
import { PHARAOH_DUNE_ZONES } from '../pharaoh-height';
import { OASIS_ECO_AREA, OASIS_ECO_POLYGON, OASIS_LAKE_AREA } from './oasis-shape';
import { pharaoh } from '../pharaoh';
import { TEMPLE_SITE, QUARRY_SITE } from './scenes';
import { SERVICE_SITE_POLYGON } from './service';

export interface SiteCoverage {
  id: string;
  name: string;
  area: number;
  /** 场地内建筑 footprint。 */
  buildingArea: number;
  /** 场地内掩体/纪念物体量 footprint（近似）。 */
  structureArea: number;
  /** 场地内道路走廊面积。 */
  roadArea: number;
}

export interface PharaohCoverageStats {
  size: number;
  cell: number;
  totalCells: number;
  totalArea: number;
  siteCells: number;
  roadCells: number;
  ecoCells: number;
  duneRidgeCells: number;
  designedCells: number;
  designedArea: number;
  designedPct: number;
  overlapCells: number;
  undesignedArea: number;
  sites: SiteCoverage[];
  buildingFootprintArea: number;
  buildingFootprintPct: number;
  coverFootprintArea: number;
  coverFootprintPct: number;
  monumentFootprintArea: number;
  lakeArea: number;
  ecoArea: number;
  roadArea: number;
  duneRidgeArea: number;
  siteArea: number;
  cellsByCategory: Record<string, number>;
}

/* ------------------------------------------------------------------ *
 * 不规则场景场地（真实内容边界，不是规则矩形平台）
 * ------------------------------------------------------------------ */

const A_SITE: Polygon = [
  [40, 580], [58, 478], [322, 478], [340, 610], [322, 742],
  [190, 765], [58, 742], [40, 680],
];
const B_SITE: Polygon = [
  [345, 600], [360, 560], [420, 550], [500, 555], [560, 580],
  [575, 640], [560, 700], [500, 720], [420, 710], [360, 680], [345, 640],
];
/** 330×300 八边形：四个 12 m 切角，净面积 98,712㎡（≥96,900）。 */
const C_SITE: Polygon = [
  [322, 245], [628, 245], [640, 257], [640, 533], [628, 545],
  [322, 545], [310, 533], [310, 257],
];
const E_SITE: Polygon = SERVICE_SITE_POLYGON;
const F_SITE: Polygon = TEMPLE_SITE;
const G_SITE: Polygon = QUARRY_SITE;
const BLUE_SITE: Polygon = [
  [30, 35], [125, 30], [135, 40], [135, 135], [125, 145],
  [35, 145], [25, 135], [25, 45],
];
const ORANGE_SITE: Polygon = [
  [660, 660], [755, 655], [765, 665], [765, 755], [755, 765],
  [665, 765], [655, 755], [655, 670],
];

export const PHARAOH_SITE_POLYGONS: Record<'blue' | 'orange' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G', Polygon> = {
  blue: BLUE_SITE,
  orange: ORANGE_SITE,
  A: A_SITE,
  B: B_SITE,
  C: C_SITE,
  D: OASIS_ECO_POLYGON,
  E: E_SITE,
  F: F_SITE,
  G: G_SITE,
};

/* ------------------------------------------------------------------ *
 * 几何工具
 * ------------------------------------------------------------------ */

export function polygonArea(poly: Polygon): number {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  }
  return Math.abs(area) / 2;
}

function inside(poly: Polygon, x: number, z: number): boolean {
  let on = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) on = !on;
  }
  return on;
}

function rasterPolygon(poly: Polygon, out: Uint8Array, cell: number): number {
  const n = Math.ceil(PHARAOH_SIZE / cell);
  let count = 0;
  const xs = poly.map((p) => p[0]);
  const zs = poly.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs) / cell));
  const x1 = Math.min(n - 1, Math.ceil(Math.max(...xs) / cell));
  const z0 = Math.max(0, Math.floor(Math.min(...zs) / cell));
  const z1 = Math.min(n - 1, Math.ceil(Math.max(...zs) / cell));
  for (let iz = z0; iz <= z1; iz++) {
    for (let ix = x0; ix <= x1; ix++) {
      if (!inside(poly, (ix + 0.5) * cell, (iz + 0.5) * cell)) continue;
      const k = iz * n + ix;
      if (!out[k]) {
        out[k] = 1;
        count++;
      }
    }
  }
  return count;
}

function rasterRoadCorridors(out: Uint8Array, cell: number): number {
  const n = Math.ceil(PHARAOH_SIZE / cell);
  let count = 0;
  for (const road of PHARAOH_NETWORK) {
    const reach = road.width / 2 + (road.shoulder ?? 0) + 0.5;
    for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1];
      const [bx, bz] = road.points[i];
      const dx = bx - ax;
      const dz = bz - az;
      const l2 = dx * dx + dz * dz || 1;
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach) / cell));
      const x1 = Math.min(n - 1, Math.ceil((Math.max(ax, bx) + reach) / cell));
      const z0 = Math.max(0, Math.floor((Math.min(az, bz) - reach) / cell));
      const z1 = Math.min(n - 1, Math.ceil((Math.max(az, bz) + reach) / cell));
      for (let iz = z0; iz <= z1; iz++) {
        for (let ix = x0; ix <= x1; ix++) {
          const x = (ix + 0.5) * cell;
          const z = (iz + 0.5) * cell;
          let t = ((x - ax) * dx + (z - az) * dz) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          if (Math.hypot(x - ax - dx * t, z - az - dz * t) > reach) continue;
          const k = iz * n + ix;
          if (!out[k]) {
            out[k] = 1;
            count++;
          }
        }
      }
    }
  }
  return count;
}

function rasterDuneZones(out: Uint8Array, cell: number): number {
  const n = Math.ceil(PHARAOH_SIZE / cell);
  let count = 0;
  const mark = (cx: number, cz: number, len: number, wid: number, angleDeg: number, tMax: number) => {
    const a = (angleDeg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const reach = Math.max(len, wid) * Math.sqrt(tMax) + 2;
    const x0 = Math.max(0, Math.floor((cx - reach) / cell));
    const x1 = Math.min(n - 1, Math.ceil((cx + reach) / cell));
    const z0 = Math.max(0, Math.floor((cz - reach) / cell));
    const z1 = Math.min(n - 1, Math.ceil((cz + reach) / cell));
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) {
        const dx = (ix + 0.5) * cell - cx;
        const dz = (iz + 0.5) * cell - cz;
        const u = dx * c + dz * s;
        const v = -dx * s + dz * c;
        if ((u * u) / (len * len) + (v * v) / (wid * wid) > tMax) continue;
        const k = iz * n + ix;
        if (!out[k]) {
          out[k] = 1;
          count++;
        }
      }
    }
  };
  for (const d of PHARAOH_DUNE_ZONES) mark(d.x, d.z, d.len, d.wid, d.angle, 0.45);
  // 手工岩脊也属于“有形地形/岩体”，按 footprint 外扩 2 m 计入。
  for (const c of pharaoh.covers) {
    if (c.kind !== 'rock') continue;
    const area = Math.max(c.w, c.d) / 2 + 2;
    const x0 = Math.max(0, Math.floor((c.x - area) / cell));
    const x1 = Math.min(n - 1, Math.ceil((c.x + area) / cell));
    const z0 = Math.max(0, Math.floor((c.y - area) / cell));
    const z1 = Math.min(n - 1, Math.ceil((c.y + area) / cell));
    for (let iz = z0; iz <= z1; iz++) {
      for (let ix = x0; ix <= x1; ix++) {
        if (Math.hypot((ix + 0.5) * cell - c.x, (iz + 0.5) * cell - c.y) > area) continue;
        const k = iz * n + ix;
        if (!out[k]) {
          out[k] = 1;
          count++;
        }
      }
    }
  }
  return count;
}

/* ------------------------------------------------------------------ *
 * 实体 footprint（建筑/掩体/纪念物）
 * ------------------------------------------------------------------ */

function buildingFootprint(map: MapDef): number {
  let total = 0;
  for (const b of map.buildings) total += polygonArea(b.polygon);
  return Math.round(total);
}

function coverFootprint(map: MapDef): number {
  let total = 0;
  for (const c of map.covers) total += Math.max(1, c.w) * Math.max(1, c.d);
  return Math.round(total);
}

/** 金字塔外层 + 狮身本体（不属于 MapDef.buildings，但确实是实体体量）。 */
const MONUMENT_FOOTPRINT = 264 * 264 + 150 * 52;

/* ------------------------------------------------------------------ *
 * 主统计
 * ------------------------------------------------------------------ */

export function pharaohCoverageStats(cell = 1): PharaohCoverageStats {
  const n = Math.ceil(PHARAOH_SIZE / cell);
  const totalCells = n * n;
  const siteMask = new Uint8Array(totalCells);
  const roadMask = new Uint8Array(totalCells);
  const ecoMask = new Uint8Array(totalCells);
  const duneMask = new Uint8Array(totalCells);

  const sites: SiteCoverage[] = [];
  for (const id of ['blue', 'orange', 'A', 'B', 'C', 'D', 'E', 'F', 'G'] as const) {
    const poly = PHARAOH_SITE_POLYGONS[id];
    const before = siteMask.reduce((a, v) => a + v, 0);
    rasterPolygon(poly, siteMask, cell);
    const after = siteMask.reduce((a, v) => a + v, 0);
    const siteArea = Math.round(polygonArea(poly));
    let buildingArea = 0;
    let structureArea = 0;
    for (const b of pharaoh.buildings) {
      const xs = b.polygon.map((p) => p[0]);
      const zs = b.polygon.map((p) => p[1]);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
      if (inside(poly, cx, cz)) buildingArea += polygonArea(b.polygon);
    }
    for (const c of pharaoh.covers) if (inside(poly, c.x, c.y)) structureArea += c.w * c.d;
    // roadArea per site is approximated by corridor cells intersecting the polygon.
    let roadInside = 0;
    for (let iz = 0; iz < n; iz++) {
      for (let ix = 0; ix < n; ix++) {
        if (!roadMask[iz * n + ix]) continue;
        if (inside(poly, (ix + 0.5) * cell, (iz + 0.5) * cell)) roadInside++;
      }
    }
    sites.push({
      id,
      name: PHARAOH_LAYOUT[id].label,
      area: siteArea,
      buildingArea: Math.round(buildingArea),
      structureArea: Math.round(structureArea),
      roadArea: Math.round(roadInside * cell * cell),
    });
    void before;
    void after;
  }

  const roadCells = rasterRoadCorridors(roadMask, cell);
  const ecoCells = rasterPolygon(OASIS_ECO_POLYGON, ecoMask, cell);
  const duneRidgeCells = rasterDuneZones(duneMask, cell);

  let designedCells = 0;
  for (let i = 0; i < totalCells; i++) {
    const count = siteMask[i] + roadMask[i] + ecoMask[i] + duneMask[i];
    if (count > 0) designedCells++;
  }

  const siteCells = siteMask.reduce((a, v) => a + v, 0);
  // 多重重叠也要完整扣除：sum(类别) - union = 所有重复计数的格次。
  const overlapCells = siteCells + roadCells + ecoCells + duneRidgeCells - designedCells;
  const totalArea = totalCells * cell * cell;
  const designedArea = designedCells * cell * cell;
  const buildingArea = buildingFootprint(pharaoh);
  const coverArea = coverFootprint(pharaoh);

  return {
    size: PHARAOH_SIZE,
    cell,
    totalCells,
    totalArea,
    siteCells,
    roadCells,
    ecoCells,
    duneRidgeCells,
    designedCells,
    designedArea,
    designedPct: Math.round((designedCells / totalCells) * 10000) / 100,
    overlapCells,
    undesignedArea: totalArea - designedArea,
    sites,
    buildingFootprintArea: buildingArea,
    buildingFootprintPct: Math.round((buildingArea / totalArea) * 10000) / 100,
    coverFootprintArea: coverArea,
    coverFootprintPct: Math.round((coverArea / totalArea) * 10000) / 100,
    monumentFootprintArea: MONUMENT_FOOTPRINT,
    lakeArea: OASIS_LAKE_AREA,
    ecoArea: OASIS_ECO_AREA,
    roadArea: Math.round(roadCells * cell * cell),
    duneRidgeArea: Math.round(duneRidgeCells * cell * cell),
    siteArea: Math.round(siteCells * cell * cell),
    cellsByCategory: {
      site: siteCells,
      road: roadCells,
      eco: ecoCells,
      duneRidge: duneRidgeCells,
      designed: designedCells,
      overlap: overlapCells,
    },
  };
}

export default pharaohCoverageStats;
