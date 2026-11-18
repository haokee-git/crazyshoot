/**
 * 法老坟墓 · 绿洲（D 点）作者数据（0.20.3 重写）
 *
 * 契约：docs/map-pharaoh/CONTRACT.md §2 / §4.4；共享任务 OAS-01 / OAS-02。
 *
 * 关键约定（不要在本文件之外另立一套）：
 * - 湖心 (115,230)，水面 -2.0，湖底 -6.0；D 点 (175,290) r10 干岸台地 +0.6，
 *   距水线 17.7 m（东北岸）。
 * - **岸线唯一真相是 `./oasis-shape` 的 `OASIS_LAKE_POLYGON`**：`pharaoh-height.ts`
 *   （地形/湖盆/水面）与水面测试都读那一份；本文件只 import + re-export，
 *   不再定义第二份折线，也**不反向 import pharaoh-height**（会成环）。
 * - 本文件只产出 MapDef 数据（terrain / covers / props / buildings），不写体素。
 * - **生态区外边界唯一真相是 `./oasis-shape` 的 `OASIS_ECO_POLYGON`**（约 274×268 m，
 *   面积 5.93 万 m²）：本文件只 import + re-export，所有地表 patch 与植被都在它内部，
 *   不再另立第二份生态区折线。G 采石场（x>104 且 z>328）压在北叶上，留给 G 的石面，
 *   那里不种树。
 * - 生态区主体是棕榈林/疏林，不是湖本身。植被按
 *   「离水距离 × 低频噪声团簇 × 生态区边界衰减」加权撒点，不是同心圆树环：
 *     水体 → 湿泥/浅滩/芦苇 → 湿润草甸+较密棕榈林 → 金合欢/柽柳混交疏林 →
 *     灌木/干草/裸土/砾石 → 沙地
 *   近岸密、干旱侧稀，边缘靠噪声团簇与地表斑块互相咬合。
 * - 植被避让：湖面与湿岸、道路（含 `OASIS_LOOP` 环湖干道，走 `clearOfRoads`）、
 *   三栋建筑、木栈桥、D 点 r10+2、8 个出水点、D 营地铺装、水塔/灯/招牌/木门与杂物。
 *   芦苇/灌木/草都是 solid:false 的细节块，只有树干占 1 格，不堵导航；
 *   树间距 ≥3.2 m，林间自然留出多条步兵通道。
 *
 * 世界生成器需要解释的 variant：
 *   palm-tall / palm-mid / palm-short  高干 94 + 三层叶冠 95（frond solid:false）
 *   acacia / acacia-shade              金合欢（tree：树干 + 平顶伞冠）
 *   tamarisk                           柽柳（tree：细干 + 小冠）
 *   reeds                              芦苇（kind=reeds：9 根细杆，solid:false）
 *   bush / grass                       灌木丛 / 干草簇（kind=bush，solid:false）
 *   pier-deck / pier-post              木栈桥板/柱（板面钉在 y≈-1.1，柱子下探湖底）
 *   well / intake-deck                 取水台（石圈 + 木台）
 *
 * 对外统计（验收/覆盖统计/平面图/测试直接读，不写死）：
 *   OASIS_ECO_POLYGON / OASIS_ECO_AREA / OASIS_ECO_BOUNDS
 *   OASIS_VEGETATION_STATS  实际撒出的树种/灌草数量
 *   OASIS_VEGETATION_BANDS  0–6 / 6–20 / 20–45 / 45–80 / 80+ m 的面积、株数与密度
 *   OASIS_WATER_EXITS       8 个真实出水口（岸线外 1.2 m，逐个带实测岸坡）
 */
import type {Building, Cover, Polygon, Prop, TerrainPatch, Vec2} from '../types';
import {building, cover, prop, terrain} from '../helpers';
import {clearOfRoads} from './network';
import {
  OASIS_ECO_AREA,
  OASIS_ECO_POLYGON,
  OASIS_LAKE_BED,
  OASIS_LAKE_CENTER,
  OASIS_LAKE_POLYGON,
  OASIS_WATER_SURFACE,
  lakeShoreDistance,
  pointInPolygon,
} from './oasis-shape';

/**
 * 岸线与生态区外边界都是 ./oasis-shape 的唯一真相；本文件只 re-export，
 * 不再复制第二份折线，也不反向 import pharaoh-height（会成环）。
 */
export {
  OASIS_ECO_AREA,
  OASIS_ECO_POLYGON,
  OASIS_LAKE_BED,
  OASIS_LAKE_CENTER,
  OASIS_LAKE_POLYGON,
  OASIS_WATER_SURFACE,
};

/* ------------------------------------------------------------------ *
 * 基准（与 src/maps/pharaoh/layout.ts 的 D 锚点一致）
 * ------------------------------------------------------------------ */

export const OASIS_POINT: Vec2 = [175, 290];
export const OASIS_POINT_RADIUS = 10;
export const OASIS_POINT_GROUND = 0.6;
/** 植被/掩体到 D 点圆心的最小水平净空（≥ r10 + 2 m）。 */
export const OASIS_POINT_CLEARANCE = 12;

/* ------------------------------------------------------------------ *
 * 几何 / 噪声小工具（确定性，模块加载时一次算完）
 * ------------------------------------------------------------------ */

const round = (n: number): number => Math.round(n * 100) / 100;

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

