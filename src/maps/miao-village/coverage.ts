/**
 * 千户苗寨 · 可活动面积统计（0.5 m 栅格，可达性 BFS + 去重 union）。
 *
 * 口径：
 * - 从双方出生区出发，0.5 m 栅格四邻 BFS；单步高差 ≤ 1.05 m（引擎 MAX_STEP），
 *   且该格不是纯装饰高山（h > 40 m）——山体本身靠连续陡坡/林带阻止进入，
 *   不是空气墙。
 * - 陆地按地形顶面计；室内只按“底层投影”计一次（138 栋 footprint union）。
 * - 桥面按真实桥体矩形计一次。
 * - 水域按 waterVolumes 的 surfaceY 范围计一次（河/梯田/渡船坞）。
 * - 同一水平位置只计一次；不重复累加楼层。
 */
import { miaoHeight } from './height';
import { MIAO_PLOTS, MIAO_PADDIES, MIAO_SPAWNS, MIAO_PIG_FARM, MIAO_THEATER } from './layout';
import { MIAO_BRIDGES, MIAO_FERRY_BASINS, riverPolygon } from './river';

const SIZE = 500;
const CELL = 0.5;
export interface CoverageStats {
  size: number;
  cell: number;
  totalArea: number;
  landArea: number;
  waterArea: number;
  buildingArea: number;
  bridgeArea: number;
  playableArea: number;
  playablePct: number;
  landPct: number;
  waterPct: number;
  reachableCells: number;
  mountainCells: number;
  districts: { id: string; name: string; area: number; pct: number }[];
}

const insidePoly = (x: number, z: number, poly: [number, number][]) => {
  let on = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) on = !on;
  }
  return on;
};

const riverPoly = riverPolygon();
const basins = MIAO_FERRY_BASINS;
const paddyRects = MIAO_PADDIES.map((p) => ({ x0: p.x - p.w / 2, z0: p.z - p.d / 2, x1: p.x + p.w / 2, z1: p.z + p.d / 2 }));

