/**
 * 法老坟墓 · 同源 DDA 视线验收（800 图）
 *
 * 与渲染/碰撞/子弹共用同一份体素数据（TerrainData），不做第二套射线世界：
 *  - 在中央低沙脊选 10–12 个代表点，检查对 C/D/E/F/G 露天据点主要交战区的通视；
 *    单个脊点不得同时无遮挡控制超过 2 个露天据点。
 *  - A/B 是室内点：只检查入口/前庭，避免把“墓室被实体挡住”当成地形视线成果。
 *  - 主推进路线周期性出现遮挡（不是全程暴露在同一高地之下）。
 *
 * 该模块只读体素，不建渲染；测试与 tools/maps/pharaoh-los.ts 共用。
 */
import type { MapDef, Vec2 } from '../types';
import type { TerrainData } from '../../game/world/voxel-map-data';
import * as THREE from 'three';
import { VoxelWorldQueries } from '../../game/world/voxel-world-queries';
import { pharaohHeight } from '../pharaoh-height';
import { PHARAOH_LAYOUT } from './layout';

export interface LosPoint {
  id: string;
  label: string;
  x: number;
  z: number;
  y: number;
}

export interface LosPair {
  from: string;
  to: string;
  visible: boolean;
}

export interface RidgeLosRow {
  ridge: string;
  x: number;
  z: number;
  ground: number;
  openSites: string[];
  siteHits: Record<string, boolean>;
  entrances: Record<string, boolean>;
}

export interface RouteExposureRow {
  route: string;
  team: string;
  samples: number;
  exposed: number;
  exposurePct: number;
}

export interface PharaohLosReport {
  ridges: RidgeLosRow[];
  siteCoverage: Record<string, number>;
  entranceCoverage: Record<string, number>;
  maxOpenSitesPerRidge: number;
  worstRidge: string;
  routes: RouteExposureRow[];
  failures: string[];
}

const QUERY_CACHE = new WeakMap<TerrainData, VoxelWorldQueries>();
function queriesFor(data: TerrainData): VoxelWorldQueries {
  let q = QUERY_CACHE.get(data);
  if (!q) {
    q = new VoxelWorldQueries(data);
    QUERY_CACHE.set(data, q);
  }
  return q;
}

/**
 * 与 `VoxelWorldQueries.ray/line` 同口径：体素体 + 0.5 m detailBoxes（石柱/墙/摊位/
 * 脚手架/观察口栅条）都参与遮挡。两端各留 1.2 m，避免把起点所在掩体/目标自身算成墙。
 */
export function losVisible(data: TerrainData, a: LosPoint, b: LosPoint): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 1.2) return true;
  const ux = dx / dist;
  const uy = dy / dist;
  const uz = dz / dist;
  const q = queriesFor(data);
  const origin = new THREE.Vector3(a.x + ux * 1.2, a.y + uy * 1.2, a.z + uz * 1.2);
  const end = new THREE.Vector3(b.x - ux * 0.6, b.y - uy * 0.6, b.z - uz * 0.6);
  return !q.line(origin, end);
}

export const PHARAOH_RIDGE_POINTS: {id: string; x: number; z: number; label: string}[] = [
  {id: 'ridge-quarry-west', x: 300, z: 350, label: '采石场西缘沙脊'},
  {id: 'ridge-bazaar-west', x: 275, z: 425, label: '集市西缘沙脊'},
  {id: 'ridge-bazaar-mid', x: 450, z: 400, label: '集市中脊'},
  {id: 'ridge-bazaar-east', x: 725, z: 325, label: '集市东沙脊'},
  {id: 'ridge-south', x: 520, z: 205, label: '南中沙脊'},
  {id: 'ridge-east', x: 690, z: 400, label: '东侧沙脊'},
  {id: 'ridge-south-c', x: 500, z: 350, label: '集南沙脊'},
  {id: 'ridge-bn', x: 610, z: 585, label: '狮身东沙脊'},
  {id: 'ridge-bw', x: 340, z: 555, label: '狮身西沙脊'},
  {id: 'ridge-north', x: 550, z: 600, label: '北中沙脊'},
];

const OPEN_SITE_TARGETS: Record<string, Vec2[]> = {
  C: [[475, 395], [475, 470], [420, 395]],
  D: [[175, 290], [210, 310], [150, 330]],
  E: [[350, 105], [350, 140], [300, 130]],
  F: [[650, 220], [650, 70], [650, 160]],
  G: [[210, 420], [250, 420], [180, 450]],
};