function smooth(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1));
  return t * t * (3 - 2 * t);
}

/** 确定性随机（mulberry32）：同一份代码永远撒出同一片林。 */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 二维值噪声（0..1）：团簇/斑块的低频形状来源。 */
function noise2(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function segmentDistance(x: number, z: number, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2));
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

/** 点到多边形边界的最近距离（无向）。 */
function polygonDistance(x: number, z: number, poly: Polygon): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const d = segmentDistance(x, z, poly[j], poly[i]);
    if (d < best) best = d;
  }
  return best;
}

interface Bounds {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

function polyBounds(poly: Polygon): Bounds {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of poly) {
    if (p[0] < x0) x0 = p[0];
    if (p[0] > x1) x1 = p[0];
    if (p[1] < z0) z0 = p[1];
    if (p[1] > z1) z1 = p[1];
  }
  return {x0, x1, z0, z1};
}

/** 每条边细分 + 法向抖动：让草地/湿泥/沙地的边界是碎的，不是矢量圆弧。 */
function jagged(poly: Polygon, amp: number, seed: number, subdiv = 2): Polygon {
  const rand = seeded(seed);
  const out: Polygon = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz) || 1;
    for (let s = 0; s < subdiv; s++) {
      const t = s / subdiv;
      const off = (rand() - 0.5) * 2 * amp;
      out.push([
        round(a[0] + dx * t + (dz / len) * off),
        round(a[1] + dz * t - (dx / len) * off),
      ]);
    }
  }
  return out;
}

/** 以 center 为原点沿径向外扩，reach 逐点变化（湿泥带/沙地过渡都靠它）。 */
function expanded(poly: Polygon, center: Vec2, reach: (point: Vec2, index: number) => number): Polygon {
  return poly.map((p, i) => {
    const dx = p[0] - center[0];
    const dz = p[1] - center[1];
    const len = Math.hypot(dx, dz) || 1;
    const r = reach(p, i);
    return [round(p[0] + (dx / len) * r), round(p[1] + (dz / len) * r)];
  });
}

/** 不规则椭圆斑块（草甸/裸土/芦苇湾）。 */
function blob(cx: number, cz: number, rx: number, rz: number, seed: number, points = 14): Polygon {
  const rand = seeded(seed);
  const out: Polygon = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const k = 0.7 + rand() * 0.55;
    out.push([round(cx + Math.cos(a) * rx * k), round(cz + Math.sin(a) * rz * k)]);
  }
  return out;
}

/** 两端点 + 宽度的直线带（沙砾小径）。 */
function strip(a: Vec2, b: Vec2, width: number): Polygon {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1;
  const nx = (-dz / len) * (width / 2);
  const nz = (dx / len) * (width / 2);
  return [
    [round(a[0] + nx), round(a[1] + nz)],
    [round(b[0] + nx), round(b[1] + nz)],
    [round(b[0] - nx), round(b[1] - nz)],
    [round(a[0] - nx), round(a[1] - nz)],
  ];
}

/** 离水距离：湖内为负，湖外为正（m）。 */
const dryDistance = (x: number, z: number): number => -lakeShoreDistance(x, z);

/* ------------------------------------------------------------------ *
 * 生态区：唯一真相是 `OASIS_ECO_POLYGON`（约 274×268 m，见 ./oasis-shape）。
 *   本文件只在它**内部**再划不规则子区：草地核心内收一圈（外圈留给沙地过渡），
 *   植被、花地、湿泥、裸土、小径都不越出这条外边界。
 * ------------------------------------------------------------------ */

const ECO_BOUNDS = polyBounds(OASIS_ECO_POLYGON);

const OASIS_ECO_CENTROID: Vec2 = (() => {
  let sx = 0;
  let sz = 0;
  for (const p of OASIS_ECO_POLYGON) {
    sx += p[0];
    sz += p[1];
  }
  return [round(sx / OASIS_ECO_POLYGON.length), round(sz / OASIS_ECO_POLYGON.length)];
})();

/** 草地核心：生态区外边界内收约 12%（16–30 m）+ 边缘打碎，外圈留给沙地/砾石过渡。 */
const OASIS_GREEN: Polygon = jagged(
  OASIS_ECO_POLYGON.map(
    ([x, z]) =>
      [round(OASIS_ECO_CENTROID[0] + (x - OASIS_ECO_CENTROID[0]) * 0.88), round(OASIS_ECO_CENTROID[1] + (z - OASIS_ECO_CENTROID[1]) * 0.88)] as Vec2,
  ),
  4.5,
  0x0a51_0001,
  2,
);

/** 外缘沙地 = 生态区外边界本身：草地核心之外、外边界之内是破碎的沙地过渡。 */
const OASIS_SAND_EDGE: Polygon = OASIS_ECO_POLYGON;

/** 湖岸湿泥带：岸线外 1.8–10.6 m，宽度随岸段变化（不是等宽环）。 */
const OASIS_MUD: Polygon = jagged(
  expanded(OASIS_LAKE_POLYGON, OASIS_LAKE_CENTER, (p) => {
    const fine = noise2(p[0] / 26, p[1] / 26, 0x0a51_0004);
    const tongue = smooth(0.55, 0.85, noise2(p[0] / 64, p[1] / 64, 0x0a51_0005));
    return 1.8 + 4.6 * fine + 4.2 * tongue;
  }),
  1.5,
  0x0a51_0006,
  2,
);

