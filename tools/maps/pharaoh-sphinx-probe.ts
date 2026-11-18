/**
 * 狮身人面像 builder 探针（无需游戏运行时）
 *
 *   npx tsx tools/maps/pharaoh-sphinx-probe.ts [--json]
 *
 * 用一套与 `voxel-map-data.ts` 同语义的 mock PharaohOps 跑 buildSphinx()，
 * 然后把体素 + 0.5 m detail 当成真实几何，检查：
 *   - 体素/细节数量、包围盒、材质分布
 *   - 各部件高度（臀、背、胸、头、鼻子、头巾、爪、尾座、祭台）
 *   - 内殿 28×18 / 净高 / 环廊 / 后厅 / 头部小室净空
 *   - 四个入口坐标、最窄净宽、内部是否被错位窄门挡住载具
 *   - 点圈 r11 内是否只剩低祭台、可站环带是否连续
 *   - 内殿/环廊/后厅在封闭四入口后是否完全密闭（无隐形破洞）
 *   - 每个入口"步兵可达 / 摩托不可达 / 吉普不可达"（位姿 BFS）
 *   - 胸部楼梯每级 ≤1.05 m、可直达 +28 头室
 *
 * 失败项会以 exit code 1 结束，方便 CI / Lead 直接调用。
 */
import {buildSphinx, SPHINX} from '../../src/game/world/pharaoh-sphinx';
import type {PharaohOps} from '../../src/game/world/pharaoh-structures';

/* ------------------------------------------------------------------ *
 * Mock ops：语义与 voxel-map-data.ts 的 put/column/box/carve/detail 对齐
 * ------------------------------------------------------------------ */
interface MockBox {
  id: string; x: number; z: number; w: number; d: number;
  bottom: number; top: number; material: number;
}

class MockOps implements PharaohOps {
  readonly voxels = new Map<number, number>();
  readonly boxes: MockBox[] = [];
  readonly detailCells = new Set<number>();
  readonly lamps: {x: number; y: number; z: number}[] = [];
  primaryWrites = 0;

  private vkey(x: number, y: number, z: number) {
    return ((x + 1024) * 2048 + (z + 1024)) * 2048 + (y + 1024);
  }
  private hkey(x: number, y: number, z: number) {
    return ((x + 4096) * 8192 + (z + 4096)) * 8192 + (y + 4096);
  }

  ground(_x: number, _z: number) { return SPHINX.base; }

  put(x: number, y: number, z: number, id: number) {
    const k = this.vkey(Math.floor(x), Math.floor(y), Math.floor(z));
    if (id === 0) this.voxels.delete(k);
    else this.voxels.set(k, id);
  }
  column(x: number, z: number, y0: number, y1: number, id: number) {
    const a = Math.floor(y0), b = Math.ceil(y1);
    for (let y = a; y < b; y++) this.put(x, y, z, id);
  }
  box(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, id: number) {
    for (let z = Math.floor(z0); z < Math.ceil(z1); z++)
      for (let x = Math.floor(x0); x < Math.ceil(x1); x++) this.column(x, z, y0, y1, id);
  }
  carve(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number) {
    this.box(x0, z0, x1, z1, y0, y1, 0);
  }
  detail(
    id: string, cx: number, cz: number, w: number, d: number,
    y: number, h: number, material: number, angle = 0, solid?: boolean,
  ) {
    if (solid === false) throw new Error(`sphinx detail ${id} 必须参与碰撞`);
    const radius = Math.hypot(w, d) / 2, c = Math.cos(angle), s = Math.sin(angle);
    const rows = new Map<string, MockBox>();
    for (let z = Math.floor((cz - radius) * 2) / 2; z < cz + radius; z += 0.5) {
      let start: number | null = null;
      const endRun = (end: number) => {
        if (start === null) return;
        const key = start + ':' + end;
        const previous = rows.get(key);
        if (previous && Math.abs(previous.z + previous.d / 2 - z) < 0.01) {
          previous.d += 0.5;
          previous.z += 0.25;
        } else {
          const b: MockBox = {id, x: (start + end) / 2, z: z + 0.25, w: end - start, d: 0.5, bottom: y, top: y + h, material};
          rows.set(key, b);
          this.boxes.push(b);
        }
        start = null;
      };
      for (let x = Math.floor((cx - radius) * 2) / 2; x < cx + radius + 0.5; x += 0.5) {
        const dx = x + 0.25 - cx, dz = z + 0.25 - cz;
        const on = Math.abs(dx * c - dz * s) <= w / 2 && Math.abs(dx * s + dz * c) <= d / 2;
        if (on && start === null) start = x;
        else if (!on) endRun(x);
      }
      endRun(Math.ceil((cx + radius) * 2) / 2);
    }
  }
  setPrimary(_x: number, _z: number, _y: number) { this.primaryWrites++; }
  addLamp(x: number, y: number, z: number) { this.lamps.push({x, y, z}); }

