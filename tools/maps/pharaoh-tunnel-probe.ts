/**
 * 法老坟墓 · A–B 墓道几何探针
 *
 * 用一份 mock PharaohOps（1 m 体素 + 0.5 m detail 栅格 + primary + lamps）跑
 * buildTunnel()，然后**独立**测量几何，而不是相信 builder 自己的数：
 *   - 中心线净空：每 5 m 一个断面（宽 / 净高 / 顶板岩层厚度）
 *   - 净宽 / 净高最窄最低点
 *   - 石墩实际净宽（摩托 0.8 过、吉普 1.9 不过）
 *   - 两个地表出口的台阶级数 / 最大级高（从 primary 实测）
 *   - primary 覆盖范围、两个洞口净空、灯具数量
 *
 * 用法：npx tsx tools/maps/pharaoh-tunnel-probe.ts
 * 退出码 1 = 有硬约束不满足。
 */
import * as THREE from 'three';
import {
  buildTunnel, TUNNEL_LENGTH, TUNNEL_MOUTHS, tunnelAt, tunnelFloor,
  type TunnelReport,
} from '../../src/game/world/pharaoh-tunnel';
import type { PharaohOps } from '../../src/game/world/pharaoh-structures';
import { pharaohHeight } from '../../src/maps/pharaoh-height';
import { pharaoh } from '../../src/maps/pharaoh';
import { buildVoxelMapData } from '../../src/game/world/voxel-map-data';
import { VoxelWorldQueries } from '../../src/game/world/voxel-world-queries';
import { Navigation } from '../../src/game/world/navigation';
import { PlayerController } from '../../src/game/player/controller';
import type { Arena } from '../../src/game/world/arena';
import type { PlayerInput } from '../../src/game/player/controller';

/* ------------------------------------------------------------------ */
/* 1. 地形：直接用法老图真实高度函数（terrain owner 的 pharaohHeight）  */
/* ------------------------------------------------------------------ */

/** 真实地形表面（整数）。探针不再自造沙丘——岩脊高度、出口地表都以真图为准。 */
function mockGround(x: number, z: number): number {
  return Math.round(pharaohHeight(x + 0.5, z + 0.5));
}

/* ------------------------------------------------------------------ */
/* 2. mock PharaohOps                                                   */
/* ------------------------------------------------------------------ */

const vkey = (x: number, y: number, z: number) => (x * 2048 + z) * 128 + (y + 64);
const dkey = (x: number, y: number, z: number) => (x * 2048 + z) * 256 + (y + 128);
const pkey = (x: number, z: number) => x * 4096 + z;

interface DetailCell { x: number; y: number; z: number; material: number; solid: boolean; }

class MockOps implements PharaohOps {
  voxels = new Map<number, number>();
  details = new Map<number, DetailCell>();
  primary = new Map<number, number>();
  lamps: [number, number, number][] = [];
  calls = { put: 0, column: 0, box: 0, carve: 0, detail: 0, primary: 0, lamp: 0 };
  detailCalls = 0;
  solidDetails = 0;
  decoDetails = 0;

  ground(x: number, z: number) { return mockGround(x, z); }

  put(x: number, y: number, z: number, id: number) {
    this.calls.put++;
    this.voxels.set(vkey(Math.floor(x), Math.floor(y), Math.floor(z)), id);
  }

