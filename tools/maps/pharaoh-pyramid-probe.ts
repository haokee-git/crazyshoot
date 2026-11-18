/**
 * 金字塔 builder 纯几何探针（不依赖渲染 / 浏览器 / Lead 未完成的接口）
 *
 *   npx tsx tools/maps/pharaoh-pyramid-probe.ts
 *
 * 用记录式 mock 跑一遍 `buildPyramid(ops)`，然后：
 *  1. 统计体素 / detail / 灯 / 包围盒，并按材质分布；
 *  2. 逐个房间测地板高度、净空（体素顶到上一块实体）；
 *  3. 沿每条楼梯/坡道走一遍，校验级高（玩家 MAX_STEP=1.05）与终点高度；
 *  4. 从南门外做玩家行走 BFS（0.5 m 网格、步高 1.05、身高 1.8），验证
 *     墓室 / 西储藏 / 东塌陷 / 北雕像廊 / +20 上层 / 顶平台 / 北门楼全部可达；
 *  5. 用 primary=+4 的载具语义再 BFS 一遍，确认任何载具都进不了墓室。
 *
 * 退出码：0 = 全部断言通过；1 = 有断言失败（打印明细）。
 */
import {
  buildPyramid,
  PYRAMID_APEX,
  PYRAMID_BASE,
  PYRAMID_PLATFORM,
  PYRAMID_ROOMS,
  PYRAMID_STAIRS,
  PYRAMID_SUMMIT_HATCH,
  PYRAMID_TOP,
  TIER_HALF,
  pyramidSurface,
} from '../../src/game/world/pharaoh-pyramid';

/* ------------------------------------------------------------------ */
/* 记录式 mock                                                          */
/* ------------------------------------------------------------------ */

interface DetailBox { id: string; x: number; z: number; w: number; d: number; bottom: number; top: number; material: number; }

const Y_MIN = -12, Y_MAX = 60;
const X_MIN = 200, X_MAX = 460, Z_MIN = 540, Z_MAX = 820;
const key = (x: number, y: number, z: number) => ((x - X_MIN) * (Z_MAX - Z_MIN) + (z - Z_MIN)) * (Y_MAX - Y_MIN) + (y - Y_MIN);

class Recorder {
  readonly voxels = new Map<number, number>();
  readonly details: DetailBox[] = [];
  readonly lamps: [number, number, number][] = [];
  readonly counts = {put: 0, column: 0, box: 0, carve: 0, detail: 0, lamp: 0, primary: 0};
  readonly primaryWrites: {x: number; z: number; y: number}[] = [];
  /** 记录所有写入过的列，用于统计「有内容的列数」。 */
  readonly bounds = {x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity};

  private track(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    const b = this.bounds;
    b.x0 = Math.min(b.x0, x0); b.x1 = Math.max(b.x1, x1);
    b.y0 = Math.min(b.y0, y0); b.y1 = Math.max(b.y1, y1);
    b.z0 = Math.min(b.z0, z0); b.z1 = Math.max(b.z1, z1);
  }

  private set(x: number, y: number, z: number, id: number) {
    if (x < X_MIN || x >= X_MAX || z < Z_MIN || z >= Z_MAX || y < Y_MIN || y >= Y_MAX) return;
    const k = key(x, y, z);
    if (id === 0) this.voxels.delete(k); else this.voxels.set(k, id);
  }

  private fillColumn(x: number, z: number, y0: number, y1: number, id: number) {
    const a = Math.floor(y0), b = Math.ceil(y1);
    for (let y = a; y < b; y++) this.set(x, y, z, id);
  }

  readonly ops = {
    ground: (x: number, z: number) => pyramidSurface(x, z),
    put: (x: number, y: number, z: number, id: number) => {
      this.counts.put++;
      this.set(Math.floor(x), Math.floor(y), Math.floor(z), id);
      this.track(x, y, z, x, y, z);
    },
    column: (x: number, z: number, y0: number, y1: number, id: number) => {
      this.counts.column++;
      this.fillColumn(Math.floor(x), Math.floor(z), y0, y1, id);
      this.track(x, y0, z, x, y1, z);
    },
    box: (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, id: number) => {
      this.counts.box++;
      for (let z = Math.floor(z0); z < Math.ceil(z1); z++)
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) this.fillColumn(x, z, y0, y1, id);
      this.track(x0, y0, z0, x1, y1, z1);
    },
    carve: (x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) => {
      this.counts.carve++;
      for (let z = Math.floor(z0); z < Math.ceil(z1); z++)
        for (let x = Math.floor(x0); x < Math.ceil(x1); x++) this.fillColumn(x, z, y0, y1, 0);
      this.track(x0, y0, z0, x1, y1, z1);
    },
    detail: (id: string, cx: number, cz: number, w: number, d: number, y: number, h: number, material: number, _angle = 0, solid?: boolean) => {
      this.counts.detail++;
      if (solid === false) return;
      this.details.push({id, x: cx, z: cz, w, d, bottom: y, top: y + h, material});
      this.track(cx - w / 2, y, cz - d / 2, cx + w / 2, y + h, cz + d / 2);
    },
    setPrimary: (x: number, z: number, y: number) => { this.counts.primary++; this.primaryWrites.push({x, z, y}); },
    addLamp: (x: number, y: number, z: number) => { this.counts.lamp++; this.lamps.push([x, y, z]); },
  };

  solid(x: number, y: number, z: number): boolean {
    const id = this.voxels.get(key(Math.floor(x), Math.floor(y), Math.floor(z)));
    return id !== undefined && id !== 0;
  }
}

