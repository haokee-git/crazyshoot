/**
 * 法老坟墓 · F 卡纳克列柱神庙 / G 帝王谷采石场（800×800 新布局）
 *
 * 契约：docs/map-pharaoh/CONTRACT.md §2 / §4.4；新布局锚点见 `layout.ts`，
 * 对外道路只读 `network.ts`（temple-axis / temple-gate / temple-east / f-c / f-east /
 * ef-south / quarry-haul / west-oasis-quarry / west-quarry-pyramid / g-c）。
 *
 * F 卡纳克列柱神庙 · 中心/据点 (650,130)，r12，地面 +4.0，场地包络 557..743 / 47..213
 *   从南到北的仪式序列（全部沿 x=650 轴，与 network 的 temple-axis 同轴）：
 *     南门楼（z68..85，20 m 门洞）→ 前庭（z85..116，两侧列柱 + 两座方尖碑）→
 *     主柱厅（z116..160，中殿净宽 48 m，中央占点区 r12 内无实体，最近实体 14.3 m）→
 *     圣所（z164..196，南北双门洞）→ 北门楼（z198..210）→ temple-gate / 主路。
 *   东侧院道 `temple-east` 从 (700,130) 进入主柱厅东侧廊（东侧廊在 z=130 留 6.8 m 门洞），
 *   西侧为侧柱廊/侧殿；东北角与西南角是倒塌柱区；外围三面残墙按道路留缺口。
 *   柱高 8.4–11.2 m（40 根立柱 + 2 根断柱残桩），倒塌柱鼓 9 段，方尖碑 13.5 / 15 m。
 *
 * G 帝王谷采石场 · 中心/据点 (210,420)，r12，地面 +3.0，场地包络 110..310 / 332..507
 *   西侧是三级开采台阶（0.8–0.9 m 级高，可步行上下），台阶顶 3.9/4.8/5.7；
 *   东北是 7 m 宽、0.3/0.4/0.5 m 级高的车辆坡道 + 0.5 m 装车台（车辆可过，不卡 bench）；
 *   东/东南是切割石块堆场与两座工棚，西南角保留半埋巨像（26×20，h14）。
 *   z 455..478 完全留空，作为 G ↔ A 金字塔南门的开阔前庭（Lead 预留 4 个中立载具位
 *   (140/155/170/185,462) 全部落在净空带内）；东缘 x≥300 不放实体，给 (315,470) 重机枪留通路。
 *
 * 本文件只产出 MapDef 数据（terrain / covers / props / decor / scenePads），不写体素；
 * 柱、方尖碑、过梁、巨像、工棚等细节由世界生成器解释 `kind` + `height`。
 * 特殊地表全部 `preserveUnderRoads: true`：F 石铺广场、G 采石场石面/石渣/装车台，
 * 避免道路铺装盖掉作者铺面。
 */
import type { Building, Cover, CoverKind, DecorPlane, Polygon, Prop, TerrainKind, TerrainPatch, Vec2 } from '../types';
import { cover, prop } from '../helpers';

/* ------------------------------------------------------------------ *
 * 基准（与 layout.ts 的 PHARAOH_LAYOUT.F / .G 完全一致）
 * ------------------------------------------------------------------ */

export const TEMPLE_CENTER: Vec2 = [650, 130];
export const TEMPLE_GROUND = 4.0;
export const TEMPLE_POINT_RADIUS = 12;
/** F 点圈内净空：任何实体（含柱/过梁/方尖碑/道具）footprint 到圆心 ≥ 13 m。 */
export const TEMPLE_POINT_CLEARANCE = 13;
/** 初始场地包络（空间预算，不是可见平台；可见边界见 TEMPLE_SITE 多边形）。 */
export const TEMPLE_BOUNDS = { x0: 557, z0: 47, x1: 743, z1: 213 };

export const QUARRY_CENTER: Vec2 = [210, 420];
export const QUARRY_GROUND = 3.0;
export const QUARRY_POINT_RADIUS = 12;
export const QUARRY_POINT_CLEARANCE = 13;
export const QUARRY_BOUNDS = { x0: 110, z0: 332, x1: 310, z1: 507 };

/* ------------------------------------------------------------------ *
 * 局部工具
 * ------------------------------------------------------------------ */