  column(x: number, z: number, y0: number, y1: number, id: number) {
    this.calls.column++;
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) this.voxels.set(vkey(Math.floor(x), y, Math.floor(z)), id);
  }

  box(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, id: number) {
    this.calls.box++;
    for (let z = Math.floor(z0); z < Math.ceil(z1); z++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++) this.column(x, z, y0, y1, id);
  }

  carve(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) {
    this.calls.carve++;
    for (let z = Math.floor(z0); z < Math.ceil(z1); z++) for (let x = Math.floor(x0); x < Math.ceil(x1); x++)
      for (let y = Math.floor(y0); y < Math.ceil(y1); y++) this.voxels.delete(vkey(x, y, z));
  }

  /** 与 voxel-map-data.ts 的 detail() 同一套 0.5 m 栅格化规则。 */
  detail(id: string, cx: number, cz: number, w: number, d: number, y: number, h: number, material: number, angle = 0, solid = true) {
    this.calls.detail++;
    this.detailCalls++;
    const radius = Math.hypot(w, d) / 2, cos = Math.cos(angle), sin = Math.sin(angle);
    const y0 = Math.round(y * 2), y1 = Math.round((y + h) * 2);
    for (let gz = Math.floor((cz - radius) * 2) / 2; gz < cz + radius; gz += 0.5) {
      for (let gx = Math.floor((cx - radius) * 2) / 2; gx < cx + radius + 0.5; gx += 0.5) {
        const dx = gx + 0.25 - cx, dz = gz + 0.25 - cz;
        if (Math.abs(dx * cos - dz * sin) > w / 2 || Math.abs(dx * sin + dz * cos) > d / 2) continue;
        for (let gy = y0; gy < y1; gy++) {
          this.details.set(dkey(Math.floor((gx + 0.25) * 2), gy, Math.floor((gz + 0.25) * 2)), { x: gx + 0.25, y: gy / 2, z: gz + 0.25, material, solid });
        }
      }
    }
    if (solid) this.solidDetails++; else this.decoDetails++;
  }

  setPrimary(x: number, z: number, y: number) {
    this.calls.primary++;
    this.primary.set(pkey(Math.floor(x), Math.floor(z)), y);
  }

  addLamp(x: number, y: number, z: number) {
    this.calls.lamp++;
    this.lamps.push([x, y, z]);
  }

  /** 点是否实心（体素 + detail，detail 只算 solid）。 */
  solid(px: number, py: number, pz: number): boolean {
    const v = this.voxels.get(vkey(Math.floor(px), Math.floor(py), Math.floor(pz)));
    if (v !== undefined && v !== 0) return true;
    return this.details.has(dkey(Math.floor(px * 2), Math.floor(py * 2), Math.floor(pz * 2)));
  }

  primaryAt(px: number, pz: number): number {
    const v = this.primary.get(pkey(Math.floor(px), Math.floor(pz)));
    return v === undefined ? NaN : v;
  }
}

/* ------------------------------------------------------------------ */
/* 3. 真实地形预填：模拟 buildVoxelMapData 的 STONE/DIRT/地表三层柱     */
/* ------------------------------------------------------------------ */

const ops = new MockOps();
// 地形柱：minY..h-3 石、h-3..h-1 土、h-1..h 地表。不给这层，"隧道上方有没有岩层"
// 就会被 mock 的空世界误判成露天。
for (let z = 600; z <= 700; z++) for (let x = 380; x <= 570; x++) {
  const h = mockGround(x, z);
  for (let y = -6; y < h; y++) {
    const id = y < h - 3 ? 3 : y < h - 1 ? 2 : 12;   // STONE / DIRT / SAND
    ops.voxels.set(vkey(x, y, z), id);
  }
}

/* ------------------------------------------------------------------ */
/* 4. 测量                                                              */
/* ------------------------------------------------------------------ */
const t0 = Date.now();
const report: TunnelReport = buildTunnel(ops);
const buildMs = Date.now() - t0;

/** 净高（primary → 第一块实心）+ 其上岩层厚度（到第一个空气层）。 */
function section(px: number, pz: number) {
  const floor = ops.primaryAt(px, pz);
  if (!Number.isFinite(floor)) return { floor: NaN, clear: NaN, cover: NaN, rockTop: NaN };
  let y = floor + 0.02, clear = NaN, cover = NaN, rockTop = NaN;
  for (; y < floor + 24; y += 0.02) if (ops.solid(px, y, pz)) { clear = y - floor; break; }
  if (Number.isFinite(clear)) {
    for (y = floor + clear + 0.02; y < floor + 24; y += 0.02) if (!ops.solid(px, y, pz)) { rockTop = y - floor; break; }
    if (Number.isFinite(rockTop)) cover = rockTop - clear;
  }
  return { floor, clear, cover, rockTop };
}