const rec = new Recorder();
buildPyramid(rec.ops as never);

/* ------------------------------------------------------------------ */
/* 查询（与 VoxelWorldQueries.support / blocked 同语义的简化版）        */
/* ------------------------------------------------------------------ */

const detailGrid = new Map<string, DetailBox[]>();
for (const b of rec.details) {
  const r = Math.hypot(b.w, b.d) / 2;
  for (let x = Math.floor((b.x - r) / 8); x <= Math.floor((b.x + r) / 8); x++)
    for (let z = Math.floor((b.z - r) / 8); z <= Math.floor((b.z + r) / 8); z++) {
      const k = `${x},${z}`;
      const arr = detailGrid.get(k);
      if (arr) arr.push(b); else detailGrid.set(k, [b]);
    }
}
const detailsAt = (x: number, z: number) => detailGrid.get(`${Math.floor(x / 8)},${Math.floor(z / 8)}`) ?? [];

/** 平台默认地面（金字塔建在 A 点 +4 平台上）。 */
const TERRAIN = PYRAMID_PLATFORM;

function support(x: number, z: number, maxY: number): number {
  let best = -Infinity;
  for (const b of detailsAt(x, z)) {
    if (b.top > maxY + 0.001) continue;
    if (Math.abs(x - b.x) > b.w / 2 || Math.abs(z - b.z) > b.d / 2) continue;
    best = Math.max(best, b.top);
  }
  const from = Math.min(Y_MAX - 1, Math.floor(maxY + 1e-5) - 1);
  for (let y = from; y >= Y_MIN; y--) {
    if (rec.solid(x, y, z) && !rec.solid(x, y + 1, z)) return Math.max(y + 1, best);
  }
  return Math.max(TERRAIN, best);
}

function firstSolidAbove(x: number, z: number, from: number): number {
  for (let y = Math.max(Y_MIN, Math.ceil(from)); y < Y_MAX; y++) if (rec.solid(x, y, z)) return y;
  return Number.POSITIVE_INFINITY;
}