/** 多边形面积（m²），用于导出真实场地/核心区面积。 */
function polygonArea(points: Polygon): number {
  let twice = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    twice += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  }
  return Math.abs(twice) / 2;
}

/** 作者铺面：一律保留原材质，不让公路/支路把石铺/石渣/装车台盖成沥青。 */
function surface(
  id: string,
  kind: TerrainKind,
  polygon: Polygon,
  label: string,
  surfacePriority = 2,
): TerrainPatch {
  return { id, kind, polygon, elevation: 0, opacity: 1, label, preserveUnderRoads: true, surfacePriority };
}

/** 有稳定 id 的 cover（同一 id 的相邻 0.5 m 行会被生成器合并成一个碰撞盒）。 */
let templeSeq = 0;
let quarrySeq = 0;
function fCover(kind: CoverKind, x: number, z: number, w: number, d: number, rot: number, extra: Partial<Cover>): Cover {
  return cover(kind, x, z, w, d, rot, { id: `temple-${++templeSeq}`, ...extra });
}
function gCover(kind: CoverKind, x: number, z: number, w: number, d: number, rot: number, extra: Partial<Cover>): Cover {
  return cover(kind, x, z, w, d, rot, { id: `quarry-${++quarrySeq}`, ...extra });
}

/** 立/断柱：[x, z, 高度, 直径]。h < 4 表示断柱残桩。 */
type ColSpec = [number, number, number, number];
const columnCovers = (specs: ColSpec[], make: typeof fCover): Cover[] =>
  specs.map(([x, z, h, w]) =>
    make('column', x, z, w, w, 0, { height: h, color: '#b6a98d', label: h < 4 ? '断柱残桩' : '列柱' }),
  );

/** 倒塌柱鼓/倒下的方尖碑段：[x, z, 长, 宽, 旋转, 高]。 */
type DrumSpec = [number, number, number, number, number, number];
const drumCovers = (specs: DrumSpec[], make: typeof fCover, label = '倒塌柱鼓'): Cover[] =>
  specs.map(([x, z, w, d, rot, h]) => make('column', x, z, w, d, rot, { height: h, color: '#a89a80', label }));

/** 残墙/石台：[x, z, 长, 厚, 旋转, 高]。 */
type WallSpec = [number, number, number, number, number, number];
const wallCovers = (specs: WallSpec[], make: typeof fCover, label = '残墙'): Cover[] =>
  specs.map(([x, z, w, d, rot, h]) => make('wall', x, z, w, d, rot, { height: h, label }));

/** 过梁（悬浮在柱顶的横梁）：height 是梁顶相对地面的高度。 */
type BeamSpec = [number, number, number, number, number];
const beamCovers = (specs: BeamSpec[], make: typeof fCover): Cover[] =>
  specs.map(([x, z, w, d, top]) => make('architrave', x, z, w, d, 0, { height: top, label: '石过梁' }));

/* ================================================================== *
 * F · 卡纳克列柱神庙
 * ================================================================== */

/* ------------------------------------------------------------------ *
 * 柱列：前庭 8 / 主柱厅中殿 12 / 侧廊 8 / 圣所 4 / 东西侧柱廊 10
 * 中殿柱 x=626/674，到 F 点 (650,130) 最近 24.3 m；r12 内没有柱、梁、道具。
 * ------------------------------------------------------------------ */

const FORECOURT_COLUMNS: ColSpec[] = [
  [600, 90, 9.6, 2.9], [700, 90, 9.4, 2.9],
  [600, 98, 9.5, 2.8], [700, 98, 9.6, 2.8],
  [600, 106, 9.4, 2.9], [700, 106, 9.5, 2.9],
  [600, 114, 9.6, 2.8], [700, 114, 9.4, 2.8],
];

const NAVE_COLUMNS: ColSpec[] = [
  [626, 118, 11.0, 3.1], [674, 118, 11.2, 3.1],
  [626, 126, 11.2, 3.1], [674, 126, 10.8, 3.1],
  [626, 134, 10.8, 3.0], [674, 134, 11.0, 3.0],
  [626, 142, 11.0, 3.0], [674, 142, 10.6, 3.0],
  [626, 150, 10.6, 3.0], [674, 150, 3.4, 3.0], // 东列北段断柱
  [626, 158, 10.4, 3.0], [674, 158, 10.2, 3.0],
];

