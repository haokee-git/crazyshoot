import type {PharaohOps} from './pharaoh-structures';
import type {NavLink} from '../../maps/types';

/**
 * 法老坟墓 · A–B 地下墓道（金字塔东门 ↔ 狮身人面像西后侧）
 *
 * 契约 4.3/4.4：
 * - 路线 (396,680)→(440,620)→(505,615)→(552,650)；主宽 5.0 m、净高 3.5 m；
 *   地面 +5 缓降 → +1，再升到 B +4（0.5 m 栅格，相邻列落差 ≤1 m）。
 * - 一个前室、一个塌陷大厅、一条短支路；两个地表出口（(445,622)、(505,625) 附近）。
 * - 隧道内每 30–40 m 一对石墩，净宽 1.6 m：摩托 0.8+规划 margin 0.7=1.5 可过，
 *   吉普 1.9+0.7=2.6 不可。石墩/石门用 0.5 m detail 旋转盒（1 m 体素做不出 1.6 m），
 *   全部真实碰撞，没有隐形墙。
 * - 隧道壁/顶不依赖地形：走廊外圈 1 m 砌石 + 顶板 ≥1 m 岩层；地表低于隧道顶时
 *   自动补成岩脊（**不改 heights**），因此隧道永不露天。
 * - 全程 setPrimary 到墓道地面（载具/导航第一层地面）；顶部地表仍由 heights/support 提供。
 * - addLamp 静态暖光（低对比），方向标记用 0.5 m detail 做石雕箭头/壁龛。
 *
 * 本文件只写 voxels / detailBoxes / primary / lamps，不碰 heights 与其他文件。
 * 洞口延长段（金字塔内 5 m、狮身内 5 m）只挖空、不砌墙不封顶，保证与其他 builder
 * 的净空重叠 ≥1 m；洞口矩形见 TUNNEL_MOUTHS。
 *
 * 生成顺序：buildPharaohStructures() 里 pyramid → sphinx → tunnel，本 builder 最后跑，
 * 洞口延长段的 carve 会重新打开两侧 monument 的石壁。
 */

export type TunnelKind = 'route' | 'room' | 'hall' | 'branch' | 'niche' | 'shaft' | 'apron';

export interface TunnelPillar { s: number; x: number; z: number; gap: number; }
export interface TunnelExit {
  name: string;
  entry: [number, number];
  mouth: [number, number];
  entryFloor: number;
  top: number;
  steps: number;
  maxRiser: number;
  run: number;
  apron: number;
}
export interface TunnelReport {
  length: number;
  route: [number, number][];
  floor: { start: number; end: number; lowest: number; lowestAt: [number, number] };
  width: { grid: number; clear: number; gateClear: number; pillarGap: number };
  pillars: TunnelPillar[];
  gates: { s: number; x: number; z: number; clear: number }[];
  exits: TunnelExit[];
  rooms: { name: string; center: [number, number]; width: number; length: number; height: number }[];
  lamps: number;
  primary: { count: number; minY: number; maxY: number; bounds: [number, number, number, number] };
  rock: { minCover: number; ridgeMaxAboveGround: number; columns: number };
}

/* ------------------------------------------------------------------ */
/* 常量（口径全部来自 docs/map-pharaoh/CONTRACT.md 4.3/4.4）           */
/* ------------------------------------------------------------------ */

/**
 * 路线控制点：A 金字塔东门 → B 狮身人面像西后侧。
 * 第一段 (396,680)→(414,680) 是**正东直段**：金字塔东门开在 x=396 / z 677..683，
 * 若一出门就向东南折，门洞正前方那 10 多米会立刻落在走廊外变成实心岩（实测
 * blockedAt(400,680,.38,5)=true，人从墓室根本出不来）。18 m 直段保证门洞与
 * 墓道轴线对齐，再折向 (440,620)。
 */
export const TUNNEL_ROUTE: [number, number][] = [
  [322, 600], [336, 600], [350, 578], [372, 558], [398, 548],
  [425, 555], [438, 580], [430, 605], [400, 608], [380, 620], [365, 640], [385, 640],
];

/** 体素材质（契约 §5）。 */
const MAT = { sandstone: 81, strata: 82, granite: 83, plaster: 84, relief: 85, soot: 86 } as const;

const MOUTH_EXTEND = 5;          // 两端各深入金字塔/狮身 5 m：保证净空重叠 ≥1 m
const HALF = 3.0;                // 主通道栅格半宽：1 m 体素按列中心取样，净宽 ≈2*(3-0.5)=5.0 m
const CLEAR = 3.5;               // 净高（体素空腔 4 m，0.5 m 顶板 detail 压到 3.5）
const VOID = 4;                  // 体素空腔高度
const RIDGE = 5;                 // 岩顶 = 地面 +5：3.5 净高 + 0.5 顶板 + ≥1 m 岩层
const BAND_MAX = 5;              // 岩脊裙边圈数（1 m/圈，最外圈贴地 1 m 台阶）
const PILLAR_EDGE = 1.0;         // 石墩内缘 |u|：净宽 2.0 m（摩托可过、吉普 1.9+margin 不可）
const GATE_EDGE = 1.2;           // 石门净宽 2*1.2 = 2.4 m

/**
 * 洞口（供 pyramid / sphinx builder 对齐，本 builder 最后跑会重开这两个矩形）：
 * - A：(391..396, 677..683)，地面 +5，净空 +5.0..+8.5（4 m 体素空腔，3.5 m 净高）
 * - B：(552..557, 648..656)，地面 +4，净空 +4.0..+7.5
 */