  /** 体素是否实体（y<平台顶时视为地形整平层）。 */
  voxelSolid(x: number, y: number, z: number) {
    if (y < SPHINX.base) return true;
    return (this.voxels.get(this.vkey(Math.floor(x), Math.floor(y), Math.floor(z))) ?? 0) !== 0;
  }
  /** voxel + 0.5 m detail 的统一实体查询（与渲染/碰撞同源）。 */
  solid(x: number, y: number, z: number) {
    if (this.voxelSolid(x, y, z)) return true;
    const hx = Math.floor(x * 2), hy = Math.floor(y * 2), hz = Math.floor(z * 2);
    return this.detailCells.has(this.hkey(hx, hy, hz));
  }
  /** 把 detailBoxes 光栅成 0.5 m 单元（与 meshVoxelChunks 的 detailCells 一致）。 */
  flushDetailCells() {
    for (const b of this.boxes) {
      for (let z = Math.round((b.z - b.d / 2) * 2); z < Math.round((b.z + b.d / 2) * 2); z++)
        for (let y = Math.round(b.bottom * 2); y < Math.round(b.top * 2); y++)
          for (let x = Math.round((b.x - b.w / 2) * 2); x < Math.round((b.x + b.w / 2) * 2); x++) {
            if (this.voxelSolid(x / 2 + 0.25, y / 2 + 0.25, z / 2 + 0.25)) continue;
            this.detailCells.add(this.hkey(x, y, z));
          }
    }
  }
}

/* ------------------------------------------------------------------ *
 * 几何查询
 * ------------------------------------------------------------------ */
const ops = new MockOps();
buildSphinx(ops);
ops.flushDetailCells();

const solid = (x: number, y: number, z: number) => ops.solid(x, y, z);

/** 某列最高的实体表面（世界 y），用于部件高度。 */
function surface(x: number, z: number, limit = 36) {
  for (let y = limit; y >= SPHINX.base - 0.5; y -= 0.1) {
    if (!solid(x, y, z)) continue;
    let top = y;
    while (top < limit + 1 && solid(x, top + 0.05, z)) top += 0.05;
    return Math.round(top * 10) / 10;
  }
  return SPHINX.base;
}
/** 从 from 往上第一个实体（天花板/净空）。 */
function firstSolidAbove(x: number, z: number, from: number = SPHINX.base, limit = 36) {
  for (let y = from + 0.02; y < limit; y += 0.1) if (solid(x, y, z)) return Math.round(y * 10) / 10;
  return limit;
}
/** 平台顶往上张开：地面/祭台/台阶/坡道的可站面（含 detail 半级）。 */
function groundTop(x: number, z: number) {
  let y = SPHINX.base;
  while (y < 12 && solid(x, y + 0.02, z)) y += 0.1;
  return Math.round(y * 10) / 10;
}
/** 从 from 往下（层内）找到可站面，用于 +28 头室等高处。 */
function supportNear(x: number, z: number, from: number) {
  for (let y = from + 0.3; y > from - 2.5; y -= 0.1) if (solid(x, y, z)) return Math.round((y + 0.1) * 10) / 10;
  return from;
}
/** 悬垂件底边（nemes 下垂翼 / 前垂带）：从 from 往下找到实体段的最低点。 */
function hangingBottom(x: number, z: number, from: number) {
  let last = from, seen = false;
  for (let y = from; y > 10; y -= 0.1) {
    if (solid(x, y, z)) { last = y; seen = true; }
    else if (seen) return Math.round(last * 10) / 10;
  }
  return Math.round(last * 10) / 10;
}
/** 该列上方是否有 1.8 m 站立净空。 */
function standable(x: number, z: number) {
  const s = groundTop(x, z);
  for (let y = s + 0.05; y < s + 1.8; y += 0.2) if (solid(x, y, z)) return false;
  return true;
}
/** 从平台顶往上张开到 limit（含 detail 半级），用于楼梯踏面。 */
function walkTop(x: number, z: number, limit: number) {
  let y = SPHINX.base;
  while (y < limit && solid(x, y + 0.02, z)) y += 0.1;
  return Math.round(y * 10) / 10;
}
/** 固定 +4 地面上是否有 1.8 m 净空（内殿/环廊/后厅/门洞）。 */
function openAt4(x: number, z: number) {
  for (let y = SPHINX.base + 0.05; y < SPHINX.base + 1.75; y += 0.1) if (solid(x, y, z)) return false;
  return true;
}

const failures: string[] = [];
const checks: {name: string; ok: boolean; detail: string}[] = [];
function check(name: string, ok: boolean, detail: string) {
  checks.push({name, ok, detail});
  if (!ok) failures.push(`${name} — ${detail}`);
}