const AISLE_COLUMNS: ColSpec[] = [
  [602, 122, 9.2, 2.7], [602, 138, 9.0, 2.7], [602, 146, 8.8, 2.7], [602, 154, 2.6, 2.7], // 北端残桩
  [698, 122, 9.0, 2.7], [698, 138, 8.8, 2.7], [698, 146, 9.2, 2.7], [698, 154, 8.6, 2.7],
];

const SANCTUARY_COLUMNS: ColSpec[] = [
  [630, 172, 9.5, 2.8], [670, 172, 9.5, 2.8],
  [630, 186, 9.4, 2.8], [670, 186, 9.4, 2.8],
];

const WING_COLUMNS: ColSpec[] = [
  [584, 86, 8.6, 2.6], [584, 94, 8.5, 2.6], [584, 102, 8.7, 2.6], [584, 110, 8.4, 2.6], [584, 118, 8.6, 2.6],
  [716, 86, 8.5, 2.6], [716, 94, 8.6, 2.6], [716, 102, 8.4, 2.6], [716, 110, 8.7, 2.6], [716, 118, 8.5, 2.6],
];

/** 倒塌柱区：东北角 4 段、西侧 4 段、东南角倒下的方尖碑 1 段。 */
const FALLEN_DRUMS: DrumSpec[] = [
  [706, 158, 8.0, 2.6, 64, 1.6],
  [718, 166, 7.0, 2.4, -38, 1.4],
  [696, 176, 9.0, 2.8, 96, 1.8],
  [722, 186, 6.5, 2.3, 28, 1.3],
  [578, 148, 7.5, 2.4, 22, 1.5],
  [570, 158, 6.0, 2.2, -14, 1.3],
  [584, 166, 8.0, 2.5, 78, 1.6],
  [574, 176, 7.0, 2.4, 42, 1.4],
  [714, 62, 12.0, 3.0, 74, 2.0],
];

/** 两座方尖碑：前庭内、仪式轴两侧 24 m。 */
export const TEMPLE_OBELISKS: { x: number; z: number; height: number; width: number }[] = [
  { x: 626, z: 92, height: 15.0, width: 3.6 },
  { x: 674, z: 92, height: 13.5, width: 3.4 },
];

/* ------------------------------------------------------------------ *
 * 墙/门楼/圣所/外围残墙
 * ------------------------------------------------------------------ */

const TEMPLE_WALLS: WallSpec[] = [
  // 南门楼两座塔（20 m 门洞 x640..660；塔身外缘咬合到 z68..85）
  [612, 76, 32, 16, 0, 10.5], [634, 80, 12, 10, 0, 8.2],
  [688, 76, 32, 16, 0, 10.5], [666, 80, 12, 10, 0, 8.2],
  // 圣所（南北双门洞；内部 28×26 可绕行）
  [608, 178, 3, 34, 0, 7.5], [692, 178, 3, 34, 0, 7.5],
  [622, 194, 28, 3, 0, 8.0], [678, 194, 28, 3, 0, 8.0],
  [624, 164, 30, 2.6, 0, 7.0], [676, 164, 30, 2.6, 0, 7.0],
  // 北门楼（temple-gate 20 m 门洞）
  [630, 204, 20, 12, 0, 8.5], [670, 204, 20, 12, 0, 8.5],
  // 外围残墙：西面 3 段、东面 2 段（z112..150 给 temple-east 让路，z186..213 给东北出口让路）、
  // 南面只保留东段（西南角是 ef-south 进场带）
  [562, 90, 2.6, 40, 0, 3.4], [562, 142, 2.6, 36, 0, 2.8], [562, 178, 2.6, 12, 0, 3.2],
  [738, 86, 2.6, 52, 0, 3.0], [738, 168, 2.6, 36, 0, 3.2],
  [700, 54, 76, 2.6, 0, 2.4],
  // 倒塌的过梁/压顶石
  [704, 150, 14, 2.4, 18, 1.5], [582, 150, 12, 2.4, -22, 1.3],
];