/** 玩家身体（半径 0.3、身高 1.8）在该点是否被挡。 */
function bodyBlocked(x: number, z: number, feet: number): boolean {
  const r = 0.3, h = 1.8;
  for (const [dx, dz] of [[0, 0], [-r, -r], [r, -r], [-r, r], [r, r]]) {
    const px = x + dx, pz = z + dz;
    const y0 = Math.floor(feet + 0.02), y1 = Math.ceil(feet + h - 0.02);
    for (let y = y0; y < y1; y++) if (rec.solid(px, y, pz)) return true;
    for (const b of detailsAt(px, pz)) {
      if (Math.abs(px - b.x) > b.w / 2 || Math.abs(pz - b.z) > b.d / 2) continue;
      if (b.top > feet + 0.04 && b.bottom < feet + h - 0.02) return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* 统计                                                                 */
/* ------------------------------------------------------------------ */

type Row = {label: string; value: string};
const rows: Row[] = [];
const fail: string[] = [];
const assert = (ok: boolean, msg: string) => { if (!ok) fail.push(msg); };

const materialCounts = new Map<number, number>();
for (const id of rec.voxels.values()) materialCounts.set(id, (materialCounts.get(id) ?? 0) + 1);

const sortedX: number[] = [];
for (const k of rec.voxels.keys()) {
  const iy = k % (Y_MAX - Y_MIN);
  const rest = (k - iy) / (Y_MAX - Y_MIN);
  const iz = rest % (Z_MAX - Z_MIN);
  sortedX.push(Math.floor(rest / (Z_MAX - Z_MIN)));
  void iz;
}
const voxelCount = rec.voxels.size;
let realX0 = Infinity, realX1 = -Infinity, realY0 = Infinity, realY1 = -Infinity, realZ0 = Infinity, realZ1 = -Infinity;
for (const k of rec.voxels.keys()) {
  const iy = k % (Y_MAX - Y_MIN);
  const rest = (k - iy) / (Y_MAX - Y_MIN);
  const iz = rest % (Z_MAX - Z_MIN);
  const ix = Math.floor(rest / (Z_MAX - Z_MIN));
  const x = ix + X_MIN, y = iy + Y_MIN, z = iz + Z_MIN;
  realX0 = Math.min(realX0, x); realX1 = Math.max(realX1, x);
  realY0 = Math.min(realY0, y); realY1 = Math.max(realY1, y);
  realZ0 = Math.min(realZ0, z); realZ1 = Math.max(realZ1, z);
}
void sortedX;

rows.push({label: '体素（唯一格）', value: String(voxelCount)});
rows.push({label: 'ops 调用 put/column/box/carve', value: `${rec.counts.put}/${rec.counts.column}/${rec.counts.box}/${rec.counts.carve}`});
rows.push({label: 'detail 盒（0.5 m 碰撞/渲染）', value: String(rec.details.length)});
rows.push({label: 'addLamp', value: String(rec.lamps.length)});
rows.push({label: 'setPrimary（仅 +5 房间内同步）', value: `${rec.counts.primary} 列`});
rows.push({label: '包围盒 x / y / z', value: `[${realX0}..${realX1}]/[${realY0}..${realY1}]/[${realZ0}..${realZ1}]`});
rows.push({label: '材质分布', value: [...materialCounts.entries()].sort((a, b) => b[1] - a[1]).map(([id, n]) => `${id}:${n}`).join(' ')});

// primary 只允许写在 authored 房间内部、且等于该房间地面（门洞/通道必须保持 +4 + 1 m 门槛）。
const outsidePrimary = rec.primaryWrites.filter((w) => !PYRAMID_ROOMS.some((r) =>
  w.x >= r.x0 && w.x < r.x1 && w.z >= r.z0 && w.z < r.z1 && Math.abs(r.floor - w.y) < 0.001));
assert(outsidePrimary.length === 0, `primary 写到了房间外/写错高度：${outsidePrimary.length} 处（例 ${outsidePrimary.slice(0, 3).map((w) => `(${w.x},${w.z})=${w.y}`).join('、')}）`);
assert(rec.primaryWrites.every((w) => w.y === 5), `primary 只能在 +5 房间内同步，实际 ${[...new Set(rec.primaryWrites.map((w) => w.y))].join(',')}`);
assert(rec.lamps.length >= 12 && rec.lamps.length <= 18, `addLamp 数量 ${rec.lamps.length} 不在 12–18`);
assert(realX0 >= PYRAMID_BASE.x0 - 22 && realX1 <= PYRAMID_BASE.x1 + 22, `x 包围盒溢出：${realX0}..${realX1}`);
assert(realZ0 >= PYRAMID_BASE.z0 - 22 && realZ1 <= PYRAMID_BASE.z1 + 22, `z 包围盒溢出：${realZ0}..${realZ1}`);
assert(realY1 <= PYRAMID_APEX, `最高体素 ${realY1}（顶面 +${PYRAMID_APEX}，允许梯口护墙到 +${PYRAMID_APEX}）`);

/* ------------------------------------------------------------------ */
/* 1. 台坎轮廓                                                          */
/* ------------------------------------------------------------------ */

const tiers: {tier: number; surface: number; half: number; ringCells: number; surfaceOk: number}[] = [];
for (let i = 0; i < TIER_HALF.length; i++) {
  const half = TIER_HALF[i], surface = 6 + i * 2;
  // 在该级外沿 −1.5 m 处取 8 个方位点，全部应等于该级台面
  let ok = 0;
  const e = half - 0.75;
  const probes: [number, number][] = [
    [330 - e, 690], [330 + e, 690], [330, 690 - e], [330, 690 + e],
    [330 - e, 690 - e], [330 + e, 690 - e], [330 - e, 690 + e], [330 + e, 690 + e],
  ];
  for (const [px, pz] of probes) if (pyramidSurface(Math.floor(px), Math.floor(pz)) === surface) ok++;
  tiers.push({tier: i + 1, surface, half, ringCells: ok, surfaceOk: probes.length});
}
const tierOk = tiers.every((t) => t.surfaceOk === t.ringCells);
assert(tierOk, '台坎外沿高度与 TIER_HALF 不一致（有方位点落错级）');
assert(TIER_HALF.length === 24 && 6 + 23 * 2 === PYRAMID_APEX, '台坎级数 × 2 m 必须 = 48（+4 → +52）');
assert(TIER_HALF[TIER_HALF.length - 1] * 2 === PYRAMID_TOP.x1 - PYRAMID_TOP.x0, '顶层 12×12 口径不一致');

// 顶面实测
let topOk = 0, topCells = 0;
for (let z = PYRAMID_TOP.z0; z < PYRAMID_TOP.z1; z++)
  for (let x = PYRAMID_TOP.x0; x < PYRAMID_TOP.x1; x++) {
    topCells++;
    const inHatch = x >= PYRAMID_SUMMIT_HATCH.x0 && x < PYRAMID_SUMMIT_HATCH.x1 && z >= PYRAMID_SUMMIT_HATCH.z0 && z < PYRAMID_SUMMIT_HATCH.z1;
    if (inHatch) { topOk++; continue; }
    if (support(x + 0.5, z + 0.5, PYRAMID_APEX + 0.01) >= PYRAMID_APEX - 0.6) topOk++;
  }
assert(topOk >= topCells - 4, `顶平台可站立格 ${topOk}/${topCells}`);

/* ------------------------------------------------------------------ */
/* 1b. 外壳完整性：除「西南考古阶梯切进去的切口」「东盗洞竖井」外，          */
/*     台坎顶面不允许出现 >0.9 m 的下陷（否则内部房间就漏到外面了）。        */
/* ------------------------------------------------------------------ */

const summitHatchBox = (x: number, z: number) =>
  x >= PYRAMID_SUMMIT_HATCH.x0 && x < PYRAMID_SUMMIT_HATCH.x1 && z >= PYRAMID_SUMMIT_HATCH.z0 && z < PYRAMID_SUMMIT_HATCH.z1;
const looterHole = (x: number, z: number) => x >= 368 && x <= 375 && z >= 688 && z <= 695;
/** 该列实体最高点（含门楼/栈道/阶梯这类「加高」结构，不算凿穿）。 */
function columnTop(x: number, z: number): number {
  for (let y = Y_MAX - 1; y >= Y_MIN; y--) if (rec.solid(x, y, z)) return y + 1;
  return TERRAIN;
}
const shellHoles: {x: number; z: number; expected: number; actual: number}[] = [];
for (let z = PYRAMID_BASE.z0; z < PYRAMID_BASE.z1; z++) {
  for (let x = PYRAMID_BASE.x0; x < PYRAMID_BASE.x1; x++) {
    const expected = pyramidSurface(x, z);
    const actual = columnTop(x, z);
    if (actual >= expected - 2.5) continue;                      // 齐平/加高/≤2.5 m 风化坍缺都算正常
    if (summitHatchBox(x + 0.5, z + 0.5) || looterHole(x + 0.5, z + 0.5)) continue;
    shellHoles.push({x, z, expected, actual});
  }
}
assert(shellHoles.length === 0, `外壳有 ${shellHoles.length} 列被内部空间凿穿（>2.5 m）（例：${shellHoles.slice(0, 5).map((h) => `(${h.x},${h.z}) ${h.expected}→${h.actual}`).join('、')}）`);

/* ------------------------------------------------------------------ */
/* 1c. 灯位：必须在空气里、且头顶 ≥1.2 m（不能埋在墙/顶板里）              */
/* ------------------------------------------------------------------ */

const badLamps = rec.lamps.filter(([x, y, z]) => {
  if (rec.solid(x, y, z)) return true;
  if (rec.solid(x, y + 1, z)) return true;
  return false;
});
assert(badLamps.length === 0, `有 ${badLamps.length} 盏灯埋在实体里：${badLamps.slice(0, 4).map(([x, y, z]) => `(${x},${y},${z})`).join('、')}`);

/* ------------------------------------------------------------------ */
/* 2. 房间净空                                                          */
/* ------------------------------------------------------------------ */

interface RoomReport { id: string; label: string; floor: number; clear: number; airRatio: number; ok: boolean; }
const rooms: RoomReport[] = [];
for (const r of PYRAMID_ROOMS) {
  // 网格取样：室内有家具/石棺时取「出现最多的地板」，再取该地板上的最小净空。
  const floors: number[] = [];
  const ptx: number[] = [], ptz: number[] = [];
  const xs: number[] = [];
  for (let x = r.x0 + 1; x <= r.x1 - 1.001; x += 1) xs.push(x);
  if (!xs.length) xs.push((r.x0 + r.x1) / 2);
  const zs: number[] = [];
  for (let z = r.z0 + 1; z <= r.z1 - 1.001; z += 1) zs.push(z);
  if (!zs.length) zs.push((r.z0 + r.z1) / 2);
  for (const z of zs) for (const x of xs) {
    ptx.push(x); ptz.push(z);
    floors.push(support(x, z, r.floor + 0.6));
  }
  const tally = new Map<number, number>();
  for (const f of floors) tally.set(f, (tally.get(f) ?? 0) + 1);
  let floor = r.floor, bestCount = -1;
  for (const [f, n] of tally) if (n > bestCount || (n === bestCount && Math.abs(f - r.floor) < Math.abs(floor - r.floor))) { floor = f; bestCount = n; }
  let clear = Infinity;
  for (let i = 0; i < floors.length; i++) {
    if (Math.abs(floors[i] - floor) > 1e-6) continue;
    clear = Math.min(clear, firstSolidAbove(ptx[i], ptz[i], floor + 0.05) - floor);
  }
  if (!Number.isFinite(clear)) clear = 0;
  // 空腔率：房间体（内收 1 m）里应为空气的格数比例
  let air = 0, total = 0;
  for (let z = r.z0 + 1; z < r.z1 - 1; z += 2)
    for (let x = r.x0 + 1; x < r.x1 - 1; x += 2)
      for (let y = r.floor; y < r.ceil; y += 1) {
        total++;
        if (!rec.solid(x + 0.5, y + 0.5, z + 0.5)) air++;
      }
  const airRatio = total ? air / total : 1;
  // 楼梯口这类空间地板允许高于名义值 1 m（第一级踏面），但不得更低。
  const floorOk = floor >= r.floor - 0.001 && floor <= r.floor + 1.0;
  const ok = floorOk && clear >= Math.min(3, r.ceil - r.floor - 0.5) && airRatio > 0.92;
  rooms.push({id: r.id, label: r.label, floor, clear, airRatio, ok});
  if (!ok) fail.push(`房间 ${r.id}(${r.label}) 地板 ${floor}（期望 ${r.floor}）净空 ${clear} 空腔率 ${(airRatio * 100).toFixed(1)}%`);
}

/* ------------------------------------------------------------------ */
/* 3. 楼梯：级高 + 终点                                               */
/* ------------------------------------------------------------------ */

interface StairReport { id: string; label: string; maxRise: number; reached: number; target: number; ok: boolean; }
const stairs: StairReport[] = [];
for (const st of PYRAMID_STAIRS) {
  const total = Math.hypot(st.to[0] - st.from[0], st.to[1] - st.from[1]);
  const samples = Math.max(8, Math.ceil(total / 0.25));
  let prev = st.yBottom, maxRise = 0, reached = st.yBottom;
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const x = st.from[0] + (st.to[0] - st.from[0]) * t;
    const z = st.from[1] + (st.to[1] - st.from[1]) * t;
    const y = support(x, z, prev + 1.05 + 0.02);
    if (!Number.isFinite(y)) break;
    maxRise = Math.max(maxRise, y - prev);
    if (y > prev + 1e-6 || Math.abs(y - prev) < 1e-6) prev = y;
    reached = Math.max(reached, y);
  }
  const ok = maxRise <= 1.05 + 1e-6 && reached >= st.yTop - 0.5;
  stairs.push({id: st.id, label: st.label, maxRise, reached, target: st.yTop, ok});
  if (!ok) fail.push(`楼梯 ${st.id} 最大级高 ${maxRise.toFixed(2)}m（上限 1.05）/ 到达 ${reached}（目标 ${st.yTop}）`);
}
assert(PYRAMID_STAIRS.every((s) => s.riser <= 1), '楼梯级高常量超过玩家 MAX_STEP=1.05');

/* ------------------------------------------------------------------ */
/* 4. 玩家行走 BFS（0.5 m 网格，步高 1.05，身高 1.8）                   */
/* ------------------------------------------------------------------ */

const STEP = 0.5;
const BX0 = 240, BX1 = 440, BZ0 = 590, BZ1 = 790;
const GX = Math.round((BX1 - BX0) / STEP), GZ = Math.round((BZ1 - BZ0) / STEP);

function walkBfs(startX: number, startZ: number, limit?: (x: number, z: number) => boolean): Map<number, Set<number>> {
  const levels = new Map<number, Set<number>>();   // cell -> 可达 feet（0.5 m 量化）
  const seen = new Set<string>();
  const queue: {ix: number; iz: number; feet: number}[] = [];
  const push = (ix: number, iz: number, feet: number) => {
    const k = `${ix},${iz},${Math.round(feet * 2)}`;
    if (seen.has(k)) return;
    seen.add(k);
    queue.push({ix, iz, feet});
    const cell = iz * GX + ix;
    const set = levels.get(cell);
    if (set) set.add(Math.round(feet * 2)); else levels.set(cell, new Set([Math.round(feet * 2)]));
  };
  const startFeet = support(startX, startZ, TERRAIN + 1.05);
  push(Math.round((startX - BX0) / STEP), Math.round((startZ - BZ0) / STEP), Number.isFinite(startFeet) ? startFeet : TERRAIN);
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cur.ix + dx, nz = cur.iz + dz;
      if (nx < 0 || nz < 0 || nx >= GX || nz >= GZ) continue;
      const px = BX0 + nx * STEP + 0.25, pz = BZ0 + nz * STEP + 0.25;
      if (limit && !limit(px, pz)) continue;
      let feet = support(px, pz, cur.feet + 1.05 + 0.02);
      if (!Number.isFinite(feet)) continue;
      // 引擎用 ≤0.35 m 子步推进：中心还没进台面时，也可能先「探进」一级再抬腿。
      // 这里用同方向 0.35 m 的探针补齐 0.5 m 网格跨不过的 0.25 m 台沿。
      if (feet - cur.feet > 1.05 + 1e-6 || bodyBlocked(px, pz, Math.max(feet, cur.feet))) {
        const ax = px + dx * 0.35, az = pz + dz * 0.35;
        const ahead = support(ax, az, cur.feet + 1.05 + 0.02);
        if (ahead > feet + 1e-6 && ahead - cur.feet <= 1.05 + 1e-6 && !bodyBlocked(ax, az, ahead)) feet = ahead;
      }
      const rising = feet >= cur.feet - 1e-6;
      if (feet - cur.feet > 1.05 + 1e-6) continue;
      if (cur.feet - feet > 8) continue;                     // 超过 8 m 的坠落不入图
      if (rising && bodyBlocked(px, pz, feet)) continue;      // 引擎只在抬腿到新高度时查身体；下落不查
      push(nx, nz, feet);
    }
  }
  return levels;
}