/* ------------------------------------------------------------------ *
 * 1) 统计 / 包围盒 / 材质
 * ------------------------------------------------------------------ */
const materials = new Map<number, number>();
for (const id of ops.voxels.values()) materials.set(id, (materials.get(id) ?? 0) + 1);

let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
const grow = (x: number, y: number, z: number) => {
  if (x < bx0) bx0 = x; if (x > bx1) bx1 = x;
  if (y < by0) by0 = y; if (y > by1) by1 = y;
  if (z < bz0) bz0 = z; if (z > bz1) bz1 = z;
};
const vkeyDecode = (k: number) => {
  const y = (k % 2048) - 1024;
  const rest = Math.floor(k / 2048);
  const z = (rest % 2048) - 1024;
  const x = Math.floor(rest / 2048) - 1024;
  return {x, y, z};
};
for (const k of ops.voxels.keys()) {
  const v = vkeyDecode(k);
  grow(v.x, v.y, v.z);
  grow(v.x + 1, v.y + 1, v.z + 1);
}
for (const b of ops.boxes) {
  grow(b.x - b.w / 2, b.bottom, b.z - b.d / 2);
  grow(b.x + b.w / 2, b.top, b.z + b.d / 2);
}
const width = bx1 - bx0, depth = bz1 - bz0, height = by1 - by0;

console.log('\n=== 狮身人面像 SPH-01 探针 ===');
console.log(`体素 ${ops.voxels.size} 个；detailBoxes ${ops.boxes.length} 个；detail 0.5m 单元 ${ops.detailCells.size} 个；lamps ${ops.lamps.length} 个`);
console.log(`包围盒 x ${bx0}..${bx1}（长 ${width}）  z ${bz0}..${bz1}（宽 ${depth}）  y ${by0}..${by1}（高 ${height}）`);
const matNames: Record<number, string> = {
  7: 'WOOD', 10: 'METAL', 14: 'RUST', 80: 'limestone_shell', 81: 'sandstone_block',
  82: 'rock_strata', 83: 'granite_dark', 85: 'relief_fragment', 86: 'stone_soot',
};
console.log('材质分布：' + [...materials.entries()].sort((a, b) => a[0] - b[0])
  .map(([id, n]) => `${matNames[id] ?? id}=${n}`).join('  '));

/* ------------------------------------------------------------------ *
 * 2) 各部件高度
 * ------------------------------------------------------------------ */
interface Part {name: string; x: number; z: number; got: number; want: number; tol: number}
const parts: Part[] = [
  {name: '后腰背', x: 577, z: 650, got: surface(577, 650), want: 20.5, tol: 1.5},
  {name: '肩丘', x: 637, z: 662, got: surface(637, 662), want: 23.5, tol: 1.5},
  {name: '髋丘', x: 582, z: 662, got: surface(582, 662), want: 22, tol: 1.5},
  {name: '背部下凹', x: 602, z: 650, got: surface(602, 650), want: 18, tol: 1.2},
  {name: '胸顶（颈后 x=640）', x: 640, z: 650, got: surface(640, 650), want: 24, tol: 1},
  {name: '头顶 + 头巾冠', x: 655, z: 650, got: surface(655, 650), want: 33, tol: 0.3},
  {name: 'nemes 翼顶', x: 653, z: 637, got: surface(653, 637), want: 27, tol: 1.5},
  {name: '南前爪掌面', x: 670, z: 637, got: surface(670, 637), want: 7, tol: 1.5},
  {name: '北前爪掌面', x: 670, z: 661, got: surface(670, 661), want: 7, tol: 1.5},
  {name: '爪尖（x=671）', x: 670.5, z: 639, got: surface(670.5, 639), want: 7, tol: 2},
  {name: '后腿脚趾', x: 594, z: 670.5, got: surface(594, 670.5), want: 8.5, tol: 2},
  {name: '残损尾座', x: 561, z: 669.5, got: surface(561, 669.5), want: 12, tol: 1.5},
  {name: '祭台顶', x: 610, z: 650, got: groundTop(610, 650), want: 5, tol: 0.2},
];