/** 柱顶石过梁：中殿两列、侧廊、前庭、圣所、东西侧柱廊。 */
const TEMPLE_BEAMS: BeamSpec[] = [
  // 中殿西列（北段断开 = 倒塌）
  [626, 126, 2.4, 20, 11.4], [626, 149, 2.4, 18, 11.4],
  // 中殿东列（z150 断柱，梁到 z148 结束）
  [674, 132, 2.4, 32, 11.2],
  // 侧廊（东侧廊在 temple-east 门洞处断开）
  [602, 134, 2.4, 28, 9.6],
  [698, 123, 2.4, 6, 9.4], [698, 145, 2.4, 22, 9.4],
  // 前庭列柱
  [600, 102, 2.4, 28, 10.0], [700, 102, 2.4, 28, 10.0],
  // 圣所两跨
  [650, 172, 48, 2.6, 10.2], [650, 186, 48, 2.6, 10.2],
  // 东西侧柱廊
  [584, 102, 2.4, 36, 9.4], [716, 102, 2.4, 36, 9.2],
  // 主柱厅入口横梁（footprint 到 F 点 14.3 m；梁底 10.4 m，净空足够）
  [650, 114.5, 52, 2.4, 11.6],
  // 南/北门楼门楣（跨在 20 m 门洞上方，地面净空 8 m+）
  [650, 78, 22, 2.8, 9.5],
  [650, 204, 22, 2.8, 8.0],
];

const TEMPLE_SANDBAGS: [number, number, number, number][] = [
  [612, 122, 9, 1.0],
  [688, 122, 9, 1.0],
  [650, 182, 8, 0.95],
];

/** 所有立柱（含 2 根断柱残桩）；测试/统计直接读这个数组。 */
export const TEMPLE_COLUMNS: Cover[] = columnCovers(
  [...FORECOURT_COLUMNS, ...NAVE_COLUMNS, ...AISLE_COLUMNS, ...SANCTUARY_COLUMNS, ...WING_COLUMNS],
  fCover,
);

/** F 柱数/柱高真实统计：40 根 8.4–11.2 m 立柱 + 2 根 2.6/3.4 m 断柱残桩。 */
export const TEMPLE_COLUMN_STATS = (() => {
  const heights = TEMPLE_COLUMNS.map((c) => c.height ?? 0);
  const standing = heights.filter((h) => h >= 8);
  const broken = heights.filter((h) => h < 8);
  return {
    total: TEMPLE_COLUMNS.length,
    standing: standing.length,
    broken: broken.length,
    minStandingHeight: Math.min(...standing),
    maxStandingHeight: Math.max(...standing),
    fallenDrums: FALLEN_DRUMS.length,
  };
})();

export const templeCovers: Cover[] = [
  ...TEMPLE_COLUMNS,
  ...drumCovers(FALLEN_DRUMS, fCover),
  ...TEMPLE_OBELISKS.map(({ x, z, height, width }) =>
    fCover('obelisk', x, z, width, width, 0, { height, color: '#a89a80', label: '方尖碑' }),
  ),
  ...wallCovers(TEMPLE_WALLS, fCover),
  ...beamCovers(TEMPLE_BEAMS, fCover),
  ...TEMPLE_SANDBAGS.map(([x, z, w, h]) => fCover('sandbag', x, z, w, 2.2, 0, { height: h, label: '沙袋工事' })),
];

export const templeProps: Prop[] = [
  prop('lamp', 600, 84, { label: '神庙灯柱' }),
  prop('lamp', 700, 84, { label: '神庙灯柱' }),
  prop('lamp', 600, 166, { label: '神庙灯柱' }),
  prop('lamp', 700, 166, { label: '神庙灯柱' }),
  prop('sign', 668, 58, { w: 5, d: 1, label: '卡纳克列柱神庙' }),
  prop('barrels', 592, 104, { w: 3, d: 2, label: '考古队油桶' }),
  prop('barrels', 708, 104, { w: 3, d: 2, label: '考古队油桶' }),
  prop('pallets', 708, 180, { w: 2.4, d: 1.4, label: '发掘器材' }),
];

/** F 主石铺广场（核心区，面积由 TEMPLE_CORE_AREA 导出）。 */
export const TEMPLE_PLAZA: Polygon = [
  [566, 74], [600, 60], [640, 54], [690, 56], [722, 70], [734, 100], [736, 136],
  [730, 172], [712, 198], [676, 208], [628, 206], [590, 190], [570, 164], [562, 130], [562, 100],
];