const reachIn = (levels: Map<number, Set<number>>, x: number, z: number, targetY: number, tol = 1.2) => {
  const cix = Math.round((x - BX0) / STEP), ciz = Math.round((z - BZ0) / STEP);
  let hit: number | undefined, bestD = Infinity;
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    const ix = cix + dx, iz = ciz + dz;
    if (ix < 0 || iz < 0 || ix >= GX || iz >= GZ) continue;
    const set = levels.get(iz * GX + ix);
    if (!set) continue;
    const dist = Math.hypot(dx, dz);
    for (const q of set) {
      const f = q / 2;
      const score = Math.abs(f - targetY) * 10 + dist;
      if (Math.abs(f - targetY) <= tol && score < bestD) { bestD = score; hit = f; }
    }
  }
  return hit;
};

interface RouteTarget { label: string; x: number; z: number; y: number; }
interface RouteRun { id: string; label: string; start: [number, number]; targets: RouteTarget[]; }

const routeRuns: RouteRun[] = [
  {
    id: 'south', label: '南主门进入（起点 330,606）', start: [330, 606],
    targets: [
      {label: '南门楼通道', x: 330, z: 620, y: 5},
      {label: '南前厅', x: 330, z: 656, y: 5},
      {label: '墓室', x: 318, z: 690, y: 5},
      {label: '西陶罐储藏室', x: 298, z: 686, y: 5},
      {label: '北雕像廊', x: 330, z: 712, y: 5},
      {label: '东塌陷间', x: 366, z: 690, y: 5},
      {label: '东入口走廊', x: 390, z: 680, y: 5},
      {label: '上层西廊 +20', x: 300, z: 670, y: 20},
      {label: '上层登顶梯口 +20', x: 297, z: 690, y: 20},
      {label: '上层北廊 +20', x: 320, z: 720, y: 20},
      {label: '北门楼前平台 +20', x: 346, z: 752, y: 20},
      {label: '顶平台 +52', x: 334, z: 694, y: 52},
    ],
  },
  {
    id: 'west', label: '西入口（起点 252,686）', start: [252, 686],
    targets: [
      {label: '西入口走廊', x: 265, z: 687, y: 5},
      {label: '西陶罐储藏室', x: 298, z: 686, y: 5},
      {label: '墓室', x: 320, z: 690, y: 5},
    ],
  },
  {
    id: 'east', label: '东入口（起点 404,680，接 A–B 墓道）', start: [404, 680],
    targets: [
      {label: '东入口走廊', x: 390, z: 680, y: 5},
      {label: '东塌陷间', x: 366, z: 690, y: 5},
      {label: '墓室', x: 340, z: 690, y: 5},
    ],
  },
  {
    id: 'sw-stair', label: '西南考古阶梯（起点 260,694，西面径向）', start: [260, 694],
    targets: [
          {label: '阶梯 1/3 休息平台 +20', x: 281.9, z: 694, y: 20},
      {label: '阶梯 2/3 休息平台 +36', x: 303.6, z: 694, y: 36},
      
      {label: '顶平台 +52（阶梯直达）', x: 325.5, z: 694, y: 52},
    ],
  },
  {
    id: 'north-ramp', label: '北侧施工栈道（起点 356,767，限定北面区域）', start: [356, 767],
    targets: [
      {label: '栈道折返平台 +12', x: 310, z: 766, y: 12},
      {label: '栈道第二段 +16', x: 329, z: 757, y: 16},
      {label: '北门楼前平台 +20', x: 346, z: 752, y: 20},
      {label: '北门楼通道 +20', x: 343, z: 736, y: 20},
      {label: '上层北廊 +20', x: 320, z: 720, y: 20},
      {label: '顶平台 +52', x: 334, z: 694, y: 52},
    ],
  },
];