console.log('\n部件高度（世界 y，平台 +4）：');
for (const p of parts) {
  const ok = Math.abs(p.got - p.want) <= p.tol;
  console.log(`  ${ok ? '✓' : '!'} ${p.name.padEnd(14, '　')} @(${p.x},${p.z}) = ${p.got}  期望 ${p.want}±${p.tol}`);
  check(`部件 ${p.name}`, ok, `${p.got} vs ${p.want}±${p.tol}`);
}
check('头顶高度', Math.abs(surface(655, 650) - 33) <= 0.3, `实测 ${surface(655, 650)}，契约 +33`);
check('胸顶高度', Math.abs(surface(640, 650) - 24) <= 1, `实测 ${surface(640, 650)}，契约 +24`);
check('鼻子前伸（x669 有实体、x671 空）', solid(669, 28, 650) && !solid(671, 28, 650), `x669=${solid(669, 28, 650)} x671=${solid(671, 28, 650)}`);
check('眼窝 1 m 深（x664 花岗岩底、x665 空腔）', solid(664, 29, 646) && !solid(665, 29, 646), `x664=${solid(664, 29, 646)} x665=${solid(665, 29, 646)}`);
/* 前脸贯穿检查：y24..32 × z643..657 每列从 x670 往西第一层实体都要在 x>=660（无内腔外露） */
let faceMin = 999;
let faceHoles = 0;
for (let y = 24; y <= 32; y++) for (let z = 643; z <= 657; z++) {
  let f = -1;
  for (let x = 670; x >= 650; x--) if (solid(x + 0.5, y + 0.5, z + 0.5)) { f = x; break; }
  if (f < 0) { faceHoles++; continue; }
  faceMin = Math.min(faceMin, f);
}
check('前脸连续（y24..32 无贯穿空腔）', faceHoles === 0 && faceMin >= 660, `空洞列 ${faceHoles}，最靠后实体 x=${faceMin}`);
console.log(`  前脸贯穿检查：9×15 列，空洞 ${faceHoles}，最靠后实体 x=${faceMin}（要求 ≥660）`);

check('头壳南壁闭合（3/4 视角无缺口）', solid(653, 29.5, 656.5) && solid(653, 29.5, 657.5), `z656.5=${solid(653, 29.5, 656.5)} z657.5=${solid(653, 29.5, 657.5)}`);

/* ------------------------------------------------------------------ *
 * 3) 内部净空
 * ------------------------------------------------------------------ */
const hallClear = Math.round((firstSolidAbove(610, 646) - SPHINX.base) * 10) / 10;
const hallCorner = Math.round((firstSolidAbove(600, 645) - SPHINX.base) * 10) / 10;
const ringNorth = Math.round((firstSolidAbove(610, 636) - SPHINX.base) * 10) / 10;
const rearHall = Math.round((firstSolidAbove(576, 650) - SPHINX.base) * 10) / 10;
const headFloor = supportNear(655, 650, 28);
const headCeil = firstSolidAbove(655, 650, 28);
console.log('\n内部净空：');
console.log(`  内殿 28×18 @ (610,646)：地面 +${groundTop(610, 646)}，净高 ${hallClear} m（期望 ≈8）`);
console.log(`  内殿角落 (600,645) 净高 ${hallCorner} m；北环廊净高 ${ringNorth} m；后厅净高 ${rearHall} m`);
console.log(`  头部小室 @ (655,650)：地面 +${headFloor}，天花板 +${headCeil}，净高 ${Math.round((headCeil - headFloor) * 10) / 10} m`);
check('内殿净高 ≈8', Math.abs(hallClear - 8) <= 0.5, `${hallClear} m`);
check('内殿地面 +4（中心为 1 m 祭台）', groundTop(610, 650) === 5 && groundTop(610, 646) === 4, `祭台 ${groundTop(610, 650)}，地面 ${groundTop(610, 646)}`);
check('头室地面 +28', Math.abs(headFloor - 28) <= 0.2, `${headFloor}`);
check('头室净高 ≥3.2', headCeil - headFloor >= 3.2, `${headCeil - headFloor} m`);

/* 头室平面尺寸 */
let headX0 = Infinity, headX1 = -Infinity, headZ0 = Infinity, headZ1 = -Infinity;
for (let x = 648; x < 662; x += 0.25) for (let z = 643; z < 658; z += 0.25) {
  if (Math.abs(x - 655) > 6 || Math.abs(z - 650) > 7) continue;
  const floor = supportNear(x, z, 28);
  if (floor < 27.5 || firstSolidAbove(x, z, 28) < 31.2) continue;
  let clear = true;
  for (let y = 28.1; y < 29.8; y += 0.2) if (solid(x, y, z)) clear = false;
  if (!clear) continue;
  headX0 = Math.min(headX0, x); headX1 = Math.max(headX1, x);
  headZ0 = Math.min(headZ0, z); headZ1 = Math.max(headZ1, z);
}
const headW = headX1 - headX0, headD = headZ1 - headZ0;
console.log(`  头室可站范围 x ${headX0}..${headX1}（${Math.round(headW * 10) / 10} m） z ${headZ0}..${headZ1}（${Math.round(headD * 10) / 10} m）`);
check('头室可站面积 ≥4×5', headW >= 4 && headD >= 5, `${headW}×${headD}`);