/** 湿草甸/花地斑块：离水 6–26 m 的湿润带里成片出现。 */
const MEADOWS: Array<{poly: Polygon; label: string}> = [
  {poly: blob(140, 294, 26, 9, 0x0a51_0011), label: '北岸湿草甸'},
  {poly: blob(78, 282, 15, 13, 0x0a51_0012), label: '西湾湿草甸'},
  {poly: blob(198, 246, 11, 17, 0x0a51_0013), label: '东岸湿草甸'},
  {poly: blob(152, 188, 20, 9, 0x0a51_0014), label: '南岸湿草甸'},
];

/** 草舌：铺在湿泥之上，让草地在几处直接咬到水线（打断湿泥环）。 */
const GRASS_TONGUES: Array<{poly: Polygon; label: string}> = [
  {poly: blob(130, 291, 18, 8, 0x0a51_0015), label: '北岸草舌'},
  {poly: blob(62, 250, 12, 10, 0x0a51_0016), label: '西湾草舌'},
  {poly: blob(172, 198, 12, 8, 0x0a51_0017), label: '东南草舌'},
];

/** 干旱侧裸土/砾石斑块：疏林与灌木带之间的破口。 */
const DRY_PATCHES: Array<{kind: 'dirt' | 'gravel'; poly: Polygon; label: string}> = [
  {kind: 'dirt', poly: blob(224, 300, 22, 13, 0x0a51_0021), label: '东北干土坪'},
  {kind: 'dirt', poly: blob(232, 232, 19, 15, 0x0a51_0022), label: '东侧干土坡'},
  {kind: 'gravel', poly: blob(90, 336, 14, 9, 0x0a51_0023), label: '西北砾石坪'},
  {kind: 'gravel', poly: blob(60, 164, 20, 11, 0x0a51_0024), label: '西南砾石滩'},
  {kind: 'gravel', poly: blob(246, 322, 16, 9, 0x0a51_0025), label: '东北砾石坪'},
];

/* ------------------------------------------------------------------ *
 * D 点沙砾营地（preserveUnderRoads：环湖道路不许把铺装盖成土路）
 * ------------------------------------------------------------------ */

const D_APRON: Polygon = [
  [161, 281], [171, 277], [181, 280], [189, 286], [191, 294],
  [187, 301], [178, 305], [168, 304], [160, 298], [157, 290],
];

const OASIS_PATHS: TerrainPatch[] = [
  terrain('gravel', strip([180, 284], [186, 277], 3), 0, 'D 营地→水泵房'),
  terrain('gravel', strip([168, 302], [166, 307], 3), 0, 'D 营地→看守房'),
  terrain('gravel', strip([164, 285], [165, 281], 2.6), 0, 'D 营地→栈桥引道'),
  terrain('gravel', strip([186, 293], [200, 298], 3), 0, 'D 营地→东口'),
  terrain('gravel', strip([160, 300], [152, 310], 2.6), 0, 'D 营地→水塔'),
];

/* ------------------------------------------------------------------ *
 * 建筑：水泵房 / 看守房 / 护林取水小屋（8–14 × 7–12 m，高 4–4.5 m）
 * ------------------------------------------------------------------ */

const PUMP_HOUSE = {x0: 181, z0: 268, x1: 191, z1: 276};
const GUARD_HOUSE = {x0: 160, z0: 307, x1: 172, z1: 317};
const RANGER_HUT = {x0: 248, z0: 252, x1: 257, z1: 259};

export const oasisBuildings: Building[] = [
  building('oasis-pump-house', '绿洲水泵房', PUMP_HOUSE.x0, PUMP_HOUSE.z0, 10, 8, 4.5, 'flat', {
    enterable: true,
    labelAt: [186, 276],
  }),
  building('oasis-guard-house', '绿洲看守房', GUARD_HOUSE.x0, GUARD_HOUSE.z0, 12, 10, 4.5, 'flat', {
    enterable: true,
    labelAt: [166, 317],
  }),
  building('oasis-ranger-hut', '绿洲护林小屋', RANGER_HUT.x0, RANGER_HUT.z0, 12, 9, 4.2, 'open', {
    enterable: true,
    labelAt: [252.5, 259],
  }),
];

/** 摆放植被时避让的矩形（外扩 4.5 m，连 4×3 m 门洞通道一起保住）。 */
const BUILDING_KEEPOUT = [PUMP_HOUSE, GUARD_HOUSE, RANGER_HUT].map((b) => ({
  x0: b.x0 - 4.5,
  z0: b.z0 - 4.5,
  x1: b.x1 + 4.5,
  z1: b.z1 + 4.5,
}));

/* ------------------------------------------------------------------ *
 * 出水点：8 个真实可下水/上岸的岸线缺口（都在水线外 1.2 m，不在湖心）
 * ------------------------------------------------------------------ */

export interface OasisWaterExit {
  id: string;
  x: number;
  z: number;
  /** 岸坡要求，写进 layout json 供 terrain 对齐高度函数。 */
  slope: string;
  note: string;
}