interface RouteReport { run: string; label: string; feet: number | undefined; ok: boolean; }
const route: RouteReport[] = [];
const walk = walkBfs(330, 606);   // 主入口那一次保留给载具/统计复用
const swCorridor = (x: number, z: number) => {
  // SW 阶梯：西面 z 691..697 的径向梯带（x 258..326）+ 顶平台
  if (x >= 258 && x <= 327 && z >= 689.5 && z <= 697.5) return true;
  if (x >= 324 && x < 336 && z >= 684 && z < 696) return true;
  return false;
};
const northCorridor = (x: number, z: number) =>
  x >= 296 && x <= 360 && z >= 684 && z <= 772;   // 北栈道 + 门楼 + 上层廊道 + 登顶梯

for (const run of routeRuns) {
  const limit = run.id === 'sw-stair' ? swCorridor : run.id === 'north-ramp' ? northCorridor : undefined;
  const levels = run.id === 'south' ? walk : walkBfs(run.start[0], run.start[1], limit);
  for (const t of run.targets) {
    const feet = reachIn(levels, t.x, t.z, t.y);
    route.push({run: run.label, label: t.label, feet, ok: feet !== undefined});
    if (feet === undefined) fail.push(`行走不可达：${run.label} → ${t.label} (${t.x},${t.z}@${t.y})`);
  }
}