export const TUNNEL_MOUTHS = {
  a: { x0: 317, x1: 322, z0: 597, z1: 603, floor: 5, clearTop: 8.5 },
  b: { x0: 385, x1: 390, z0: 635, z1: 645, floor: 4, clearTop: 7.5 },
} as const;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const half = (v: number) => Math.round(v * 2) / 2;   // 0.5 m：detail 能表达的精度
/** 列坐标打包（地图 x/z ≤ 1000）。 */
const key = (x: number, z: number) => x * 4096 + z;
const NEIGH8: [number, number][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
/**
 * detail() 的旋转角：局部 w 轴指向世界 (dx,dz)。
 * voxel-map-data 的 detail 用 u=dx·c−dz·s、v=dx·s+dz·c，故 w 轴 = (c,−s) → θ=atan2(−dz,dx)。
 */
const detailAngle = (dx: number, dz: number) => Math.atan2(-dz, dx);

/**
 * 法老图导航栅格（arena.bounds 1..999、step 3）。石墩只留 1.6 m 净宽，3 m 栅格
 * 只有在“缺口中心正好落在一个栅格点”时才会生成可与两侧相连的节点；否则整段
 * 墓道在导航图里会被石墩切成孤岛（Bot / 走查器进不去）。这里把石墩/石门沿路线
 * 微调几米，对准最近的栅格点。
 */
const NAV_GRID_MIN = 1, NAV_GRID_STEP = 3;
const navGridError = (v: number) =>
  Math.abs(v - (NAV_GRID_MIN + Math.round((v - NAV_GRID_MIN) / NAV_GRID_STEP) * NAV_GRID_STEP));
function snapToNavGrid(s0: number, span = 6): number {
  let bestS = s0, bestErr = Infinity;
  for (let s = s0 - span; s <= s0 + span + 1e-9; s += 0.25) {
    const p = PATH.at(s);
    const err = Math.hypot(navGridError(p.x), navGridError(p.z));
    if (err < bestErr) { bestErr = err; bestS = s; }
  }
  return Math.round(bestS * 4) / 4;
}

/* ------------------------------------------------------------------ */
/* 路径：折线 + 弧长参数化                                             */
/* ------------------------------------------------------------------ */

interface Segment { ax: number; az: number; s0: number; len: number; ux: number; uz: number; }
interface PathHit { s: number; u: number; d: number; }
interface Path {
  segs: Segment[];
  length: number;
  project(x: number, z: number): PathHit;
  at(s: number): { x: number; z: number; nx: number; nz: number; tx: number; tz: number };
}

function makePath(points: [number, number][], extend: number): Path {
  const pts = points.map(([x, z]) => ({ x, z }));
  const dir = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l };
  };
  const d0 = dir(pts[0], pts[1]);
  const dn = dir(pts[pts.length - 2], pts[pts.length - 1]);
  const head = { x: pts[0].x - d0.x * extend, z: pts[0].z - d0.z * extend };
  const tail = { x: pts[pts.length - 1].x + dn.x * extend, z: pts[pts.length - 1].z + dn.z * extend };
  const all = [head, ...pts, tail];
  const segs: Segment[] = [];
  let s = -extend;
  for (let i = 0; i < all.length - 1; i++) {
    const a = all[i], b = all[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
    const ux = (b.x - a.x) / len, uz = (b.z - a.z) / len;
    segs.push({ ax: a.x, az: a.z, s0: s, len, ux, uz });
    s += len;
  }
  let length = 0;
  for (let i = 0; i < points.length - 1; i++) length += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
  const project = (x: number, z: number): PathHit => {
    let best: PathHit = { s: 0, u: 0, d: Infinity };
    for (const seg of segs) {
      const t = clamp(((x - seg.ax) * seg.ux + (z - seg.az) * seg.uz) / seg.len, 0, 1);
      const cx = seg.ax + seg.ux * t * seg.len, cz = seg.az + seg.uz * t * seg.len;
      const d = Math.hypot(x - cx, z - cz);
      if (d < best.d) best = { s: seg.s0 + t * seg.len, u: (x - cx) * -seg.uz + (z - cz) * seg.ux, d };
    }
    return best;
  };
  const at = (sIn: number) => {
    const v = clamp(sIn, segs[0].s0, segs[segs.length - 1].s0 + segs[segs.length - 1].len);
    let seg = segs[segs.length - 1];
    for (const cand of segs) if (v <= cand.s0 + cand.len) { seg = cand; break; }
    const t = (v - seg.s0) / seg.len;
    return {
      x: seg.ax + seg.ux * t * seg.len, z: seg.az + seg.uz * t * seg.len,
      tx: seg.ux, tz: seg.uz, nx: -seg.uz, nz: seg.ux,
    };
  };
  return { segs, length, project, at };
}

/** 地面高程剖面：(0,+5) 缓降 → (140,+1) → (L,+4)。s<0 平 +5，s>L 平 +4。 */
function floorProfile(s: number, length: number): number {
  const keys: [number, number][] = [[0, 5], [Math.min(140, length * 0.74), 1], [length, 4]];
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [s1, v1] = keys[i], [s0, v0] = keys[i - 1];
    if (s <= s1) return v0 + (v1 - v0) * (s - s0) / Math.max(1e-6, s1 - s0);
  }
  return keys[keys.length - 1][1];
}