export const OASIS_WATER_EXITS: OasisWaterExit[] = [
  // slope 是 pharaoh-height 滩坡剖面的实测值（沿外法线 6 m 采样，水线 -1.87 → 岸上），
  // 不是理想值：靠岸 2 m 约 1:4.8，随后收陡到 1:3，平均 1:3 上下。
  {id: 'north-main', x: 130, z: 287.2, slope: '1:3.2', note: '北岸主滩：D 点西南 52 m，环湖干道与营地之间的宽浅滩；6 m 爬升 1.9 m，最先落地的出入水口'},
  {id: 'ne-pier', x: 156.5, z: 281.6, slope: '1:3.2', note: '栈桥东侧：短木栈桥旁 6.4 m，D 点西南 20 m；6 m 爬升 1.9 m，下水后可直接游向湖心'},
  {id: 'east-beach', x: 185.7, z: 238.1, slope: '1:3.0', note: '东岸沙滩：湖东外凸岸线，6 m 爬升 2.0 m；载具绕湖与步兵涉水的主要落点'},
  {id: 'se-shoal', x: 182.6, z: 249.5, slope: '1:3.2', note: '东南浅滩：水浅坡缓，6 m 爬升 1.9 m；摩托可半涉水通过，上岸即进棕榈林'},
  {id: 'south-sandbar', x: 138.1, z: 174.8, slope: '1:2.9', note: '南岸沙洲：蓝队方向进场路线，6 m 爬升 2.1 m；接南侧干河床与中立载具便道'},
  {id: 'sw-slope', x: 105.8, z: 176.3, slope: '1:2.8', note: '西南缓坡：芦苇湾南口，6 m 爬升 2.2 m（滩坡 18 m 最长的一段）；上岸直接进湿草甸'},
  {id: 'west-reed-bay', x: 55.1, z: 246.7, slope: '1:3.1', note: '西岸芦苇湾：芦苇遮蔽的慢速上岸口，6 m 爬升 1.9 m；适合潜行绕后'},
  {id: 'nw-marsh', x: 87.9, z: 275.6, slope: '1:2.9', note: '西北泥滩：雨季浅水，6 m 爬升 2.1 m；上岸接西北干旱支脉的疏林'},
];

/* ------------------------------------------------------------------ *
 * 木栈桥（板 + 柱）与取水台
 * ------------------------------------------------------------------ */

/** 岸线 (169,270)→(162,278) 的外法线：栈桥垂直于这段岸，朝湖心伸 10.5 m。 */
const PIER_DIR: Vec2 = [0.752, 0.658];
const PIER_BANK: Vec2 = [162, 278];
const PIER_START: Vec2 = [
  round(PIER_BANK[0] + PIER_DIR[0] * 3.4),
  round(PIER_BANK[1] + PIER_DIR[1] * 3.4),
];
const PIER_END: Vec2 = [
  round(PIER_BANK[0] - PIER_DIR[0] * 10.5),
  round(PIER_BANK[1] - PIER_DIR[1] * 10.5),
];

const pierAngle = round((Math.atan2(PIER_END[1] - PIER_START[1], PIER_END[0] - PIER_START[0]) * 180) / Math.PI);
const pierLength = round(Math.hypot(PIER_END[0] - PIER_START[0], PIER_END[1] - PIER_START[1]));

const pierPost = (x: number, z: number): Cover =>
  cover('wall', round(x), round(z), 0.8, 0.8, 0, {height: 2.4, variant: 'pier-post', color: '#7a5c3c'});

/** 栈桥上 t∈[0,1] 处、横向 side 米的位置（横向 = 桥轴左法线）。 */
const pierPoint = (t: number, side: number): Vec2 => [
  round(PIER_START[0] + (PIER_END[0] - PIER_START[0]) * t + PIER_DIR[1] * side),
  round(PIER_START[1] + (PIER_END[1] - PIER_START[1]) * t - PIER_DIR[0] * side),
];

const oasisPier: Cover[] = [
  cover(
    'wall',
    round((PIER_START[0] + PIER_END[0]) / 2),
    round((PIER_START[1] + PIER_END[1]) / 2),
    pierLength,
    2.6,
    pierAngle,
    {height: 0.35, variant: 'pier-deck', color: '#8a6b47', label: '短木栈桥'},
  ),
  ...[0.42, 0.7, 0.94].flatMap((t) => [pierPoint(t, 1.1), pierPoint(t, -1.1)]).map(([x, z]) => pierPost(x, z)),
];

const oasisIntake: Cover[] = [
  cover('well', 195, 274, 3.2, 3.2, 0, {height: 1.35, variant: 'well', label: '旧取水台'}),
  cover('table', 195, 277.2, 4.4, 1.2, 0, {height: 0.8, variant: 'intake-deck'}),
];

/* ------------------------------------------------------------------ *
 * props（先定义，好让植被避让）
 * ------------------------------------------------------------------ */

const oasisPropsData: Prop[] = [
  prop('tower', 150, 312, {w: 8, d: 8, label: '绿洲水塔'}),
  prop('lamp', 190, 280, {w: 1.4, d: 1.4, label: ''}),
  prop('lamp', 158, 306, {w: 1.4, d: 1.4, label: ''}),
  prop('sign', 211, 298, {w: 5, d: 1, label: '绿洲'}),
  prop('gate', 210, 304, {w: 7, d: 3, rot: 0, label: '绿洲北口'}),
  prop('barrels', 186, 279, {label: ''}),
  prop('barrels', 188, 281, {label: ''}),
  prop('pallets', 184, 282, {w: 2.2, d: 1.25, label: ''}),
  prop('barrels', 176, 315, {label: ''}),
  prop('pallets', 178, 317, {w: 2.2, d: 1.25, label: ''}),
];