/** 沿横向扫描净宽（y 取 primary+1.0）。 */
function widthAt(px: number, pz: number, nx: number, nz: number, floor: number, reach = 8) {
  let hi = NaN, lo = NaN;
  for (let u = 0.05; u <= reach; u += 0.05) {
    if (!ops.solid(px + nx * u, floor + 1.0, pz + nz * u)) hi = u; else break;
  }
  for (let u = 0.05; u <= reach; u += 0.05) {
    if (!ops.solid(px - nx * u, floor + 1.0, pz - nz * u)) lo = u; else break;
  }
  return (Number.isFinite(hi) ? hi : 0) + (Number.isFinite(lo) ? lo : 0);
}

const f1 = (v: number) => (Number.isFinite(v) ? v.toFixed(1) : ' -- ');
const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : ' -- ');
const pad = (v: string | number, n: number) => String(v).padStart(n);

/* 每 5 m 断面 */
interface Slice { s: number; x: number; z: number; floor: number; clear: number; cover: number; width: number; }
const slices: Slice[] = [];
for (let s = 0; s <= TUNNEL_LENGTH + 1e-6; s += 5) {
  const p = tunnelAt(Math.min(s, TUNNEL_LENGTH));
  const sec = section(p.x, p.z);
  slices.push({ s, x: p.x, z: p.z, floor: sec.floor, clear: sec.clear, cover: sec.cover, width: widthAt(p.x, p.z, p.nx, p.nz, sec.floor) });
}

/* 中心线 1 m 精度的净宽 / 净高极值（避开两个出口井道开口 4 m 范围） */
const exitS = [72, 139];
// 石墩 / 石门是刻意的窄口，极值统计要跳过
const narrowS = [...report.pillars.map((p) => p.s), ...report.gates.map((g) => g.s)];
let minWidth = { v: Infinity, s: 0, x: 0, z: 0 };
let minClear = { v: Infinity, s: 0, x: 0, z: 0 };
let minCover = { v: Infinity, s: 0, x: 0, z: 0 };
for (let s = 2; s <= TUNNEL_LENGTH - 2; s += 1) {
  if (exitS.some((e) => Math.abs(s - e) < 5)) continue;
  if (narrowS.some((e) => Math.abs(s - e) < 2.6)) continue;
  const p = tunnelAt(s);
  const sec = section(p.x, p.z);
  const w = widthAt(p.x, p.z, p.nx, p.nz, sec.floor);
  if (Number.isFinite(w) && w < minWidth.v) minWidth = { v: w, s, x: p.x, z: p.z };
  if (Number.isFinite(sec.clear) && sec.clear < minClear.v) minClear = { v: sec.clear, s, x: p.x, z: p.z };
  if (Number.isFinite(sec.cover) && sec.cover < minCover.v) minCover = { v: sec.cover, s, x: p.x, z: p.z };
}

/* 石墩实测净宽 */
const pillarMeasured = report.pillars.map((p) => {
  const gaps: number[] = [];
  for (const ds of [-0.4, -0.2, 0, 0.2, 0.4]) {
    const q = tunnelAt(p.s + ds);
    const sec = section(q.x, q.z);
    gaps.push(widthAt(q.x, q.z, q.nx, q.nz, sec.floor));
  }
  return { ...p, measuredMin: Math.min(...gaps), measuredMax: Math.max(...gaps) };
});

/* 石门净宽 */
const gateMeasured = report.gates.map((g) => {
  const q = tunnelAt(g.s);
  const sec = section(q.x, q.z);
  return { ...g, measured: widthAt(q.x, q.z, q.nx, q.nz, sec.floor) };
});