/** 真实不规则场地边界（不是矩形包络；西南角沿 ef-south 进场带内收）。 */
export const TEMPLE_SITE: Polygon = [
  [558, 52], [580, 47], [620, 46], [660, 46], [700, 47], [734, 47], [740, 54], [742, 72],
  [743, 104], [743, 140], [742, 176], [738, 198], [726, 208], [700, 213], [660, 213], [620, 213],
  [596, 206], [580, 202], [566, 198], [557, 190], [557, 140], [557, 104], [557, 72], [558, 58],
];

/** F 核心石铺面积（m²）。 */
export const TEMPLE_CORE_AREA = Math.round(polygonArea(TEMPLE_PLAZA));
/** F 真实场地面积（m²）。 */
export const TEMPLE_SITE_AREA = Math.round(polygonArea(TEMPLE_SITE));

/** F 石铺广场/前庭/圣所/倒塌区铺面：不规则院落轮廓，全部保留原材质。 */
const TEMPLE_TERRAIN: TerrainPatch[] = [
  surface('temple-plaza', 'stone', TEMPLE_PLAZA, 'F 卡纳克神庙石铺广场', 2),
  surface('temple-forecourt', 'stone', [
    [598, 86], [620, 82], [650, 80], [680, 82], [702, 86], [706, 112], [700, 118], [600, 118], [594, 112],
  ], 'F 前庭石铺', 3),
  surface('temple-hypostyle', 'stone', [
    [596, 114], [704, 114], [706, 160], [694, 162], [606, 162], [594, 160],
  ], 'F 主柱厅石铺', 3),
  surface('temple-sanctuary', 'stone', [
    [604, 164], [696, 164], [694, 196], [680, 202], [620, 200], [606, 192],
  ], 'F 圣所石铺', 3),
  surface('temple-collapse-ne', 'rubble', [
    [692, 148], [728, 152], [734, 178], [722, 192], [700, 186], [690, 170],
  ], 'F 东北倒塌柱区石渣', 3),
  surface('temple-collapse-w', 'rubble', [
    [566, 144], [590, 142], [592, 166], [580, 178], [568, 172],
  ], 'F 西侧倒塌柱区石渣', 3),
  surface('temple-south-apron', 'gravel', [
    [620, 47], [668, 47], [676, 58], [664, 70], [636, 70], [618, 60],
  ], 'F 南仪式轴砾石前庭', 2),
  surface('temple-north-apron', 'gravel', [
    [628, 204], [672, 204], [673, 212.5], [650, 212.8], [626, 212.5],
  ], 'F 北门砾石前庭', 2),
];

/* ================================================================== *
 * G · 帝王谷采石场
 * ================================================================== */

/* ------------------------------------------------------------------ *
 * 西侧三级开采台阶（0.8–0.9 m 级高，整条边都可步行上下；段间留 3–4 m 缺口）
 * 台阶顶面：3.9 / 4.8 / 5.7。全部控制在 z ≤ 452。
 * ------------------------------------------------------------------ */

const QUARRY_BENCH_SPECS: WallSpec[] = [
  // 第一级（+0.80~0.90）x155..175
  [165, 366, 20, 26, 0, 0.85],
  [165, 396, 20, 28, 0, 0.90],
  [165, 426, 20, 24, 0, 0.85],
  [165, 446, 20, 10, 0, 0.80],
  // 第二级（+1.70~1.80）x136..155
  [145, 360, 19, 22, 0, 1.70],
  [145, 388, 19, 26, 0, 1.80],
  [145, 416, 19, 24, 0, 1.75],
  [145, 442, 19, 16, 0, 1.70],
  // 第三级（+2.60~2.70）x118..136
  [127, 368, 18, 26, 0, 2.60],
  [127, 398, 18, 26, 0, 2.70],
  [127, 428, 18, 28, 0, 2.65],
];

/** 东北车辆坡道 + 装车台：7 m 宽、0.3/0.4/0.5 m 级高（低于载具 0.56 m 底盘，不卡）。 */
const QUARRY_RAMP_SPECS: WallSpec[] = [
  [261, 432, 6, 7, 0, 0.30],
  [267, 432, 6, 7, 0, 0.40],
  [276, 432, 12, 12, 0, 0.50],
];