export const oasisProps: Prop[] = oasisPropsData;

interface Footprint {
  x: number;
  y: number;
  w: number;
  d: number;
  rot?: number;
}

/** 道具的实体占地（与 voxel-map-data 的默认值一致），植被不得压占。 */
const propFootprint = (p: Prop): Footprint => {
  const w = p.w ?? (p.kind === 'barrels' || p.kind === 'pallets' ? 3 : 8);
  const d = p.d ?? (p.kind === 'barrels' ? 2 : p.kind === 'pallets' ? 3 : 8);
  return {x: p.x, y: p.y, w, d, rot: p.rot ?? 0};
};

/* ------------------------------------------------------------------ *
 * D 点：两组矮沙袋 + 三块岩石（都在 r10 圈外、避开三条道路）
 * ------------------------------------------------------------------ */

const D_POINT_COVERS: Cover[] = [
  // 湖侧：挡住从栈桥/浅滩上岸的枪线（中心距圆心 12.2 m）
  cover('sandbag', 172.9, 278.0, 10.0, 2.2, 350, {
    height: 1.05,
    variant: 'sandbag-row',
    label: 'D 点湖侧矮沙袋',
  }),
  // 陆侧：挡住北面环湖干道来向（中心距圆心 13.5 m）
  cover('sandbag', 170.2, 303.2, 8.0, 2.2, 200, {
    height: 1.05,
    variant: 'sandbag-row',
    label: 'D 点陆侧矮沙袋',
  }),
  cover('rock', 161.5, 286.4, 4.0, 3.0, 12, {height: 1.6}),
  cover('rock', 157.0, 290.0, 4.0, 3.2, 64, {height: 1.7}),
  cover('rock', 179.1, 274.5, 3.6, 2.8, 30, {height: 1.5}),
];

/** 已手工摆好的实体（D 点沙袋/岩石、栈桥、取水台、道具），植被必须让开。 */
const RESERVED = [...D_POINT_COVERS, ...oasisPier, ...oasisIntake, ...oasisPropsData.map(propFootprint)].map((c) => {
  const a = ((c.rot ?? 0) * Math.PI) / 180;
  return {x: c.x, y: c.y, hw: c.w / 2, hd: c.d / 2, cos: Math.cos(a), sin: Math.sin(a)};
});

/* ------------------------------------------------------------------ *
 * 植被撒点：离水距离 × 噪声团簇 × 生态区边界衰减
 * ------------------------------------------------------------------ */

/** 该点能不能放植被：不在水里、不进 D 点净空、不压建筑/营地/栈桥/出水口/道具/道路。 */
function plantable(x: number, z: number, margin: number): boolean {
  // 生态区唯一真相：OASIS_ECO_POLYGON（见 ./oasis-shape），植被不得越出它。
  if (!pointInPolygon(x, z, OASIS_ECO_POLYGON)) return false;
  // G 帝王谷采石场（场地包络 110..310 / 332..507）不与绿洲植被重叠：
  // 生态区北叶在 x>104 的部分正好压在采石台阶上，留给 G 的石面，不种树。
  if (x > 104 && z > 328) return false;
  const dry = dryDistance(x, z);
  if (dry < 1.0 + margin * 0.2) return false;
  if (Math.hypot(x - OASIS_POINT[0], z - OASIS_POINT[1]) < OASIS_POINT_CLEARANCE + margin) return false;
  if (polygonDistance(x, z, D_APRON) < 1.0 + margin * 0.3) return false;
  if (segmentDistance(x, z, PIER_START, PIER_END) < 3.0 + margin) return false;
  for (const b of BUILDING_KEEPOUT) {
    if (x > b.x0 - margin && x < b.x1 + margin && z > b.z0 - margin && z < b.z1 + margin) return false;
  }
  for (const e of OASIS_WATER_EXITS) {
    if (Math.hypot(x - e.x, z - e.z) < 3.0 + margin) return false;
  }
  for (const c of RESERVED) {
    const dx = x - c.x;
    const dz = z - c.y;
    const u = Math.abs(dx * c.cos + dz * c.sin) - c.hw;
    const v = Math.abs(dz * c.cos - dx * c.sin) - c.hd;
    const du = u > 0 ? u : 0;
    const dv = v > 0 ? v : 0;
    if (du * du + dv * dv < (1.1 + margin) * (1.1 + margin)) return false;
  }
  return clearOfRoads(x, z, 2.2 + margin * 0.5);
}

interface Candidate {
  x: number;
  z: number;
  /** 离水线距离（m，正 = 干地）。 */
  d: number;
  /** 到生态区边界的内侧距离（m）。 */
  edge: number;
  /** 低频团簇噪声 0..1。 */
  clump: number;
  /** 更宽的棕榈林团块 0..1。 */
  grove: number;
}

/**
 * 候选点池：先在生态区内均匀撒点（间距 ≥1.25 m），再按权重挑树种。
 * 顺序是「便宜的先判」：生态区包含 → 池间距 → 离水 → 避让（含道路），
 * 这样上万次尝试里绝大多数在头两步就被丢掉，模块加载约 30 ms（一次性）。
 */
const POOL_TARGET = 3000;