/* 出口楼梯：沿轴测 primary 落差 */
const exitMeasured = report.exits.map((e) => {
  const dx = e.mouth[0] - e.entry[0], dz = e.mouth[1] - e.entry[1];
  const len = Math.hypot(dx, dz) || 1, ux = dx / len, uz = dz / len;
  let prev = NaN, maxRise = 0, rises = 0;
  for (let d = 0; d <= len + 1e-6; d += 0.5) {
    const f = ops.primaryAt(e.entry[0] + ux * d, e.entry[1] + uz * d);
    if (!Number.isFinite(f)) continue;
    if (Number.isFinite(prev) && f > prev) { maxRise = Math.max(maxRise, f - prev); rises++; }
    prev = f;
  }
  // 井口外 7 m 下行坡
  let apronRise = 0;
  prev = NaN;
  for (let d = 0; d <= 7 + 1e-6; d += 0.5) {
    const f = ops.primaryAt(e.mouth[0] + ux * d, e.mouth[1] + uz * d);
    if (!Number.isFinite(f)) continue;
    if (Number.isFinite(prev)) apronRise = Math.max(apronRise, f - prev);
    prev = f;
  }
  const entrySec = section(e.entry[0], e.entry[1]);
  const mouthSec = section(e.mouth[0], e.mouth[1]);
  return { ...e, measuredRises: rises, measuredMaxRise: maxRise, apronRise, entryClear: entrySec.clear, mouthFloor: mouthSec.floor };
});

/* primary 覆盖 */
let pMin = Infinity, pMax = -Infinity, pCount = 0;
let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
for (const [k, y] of ops.primary) {
  pCount++;
  pMin = Math.min(pMin, y);
  pMax = Math.max(pMax, y);
  const x = Math.floor(k / 4096), z = k % 4096;
  bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x);
  bz0 = Math.min(bz0, z); bz1 = Math.max(bz1, z);
}

/* 洞口 */
function mouthClear(m: { x0: number; x1: number; z0: number; z1: number; floor: number; clearTop: number }) {
  const cx = (m.x0 + m.x1) / 2, cz = (m.z0 + m.z1) / 2;
  const floor = ops.primaryAt(cx, cz);
  const sec = section(cx, cz);
  const air = !ops.solid(cx, m.floor + 1.2, cz) && !ops.solid(cx, m.floor + 3.0, cz) && !ops.solid(cx, m.floor + 3.4, cz);
  return { floor, clear: sec.clear, air };
}
const mouthA = mouthClear(TUNNEL_MOUTHS.a);
const mouthB = mouthClear(TUNNEL_MOUTHS.b);

/* 湖体隔离：整条隧道 x 必须 > 390 */
const waterFree = bx0 > 300;

/* ------------------------------------------------------------------ */
/* 4. 输出                                                             */
/* ------------------------------------------------------------------ */

console.log('=== CRAZYSHOOT · 法老坟墓 A–B 墓道探针 ===\n');
console.log(`路线 ${report.route.map((p) => `(${p[0]},${p[1]})`).join('→')}`);
console.log(`弧长 ${f1(report.length)} m；地面 ${f1(report.floor.start)} → ${f1(report.floor.end)}，最低 ${f1(report.floor.lowest)} @ (${report.floor.lowestAt[0]},${report.floor.lowestAt[1]})`);
console.log(`主宽 ${f1(report.width.clear)} m（栅格 ${f1(report.width.grid)} m）；净高 ${f1(3.5)} m；石墩净宽 ${f1(report.width.pillarGap)} m；石门 ${f1(report.width.gateClear)} m；灯 ${report.lamps}；构建 ${buildMs} ms`);
console.log(`primary 列 ${report.primary.count}（实测 ${pCount}），y ${f1(report.primary.minY)}..${f1(report.primary.maxY)}，范围 x ${bx0}..${bx1} z ${bz0}..${bz1}`);
console.log(`体素写入：put ${ops.calls.put} / column ${ops.calls.column} / box ${ops.calls.box} / carve ${ops.calls.carve} / detail ${ops.calls.detail} / primary ${ops.calls.primary} / lamp ${ops.calls.lamp}`);
console.log(`detail：实体 ${ops.solidDetails} 次 / 装饰 ${ops.decoDetails} 次，栅格单元 ${ops.details.size}，体素 ${ops.voxels.size}\n`);