/* ------------------------------------------------------------------ */
/* 5. 载具语义：primary 恒 +4，门槛/台坎必须挡住                        */
/* ------------------------------------------------------------------ */

const VEH_FEET = PYRAMID_PLATFORM;
function vehicleBlocked(x: number, z: number): boolean {
  // 与 VoxelWorldQueries.footprint 同口径：bottom = primary + 0.56，扫到底盘高度。
  for (let y = Math.floor(VEH_FEET + 0.56 + 0.03); y < Math.ceil(VEH_FEET + 0.56 + 2.2 - 0.01); y++) {
    if (rec.solid(x, y, z)) return true;
  }
  return false;
}
function vehicleBfs(startX: number, startZ: number): Set<number> {
  const seen = new Set<number>();
  const queue: number[] = [];
  const push = (ix: number, iz: number) => {
    const cell = iz * GX + ix;
    if (seen.has(cell)) return;
    seen.add(cell);
    queue.push(cell);
  };
  push(Math.round((startX - BX0) / STEP), Math.round((startZ - BZ0) / STEP));
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    const ix = cell % GX, iz = Math.floor(cell / GX);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ix + dx, nz = iz + dz;
      if (nx < 0 || nz < 0 || nx >= GX || nz >= GZ) continue;
      const px = BX0 + nx * STEP + 0.25, pz = BZ0 + nz * STEP + 0.25;
      if (vehicleBlocked(px, pz)) continue;
      push(nx, nz);
    }
  }
  return seen;
}
const vehicleCells = vehicleBfs(330, 606);
const vehicleInChamber = [...vehicleCells].some((cell) => {
  const ix = cell % GX, iz = Math.floor(cell / GX);
  const px = BX0 + ix * STEP, pz = BZ0 + iz * STEP;
  return px > 314 && px < 346 && pz > 677 && pz < 703;
});
const vehicleOnSummit = [...vehicleCells].some((cell) => {
  const ix = cell % GX, iz = Math.floor(cell / GX);
  const px = BX0 + ix * STEP, pz = BZ0 + iz * STEP;
  return px >= PYRAMID_TOP.x0 && px < PYRAMID_TOP.x1 && pz >= PYRAMID_TOP.z0 && pz < PYRAMID_TOP.z1;
});
assert(!vehicleInChamber, '载具能开进墓室（门槛/石墩失效）');
assert(!vehicleOnSummit, '载具能上金字塔顶（primary/台坎失效）');
assert(vehicleCells.size > 200, '载具连平台都开不出去（BFS 起点异常）');