const CANDIDATES: Candidate[] = (() => {
  const rand = seeded(0x0a51_7a11);
  const grid = new Map<number, Candidate[]>();
  const cell = 1.5;
  const cellKey = (ix: number, iz: number): number => ix * 4096 + iz;
  const out: Candidate[] = [];
  const b = ECO_BOUNDS;
  const w = b.x1 - b.x0;
  const h = b.z1 - b.z0;
  let attempts = 0;
  while (out.length < POOL_TARGET && attempts < 15000) {
    attempts++;
    const x = round(b.x0 + rand() * w);
    const z = round(b.z0 + rand() * h);
    if (!pointInPolygon(x, z, OASIS_ECO_POLYGON)) continue;
    const gx = Math.floor(x / cell);
    const gz = Math.floor(z / cell);
    let crowded = false;
    for (let ix = gx - 1; ix <= gx + 1 && !crowded; ix++) {
      for (let iz = gz - 1; iz <= gz + 1 && !crowded; iz++) {
        const bucket = grid.get(cellKey(ix, iz));
        if (!bucket) continue;
        for (const c of bucket) {
          const dx = c.x - x;
          const dz = c.z - z;
          if (dx * dx + dz * dz < 1.5625) {
            crowded = true;
            break;
          }
        }
      }
    }
    if (crowded) continue;
    const d = dryDistance(x, z);
    if (d < 1.0) continue;
    if (!plantable(x, z, 0.6)) continue;
    const cand: Candidate = {
      x,
      z,
      d,
      edge: polygonDistance(x, z, OASIS_ECO_POLYGON),
      clump: noise2(x / 46, z / 46, 0x0a51_7a12),
      grove: noise2(x / 68, z / 68, 0x0a51_7a13),
    };
    out.push(cand);
    const key = cellKey(gx, gz);
    const bucket = grid.get(key);
    if (bucket) bucket.push(cand);
    else grid.set(key, [cand]);
  }
  return out;
})();

/** 粗粒度间距索引：避免 6000 个候选 × 500 株植被的 O(n²) 距离检查。 */
function spacingIndex(cell = 4) {
  const buckets = new Map<number, Array<{x: number; y: number}>>();
  const key = (ix: number, iz: number): number => ix * 4096 + iz;
  return {
    tooClose(x: number, z: number, radius: number): boolean {
      const span = Math.ceil(radius / cell);
      const gx = Math.floor(x / cell);
      const gz = Math.floor(z / cell);
      const r2 = radius * radius;
      for (let ix = gx - span; ix <= gx + span; ix++) {
        for (let iz = gz - span; iz <= gz + span; iz++) {
          const bucket = buckets.get(key(ix, iz));
          if (!bucket) continue;
          for (const c of bucket) {
            const dx = c.x - x;
            const dz = c.y - z;
            if (dx * dx + dz * dz < r2) return true;
          }
        }
      }
      return false;
    },
    add(c: {x: number; y: number}): void {
      const k = key(Math.floor(c.x / cell), Math.floor(c.y / cell));
      const bucket = buckets.get(k);
      if (bucket) bucket.push(c);
      else buckets.set(k, [c]);
    },
  };
}

type Occupancy = ReturnType<typeof spacingIndex>;

interface SpeciesSpec {
  id: string;
  count: number;
  seed: number;
  /** 同种/异种之间的最小间距（m）。 */
  spacing: number;
  weight: (c: Candidate) => number;
  make: (rand: () => number, c: Candidate) => Cover;
}

/**
 * 按权重拒绝采样：p = w · (count / Σw)，分布形状完全由 w 决定
 * （近岸密、干旱侧稀、噪声团块成林）。间距检查会吃掉一部分命中，
 * 所以按轮次小幅抬高 gain 补足，直到撒满 count 或轮次用尽。
 */
function scatter(spec: SpeciesSpec, occupied: Occupancy): Cover[] {
  const weights = CANDIDATES.map((c) => Math.max(0, spec.weight(c)));
  let sum = 0;
  for (const w of weights) sum += w;
  const base = spec.count / Math.max(1e-6, sum);
  const rand = seeded(spec.seed);
  const order = CANDIDATES.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const t = order[i];
    order[i] = order[j];
    order[j] = t;
  }
  const out: Cover[] = [];
  for (let pass = 0; pass < 5 && out.length < spec.count; pass++) {
    const gain = base * Math.pow(2.1, pass);
    for (const i of order) {
      if (out.length >= spec.count) break;
      const p = Math.min(1, weights[i] * gain);
      if (p <= 0.004) continue;
      if (rand() > p) continue;
      const c = CANDIDATES[i];
      if (occupied.tooClose(c.x, c.z, spec.spacing)) continue;
      const made = spec.make(rand, c);
      out.push(made);
      occupied.add({x: made.x, y: made.y});
    }
  }
  return out;
}

/* 离水距离的形态函数（共同骨架，各树种再乘自己的团块权重） */
const wetBand = (d: number): number => 1 - smooth(6, 34, d);
const dryBand = (d: number): number => smooth(30, 82, d);
const rimFade = (edge: number, width: number): number => smooth(0, width, edge);