/** 室内点的入口/前庭：只作为“地形是否挡住门口”的证据，不计入露天据点控制数。 */
const ENTRANCE_TARGETS: Record<string, Vec2[]> = {
  A: [[190, 470], [50, 607], [330, 610]],
  B: [[380, 640], [460, 608], [540, 640], [460, 672]],
};

function eye(x: number, z: number): number {
  return pharaohHeight(x, z) + 1.7;
}

function targetVisible(data: TerrainData, from: LosPoint, points: Vec2[]): boolean {
  return points.some(([x, z]) => losVisible(data, from, {id: 'target', label: 'target', x, z, y: eye(x, z)}));
}

export function pharaohLosReport(data: TerrainData, map: MapDef): PharaohLosReport {
  const ridges: RidgeLosRow[] = [];
  for (const ridge of PHARAOH_RIDGE_POINTS) {
    const ground = pharaohHeight(ridge.x, ridge.z);
    const from: LosPoint = {id: ridge.id, label: ridge.label, x: ridge.x, z: ridge.z, y: ground + 1.7};
    const siteHits: Record<string, boolean> = {};
    const openSites: string[] = [];
    for (const [site, targets] of Object.entries(OPEN_SITE_TARGETS)) {
      const visible = targetVisible(data, from, targets);
      siteHits[site] = visible;
      if (visible) openSites.push(site);
    }
    const entrances: Record<string, boolean> = {};
    for (const [site, targets] of Object.entries(ENTRANCE_TARGETS)) entrances[site] = targetVisible(data, from, targets);
    ridges.push({ridge: ridge.id, x: ridge.x, z: ridge.z, ground: Math.round(ground * 10) / 10, openSites, siteHits, entrances});
  }

  const siteCoverage: Record<string, number> = {};
  for (const site of Object.keys(OPEN_SITE_TARGETS)) {
    siteCoverage[site] = ridges.filter((r) => r.siteHits[site]).length;
  }
  const entranceCoverage: Record<string, number> = {};
  for (const site of Object.keys(ENTRANCE_TARGETS)) {
    entranceCoverage[site] = ridges.filter((r) => r.entrances[site]).length;
  }
  let maxOpenSitesPerRidge = 0;
  let worstRidge = '';
  for (const r of ridges) {
    if (r.openSites.length > maxOpenSitesPerRidge) {
      maxOpenSitesPerRidge = r.openSites.length;
      worstRidge = r.ridge;
    }
  }

  const routes: RouteExposureRow[] = [];
  for (const route of map.routes) {
    if (!['main', 'vehicle', 'flank'].includes(route.kind ?? 'main')) continue;
    const points: Vec2[] = [];
    for (let i = 1; i < route.points.length; i++) {
      const [ax, az] = route.points[i - 1];
      const [bx, bz] = route.points[i];
      const len = Math.hypot(bx - ax, bz - az);
      for (let d = 0; d <= len; d += 15) {
        const t = len > 0 ? d / len : 0;
        points.push([ax + (bx - ax) * t, az + (bz - az) * t]);
      }
    }
    let exposed = 0;
    for (const [x, z] of points) {
      const from: LosPoint = {id: 'route', label: 'route', x, z, y: eye(x, z)};
      let seen = 0;
      for (const r of ridges) {
        if (losVisible(data, from, {id: r.ridge, label: r.ridge, x: r.x, z: r.z, y: r.ground + 1.7})) seen++;
      }
      // “被高地完全压制”= 同一点同时被 ≥3 个中央脊点通视；1–2 个脊点算周期性暴露。
      if (seen >= 3) exposed++;
    }
    routes.push({
      route: `${route.team} · ${route.label}`,
      team: route.team,
      samples: points.length,
      exposed,
      exposurePct: points.length ? Math.round((exposed / points.length) * 1000) / 10 : 0,
    });
  }

  const failures: string[] = [];
  for (const r of ridges) {
    if (r.openSites.length > 2) failures.push(`${r.ridge} controls ${r.openSites.join('/')} (${r.openSites.length} > 2)`);
  }
  for (const [site, count] of Object.entries(siteCoverage)) {
    if (count === 0) failures.push(`${site} has no central ridge with line of sight to its engagement area`);
  }
  return {
    ridges,
    siteCoverage,
    entranceCoverage,
    maxOpenSitesPerRidge,
    worstRidge,
    routes,
    failures,
  };
}

export default pharaohLosReport;