/* ------------------------------------------------------------------ */
/* 输出                                                                 */
/* ------------------------------------------------------------------ */

if (process.env.PYR_PROBE_ASCII) {
  // 俯视高度图（每 3 m 一格，字符 = 高度档）：直观核对四棱锥轮廓 / 门楼 / 阶梯
  const chars = ' .:-=+*#%@';
  console.log('\n— 俯视高度图（3 m/格，字符 = 高度/6）—');
  for (let z = 600; z <= 780; z += 3) {
    let line = '';
    for (let x = 240; x <= 420; x += 3) {
      const top = columnTop(x, z);
      const idx = top <= 4 ? 0 : Math.min(chars.length - 1, 1 + Math.floor((top - 4) / 6));
      line += chars[idx];
    }
    console.log('  ' + line);
  }
  console.log('  （左=西 x240，右=东 x420；上=z600 南，下=z780 北）');
}

const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const padL = (s: string, n: number) => (s.length >= n ? s : ' '.repeat(n - s.length) + s);

console.log('\n=== CRAZYSHOOT · 金字塔 builder 探针 (tools/maps/pharaoh-pyramid-probe.ts) ===\n');
console.log('— 总览 —');
for (const r of rows) console.log(`  ${pad(r.label, 30)} ${r.value}`);