/** G 台阶真实数据：三级、每级 0.9 m 级高、可步行上下（顶面 3.9/4.8/5.7）。 */
export const QUARRY_BENCHES: { id: string; y: number; step: number; segments: number; polygon: Vec2[] }[] = [
  { id: 'bench-1', y: QUARRY_GROUND + 0.9, step: 0.9, segments: 4, polygon: [[155, 352], [175, 352], [175, 452], [155, 452]] },
  { id: 'bench-2', y: QUARRY_GROUND + 1.8, step: 0.9, segments: 4, polygon: [[136, 348], [155, 348], [155, 452], [136, 452]] },
  { id: 'bench-3', y: QUARRY_GROUND + 2.7, step: 0.9, segments: 3, polygon: [[118, 354], [136, 354], [136, 442], [118, 442]] },
];

/** G 车辆坡道：7 m 宽、24 m 长、0.3/0.4/0.5 m 三条带 + 0.5 m 装车台，总升 0.5 m。 */
export const QUARRY_VEHICLE_RAMP = {
  width: 7,
  length: 24,
  rise: 0.5,
  bandRises: [0.3, 0.4, 0.5],
  polygon: [[258, 425], [282, 425], [282, 439], [258, 439]] as Polygon,
};

/** 车辆坡道每条带（y = 相对地面高度，polygon = 实际铺装范围）。 */
export const QUARRY_RAMP_BANDS: { y: number; width: number; polygon: Vec2[] }[] = [
  { y: 0.3, width: 7, polygon: [[258, 428.5], [264, 428.5], [264, 435.5], [258, 435.5]] },
  { y: 0.4, width: 7, polygon: [[264, 428.5], [270, 428.5], [270, 435.5], [264, 435.5]] },
  { y: 0.5, width: 7, polygon: [[270, 426], [282, 426], [282, 438], [270, 438]] },
];

/** 石块堆场：切割好的砂岩块，1.2–1.8 m 高，成排但错缝/微旋转。 */
const QUARRY_BLOCKS: WallSpec[] = [
  // 东南堆场（g-c 便道北侧）
  [252, 386, 6, 4, 6, 1.4], [260, 385, 5, 4, -4, 1.2], [268, 386, 6, 4, 3, 1.6],
  [254, 394, 5, 3.6, -8, 1.2], [262, 395, 6, 4, 5, 1.5], [272, 394, 5, 3.6, 0, 1.3],
  [286, 392, 6, 4, -6, 1.5],
  // 东北堆场（装车台两侧）
  [258, 442, 6, 4, 4, 1.4], [266, 443, 5, 4, -3, 1.2], [274, 444, 6, 4, 2, 1.6],
  [286, 448, 4, 3.2, 8, 1.2],
  // 装车台南北边缘的两块待运石料（中间 z=432 车道净空，车辆可开上台面）
  [274, 428, 3.6, 3, 12, 1.1], [279, 437, 3, 2.6, -6, 0.9],
];

/** 工棚（canopy：四角立柱 + 轻质顶，车辆可穿过棚下但不会压进室内）。 */
const QUARRY_SHEDS: [number, number, number, number, number][] = [
  [288, 444, 10, 8, 3.4],
  [282, 360, 9, 7, 3.2],
];

/** 边缘露头/切割面残岩：把三级台阶和石堆收进真实岩层，不围成一圈。 */
const QUARRY_ROCKS: DrumSpec[] = [
  [116, 360, 7, 5, 14, 2.2],
  [114, 404, 6, 4, -18, 1.8],
  [116, 438, 7, 5, 8, 2.0],
  [276, 360, 8, 6, -10, 2.4],
  [298, 382, 6, 4.5, 22, 1.9],
  [196, 344, 7, 5, 30, 2.1],
  [236, 356, 6, 4.4, -14, 1.8],
];

/** G 点四周低掩体（全部 ≥ 21 m，不挡 4 条对外通路）。 */
const QUARRY_SANDBAGS: [number, number, number, number, number, number][] = [
  [226, 406, 9, 2.2, 8, 1.0],
  [194, 436, 8, 2.2, -6, 1.0],
  [214, 440, 8, 2.2, -14, 0.95],
];

/** 半埋巨像：西南角，面向东侧主工作层；不挤压任何通路。 */
const QUARRY_COLOSSUS: [number, number, number, number, number] = [152, 346, 26, 20, 14];

/** Lead 在总装里预留给 G 的 4 个中立载具位（必须保持 z 455..478 净空）。 */
export const QUARRY_RESERVED_PADS: Vec2[] = [[140, 462], [155, 462], [170, 462], [185, 462]];
/** Lead 在总装里预留给 A 东南角的重机枪位（x>310，G 东侧不切到 x=315）。 */
export const QUARRY_RESERVED_MG: Vec2 = [315, 470];