console.log('断面（每 5 m）：');
console.log('   s      x       z    floor  clear  cover   width');
for (const sl of slices) {
  console.log(`  ${pad(f1(sl.s), 4)}  ${pad(f1(sl.x), 6)}  ${pad(f1(sl.z), 5)}   ${pad(f1(sl.floor), 5)}  ${pad(f2(sl.clear), 5)}  ${pad(f2(sl.cover), 5)}  ${pad(f2(sl.width), 6)}`);
}

console.log('\n极值：');
console.log(`  最窄净宽 ${f2(minWidth.v)} m @ s=${f1(minWidth.s)} (${f1(minWidth.x)},${f1(minWidth.z)})`);
console.log(`  最低净高 ${f2(minClear.v)} m @ s=${f1(minClear.s)} (${f1(minClear.x)},${f1(minClear.z)})`);
console.log(`  最薄顶板岩层 ${f2(minCover.v)} m @ s=${f1(minCover.s)} (${f1(minCover.x)},${f1(minCover.z)})  [builder 报 ${f2(report.rock.minCover)}]`);
console.log(`  岩脊最高出地面 ${f1(report.rock.ridgeMaxAboveGround)} m，补顶板 ${report.rock.columns} 列`);

console.log('\n石墩（真实体素，实测净宽）：');
for (const p of pillarMeasured) {
  console.log(`  s=${pad(f1(p.s), 4)} (${f1(p.x)},${f1(p.z)})  设计 ${f2(p.gap)}  实测 ${f2(p.measuredMin)}..${f2(p.measuredMax)}`);
}
console.log('\n石门 / 窄门：');
for (const g of gateMeasured) console.log(`  s=${pad(f1(g.s), 4)} (${f1(g.x)},${f1(g.z)})  实测净宽 ${f2(g.measured)} m`);

console.log('\n地表出口：');
for (const e of exitMeasured) {
  console.log(`  ${e.name}: 入口 (${f1(e.entry[0])},${f1(e.entry[1])}) floor ${f1(e.entryFloor)} → 井口 (${f1(e.mouth[0])},${f1(e.mouth[1])}) top ${f1(e.top)}`);
  console.log(`         井道长 ${f1(e.run)} m，台阶 ${e.steps} 级（实测上升 ${e.measuredRises} 次），最大级高 ${f2(e.measuredMaxRise)} m；入口净高 ${f2(e.entryClear)} m`);
  console.log(`         井口外下行坡 ${f1(e.apron)} m，实测逆行落差 ${f2(e.apronRise)} m（>0 表示有向上台阶）`);
}

console.log('\n洞口连通（与金字塔/狮身人面像重叠矩形）：');
console.log(`  A (${TUNNEL_MOUTHS.a.x0}..${TUNNEL_MOUTHS.a.x1}, ${TUNNEL_MOUTHS.a.z0}..${TUNNEL_MOUTHS.a.z1}) floor ${f1(mouthA.floor)} 净高 ${Number.isFinite(mouthA.clear) ? f2(mouthA.clear) : '由 pyramid 东廊道提供(3.5)'} 有空气 ${mouthA.air}`);
console.log(`  B (${TUNNEL_MOUTHS.b.x0}..${TUNNEL_MOUTHS.b.x1}, ${TUNNEL_MOUTHS.b.z0}..${TUNNEL_MOUTHS.b.z1}) floor ${f1(mouthB.floor)} 净高 ${f2(mouthB.clear)} 有空气 ${mouthB.air}`);