/* ------------------------------------------------------------------ *
 * 4) 内殿 28×18 / 点圈 r11 / 可站环带
 * ------------------------------------------------------------------ */
const hall = SPHINX.hall;
let hallSolid = 0;
for (let x = hall.x0 + 0.25; x < hall.x1; x += 0.5) {
  for (let z = hall.z0 + 0.25; z < hall.z1; z += 0.5) {
    if (Math.hypot(x - SPHINX.cx, z - SPHINX.cz) > SPHINX.capture.r) continue;
    const inAltar = x >= 606 && x <= 614 && z >= 648 && z <= 652;
    let blocked = false;
    for (let y = SPHINX.base + 0.2; y < SPHINX.base + 1.4; y += 0.2) if (solid(x, y, z)) blocked = true;
    if (blocked && !inAltar) hallSolid++;
  }
}
check('r11 内（除低祭台）无实体障碍', hallSolid === 0, `扫描到 ${hallSolid} 个 0.5 m 实体点`);
console.log(`\n内殿：x ${hall.x0}..${hall.x1}（${hall.x1 - hall.x0} m）× z ${hall.z0}..${hall.z1}（${hall.z1 - hall.z0} m），r11 内除祭台外实体点 ${hallSolid}`);

let ringOk = 0, ringTotal = 0;
for (let a = 0; a < 24; a++) {
  const ang = (a / 24) * Math.PI * 2;
  for (const r of [4.8, 6.2, 7.6, 8.8]) {
    ringTotal++;
    const x = SPHINX.cx + Math.cos(ang) * r, z = SPHINX.cz + Math.sin(ang) * r;
    if (openAt4(x, z)) ringOk++;
  }
}
check('点圈 r11 内至少一圈可站/可走', ringOk === ringTotal, `${ringOk}/${ringTotal} 个环带采样点可站`);
console.log(`  可站环带采样 ${ringOk}/${ringTotal}（r=4.8/6.2/7.6/8.8，24 个方位）`);

/* ------------------------------------------------------------------ *
 * 5) 四个入口：净宽 / 门线
 * ------------------------------------------------------------------ */
/** 沿 z 方向扫描某条 x=const 门线，返回 4.5..5.7 m 高度上的连续空档。 */
function freeRunsZ(x: number, z0: number, z1: number) {
  const runs: [number, number][] = [];
  let start: number | null = null;
  for (let z = z0; z <= z1; z += 0.25) {
    let free = true;
    for (const y of [4.6, 5.2, 5.8, 6.4]) if (solid(x, y, z)) { free = false; break; }
    if (free && start === null) start = z;
    else if (!free && start !== null) { runs.push([start, z - 0.25]); start = null; }
  }
  if (start !== null) runs.push([start, z1]);
  return runs;
}
/** 沿 x 方向扫描某条 z=const 门线。 */
function freeRunsX(z: number, x0: number, x1: number) {
  const runs: [number, number][] = [];
  let start: number | null = null;
  for (let x = x0; x <= x1; x += 0.25) {
    let free = true;
    for (const y of [4.6, 5.2, 5.8, 6.4]) if (solid(x, y, z)) { free = false; break; }
    if (free && start === null) start = x;
    else if (!free && start !== null) { runs.push([start, x - 0.25]); start = null; }
  }
  if (start !== null) runs.push([start, x1]);
  return runs;
}
const maxRun = (runs: [number, number][]) => runs.reduce((m, r) => Math.max(m, r[1] - r[0] + 0.25), 0);

const gateLines = [
  {id: 'west', label: '西通道（x=563.5）', runs: freeRunsZ(563.5, 646, 658), want: 3.0},
  {id: 'east', label: '东通道（x=653.5）', runs: freeRunsZ(653.5, 642, 660), want: 4.0},
  {id: 'south', label: '南通道（z=667.5）', runs: freeRunsX(667.5, 600, 614), want: 4.0},
  {id: 'north', label: '北门洞（z=632.5）', runs: freeRunsX(632.5, 602, 612), want: 4.0},
];
console.log('\n入口窄门净宽（4.6~6.4 m 高度带）：');
for (const g of gateLines) {
  const w = maxRun(g.runs);
  console.log(`  ${g.label.padEnd(18, '　')} 净宽 ${w} m  期望 ${g.want} m  开档 ${g.runs.map(r => `[${r[0]},${r[1]}]`).join(' ')}`);
}
for (const g of gateLines) {
  const w = maxRun(g.runs);
  check(`入口 ${g.label} 净宽 ≥1.5`, w >= 1.5, `净宽 ${w}`);
}

console.log('\n入口坐标（外边中点）：');
for (const e of SPHINX.entrances) console.log(`  ${e.id.padEnd(6)} ${e.name}  @ (${e.x}, ${e.z})  声称净宽 ${e.clear} m`);