export const quarryCovers: Cover[] = [
  ...wallCovers(QUARRY_BENCH_SPECS, gCover, '开采台阶'),
  ...wallCovers(QUARRY_RAMP_SPECS, gCover, '车辆坡道/装车台'),
  ...wallCovers(QUARRY_BLOCKS, gCover, '切割石块'),
  ...QUARRY_SHEDS.map(([x, z, w, d, h]) =>
    gCover('canopy', x, z, w, d, 0, { height: h, color: '#8a6a45', label: '采石工棚' }),
  ),
  ...drumCovers(QUARRY_ROCKS, gCover, '采石场露头').map((c) => ({
    ...c,
    kind: 'rock' as CoverKind,
    variant: 'pharaoh-rock',
  })),
  ...QUARRY_SANDBAGS.map(([x, z, w, d, rot, h]) => gCover('sandbag', x, z, w, d, rot, { height: h, label: '沙袋工事' })),
  gCover('colossus', QUARRY_COLOSSUS[0], QUARRY_COLOSSUS[1], QUARRY_COLOSSUS[2], QUARRY_COLOSSUS[3], 0, {
    height: QUARRY_COLOSSUS[4],
    color: '#b6a98d',
    label: '半埋巨像头',
  }),
  // 工棚/装车台附近的木箱与石料筐
  gCover('crate', 288, 449, 3, 3, 12, { height: 1.2, label: '工具箱' }),
  gCover('crate', 278, 357, 3, 2.5, -8, { height: 1.1, label: '工具箱' }),
  gCover('crate', 292, 440, 2.6, 2.4, 0, { height: 0.9, label: '石料筐' }),
];

export const quarryProps: Prop[] = [
  prop('sign', 228, 392, { w: 5, d: 1, label: '帝王谷采石场' }),
  prop('lamp', 198, 402, { label: '采石场灯' }),
  prop('lamp', 222, 444, { label: '采石场灯' }),
  prop('lamp', 282, 372, { label: '工棚灯' }),
  prop('barrels', 200, 448, { w: 3, d: 2, label: '工具油桶' }),
  prop('barrels', 282, 446, { w: 3, d: 2, label: '工具油桶' }),
  prop('pallets', 272, 448, { w: 2.4, d: 1.4, label: '石料托盘' }),
  prop('pipes', 262, 448, { w: 5, d: 1, rot: 0, label: '撬棍/钻杆' }),
];

/** G 主工作层（核心区，面积由 QUARRY_CORE_AREA 导出）。 */
export const QUARRY_FLOOR: Polygon = [
  [184, 384], [212, 376], [244, 380], [284, 392], [298, 412], [294, 444],
  [272, 452], [244, 450], [214, 442], [194, 430], [186, 410],
];

/** 真实不规则场地边界（不是矩形包络；z 455..478 是通向 A 南门的开阔前庭）。 */
export const QUARRY_SITE: Polygon = [
  [110, 340], [130, 334], [170, 332], [210, 333], [250, 337], [280, 345], [298, 357], [307, 378],
  [310, 410], [307, 442], [298, 462], [282, 474], [256, 479], [222, 480], [188, 477], [160, 468],
  [136, 458], [118, 450], [110, 440], [110, 382],
];

/** G 核心工作层面积（m²）。 */
export const QUARRY_CORE_AREA = Math.round(polygonArea(QUARRY_FLOOR));
/** G 真实场地面积（m²）。 */
export const QUARRY_SITE_AREA = Math.round(polygonArea(QUARRY_SITE));