export function miaoCoverage(cell = CELL): CoverageStats {
  const n = Math.round(SIZE / cell);
  const reachable = new Uint8Array(n * n);
  const water = new Uint8Array(n * n);
  const height = new Float32Array(n * n);
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) height[iz * n + ix] = miaoHeight((ix + 0.5) * cell, (iz + 0.5) * cell);
  }
  // water mask (volume surfaces)
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const x = (ix + 0.5) * cell, z = (iz + 0.5) * cell;
      if (insidePoly(x, z, riverPoly) || paddyRects.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) || basins.some((b) => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1)) water[iz * n + ix] = 1;
    }
  }
  // BFS from spawning zones (whole 64×56 pad is safe ground)
  const queue = new Int32Array(n * n);
  let head = 0, tail = 0;
  const push = (ix: number, iz: number) => {
    if (ix < 0 || iz < 0 || ix >= n || iz >= n) return;
    const k = iz * n + ix;
    if (reachable[k]) return;
    if (height[k] > 40 || water[k]) return;
    reachable[k] = 1;
    queue[tail++] = k;
  };
  for (const spawn of MIAO_SPAWNS) {
    for (let z = spawn.y; z <= spawn.y + spawn.d; z += cell) {
      for (let x = spawn.x; x <= spawn.x + spawn.w; x += cell) push(Math.floor(x / cell), Math.floor(z / cell));
    }
  }
  const step = 1.05;
  while (head < tail) {
    const k = queue[head++];
    const ix = k % n, iz = Math.floor(k / n), h = height[k];
    for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = ix + dx, nz = iz + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const nk = nz * n + nx;
      if (reachable[nk] || water[nk] || height[nk] > 40 || Math.abs(height[nk] - h) > step) continue;
      reachable[nk] = 1;
      queue[tail++] = nk;
    }
  }
  // bridges: real deck rectangles
  const bridge = new Uint8Array(n * n);
  for (const b of MIAO_BRIDGES) {
    for (let z = b.z - b.width / 2; z <= b.z + b.width / 2; z += cell) {
      for (let x = b.x0; x <= b.x1; x += cell) {
        const ix = Math.floor(x / cell), iz = Math.floor(z / cell);
        bridge[iz * n + ix] = 1;
      }
    }
  }
  // building ground projections (count once, regardless of floor count)
  const building = new Uint8Array(n * n);
  for (const p of MIAO_PLOTS) {
    const c = Math.cos((p.yaw * Math.PI) / 180), s = Math.sin((p.yaw * Math.PI) / 180);
    for (let v = -p.d / 2; v <= p.d / 2; v += cell) {
      for (let u = -p.w / 2; u <= p.w / 2; u += cell) {
        const x = p.x + u * c - v * s, z = p.z + u * s + v * c;
        const ix = Math.floor(x / cell), iz = Math.floor(z / cell);
        if (ix >= 0 && iz >= 0 && ix < n && iz < n) building[iz * n + ix] = 1;
      }
    }
  }
  let land = 0, wet = 0, build = 0, bridgeCells = 0, play = 0, mountain = 0;
  let districtA = 0, districtB = 0, districtC = 0, districtD = 0, districtE = 0, districtO = 0;
  const districtOf = (x: number, z: number) => {
    if (x >= 90 && x <= 230 && z >= 120 && z <= 215) return 'A';
    if (x >= 285 && x <= 430 && z >= 55 && z <= 210) return 'B';
    if (x >= 155 && x <= 310 && z >= 185 && z <= 345) return 'C';
    if (x >= 80 && x <= 230 && z >= 315 && z <= 470) return 'D';
    if (x >= 320 && x <= 450 && z >= 285 && z <= 405) return 'E';
    return 'O';
  };
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const k = iz * n + ix;
      const x = (ix + 0.5) * cell, z = (iz + 0.5) * cell;
      let counted = false;
      if (water[k]) { wet++; counted = true; }
      else if (reachable[k]) { land++; counted = true; }
      else if (height[k] > 40) { mountain++; }
      if (bridge[k]) { bridgeCells++; counted = true; }
      if (building[k]) { build++; counted = true; }
      if (!counted) continue;
      play++;
      switch (districtOf(x, z)) {
        case 'A': districtA++; break;
        case 'B': districtB++; break;
        case 'C': districtC++; break;
        case 'D': districtD++; break;
        case 'E': districtE++; break;
        default: districtO++;
      }
    }
  }
  const a = cell * cell;
  const totalArea = SIZE * SIZE;
  const landArea = Math.round(land * a);
  const waterArea = Math.round(wet * a);
  const buildingArea = Math.round(build * a);
  const bridgeArea = Math.round(bridgeCells * a);
  const playableArea = Math.round(play * a);
  const total = n * n;
  const pct = (v: number) => Math.round((v / total) * 1000) / 10;
  return {
    size: SIZE, cell, totalArea,
    landArea, waterArea, buildingArea, bridgeArea, playableArea,
    playablePct: pct(play), landPct: pct(land), waterPct: pct(wet),
    reachableCells: play, mountainCells: mountain,
    districts: [
      { id: 'A', name: '游方市集', area: Math.round(districtA * a), pct: pct(districtA) },
      { id: 'B', name: '田园打谷场', area: Math.round(districtB * a), pct: pct(districtB) },
      { id: 'C', name: '河岸与芦笙场', area: Math.round(districtC * a), pct: pct(districtC) },
      { id: 'D', name: '鼓藏堂坡地', area: Math.round(districtD * a), pct: pct(districtD) },
      { id: 'E', name: '剧场片区', area: Math.round(districtE * a), pct: pct(districtE) },
      { id: 'O', name: '寨边/外围', area: Math.round(districtO * a), pct: pct(districtO) },
    ],
  };
}

/** Pig farm/theater are authored public ground even where the terrain is steep; used in tests. */
export const MIAO_PUBLIC_GROUND = [
  { id: 'pig-farm', x: MIAO_PIG_FARM.x, z: MIAO_PIG_FARM.z, w: MIAO_PIG_FARM.w, d: MIAO_PIG_FARM.d },
  { id: 'theater', x: MIAO_THEATER.x, z: MIAO_THEATER.z, w: 64, d: 44 },
] as const;