const palmSpecies: SpeciesSpec = {
  id: 'palm',
  count: 108,
  seed: 0x0a51_a001,
  spacing: 3.2,
  weight: (c) => {
    const band = smooth(1.8, 5.5, c.d) * (1 - smooth(18, 42, c.d));
    const grove = 0.1 + 0.9 * smooth(0.36, 0.62, c.grove);
    return band * grove * (0.45 + 0.8 * c.clump) * (0.35 + 0.65 * wetBand(c.d)) * rimFade(c.edge, 20);
  },
  make: (rand, c) => {
    const pick = rand();
    const variant = pick > 0.62 ? 'palm-tall' : pick > 0.28 ? 'palm-mid' : 'palm-short';
    // height = 干高（世界生成器 clamp 7..13 m），w/d = 冠幅（非实体叶冠）
    const trunk =
      variant === 'palm-tall' ? 10.4 + rand() * 1.6 : variant === 'palm-mid' ? 8.2 + rand() * 1.5 : 7.2 + rand() * 0.9;
    const crown = 3.0 + rand() * 1.4;
    return cover('palm', c.x, c.z, round(crown), round(crown * (0.86 + rand() * 0.2)), Math.round(rand() * 360), {
      height: round(trunk),
      variant,
    });
  },
};

const tamariskSpecies: SpeciesSpec = {
  id: 'tamarisk',
  count: 36,
  seed: 0x0a51_a002,
  spacing: 3.2,
  weight: (c) => {
    const band = smooth(5, 13, c.d) * (1 - smooth(34, 62, c.d));
    return band * (0.22 + 1.0 * c.clump) * rimFade(c.edge, 18);
  },
  make: (rand, c) => {
    const w = 3.4 + rand() * 1.0;
    return cover('tree', c.x, c.z, round(w), round(w * (0.9 + rand() * 0.2)), Math.round(rand() * 360), {
      height: round(3.4 + rand() * 1.4),
      variant: 'tamarisk',
    });
  },
};

const acaciaSpecies: SpeciesSpec = {
  id: 'acacia',
  count: 32,
  seed: 0x0a51_a003,
  spacing: 3.8,
  weight: (c) => {
    const band = smooth(18, 34, c.d) * (1 - smooth(58, 96, c.d));
    return band * (0.22 + 1.1 * c.clump) * (0.45 + 0.85 * dryBand(c.d)) * rimFade(c.edge, 22);
  },
  make: (rand, c) => {
    const shade = rand() > 0.74;
    const w = shade ? 5.6 + rand() * 0.8 : 3.8 + rand() * 0.6;
    return cover('tree', c.x, c.z, round(w), round(w * (0.9 + rand() * 0.18)), Math.round(rand() * 360), {
      height: round(3.6 + rand() * 1.4),
      variant: shade ? 'acacia-shade' : 'acacia',
    });
  },
};

const reedsSpecies: SpeciesSpec = {
  id: 'reeds',
  count: 112,
  seed: 0x0a51_a004,
  spacing: 1.7,
  weight: (c) => {
    const band = smooth(0.9, 1.8, c.d) * (1 - smooth(5.5, 12, c.d));
    return band * (0.2 + 1.35 * c.clump) * rimFade(c.edge, 12);
  },
  make: (rand, c) => {
    const w = 1.4 + rand() * 1.6;
    return cover('reeds', c.x, c.z, round(w), round(1.1 + rand() * 0.9), Math.round(rand() * 360), {
      height: round(1.5 + rand() * 0.9),
      variant: 'reeds',
    });
  },
};

const bushSpecies: SpeciesSpec = {
  id: 'bush',
  count: 118,
  seed: 0x0a51_a005,
  spacing: 1.9,
  weight: (c) => {
    const band = smooth(2.5, 7, c.d) * (1 - smooth(48, 86, c.d));
    return band * (0.28 + 1.0 * c.clump) * rimFade(c.edge, 14);
  },
  make: (rand, c) => {
    const w = 1.8 + rand() * 1.8;
    return cover('bush', c.x, c.z, round(w), round(1.6 + rand() * 1.6), Math.round(rand() * 360), {
      height: round(1.0 + rand() * 0.9),
      variant: 'bush',
    });
  },
};

const grassSpecies: SpeciesSpec = {
  id: 'grass',
  count: 96,
  seed: 0x0a51_a006,
  spacing: 1.7,
  weight: (c) => {
    const band = smooth(4, 10, c.d) * (1 - smooth(70, 118, c.d));
    return band * (0.32 + 0.9 * c.clump) * (0.55 + 0.6 * dryBand(c.d)) * rimFade(c.edge, 12);
  },
  make: (rand, c) => {
    const w = 1.2 + rand() * 1.2;
    return cover('bush', c.x, c.z, round(w), round(1.0 + rand() * 1.0), Math.round(rand() * 360), {
      height: round(0.45 + rand() * 0.45),
      variant: 'grass',
    });
  },
};

/* ------------------------------------------------------------------ *
 * 组装 covers（树先撒，灌木/芦苇/草填缝）
 * ------------------------------------------------------------------ */

const occupied: Occupancy = spacingIndex();

const palmCovers = scatter(palmSpecies, occupied);
const tamariskCovers = scatter(tamariskSpecies, occupied);
const acaciaCovers = scatter(acaciaSpecies, occupied);
const reedsCovers = scatter(reedsSpecies, occupied);
const bushCovers = scatter(bushSpecies, occupied);
const grassCovers = scatter(grassSpecies, occupied);