console.log('\n房间：');
for (const r of report.rooms) console.log(`  ${pad(r.name, 12)} 中心 (${r.center[0]},${r.center[1]})  ${r.width}×${r.length} m  净高 ${f1(r.height)}`);

/* ---------------- 断言 ---------------- */
const fails: string[] = [];
if (!(minClear.v >= 3.4)) fails.push(`净高最小 ${f2(minClear.v)} < 3.4`);
if (!(minCover.v >= 0.9)) fails.push(`顶板岩层最薄 ${f2(minCover.v)} < 0.9`);
for (const p of pillarMeasured) {
  if (p.measuredMin < 1.0) fails.push(`石墩 s=${p.s} 实测净宽 ${f2(p.measuredMin)} < 1.0（摩托过不去）`);
  if (p.measuredMin > 1.9) fails.push(`石墩 s=${p.s} 实测净宽 ${f2(p.measuredMin)} > 1.9（吉普能挤过去）`);
}
for (const e of exitMeasured) if (e.measuredMaxRise > 1.0 + 1e-9) fails.push(`${e.name} 最大级高 ${f2(e.measuredMaxRise)} > 1.0`);
if (report.lamps < 15 || report.lamps > 20) fails.push(`灯 ${report.lamps} 不在 15..20`);
if (!mouthA.air || !mouthB.air) fails.push('洞口不连通（洞内有实心）');
if (!waterFree) fails.push('primary 覆盖伸到 x<=300（可能与湖体连通）');
if (!(minWidth.v >= 4.4)) fails.push(`主通道最窄净宽 ${f2(minWidth.v)} < 4.4`);