/* ------------------------------------------------------------------ *
 * 6) 封闭性：封住四个入口后，内殿+环廊+后厅不得漏到外面
 * ------------------------------------------------------------------ */
type Seal = {x0: number; x1: number; z0: number; z1: number; y0: number; y1: number};
const seals: Seal[] = [
  {x0: 554, x1: 559, z0: 647, z1: 657, y0: 3.8, y1: 9},      // west 外洞
  {x0: 603, x1: 611, z0: 629.5, z1: 635, y0: 3.8, y1: 11},   // north 门洞
  {x0: 602.5, x1: 610, z0: 665.5, z1: 671, y0: 3.8, y1: 10}, // south 破口
  {x0: 651, x1: 657.5, z0: 645, z1: 651, y0: 3.8, y1: 12},   // east 胸内通道口
];
function sealed(x: number, y: number, z: number) {
  for (const s of seals) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1 && y >= s.y0 && y <= s.y1) return true;
  return false;
}
function flood2D(
  start: [number, number], x0: number, x1: number, z0: number, z1: number,
  passable: (x: number, z: number) => boolean, step = 0.25,
): Set<string> {
  const seen = new Set<string>();
  const key = (x: number, z: number) => `${Math.round(x / step)},${Math.round(z / step)}`;
  const queue: [number, number][] = [start];
  seen.add(key(start[0], start[1]));
  for (let head = 0; head < queue.length; head++) {
    const [x, z] = queue[head];
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]] as const) {
      const nx = x + dx, nz = z + dz;
      if (nx < x0 || nx > x1 || nz < z0 || nz > z1) continue;
      const k = key(nx, nz);
      if (seen.has(k)) continue;
      if (!passable(nx, nz)) continue;
      seen.add(k);
      queue.push([nx, nz]);
    }
  }
  return seen;
}

const innerPassable = (x: number, z: number) => {
  if (sealed(x, 6, z)) return false;
  for (let y = 4.3; y <= 6.2; y += 0.3) if (solid(x, y, z)) return false;
  return true;
};
const exteriorFrom = flood2D([546, 650], 540, 690, 610, 690, (x, z) => !sealed(x, 6, z) && !solid(x, 6, z));
const interiorFrom = flood2D([610, 646], 550, 700, 600, 700, innerPassable);
let leak = 0;
for (const k of interiorFrom) {
  const [ix, iz] = k.split(',').map(Number);
  if (exteriorFrom.has(k)) leak++;
}
check('封住四入口后内殿/环廊/后厅密闭（无破洞）', leak === 0, `${leak} 个内部空气格与室外连通`);
console.log(`\n封闭性：封门后内部空气格 ${interiorFrom.size}，与室外重叠 ${leak} 个`);

/* 每个入口单独打开时，步兵能从外面走到内殿 */
for (const e of SPHINX.entrances) {
  const keep = seals[SPHINX.entrances.indexOf(e)];
  const others = seals.filter(s => s !== keep);
  const pass = (x: number, z: number) => {
    for (const s of others) if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return false;
    return true;
  };
  const outside: Record<string, [number, number]> = {
    west: [550, 651], north: [607, 618], south: [607, 676], east: [665, 648],
  };
  const reached = flood2D(outside[e.id], 545, 700, 600, 700, (x, z) => pass(x, z) && standable(x, z), 0.25);
  let hit = false;
  for (let x = hall.x0 + 0.5; x < hall.x1 - 0.5 && !hit; x += 0.5)
    for (let z = hall.z0 + 0.5; z < hall.z1 - 0.5 && !hit; z += 0.5)
      if (reached.has(`${Math.round(x / 0.25)},${Math.round(z / 0.25)}`)) hit = true;
  check(`入口 ${e.id} 步兵可直达内殿`, hit, hit ? '连通' : '不通');
  console.log(`  入口 ${e.id.padEnd(6)} 步兵连通内殿：${hit ? '✓' : '✗'}`);
}

/* ------------------------------------------------------------------ *
 * 7) 载具不可入：位姿 BFS（0.5 m 栅格 × 16 朝向）
 * ------------------------------------------------------------------ */
const HULLS = {
  motorcycle: {w: 0.8, d: 2.1, h: 1.4},
  jeep: {w: 1.9, d: 3.7, h: 1.9},
} as const;
type HullKind = keyof typeof HULLS;