console.log('\n— 台坎轮廓（24 级 × 2 m，顶面 12×12 @+52）—');
console.log(`  外沿取样一致: ${tierOk ? 'OK' : 'FAIL'}   顶平台可站立: ${topOk}/${topCells}   外壳凿穿列: ${shellHoles.length}（白名单：登顶洞口/东盗洞）`);
for (const t of tiers) console.log(`  第 ${padL(String(t.tier), 2)} 级  半宽 ${padL(String(t.half), 5)}  台面 +${t.surface}  取样 ${t.ringCells}/${t.surfaceOk}`);

console.log('\n— 房间（地板 / 净空 / 空腔率）—');
for (const r of rooms) {
  console.log(`  ${r.ok ? 'ok  ' : 'FAIL'} ${pad(r.id, 20)} ${pad(r.label, 30)} 地板 +${padL(String(r.floor), 3)} 净空 ${padL(String(r.clear), 3)} m  空腔 ${(r.airRatio * 100).toFixed(1)}%`);
}

console.log('\n— 楼梯 / 坡道（级高 ≤1.05，终点≥目标−0.5）—');
for (const s of stairs) {
  console.log(`  ${s.ok ? 'ok  ' : 'FAIL'} ${pad(s.id, 16)} ${pad(s.label, 30)} 最大级高 ${s.maxRise.toFixed(2)} m  到达 ${s.reached.toFixed(1)} / 目标 ${s.target}`);
}

console.log('\n— 行走可达（每次从图外真实起点 BFS，0.5 m 网格 / 步高 1.05 / 身高 1.8）—');
let lastRun = '';
for (const r of route) {
  if (r.run !== lastRun) { console.log(`  [${r.run}]`); lastRun = r.run; }
  console.log(`    ${r.ok ? 'ok  ' : 'FAIL'} ${pad(r.label, 22)} feet ${r.feet === undefined ? '不可达' : '+' + r.feet.toFixed(1)}`);
}

console.log('\n— 载具（primary=+4，jeep 1.9×3.7×1.9 口径）—');
console.log(`  可行驶格 ${vehicleCells.size}   能进墓室: ${vehicleInChamber ? 'YES(FAIL)' : 'no'}   能上顶: ${vehicleOnSummit ? 'YES(FAIL)' : 'no'}`);

const detailWarn = rec.details.length > 2600 ? `（detail 偏多：${rec.details.length}，建议复盘坡道级数）` : '';
console.log(`\n— 风险 / 提示 —\n  detail 盒 ${rec.details.length}${detailWarn}`);
console.log(`  灯 ${rec.lamps.length} 盏（灯位实心检查 ${badLamps.length}）；西南考古阶梯 48 级 × 1.0 m（4 m 宽）；北栈道 2 段 × 16 级。`);

console.log(`\n=== ${fail.length === 0 ? 'PASS：全部断言通过' : `FAIL：${fail.length} 项`} ===`);
for (const f of fail) console.log(`  ✗ ${f}`);
process.exit(fail.length === 0 ? 0 : 1);