console.log('');
if (fails.length) {
  console.log(`✗ ${fails.length} 项不满足：`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exitCode = 1;
} else {
  console.log('✓ 全部硬约束通过');
}

console.log('\nJSON ' + JSON.stringify({
  length: report.length,
  floor: report.floor,
  width: report.width,
  minWidth: minWidth.v,
  minClear: minClear.v,
  minCover: minCover.v,
  pillars: pillarMeasured.map((p) => ({ s: p.s, x: p.x, z: p.z, gap: p.gap, measuredMin: p.measuredMin, measuredMax: p.measuredMax })),
  gates: gateMeasured,
  exits: exitMeasured.map((e) => ({ name: e.name, entry: e.entry, mouth: e.mouth, top: e.top, run: e.run, steps: e.steps, maxRiser: e.maxRiser, measuredMaxRise: e.measuredMaxRise, apron: e.apron })),
  lamps: report.lamps,
  primary: { count: pCount, bounds: [bx0, bz0, bx1, bz1], y: [pMin, pMax] },
  rooms: report.rooms,
  mouths: { a: mouthA, b: mouthB },
}));


/* ------------------------------------------------------------------ */
/* 5. A 口断面（Lead 要的“A 口断面图”，mock 世界，只反映本 builder）     */
/* ------------------------------------------------------------------ */

function aMouthSection() {
  const y0 = 4, y1 = 11, z0 = 673, z1 = 687;
  console.log("\nA 口断面（z 673..686 × y 4..10 @ x=400，'#' 实心 '.' 空气；体素 + detail）：");
  let head = '      ';
  for (let z = z0; z <= z1; z++) head += String(z % 10);
  console.log(head);
  for (let y = y1; y >= y0; y--) {
    let line = String(y).padStart(4) + '  ';
    for (let z = z0; z <= z1; z++) line += ops.solid(400.5, y + 0.5, z + 0.5) ? '#' : '.';
    console.log(line);
  }
  console.log('x      净宽  净高  primary   顶板岩层');
  for (const x of [392, 394, 396, 398, 400, 402, 404, 406, 408, 410, 412, 414, 416]) {
    const sec = section(x + 0.5, 680.5);
    const w = widthAt(x + 0.5, 680.5, 0, 1, Number.isFinite(sec.floor) ? sec.floor : 5);
    console.log(`${String(x).padStart(3)}   ${f2(w)}  ${f2(sec.clear)}  ${f1(sec.floor)}     ${f2(sec.cover)}`);
  }
  // 等价于 blockedAt(x,680,0.38,5)：门洞正前方 22 m 内逐米可站
  const stops: number[] = [];
  for (let x = 389; x <= 420; x++) {
    const foot = 5;
    const r = 0.38;
    let hit = false;
    for (let dz = -r; dz <= r + 1e-9; dz += 0.19) for (let dy = 0.05; dy < 1.8; dy += 0.35) for (let dx = -r; dx <= r + 1e-9; dx += 0.19) {
      if (ops.solid(x + 0.5 + dx, foot + dy, 680 + dz)) { hit = true; break; }
      }
    if (hit) stops.push(x);
  }
  console.log(stops.length ? `  blockedAt(x,680,.38,5) 命中 x=${stops.join(',')}` : '  blockedAt(x,680,.38,5) 在 x=389..420 全部可站 ✓');
}

aMouthSection();

/* ------------------------------------------------------------------ */
/* 6. 可选：真实世界 + 正式 PlayerController 走查（--walk）              */
/* ------------------------------------------------------------------ */

if (process.argv.includes('--walk')) {
  const BOUNDS = { minX: 1, maxX: 999, minZ: 1, maxZ: 999 };
  const t0 = Date.now();
  const data = buildVoxelMapData(pharaoh);
  const queries = new VoxelWorldQueries(data);
  const arena = {
    scene: new THREE.Scene(), colliders: [], targets: [],
    spawn: new THREE.Vector3(90, queries.navigationHeight(90, 110), 110), spawnYaw: 0, bounds: BOUNDS,
    navLinks: data.navLinks, ladders: data.ladders ?? [],
    navigationLayers: data.navLayers ?? 3, maxSupportY: data.minY + data.height - 1,
    capturePoints: [], vehiclePads: [], vehicles: [], scoreRate: pharaoh.scoreRate,
    teamSpawns: { blue: { x: 90, z: 110, yaw: 0 }, orange: { x: 905, z: 895, yaw: Math.PI } },
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
    footprintBlocked: (x: number, z: number, w: number, d: number, yaw: number, feet: number, height: number, terrain?: { min: number; max: number }) => queries.footprint(x, z, w, d, yaw, feet, height, terrain),
    raycastTargets: () => null, reset: () => {},
  } as unknown as Arena;
  const nav = new Navigation(arena);
  const worldMs = Date.now() - t0;

  const walk = (from: [number, number], to: [number, number], goalY: number, maxSeconds = 260) => {
    const controller = new PlayerController(new THREE.PerspectiveCamera());
    const startY = (queries.navigationHeight(from[0], from[1]) ?? 0) + 0.02;
    controller.teleport(new THREE.Vector3(from[0], startY, from[1]), 0);
    const keys = new Set<string>();
    const input: PlayerInput = { down: (c) => keys.has(c), consumeLook: () => ({ x: 0, y: 0 }), worldMove: null };
    let minY = controller.position.y, maxY = controller.position.y, frames = 0, arrived = 0, reason = 'timeout';
    let maxYAt = [controller.position.x, controller.position.z] as [number, number];
    let stuck = 0, lastX = controller.position.x, lastZ = controller.position.z;
    const dbg: string[] = [];
    const marks: { x: number; y: number; z: number }[] = [];
    while (frames < maxSeconds * 60) {
      const p = controller.position;
      const dist = Math.hypot(p.x - to[0], p.z - to[1]);
      if (dist <= 3 && Math.abs(p.y - goalY) <= 1.6) { if (++arrived >= 3) { reason = 'arrived'; break; } } else arrived = 0;
      if (p.y < data.minY + 1) { reason = 'fell'; break; }
      const wp = (nav.next as any)(p.x, p.z, to[0], to[1], p.y, goalY) ?? (nav.next as any)(p.x, p.z, to[0], to[1]);
      if (!wp) { reason = 'unreachable'; break; }
      let dx = wp.x - p.x, dz = wp.z - p.z;
      const len = Math.hypot(dx, dz) || 1;
      input.worldMove = { x: dx / len, z: dz / len };
      controller.yaw = Math.atan2(-dx / len, -dz / len);
      if (frames < 600 && frames % 60 === 0) dbg.push(`${frames}: p=(${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)}) wp=(${wp.x.toFixed(1)},${wp.y.toFixed(1)},${wp.z.toFixed(1)})${wp.action}`);
      keys.add('KeyW');
      if (frames % 12 === 0 && Math.hypot(p.x - lastX, p.z - lastZ) < 0.35) stuck++; else if (frames % 12 === 0) { stuck = 0; lastX = p.x; lastZ = p.z; }
      if (stuck > 3 && frames % 12 < 3) keys.add('Space'); else keys.delete('Space');
      if (frames % 60 === 0) marks.push({ x: +p.x.toFixed(1), y: +p.y.toFixed(1), z: +p.z.toFixed(1) });
      controller.update(1 / 60, input, arena, true);
      minY = Math.min(minY, controller.position.y);
      if (controller.position.y > maxY) { maxY = controller.position.y; maxYAt = [controller.position.x, controller.position.z]; }
      frames++;
    }
    const p = controller.position;
    return { reason, arrived: reason === 'arrived', seconds: +(frames / 60).toFixed(1), end: [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1)], minY: +minY.toFixed(2), maxY: +maxY.toFixed(2), maxYAt: [+maxYAt[0].toFixed(1), +maxYAt[1].toFixed(1)], marks, dbg };
  };

  console.log(`\n=== 真实世界走查（buildVoxelMapData + 正式 PlayerController，world ${worldMs} ms）===`);
  const t1 = Date.now();
  const a = walk([330, 680], [396, 680], 5, 90);                  // 墓室 → 东门（金字塔内部）
  const mid = tunnelAt(150), midY = tunnelFloor(150);
  const b = walk([396, 680], [mid.x, mid.z], midY, 200);          // 东门 → 隧道深处 s=170（只可能走隧道）
  const c = walk([399, 680], [548, 648], 4, 200);                 // 门口 → B 洞口内侧
  const d = walk([396, 680], [566, 650], 4, 260);                 // 东门 → 狮身西后侧
  const e = walk([330, 680], [610, 650], 4, 300);                 // Lead 要的整条
  for (const [name, r] of [
    ['墓室(330,680,+5) → 东门(396,680,+5)', a],
    [`东门(396,680,+5) → 隧道 s=150 (${mid.x.toFixed(0)},${mid.z.toFixed(0)},+${midY}) 全程地下`, b],
    ['A 门口(399,680) → B 洞口(548,648)', c],
    ['东门(396,680) → 狮身西后侧(566,650,y4)', d],
    ['墓室(330,680) → 狮身内殿(610,650,y4)（整条）', e],
  ] as const) {
    console.log(`${r.arrived ? '✓' : '✗'} ${name}: ${r.reason} ${r.seconds}s end=${JSON.stringify(r.end)} minY=${r.minY} maxY=${r.maxY}@${JSON.stringify(r.maxYAt)}`);
    console.log(`   轨迹 ${JSON.stringify(r.marks)}`);
    if (!r.arrived) {
      console.log(`   轨迹 ${JSON.stringify(r.marks.slice(0, 10))}`);
      for (const d of r.dbg) console.log('   ' + d);
    }
  }
  console.log(`walk ms ${Date.now() - t1}`);
  if (!b.arrived || !c.arrived) process.exitCode = 1;   // 本模块范围的两段必须通；a/d/e 跨别人的文件只报告
  if (b.arrived && b.maxY > 6.6) process.exitCode = 1;  // 走隧道就必须全程在地下
}