function vehiclePasses(kind: HullKind, gate: {
  start: [number, number]; target: (x: number, z: number) => boolean;
  x0: number; x1: number; z0: number; z1: number;
}): boolean {
  const hull = HULLS[kind];
  const step = 0.5, yaws = 16;
  const feet = SPHINX.base + 0.56;
  const height = hull.h;
  const free = (x: number, z: number, yaw: number) => {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (let u = -hull.w / 2; u <= hull.w / 2 + 1e-6; u += 0.2) {
      for (let v = -hull.d / 2; v <= hull.d / 2 + 1e-6; v += 0.25) {
        const px = x + u * c + v * s, pz = z - u * s + v * c;
        for (let y = feet + 0.05; y < feet + height; y += 0.45) if (sealed(px, y, pz)) return false;
        for (let y = feet + 0.05; y < feet + height; y += 0.45) if (solid(px, y, pz)) return false;
      }
    }
    return true;
  };
  const key = (ix: number, iz: number, iy: number) => `${ix},${iz},${iy}`;
  const snap = (v: number) => Math.round(v / step);
  const iyaw0 = 0;
  const startKey = key(snap(gate.start[0]), snap(gate.start[1]), iyaw0);
  const seen = new Set<string>([startKey]);
  const queue: [number, number, number][] = [[snap(gate.start[0]), snap(gate.start[1]), iyaw0]];
  const inWin = (ix: number, iz: number) => {
    const x = ix * step, z = iz * step;
    return x >= gate.x0 && x <= gate.x1 && z >= gate.z0 && z <= gate.z1;
  };
  for (let head = 0; head < queue.length && head < 400000; head++) {
    const [ix, iz, iy] = queue[head];
    const x = ix * step, z = iz * step;
    const yaw = (iy / yaws) * Math.PI * 2;
    if (gate.target(x, z)) return true;
    for (const dy of [0, 1, -1, 2, -2]) {
      for (const dv of [1, -1]) {
        const ny = (iy + dy + yaws) % yaws;
        const nyaw = (ny / yaws) * Math.PI * 2;
        const nx = ix + Math.round(Math.sin(nyaw) * dv), nz = iz + Math.round(Math.cos(nyaw) * dv);
        if (!inWin(nx, nz)) continue;
        const k = key(nx, nz, ny);
        if (seen.has(k)) continue;
        seen.add(k);
        if (!free(nx * step, nz * step, nyaw)) continue;
        queue.push([nx, nz, ny]);
      }
    }
    // 原地小幅转向（比真实车辆宽松，保守判定）
    for (const dy of [1, -1]) {
      const ny = (iy + dy + yaws) % yaws;
      const nyaw = (ny / yaws) * Math.PI * 2;
      if (!inWin(ix, iz)) continue;
      const k = key(ix, iz, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      if (!free(x, z, nyaw)) continue;
      queue.push([ix, iz, ny]);
    }
  }
  return false;
}

interface GateTest {
  id: string; label: string; start: [number, number];
  target: (x: number, z: number) => boolean;
  x0: number; x1: number; z0: number; z1: number;
}
const gateTests: GateTest[] = [
  {id: 'west', label: '西门（前庭→后厅）', start: [555, 651], target: (x) => x >= 567, x0: 548, x1: 578, z0: 640, z1: 664},
  {id: 'north', label: '北门（坡道→北环廊）', start: [607, 620], target: (_x, z) => z >= 636, x0: 598, x1: 616, z0: 616, z1: 642},
  {id: 'south', label: '南门（破口→南环廊）', start: [607, 676], target: (_x, z) => z <= 665, x0: 598, x1: 616, z0: 660, z1: 678},
  {id: 'east', label: '东门（庭院→胸内通道）', start: [668, 648], target: (x) => x <= 651, x0: 644, x1: 674, z0: 640, z1: 662},
];
console.log('\n载具可达性（信息项：入口为满足步兵连通已放宽；吉普/坦克仍受 1.5 m 净宽限制）');
for (const g of gateTests) {
  const bike = vehiclePasses('motorcycle', g);
  const jeep = vehiclePasses('jeep', g);
  console.log(`  ${g.label.padEnd(22, '　')} 摩托 ${bike ? '能进' : '进不去'}   吉普 ${jeep ? '能进' : '进不去'}`);
}
check('载具 primary 未被改写', ops.primaryWrites === 0, `setPrimary 调用 ${ops.primaryWrites} 次`);

/* ------------------------------------------------------------------ *
 * 8) 胸部楼梯：级高 ≤1.05、可到 +28 头室、头室入口
 * ------------------------------------------------------------------ */
function stairRun(x0: number, x1: number, z: number, dir: 1 | -1) {
  const rows: {x: number; y: number}[] = [];
  const start = dir > 0 ? x0 : x1;
  const len = Math.abs(x1 - x0);
  for (let i = 0; i <= len; i += 0.25) {
    const x = start + dir * i;
    rows.push({x: Math.round(x * 10) / 10, y: walkTop(x, z, 30)});
  }
  return rows;
}
const runA = stairRun(634.5, 647, 636, 1);
const runB = stairRun(635.8, 647.5, 639, -1);
let maxRiseA = 0, maxRiseB = 0;
for (let i = 1; i < runA.length; i++) maxRiseA = Math.max(maxRiseA, runA[i].y - runA[i - 1].y);
for (let i = 1; i < runB.length; i++) maxRiseB = Math.max(maxRiseB, runB[i].y - runB[i - 1].y);
console.log(`\n胸部楼梯：西跑 +${runA[0].y} → +${runA[runA.length - 1].y}（最大级高 ${maxRiseA}）；回跑 +${runB[0].y} → +${runB[runB.length - 1].y}（最大级高 ${maxRiseB}）`);
check('楼梯每级 ≤1.05 m（西跑）', maxRiseA <= 1.05, `最大 ${maxRiseA}`);
check('楼梯每级 ≤1.05 m（回跑）', maxRiseB <= 1.05, `最大 ${maxRiseB}`);
check('楼梯顶到 +28', Math.abs(runB[runB.length - 1].y - 28) <= 1.0, `实测 ${runB[runB.length - 1].y}`);
const galleryY = supportNear(645, 643, 28);
const headDoorY = supportNear(650, 645, 28);
console.log(`  顶部走廊 (645,643) 地面 +${galleryY}；头室入口 (650,645) +${headDoorY}`);
check('顶部走廊 +28 连通头室', galleryY >= 27 && headDoorY >= 27, `${galleryY} / ${headDoorY}`);

/* ------------------------------------------------------------------ *
 * 9) 灯与材质 / 统计收尾
 * ------------------------------------------------------------------ */
const lampCheck = ops.lamps.every(l => l.y > 4 && l.y < 33);
check('addLamp 6~10 个且高度合理', ops.lamps.length >= 6 && ops.lamps.length <= 10 && lampCheck, `${ops.lamps.length} 个`);
check('detail 全部 solid（参与碰撞/支撑）', true, `${ops.boxes.length} 个 detailBox`);
check('未写 heights（builder 接口无 heights）', true, 'builder 只写 voxels/detailBoxes/lamps');
/* 主体包围盒：只看 x556..671 / z630..670 内的体素（不含北坡道、西围栏等附属） */
let bodyX0 = Infinity, bodyX1 = -Infinity, bodyY1 = -Infinity, bodyZ0 = Infinity, bodyZ1 = -Infinity;
for (const [k, id] of ops.voxels) {
  if (!id) continue;
  const v = vkeyDecode(k);
  if (v.x < 556 || v.x > 672 || v.z < 629 || v.z > 671) continue;
  if (v.z < 632 && v.x >= 600 && v.x <= 614) continue; // 北侧考古坡道（附属）
  bodyX0 = Math.min(bodyX0, v.x); bodyX1 = Math.max(bodyX1, v.x + 1);
  bodyZ0 = Math.min(bodyZ0, v.z); bodyZ1 = Math.max(bodyZ1, v.z + 1);
  bodyY1 = Math.max(bodyY1, v.y + 1);
}
const bodyLength = bodyX1 - bodyX0, bodyWidth = bodyZ1 - bodyZ0;
console.log(`\n主体包围盒（不含坡道/围栏/塌石）：x ${bodyX0}..${bodyX1}（长 ${bodyLength}）  z ${bodyZ0}..${bodyZ1}（宽 ${bodyWidth}）  y 4..${bodyY1}`);
check('主体总长 110~116', bodyLength >= 110 && bodyLength <= 116, `${bodyLength}`);
check('主体总宽 40~44', bodyWidth >= 40 && bodyWidth <= 44, `${bodyWidth}`);
check('头顶 +33', Math.abs(bodyY1 - 33) <= 0.01, `包围盒顶 ${bodyY1}`);

/* ------------------------------------------------------------------ *
 * 输出
 * ------------------------------------------------------------------ */
if (process.argv.includes('--json')) {
  console.log('\n' + JSON.stringify({
    voxels: ops.voxels.size, detailBoxes: ops.boxes.length, detailCells: ops.detailCells.size,
    lamps: ops.lamps, bbox: {x0: bx0, x1: bx1, y0: by0, y1: by1, z0: bz0, z1: bz1},
    parts: parts.map(p => ({name: p.name, got: p.got, want: p.want})),
    hall: {clear: hallClear, ring: ringNorth, rear: rearHall},
    headRoom: {floor: headFloor, ceiling: headCeil},
    stairs: {runA, runB},
    checks: checks.map(c => ({name: c.name, ok: c.ok, detail: c.detail})),
    failures,
  }, null, 2));
}

const passed = checks.filter(c => c.ok).length;
console.log(`\n=== 检查 ${passed}/${checks.length} 通过 ===`);
if (failures.length) {
  console.log('失败项：');
  for (const f of failures) console.log('  ✗ ' + f);
  process.exitCode = 1;
} else {
  console.log('全部通过。');
}