/** 路线参数化（buildTunnel 与 tools/maps/pharaoh-tunnel-probe.ts 共用，避免口径漂移）。 */
const PATH = makePath(TUNNEL_ROUTE, MOUTH_EXTEND);
export const TUNNEL_LENGTH = PATH.length;
/** 主通道地面（0.5 m 精度）。 */
export function tunnelFloor(s: number) { return half(floorProfile(s, TUNNEL_LENGTH)); }
/** 路线上 s 处的中心点 / 切向 / 左法线（左法线 ≈ 北侧）。 */
export function tunnelAt(s: number) { return PATH.at(s); }

/** 两个中途出口的立井起点（弧长 s），契约里 (445,622) / (505,625) 的“附近”。 */
export const TUNNEL_EXIT_PLAN: { name: string; entryS: number }[] = [
  { name: 'exit-1', entryS: 88.5 },   // ≈(445,619.6)，契约 (445,622) 附近
  { name: 'exit-2', entryS: 147 },    // ≈(504.5,615.2)，井道北上经过 (505,625)
];

/**
 * 石墩/石门的导航桥接（3 m 栅格无法表达 1.6/2.4 m 净宽）。
 * 与 buildTunnel 内使用的 s 完全同源，避免 nav-links 里再手抄一组坐标。
 */
const TUNNEL_PILLAR_S = [58, 96, 134, 172].map((s0) => snapToNavGrid(s0));
const TUNNEL_GATE_S = [snapToNavGrid(52, 4), snapToNavGrid(TUNNEL_LENGTH - 7, 4)];
export function tunnelNavLinks(): NavLink[] {
  const out: NavLink[] = [];
  for (const s of TUNNEL_PILLAR_S) {
    const p = PATH.at(s);
    const y = tunnelFloor(s);
    out.push({
      label: `tunnel-pillar-${Math.round(s)}`,
      ax: Math.round((p.x + p.nx * 1.35) * 10) / 10, az: Math.round((p.z + p.nz * 1.35) * 10) / 10, ay: y,
      bx: Math.round((p.x - p.nx * 1.35) * 10) / 10, bz: Math.round((p.z - p.nz * 1.35) * 10) / 10, by: y,
    });
  }
  for (const s of TUNNEL_GATE_S) {
    const p = PATH.at(s);
    const y = tunnelFloor(s);
    out.push({
      label: `tunnel-gate-${Math.round(s)}`,
      ax: Math.round((p.x + p.nx * 1.55) * 10) / 10, az: Math.round((p.z + p.nz * 1.55) * 10) / 10, ay: y,
      bx: Math.round((p.x - p.nx * 1.55) * 10) / 10, bz: Math.round((p.z - p.nz * 1.55) * 10) / 10, by: y,
    });
  }
  return out;
}

const EXIT_SLOPE = 0.45;   // 24° 石阶
const EXIT_LANDING = 1.5;  // 井底平台（与隧道地面齐平）
const EXIT_HALF = 2.3;     // 井道半宽 → 净宽 3.6 m
const EXIT_APRON = 7;      // 井口外下行石坡长度

export interface TunnelExitGeom {
  name: string;
  /** 井道在隧道中心线上的弧长（QA/工具可从 tunnelAt(entryS ± n) 起步） */
  entryS: number;
  entry: [number, number];
  mouth: [number, number];
  entryFloor: number;
  top: number;
  run: number;
  steps: number;
  landing: number;
  slope: number;
}

/**
 * 出口井道几何（**纯函数**，给定地形表面高度就能复算；buildTunnel 与 QA/工具共用，
 * 避免把井口坐标写死第二份）。石阶从隧道壁外向地表爬，爬到与地表相交为止。
 */
export function tunnelExitGeom(ground: (x: number, z: number) => number): TunnelExitGeom[] {
  const g = (x: number, z: number) => Math.round(ground(x, z));
  return TUNNEL_EXIT_PLAN.map((plan) => {
    const hit = PATH.at(plan.entryS);
    const entry = { x: hit.x + hit.nx * HALF, z: hit.z + hit.nz * HALF };
    const entryFloor = half(floorProfile(plan.entryS, TUNNEL_LENGTH));
    let run = 0;
    for (let d = EXIT_LANDING + 2; d <= 28.0001; d += 0.5) {
      const y = g(entry.x + hit.nx * d, entry.z + hit.nz * d);
      if (entryFloor + EXIT_SLOPE * (d - EXIT_LANDING) >= y - 0.5) { run = d; break; }
    }
    if (!run) run = 26;
    const mouth = { x: entry.x + hit.nx * run, z: entry.z + hit.nz * run };
    const surface = g(mouth.x, mouth.z);
    const top = Math.max(surface, half(entryFloor + EXIT_SLOPE * (run - EXIT_LANDING)));
    return {
      name: plan.name,
      entryS: plan.entryS,
      entry: [entry.x, entry.z] as [number, number],
      mouth: [mouth.x, mouth.z] as [number, number],
      entryFloor, top, run, steps: Math.round((top - entryFloor) / 0.5),
      landing: EXIT_LANDING, slope: EXIT_SLOPE,
    };
  });
}

/* ------------------------------------------------------------------ */
/* 通道原语                                                            */
/* ------------------------------------------------------------------ */