export const oasisCovers: Cover[] = [
  ...palmCovers,
  ...tamariskCovers,
  ...acaciaCovers,
  ...reedsCovers,
  ...bushCovers,
  ...grassCovers,
  ...D_POINT_COVERS,
  ...oasisPier,
  ...oasisIntake,
];

/* ------------------------------------------------------------------ *
 * terrain patches：沙地过渡 → 草地 → 花地 → 湿泥 → 草舌 → 裸土 →
 * 小径/砾石 → D 营地（preserveUnderRoads）→ 湖底细沙 → 湖面
 * ------------------------------------------------------------------ */

export const oasisTerrain: TerrainPatch[] = [
  terrain('sand', OASIS_SAND_EDGE, 0, '绿洲沙地过渡'),
  terrain('grass', OASIS_GREEN, 0, '绿洲草地'),
  ...MEADOWS.map((m) => terrain('flowers', m.poly, 0, m.label)),
  terrain('mud', OASIS_MUD, 0, '湖岸湿泥'),
  ...GRASS_TONGUES.map((t) => terrain('grass', t.poly, 0, t.label)),
  ...DRY_PATCHES.map((p) => terrain(p.kind, p.poly, 0, p.label)),
  ...OASIS_PATHS,
  {...terrain('gravel', D_APRON, 0, 'D 点沙砾营地'), preserveUnderRoads: true},
  terrain('sand', OASIS_LAKE_POLYGON, 0, '湖底细沙'),
  terrain('water', OASIS_LAKE_POLYGON, 0, '绿洲湖面'),
];

/* ------------------------------------------------------------------ *
 * 对外统计（验收/覆盖统计/平面图/测试读取真实计算值，不在测试里写死）
 * ------------------------------------------------------------------ */

/** 生态区包络（快速空间查询用；外边界本体见 re-export 的 OASIS_ECO_POLYGON）。 */
export const OASIS_ECO_BOUNDS = ECO_BOUNDS;

export interface OasisVegetationStats {
  palms: number;
  acacias: number;
  tamarisks: number;
  reeds: number;
  bushes: number;
  grass: number;
  trees: number;
  shrubs: number;
  total: number;
}

const isVegetation = (c: Cover): boolean =>
  c.kind === 'palm' || c.kind === 'tree' || c.kind === 'reeds' || c.kind === 'bush';

/** 实际撒出的植被规模（tree = 棕榈+金合欢+柽柳，shrubs = 芦苇+灌木+干草）。 */
export const OASIS_VEGETATION_STATS: OasisVegetationStats = (() => {
  const stats: OasisVegetationStats = {
    palms: 0,
    acacias: 0,
    tamarisks: 0,
    reeds: 0,
    bushes: 0,
    grass: 0,
    trees: 0,
    shrubs: 0,
    total: 0,
  };
  for (const c of oasisCovers) {
    if (!isVegetation(c)) continue;
    if (c.kind === 'palm') stats.palms++;
    else if (c.kind === 'tree') {
      if (c.variant === 'tamarisk') stats.tamarisks++;
      else stats.acacias++;
    } else if (c.kind === 'reeds') stats.reeds++;
    else if (c.variant === 'grass') stats.grass++;
    else stats.bushes++;
  }
  stats.trees = stats.palms + stats.acacias + stats.tamarisks;
  stats.shrubs = stats.reeds + stats.bushes + stats.grass;
  stats.total = stats.trees + stats.shrubs;
  return stats;
})();

export interface OasisVegetationBand {
  /** 离水距离下限（m）。 */
  from: number;
  /** 离水距离上限（m）；null = 开区间。 */
  to: number | null;
  /** 该带内生态区陆地面积（m²，2 m 网格估算）。 */
  area: number;
  /** 该带内植被组数。 */
  covers: number;
  /** 每 1000 m² 密度。 */
  density: number;
}

/** 离水分段密度：0–6 / 6–20 / 20–45 / 45–80 / 80+ m（验收直接用这份）。 */
export const OASIS_VEGETATION_BANDS: OasisVegetationBand[] = (() => {
  const edges = [0, 6, 20, 45, 80];
  const areas = edges.map(() => 0);
  const counts = edges.map(() => 0);
  const bandOf = (d: number): number => {
    for (let i = edges.length - 1; i >= 0; i--) if (d >= edges[i]) return i;
    return 0;
  };
  const step = 2;
  for (let z = Math.floor(ECO_BOUNDS.z0); z <= Math.ceil(ECO_BOUNDS.z1); z += step) {
    for (let x = Math.floor(ECO_BOUNDS.x0); x <= Math.ceil(ECO_BOUNDS.x1); x += step) {
      if (!pointInPolygon(x, z, OASIS_ECO_POLYGON)) continue;
      if (x > 104 && z > 328) continue; // G 采石场压占区不种树，也不计入可种植面积
      const d = dryDistance(x, z);
      if (d < 0) continue; // 水面不计入生态区陆地面积
      areas[bandOf(d)] += step * step;
    }
  }
  for (const c of oasisCovers) {
    if (!isVegetation(c)) continue;
    const d = dryDistance(c.x, c.y);
    if (d < 0) continue;
    counts[bandOf(d)]++;
  }
  return edges.map((from, i) => ({
    from,
    to: i + 1 < edges.length ? edges[i + 1] : null,
    area: areas[i],
    covers: counts[i],
    density: round((counts[i] / Math.max(1, areas[i])) * 1000),
  }));
})();