/** G 采石场石面/石渣/装车台/前庭铺面：全部保留原材质。 */
const QUARRY_TERRAIN: TerrainPatch[] = [
  surface('quarry-floor', 'rubble', QUARRY_FLOOR, 'G 采石场主工作层石渣', 2),
  surface('quarry-bench-1', 'stone', [
    [153, 352], [177, 350], [177, 420], [175, 452], [154, 452], [152, 414],
  ], 'G 第一级开采台阶石面', 3),
  surface('quarry-bench-2', 'stone', [
    [134, 350], [156, 348], [156, 430], [154, 452], [134, 450], [133, 400],
  ], 'G 第二级开采台阶石面', 3),
  surface('quarry-bench-3', 'stone', [
    [116, 356], [137, 354], [136, 414], [137, 442], [116, 442], [114, 400],
  ], 'G 第三级开采台阶石面', 3),
  surface('quarry-blockyard', 'gravel', [
    [248, 372], [296, 378], [302, 404], [296, 438], [266, 444], [246, 432], [242, 404],
  ], 'G 石块堆场碎石地', 2),
  surface('quarry-dock-apron', 'stone', [
    [256, 424], [284, 422], [286, 440], [262, 442], [258, 433],
  ], 'G 装车台石面', 3),
  surface('quarry-shed-floor-a', 'dirt', [
    [278, 438], [296, 438], [296, 452], [278, 452], [277, 445],
  ], 'G 东北工棚土场', 2),
  surface('quarry-shed-floor-b', 'dirt', [
    [278, 352], [290, 352], [292, 366], [280, 366], [277, 359],
  ], 'G 东侧工棚土场', 2),
  surface('quarry-south-apron', 'gravel', [
    [200, 368], [232, 364], [244, 380], [232, 398], [204, 400], [194, 384],
  ], 'G 南入口砾石场坪', 2),
  surface('quarry-north-forecourt', 'rubble', [
    [186, 454], [238, 452], [274, 456], [282, 468], [264, 476], [214, 476], [190, 470],
  ], 'G ↔ A 南门开阔前庭', 1),
  surface('quarry-colossus-plinth', 'stone', [
    [138, 336], [166, 336], [168, 356], [136, 356], [135, 346],
  ], 'G 半埋巨像基座石面', 2),
];

/* ================================================================== *
 * 场景地表 / 装饰 / 整平垫 / 导出
 * ================================================================== */

export const sceneTerrain: TerrainPatch[] = [...TEMPLE_TERRAIN, ...QUARRY_TERRAIN];

export const sceneDecor: DecorPlane[] = [
  // F 圣所北墙内壁壁画（rot 180 面向南侧入口）
  { atlas: 'atlas_murals_objects', x: 650, y: 2.8, z: 193.4, w: 9, h: 2.8, rot: 180, uv: [0, 0, 0.5, 0.5] },
  // F 圣所西墙壁画
  { atlas: 'atlas_murals_objects', x: 610.6, y: 2.5, z: 178, w: 8, h: 2.4, rot: 90, uv: [0.5, 0, 0.5, 0.5] },
  // F 前庭东侧植物
  { atlas: 'atlas_plants', x: 708, y: 0.9, z: 96, w: 4, h: 2, rot: 90, uv: [0, 0, 0.5, 0.5] },
  // G 工棚布幔/招牌
  { atlas: 'atlas_cloth_signs', x: 288, y: 2.2, z: 440.2, w: 3.2, h: 1.2, rot: 0, uv: [0, 0.5, 0.5, 0.5] },
];

/**
 * 场景整平垫：只做“兜底压平”，不是可见平台——可见轮廓由上面的不规则铺面定义。
 * 中心高程与高度台地一致（F 4.0 / G 3.0），每块都落在 layout.ts 的台地平核内。
 */
export const scenePads = [
  { id: 'temple-core', x: 650, z: 130, w: 96, d: 88 },
  { id: 'temple-forecourt', x: 650, z: 78, w: 110, d: 40 },
  { id: 'temple-sanctuary', x: 650, z: 182, w: 92, d: 46 },
  { id: 'quarry-floor', x: 222, z: 405, w: 120, d: 70 },
  { id: 'quarry-bench', x: 146, z: 395, w: 64, d: 90 },
  // E 驿站场坪（service.ts 的 SERVICE_SITE 内；高度 3.2 由 layout 台地保证）
  { id: 'service-yard', x: 350, z: 104, w: 150, d: 112 },
  { id: 'service-front', x: 350, z: 150, w: 40, d: 26 },
];

/** F/G 不新增独立 Building：神庙侧殿/门楼用墙+柱+过梁拼，采石场工棚用 canopy。 */
export const templeBuildings: Building[] = [];
export const quarryBuildings: Building[] = [];

export default {
  sceneTerrain,
  templeCovers,
  templeProps,
  templeBuildings,
  quarryCovers,
  quarryProps,
  quarryBuildings,
  sceneDecor,
  scenePads,
};