interface Passage {
  name: string;
  ax: number; az: number; bx: number; bz: number;
  half: number;
  prio: number;
  kind: TunnelKind;
  /** localS = 自 a 点起的米数 */
  floor: (localS: number) => number;
  open: boolean | ((localS: number, groundY: number) => boolean);
}

interface Cell {
  x: number; z: number;
  floor: number;
  routeS: number;
  routeU: number;
  open: boolean;
  kind: TunnelKind;
  prio: number;
}

function projectPassage(p: Passage, x: number, z: number) {
  const dx = p.bx - p.ax, dz = p.bz - p.az, len = Math.hypot(dx, dz) || 1;
  const ux = dx / len, uz = dz / len;
  const t = clamp(((x - p.ax) * ux + (z - p.az) * uz) / len, 0, 1);
  const cx = p.ax + ux * t * len, cz = p.az + uz * t * len;
  return { d: Math.hypot(x - cx, z - cz), localS: t * len };
}

/* ------------------------------------------------------------------ */
/* 主函数                                                              */
/* ------------------------------------------------------------------ */

export function buildTunnel(ops: PharaohOps): TunnelReport {
  const path = PATH;
  const L = TUNNEL_LENGTH;
  const groundAt = (x: number, z: number) => Math.round(ops.ground(x, z));
  const routeFloor = tunnelFloor;
  const atS = (s: number) => path.at(s);
  /** 路线上某点 + 横向偏移（左法线正向）。 */
  const offset = (s: number, u: number) => {
    const hit = path.at(s);
    return { x: hit.x + hit.nx * u, z: hit.z + hit.nz * u };
  };

  /* ---------------- 1. 通道原语 ---------------- */

  const passages: Passage[] = [];
  // 主通道：三段折线（含两端 5 m 洞口延长段），地面走剖面
  for (const seg of path.segs) {
    passages.push({
      name: `route-${seg.s0.toFixed(0)}`,
      ax: seg.ax, az: seg.az,
      bx: seg.ax + seg.ux * seg.len, bz: seg.az + seg.uz * seg.len,
      half: HALF, prio: 0, kind: 'route', open: false,
      floor: (localS) => routeFloor(seg.s0 + localS),
    });
  }

  // 前室（s 28..46，净宽 9 m）
  const roomA0 = atS(28), roomA1 = atS(46);
  passages.push({
    name: 'antechamber', ax: roomA0.x, az: roomA0.z, bx: roomA1.x, bz: roomA1.z,
    half: 4.5, prio: 1, kind: 'room', open: false,
    floor: (localS) => routeFloor(28 + localS),
  });

  // 塌陷大厅（s 108..128，净宽 14 m；20 m 长）
  const hall0 = atS(108), hall1 = atS(128);
  passages.push({
    name: 'hall', ax: hall0.x, az: hall0.z, bx: hall1.x, bz: hall1.z,
    half: 7.0, prio: 1, kind: 'hall', open: false,
    floor: (localS) => routeFloor(108 + localS),
  });

  // 短支路：自大厅北墙向北 16 m，净宽 2.8 m（按路线法线计算，不再写死坐标）
  const nicheFloor = routeFloor(118);
  const branchAx = offset(118, 7.0);
  const branchAt = atS(118);
  const branchEnd = {x: branchAx.x + branchAt.nx * 16, z: branchAx.z + branchAt.nz * 16};
  const nicheEnd = {x: branchEnd.x + branchAt.nx * 6, z: branchEnd.z + branchAt.nz * 6};
  const nicheCenter = {x: branchEnd.x + branchAt.nx * 3, z: branchEnd.z + branchAt.nz * 3};
  passages.push({
    name: 'side-branch', ax: branchAx.x, az: branchAx.z, bx: branchEnd.x, bz: branchEnd.z,
    half: 1.4, prio: 3, kind: 'branch', open: false,
    floor: () => nicheFloor,
  });
  // 支路尽头的墓室（6×6）
  passages.push({
    name: 'niche', ax: branchEnd.x, az: branchEnd.z, bx: nicheEnd.x, bz: nicheEnd.z,
    half: 3.0, prio: 2, kind: 'niche', open: false,
    floor: () => nicheFloor,
  });

  /* ---------------- 2. 两个地表出口（垂直井道，避开大厅/支路） ---------------- */

  // 井道几何（tunnelExitGeom 纯函数，与 QA/工具同源）：先 1.5 m 平台，再 0.45/m 爬升
  const exitInfo: TunnelExit[] = [];
  for (const exit of tunnelExitGeom(groundAt)) {
    const { entryFloor, top, run, landing: LANDING, slope: SLOPE } = exit;
    const hit = atS(TUNNEL_EXIT_PLAN.find((p) => p.name === exit.name)!.entryS);
    const dirX = hit.nx, dirZ = hit.nz;
    const entry = { x: exit.entry[0], z: exit.entry[1] };
    const mouth = { x: exit.mouth[0], z: exit.mouth[1] };
    const rise = top - entryFloor;
    const shaftFloor = (localS: number) =>
      half(entryFloor + SLOPE * clamp(localS - LANDING, 0, run - LANDING));
    passages.push({
      name: exit.name, ax: entry.x, az: entry.z, bx: mouth.x, bz: mouth.z,
      half: 2.3, prio: 4, kind: 'shaft',
      open: (localS: number, groundY: number) => localS > 2.5 && shaftFloor(localS) + VOID >= groundY,
      floor: shaftFloor,
    });
    // 井口外的下行石坡：top → 附近地面，长 7 m，两侧矮墙由 ring 自动生成。
    // 轴线外移 2.3 m（=半宽），避免缓坡的圆头又盖回井道、在井口顶出一个 1–2 m 台阶。
    const a0x = mouth.x + dirX * 2.3, a0z = mouth.z + dirZ * 2.3;
    const a1x = mouth.x + dirX * 9.3, a1z = mouth.z + dirZ * 9.3;
    const groundEnd = Math.min(top, groundAt(Math.floor(a1x), Math.floor(a1z)));
    passages.push({
      name: `${exit.name}-apron`, ax: a0x, az: a0z, bx: a1x, bz: a1z,
      half: 2.3, prio: 5, kind: 'apron', open: true,
      floor: (localS) => half(top - (top - groundEnd) * clamp(localS / 7, 0, 1)),
    });
    exitInfo.push({
      name: exit.name,
      entry: [entry.x, entry.z], mouth: [mouth.x, mouth.z],
      entryFloor, top, steps: Math.round(rise / 0.5), maxRiser: 0.5, run, apron: top - groundEnd,
    });
  }

  /* ---------------- 3. 栅格化到列 ---------------- */

  const cells = new Map<number, Cell>();
  for (const p of passages) {
    const pad = p.half + 1;
    const minX = Math.floor(Math.min(p.ax, p.bx) - pad), maxX = Math.ceil(Math.max(p.ax, p.bx) + pad);
    const minZ = Math.floor(Math.min(p.az, p.bz) - pad), maxZ = Math.ceil(Math.max(p.az, p.bz) + pad);
    for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
      const cx = x + 0.5, cz = z + 0.5;
      const hit = projectPassage(p, cx, cz);
      if (hit.d > p.half) continue;
      const floor = half(p.floor(hit.localS));
      const route = path.project(cx, cz);
      const g = groundAt(x, z);
      let open = typeof p.open === 'function' ? p.open(hit.localS, g) : p.open;
      // 井道压在隧道本体上的那几列必须保持有顶：否则会在隧顶开一个天窗。
      if (p.kind === 'shaft' && route.d <= HALF - 0.25) open = false;
      const k = key(x, z), prev = cells.get(k);
      if (!prev || floor > prev.floor || (floor === prev.floor && p.prio < prev.prio)) {
        cells.set(k, { x, z, floor, routeS: route.s, routeU: route.u, open, kind: p.kind, prio: p.prio });
      }
    }
  }

  /* ---------------- 4. 石墩与石门（0.5 m detail 旋转盒 = 真实碰撞） ---------------- */

  // 石墩：基数 58/96/134/172，再吸附到 3 m 导航栅格（否则 1.6 m 缺口在 nav 里是墙）
  const pillarS = [58, 96, 134, 172].map((s0) => snapToNavGrid(s0));
  const pillars: TunnelPillar[] = [];
  for (const s of pillarS) {
    const p = atS(s);
    const angle = detailAngle(p.nx, p.nz);
    const depth = HALF + 1.5 - PILLAR_EDGE;   // 3.7 m 进深（含 1.5 m 咬进岩壁，raster 不会漏）
    for (const side of [-1, 1]) {
      ops.detail('tunnel-pier', p.x + p.nx * side * (PILLAR_EDGE + depth / 2), p.z + p.nz * side * (PILLAR_EDGE + depth / 2),
        depth, 2.0, routeFloor(s), CLEAR, MAT.sandstone, angle, true);
    }
    pillars.push({ s, x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10, gap: PILLAR_EDGE * 2 });
  }

  // 石门 / 窄门：s=16、s≈L-6 各一道，净宽 2.4 m、净高 2.6 m
  const gates: { s: number; x: number; z: number; clear: number }[] = [];
  const gateS = [snapToNavGrid(52, 4), snapToNavGrid(L - 7, 4)];
  for (const gs of gateS) {
    const p = atS(gs);
    const angle = detailAngle(p.nx, p.nz);
    const depth = HALF + 1.5 - GATE_EDGE;
    for (const side of [-1, 1]) {
      ops.detail('tunnel-gate', p.x + p.nx * side * (GATE_EDGE + depth / 2), p.z + p.nz * side * (GATE_EDGE + depth / 2),
        depth, 2.0, routeFloor(gs), CLEAR, MAT.granite, angle, true);
    }
    // 门楣：净高 2.6 m
    ops.detail('tunnel-gate-lintel', p.x, p.z, GATE_EDGE * 2 + 0.4, 2.0, routeFloor(gs) + 2.6, CLEAR - 2.6, MAT.granite, angle, true);
    gates.push({ s: gs, x: p.x, z: p.z, clear: GATE_EDGE * 2 });
  }

  /* ---------------- 5. 逐列生成：基础 / 空腔 / 顶板 / 地面 ---------------- */

  const floorMaterial = (c: Cell) => {
    if (c.kind === 'room' || c.kind === 'niche') return MAT.plaster;
    if (c.kind === 'hall') return MAT.relief;
    if (c.kind === 'branch' || c.kind === 'shaft' || c.kind === 'apron') return MAT.strata;
    return ((c.x * 7 + c.z * 13) & 15) === 0 ? MAT.plaster : MAT.sandstone;
  };

  let primaryCount = 0, primaryMin = Infinity, primaryMax = -Infinity;
  let px0 = Infinity, px1 = -Infinity, pz0 = Infinity, pz1 = -Infinity;
  let ridgeMaxAboveGround = 0, rockColumns = 0, minCover = Infinity;

  for (const c of cells.values()) {
    const g = groundAt(c.x, c.z);
    const vy = Math.floor(c.floor);
    const rt = Math.floor(c.floor + RIDGE);
    const base = Math.min(g - 1, vy - 2);
    // A 端延长段在金字塔东廊道里（pyramid 要求 391..396 不加顶板，净高交给他们），
    // B 端延长段有 3 m 在狮身西壁之外，必须自己补岩顶，否则洞口前会开一条 4 m 明沟。
    const insideMouth = c.routeS < -0.001;

    // 基础：地形低时把隧道垫起来（不改 heights，只加体素）
    if (vy > base) ops.column(c.x, c.z, base, vy, MAT.strata);
    // 地面表层
    ops.put(c.x, vy - 1, c.z, floorMaterial(c));
    // 0.5 m 地面：体素只能到整数，用 0.5 m 底板 detail 补上半级，
    // 否则 primary 会比真实可站面高 0.5 m（载具浮空、nav 层与 primary 打架）。
    if (c.floor > vy + 0.001) {
      ops.detail('tunnel-tread', c.x + 0.5, c.z + 0.5, 1, 1, vy, c.floor - vy, floorMaterial(c), 0, true);
    }
    // 空腔
    ops.carve(c.x, c.z, c.x + 1, c.z + 1, vy, vy + VOID);
    // 顶板 + 岩层：只在隧道段补，洞口延长段交给金字塔/狮身人面像本体
    if (!insideMouth && !c.open && g < rt) {
      ops.column(c.x, c.z, vy + VOID, vy + VOID + 1, MAT.soot);
      if (rt > vy + VOID + 1) ops.column(c.x, c.z, vy + VOID + 1, rt, MAT.strata);
      ops.put(c.x, rt - 1, c.z, MAT.strata);
      ridgeMaxAboveGround = Math.max(ridgeMaxAboveGround, rt - g);
      rockColumns++;
      minCover = Math.min(minCover, rt - (c.floor + CLEAR));
    }
    // 载具/导航第一层地面
    ops.setPrimary(c.x + 0.5, c.z + 0.5, c.floor);
    primaryCount++;
    primaryMin = Math.min(primaryMin, c.floor);
    primaryMax = Math.max(primaryMax, c.floor);
    px0 = Math.min(px0, c.x); px1 = Math.max(px1, c.x + 1);
    pz0 = Math.min(pz0, c.z); pz1 = Math.max(pz1, c.z + 1);
  }

  /* ---------------- 6. 砌体：墙圈 + 岩脊裙边 ---------------- */

  interface Band { d: number; floor: number; rt: number; open: boolean; routeS: number; }
  const bands = new Map<number, Band>();
  const visited = new Set(cells.keys());
  type Wave = { x: number; z: number; floor: number; rt: number; open: boolean; routeS: number };
  let frontier: Wave[] = [];
  for (const c of cells.values()) {
    frontier.push({
      x: c.x, z: c.z, floor: c.floor,
      rt: c.open ? Math.floor(c.floor) + 2 : Math.floor(c.floor + RIDGE),
      open: c.open, routeS: c.routeS,
    });
  }
  for (let step = 1; step <= BAND_MAX; step++) {
    const next: Wave[] = [];
    for (const f of frontier) {
      for (const [dx, dz] of NEIGH8) {
        const x = f.x + dx, z = f.z + dz, k = key(x, z);
        if (visited.has(k)) continue;
        visited.add(k);
        bands.set(k, { d: step, floor: f.floor, rt: f.rt, open: f.open, routeS: f.routeS });
        next.push({ x, z, floor: f.floor, rt: f.rt, open: f.open, routeS: f.routeS });
      }
    }
    frontier = next;
  }

  for (const [k, b] of bands) {
    if (b.routeS < 0 || b.routeS > L) continue;   // 洞口延长段不砌墙、不封顶
    const x = Math.floor(k / 4096), z = k % 4096;
    const g = groundAt(x, z);
    const vy = Math.floor(b.floor);
    const base = Math.min(g - 1, vy - 2);
    if (b.d === 1) {
      // 墙圈：整圈砌到岩顶；地表出口段压成 1.2–2 m 矮墙（防“出口即死地”）
      const top = b.open ? Math.max(g + 1, vy + 2) : b.rt;
      if (top <= base) continue;
      ops.column(x, z, base, vy, MAT.strata);
      ops.column(x, z, vy, vy + 2, MAT.sandstone);
      if (top > vy + 2) ops.column(x, z, vy + 2, Math.min(top, vy + 3), MAT.strata);
      if (top > vy + 3) ops.column(x, z, vy + 3, top, MAT.soot);
      continue;
    }
    // 岩脊裙边：每圈降 1 m，最外圈不低于地面 +1 m（1 m 台阶，玩家可上）
    const top = Math.max(g + 1, b.rt - (b.d - 1));
    if (top <= g) continue;
    ops.column(x, z, g, top, MAT.strata);
  }

  /* ---------------- 7. 顶板压条（净高精确 3.5 m） ---------------- */

  // 整数地面时体素空腔是 4 m，用 0.5 m 顶板 detail 压到 3.5；半米地面自身就是 3.5。
  // 按 z 行合并连续列，减少 detail 调用。
  const trimRows = new Map<number, Cell[]>();
  for (const c of cells.values()) {
    if (c.open || c.routeS < -0.001 || !Number.isInteger(c.floor)) continue;   // A 洞口段顶板归 pyramid
    const row = trimRows.get(c.z);
    if (row) row.push(c); else trimRows.set(c.z, [c]);
  }
  for (const [z, row] of trimRows) {
    row.sort((a, b) => a.x - b.x);
    let i = 0;
    while (i < row.length) {
      let j = i + 1;
      while (j < row.length && row[j].x === row[j - 1].x + 1 && row[j].floor === row[i].floor) j++;
      const w = j - i, floor = row[i].floor;
      ops.detail('tunnel-ceiling', row[i].x + w / 2, z + 0.5, w, 1, floor + CLEAR, 0.5, MAT.soot, 0, true);
      i = j;
    }
  }

  /* ---------------- 8. 前室 / 大厅 / 支路内部 ---------------- */

  // 前室：两侧石凳 + 侧壁假门（w 轴沿路线方向）
  for (const side of [-1, 1]) {
    for (const s of [25, 29.5, 34, 38]) {
      const p = atS(s);
      const u = side * 4.1;
      ops.detail('tunnel-bench', p.x + p.nx * u, p.z + p.nz * u, 3.2, 0.7, routeFloor(s), 0.5,
        MAT.sandstone, detailAngle(p.tx, p.tz), true);
    }
  }
  const falseDoor = atS(30);
  ops.detail('tunnel-false-door', falseDoor.x - falseDoor.nx * 4.3, falseDoor.z - falseDoor.nz * 4.3, 2.0, 0.6,
    routeFloor(30), 2.2, MAT.granite, detailAngle(falseDoor.tx, falseDoor.tz), true);

  // 大厅：塌落堆 / 断裂石柱 / 残梁（全部让出中央 5 m 通道）
  const hallFloor = routeFloor(118);
  const rubble: [number, number, number][] = [
    [-5.4, 3.0, 1.6], [-4.6, 6.0, 1.0], [5.6, -4.0, 1.8], [4.8, 7.0, 1.2],
    [-6.0, -3.0, 2.0], [6.2, 3.0, 1.4], [-4.4, 9.0, 1.0], [4.6, -9.0, 1.2],
  ];
  for (const [u, ds, h] of rubble) {
    const p = atS(118 + ds);
    const wx = p.x + p.nx * u, wz = p.z + p.nz * u;
    const step = Math.max(1, Math.round(h));
    for (let y = 0; y < step; y++) {
      ops.column(Math.floor(wx), Math.floor(wz), Math.floor(hallFloor) + y, Math.floor(hallFloor) + y + 1, MAT.strata);
    }
    ops.detail('tunnel-rubble', wx, wz, 2.4, 2.0, hallFloor + h, 0.5, MAT.relief,
      detailAngle(p.tx, p.tz) + u * 0.08, true);
  }
  for (const [u, ds] of [[-4.2, -9], [4.2, 9]] as [number, number][]) {
    const p = atS(118 + ds);
    ops.detail('tunnel-broken-column', p.x + p.nx * u, p.z + p.nz * u, 1.1, 1.1, hallFloor, 2.6,
      MAT.granite, detailAngle(p.nx, p.nz), true);
    ops.detail('tunnel-broken-column', p.x + p.nx * u, p.z + p.nz * u, 1.5, 1.5, hallFloor + 2.6, 0.4,
      MAT.granite, detailAngle(p.nx, p.nz), true);
  }
  // 塌落残梁：靠大厅两侧斜倚，2.4 m 高，不跨中轴
  for (const [u, ds] of [[-4.6, -6], [4.6, 6]] as [number, number][]) {
    const p = atS(118 + ds);
    ops.detail('tunnel-fallen-beam', p.x + p.nx * u, p.z + p.nz * u, 3.2, 0.8, hallFloor + 2.4, 1.1,
      MAT.strata, detailAngle(p.nx, p.nz) + 0.05 * ds, true);
  }

  // 短支路尽端墓室：陶罐 + 假门
  for (const [dx, dz, r] of [[-1.8, -1.2, 1.2], [-2.0, 0.4, 0.9], [1.9, -1.3, 1.1], [1.5, 1.4, 1.0], [-0.3, 1.8, 0.8]]) {
    ops.detail('tunnel-urn', nicheCenter.x + dx, nicheCenter.z + dz, r, r, nicheFloor, 0.8, MAT.relief, dx * 0.3, true);
  }
  ops.detail('tunnel-niche-door', nicheCenter.x + branchAt.nx * 4.6, nicheCenter.z + branchAt.nz * 4.6, 2.4, 0.6, nicheFloor, 2.4, MAT.granite, detailAngle(branchAt.nx, branchAt.nz), true);

  /* ---------------- 9. 出口井口保护：岩石 / 矮墙 / 沙丘背坡 ---------------- */

  for (const exit of exitInfo) {
    const mx = exit.mouth[0], mz = exit.mouth[1];
    const dirLen = Math.hypot(mx - exit.entry[0], mz - exit.entry[1]) || 1;
    const dx = (mx - exit.entry[0]) / dirLen, dz = (mz - exit.entry[1]) / dirLen;
    const nx = -dz, nz = dx;
    // 井口两侧大石
    for (const side of [-1, 1]) for (const along of [1.2, 4.2]) {
      const bx = mx + dx * along + nx * side * 2.9, bz = mz + dz * along + nz * side * 2.9;
      const bg = groundAt(Math.floor(bx), Math.floor(bz));
      ops.detail('tunnel-exit-rock', bx, bz, 2.0, 1.6, bg, 1.6, MAT.strata, side * 0.4, true);
    }
    // 井口外沙丘背坡（矮石堆），给井口一个能趴的背光面
    for (const along of [2.4, 5.6]) {
      const bx = mx + dx * along - nx * 3.0, bz = mz + dz * along - nz * 3.0;
      const bg = groundAt(Math.floor(bx), Math.floor(bz));
      ops.detail('tunnel-exit-berm', bx, bz, 3.0, 1.2, bg, 1.0, MAT.strata, detailAngle(dx, dz), true);
    }
  }

  /* ---------------- 10. 方向标记：石雕箭头 / 壁龛 ---------------- */

  for (const [i, s] of [12, 34, 58, 82, 106, 130, 154, 178, 202, 226].entries()) {
    const side = i % 2 ? 1 : -1;
    const p = atS(s);
    const angle = detailAngle(p.tx, p.tz);       // w 轴沿路线（箭杆指向 B 端）
    const u = side * (HALF - 0.55);
    const bx = p.x + p.nx * u, bz = p.z + p.nz * u;
    const y = routeFloor(s);
    // 箭杆 + 箭头 + 尾羽（0.5 m detail，solid:false 纯装饰，不缩净宽）
    ops.detail('tunnel-arrow', bx, bz, 1.6, 0.5, y + 1.5, 0.5, MAT.relief, angle, false);
    ops.detail('tunnel-arrow', bx + p.tx * 1.1, bz + p.tz * 1.1, 0.7, 0.5, y + 1.5, 0.5, MAT.relief, angle, false);
    ops.detail('tunnel-arrow', bx - p.tx * 0.75 + p.nx * side * 0.35, bz - p.tz * 0.75 + p.nz * side * 0.35,
      0.5, 0.5, y + 1.5, 0.5, MAT.relief, angle, false);
  }
  for (const [i, s] of [28, 100, 150].entries()) {
    const side = i % 2 ? -1 : 1;
    const p = atS(s);
    const u = side * (HALF - 0.5);
    const y = routeFloor(s);
    // 壁龛：深色凹槽（solid:false，视觉凹陷，不挡人）
    ops.detail('tunnel-niche', p.x + p.nx * u, p.z + p.nz * u, 1.2, 0.5, y + 1.7, 1.1, MAT.soot, detailAngle(p.tx, p.tz), false);
  }

  /* ---------------- 11. 静态灯（低对比暖光） ---------------- */

  let lampCount = 0;
  for (let s = 10; s <= L - 8; s += 13) {
    const p = atS(s);
    const side = (lampCount % 2 ? 1 : -1) * 1.9;
    ops.addLamp(p.x + p.nx * side, routeFloor(s) + 3.05, p.z + p.nz * side);
    lampCount++;
  }
  for (const exit of exitInfo) {
    ops.addLamp(exit.mouth[0], exit.top - 0.4, exit.mouth[1]);
    lampCount++;
  }
  ops.addLamp(nicheCenter.x, nicheFloor + 2.6, nicheCenter.z);
  lampCount++;

  /* ---------------- 12. 报表 ---------------- */

  let lowest = Infinity, lowestAt: [number, number] = [0, 0];
  for (let s = 0; s <= L; s += 1) {
    const f = routeFloor(s);
    if (f < lowest) { lowest = f; const p = atS(s); lowestAt = [Math.round(p.x), Math.round(p.z)]; }
  }

  const rooms = [
    {
      name: 'antechamber',
      center: [Math.round((roomA0.x + roomA1.x) / 2), Math.round((roomA0.z + roomA1.z) / 2)] as [number, number],
      width: 9, length: Math.round(Math.hypot(roomA1.x - roomA0.x, roomA1.z - roomA0.z)), height: CLEAR,
    },
    {
      name: 'hall',
      center: [Math.round((hall0.x + hall1.x) / 2), Math.round((hall0.z + hall1.z) / 2)] as [number, number],
      width: 14, length: Math.round(Math.hypot(hall1.x - hall0.x, hall1.z - hall0.z)), height: CLEAR,
    },
    { name: 'niche', center: [nicheCenter.x, nicheCenter.z] as [number, number], width: 6, length: 6, height: CLEAR },
  ];

  return {
    length: Math.round(L * 10) / 10,
    route: TUNNEL_ROUTE,
    floor: { start: routeFloor(0), end: routeFloor(L), lowest, lowestAt },
    width: { grid: HALF * 2, clear: (HALF - 0.5) * 2, gateClear: GATE_EDGE * 2, pillarGap: PILLAR_EDGE * 2 },
    pillars,
    gates,
    exits: exitInfo,
    rooms,
    lamps: lampCount,
    primary: {
      count: primaryCount,
      minY: primaryMin === Infinity ? 0 : primaryMin,
      maxY: primaryMax === -Infinity ? 0 : primaryMax,
      bounds: [px0, pz0, px1, pz1],
    },
    rock: {
      minCover: Number.isFinite(minCover) ? Math.round(minCover * 100) / 100 : 0,
      ridgeMaxAboveGround,
      columns: rockColumns,
    },
  };
}
