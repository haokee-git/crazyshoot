/**
 * CRAZYSHOOT · 法老坟墓 · C 沙漠集市（BAZ-02，0.20.3 新布局）
 *
 * 中心 (475,395)，场地包络 x310..640 / z245..545（约 330×300 = 99,000 m²），
 * 基准地面 +6.5（本文件只给相对高度，世界生成器按 pharaohHeight 贴地）。
 *
 * **道路单一真相**：主街 9 m / 横街 8 m / 六条 4 m 支巷全部来自
 * `src/maps/pharaoh/network.ts` 的 BAZAAR_MAIN_STREET / BAZAAR_CROSS_STREET / PHARAOH_NETWORK，
 * 本文件不再写第二套街道坐标；`bazaarStreets` 只为旧 API 保留主街+横街两条
 * （从网络过滤），`bazaarLanes` 导出六条支巷（同一来源）。
 * **总装不要把它们再追加进 MapDef.roads**：roads.ts 的 PHARAOH_ROADS 已经是
 * PHARAOH_NETWORK 全量（含 bazaar-*），重复追加会把同一条街铺两遍。
 *
 * 七个相互连接的街区（共 54 栋建筑；多边形见 BAZAAR_BLOCKS，面积见 BAZAAR_CORE_AREA）：
 *
 *   1. NW 民居/陶坊   x310..472 / z396..545  11 栋：横街北两排泥砖宅 + 陶坊 + 风塔宅，
 *                                              内部留 24 m 陶匠院（陶窑/陶罐/晾晒棚）。
 *   2. NE 商队客栈/茶馆 x484..640 / z396..498  7 栋：主街东侧客栈/茶楼，东侧留开放停车场
 *                                              （总装的中立载具位/特武箱净空），lane-ne 斜巷穿院。
 *   3. N 仓栈          x484..640 / z498..545  6 栋：北端货栈带，Rocket 箱净空在 z500 北侧空地。
 *   4. W 染坊/陶窑     x310..472 / z330..396   7 栋：横街南侧一排作坊，染料/陶窑/陶器铺。
 *   5. E 货运院/修车院 x484..640 / z330..396   7 栋：修车棚、货运院、门房 + 开放货场。
 *   6. S 市集/茶院     x310..472 / z245..330   8 栋：南入口两排（南市客栈/茶院/香料/面饼/拱廊/茶楼）。
 *   7. SE 货栈/茶院    x484..640 / z245..330   8 栋：货运仓/调度/轮胎/考古货栈 + 南侧开放茶院。
 *
 * C 点 r13 街心广场只有一口浅井（cover 'bz-plaza-well'，height 0.9）；四个 4×4 摊
 * 摆在四条对角线 r≈18.4 处（不闭合环），N/S/W/E 四个街口保持 ≥8 m 净开口。
 *
 * 建筑尺度：54 栋，footprint 13..16 × 11..14 m，高 4..9 m；其中 8 栋 height≥8
 * （二层，W≥15、D≥12，给 buildBuildingInterior 留 4 m 跑 + 2 m 宽楼梯），
 * 占比 13% < 1/3。3 栋 open 敞棚（陶坊棚/摊贩拱廊/货场敞棚）。
 *
 * 所有实体（建筑 polygon / 掩体+道具的旋转 footprint，逐点采样）到道路铺装+肩带边缘
 * ≥1.5 m，且全部落在 C 包络内（±2 m 不规则外延）。C 包络西北角 x<325 / z>477 是 A 金字塔
 * 外层壳体，本文件不往那里放任何东西。
 *
 * 旧 scenes.ts 的 5 栋集市卫星房已迁入本街区体系（旧坐标全部废弃）：
 *   南市客栈→bz-s-inn、东货运仓→bz-se-depot、北市陶坊→bz-nw-potter、
 *   西染坊院→bz-w-dye-house、狮身考古院→bz-se-archaeology（改名考古货栈）。
 *
 * 导出（旧 API 保留）：BAZAAR_CENTER / BAZAAR_RADIUS / BAZAAR_BOUNDS /
 * BAZAAR_MAIN_WIDTH / BAZAAR_CROSS_WIDTH / bazaarBuildings / bazaarCovers /
 * bazaarProps / bazaarDecor / bazaarStreets；新增 bazaarLanes / BAZAAR_BLOCKS /
 * BAZAAR_CORE_AREA / BAZAAR_GROUND / BAZAAR_PLAZA_CLEARANCE。
 */
import type { Building, Cover, DecorPlane, Prop, Vec2 } from '../types';
import { building, cover, prop } from '../helpers';
import { BAZAAR_STREETS } from './network';

/* ------------------------------------------------------------------ */
/* 地块常数（pharaoh.ts / 平面图 / 自检脚本共用；改布局请同步 bazaar-layout.json） */
/* ------------------------------------------------------------------ */

/** C 据点（集市街心）中心。 */
export const BAZAAR_CENTER: Vec2 = [475, 395];
/** C 点半径（圈内只允许中心浅井）。 */
export const BAZAAR_RADIUS = 13;
/** 集市场地包络（约 330×300 m；不规则城镇，不是矩形平台）。 */
export const BAZAAR_BOUNDS = { x0: 310, x1: 640, z0: 245, z1: 545 };
/** 主街宽度（契约 9 m）。 */
export const BAZAAR_MAIN_WIDTH = 9;
/** 横街宽度（契约 8 m）。 */
export const BAZAAR_CROSS_WIDTH = 8;
/** 集市基准地面高度（m）。 */
export const BAZAAR_GROUND = 6.5;

/* ------------------------------------------------------------------ */
/* 街道：全部从 network.ts 过滤，本文件不新增坐标                       */
/* ------------------------------------------------------------------ */

type StreetExport = { points: Vec2[]; width: number; kind: 'secondary' | 'path'; label: string };

const toStreet = (spec: (typeof BAZAAR_STREETS)[number]): StreetExport => ({
  points: spec.points.map(([x, z]) => [x, z] as Vec2),
  width: spec.width,
  kind: spec.kind === 'secondary' ? 'secondary' : 'path',
  label: spec.label,
});

const STREET_IDS = new Set(['bazaar-main-street', 'bazaar-cross-street']);

/** 旧 API：主街（9 m）+ 横街（8 m），坐标/宽度直接来自 PHARAOH_NETWORK。 */
export const bazaarStreets: StreetExport[] = BAZAAR_STREETS.filter((r) => STREET_IDS.has(r.id)).map(toStreet);

/** 六条 4 m 步行支巷（同一网络来源；主街/横街之外的全部 bazaar 巷）。 */
export const bazaarLanes: StreetExport[] = BAZAAR_STREETS.filter((r) => !STREET_IDS.has(r.id)).map(toStreet);

/* ------------------------------------------------------------------ */
/* 街区：7 个不规则有效范围（边界到相邻街道中心线，含院落/支巷）        */
/* ------------------------------------------------------------------ */

export interface BazaarBlock {
  id: string;
  name: string;
  /**
   * 不规则有效范围：外缘到场地包络，内缘到相邻主街/横街的**中心线**，
   * 因此相邻街区共边、并集覆盖整个 C 场地核心（扣掉 A 金字塔壳体侵入的西北角）。
   * 多边形不是建筑包络——街区内部的房屋、陶匠院、晒场、支巷都算在街区内。
   */
  polygon: Vec2[];
}

const mainStreetSpec = BAZAAR_STREETS.find((r) => r.id === 'bazaar-main-street');
const crossStreetSpec = BAZAAR_STREETS.find((r) => r.id === 'bazaar-cross-street');
if (!mainStreetSpec || !crossStreetSpec) throw new Error('bazaar: network.ts 缺少集市主街/横街');

/** 主街中心线在任意 z 的 x（折线线性插值；network 的 z 单调递减）。 */
const mainStreetX = (z: number): number => {
  const pts = mainStreetSpec.points;
  for (let i = 1; i < pts.length; i++) {
    const [x0, z0] = pts[i - 1];
    const [x1, z1] = pts[i];
    if (z <= z0 && z >= z1) {
      const t = z0 === z1 ? 0 : (z - z0) / (z1 - z0);
      return x0 + (x1 - x0) * t;
    }
  }
  return pts[0][0];
};

const CENTER_X = BAZAAR_CENTER[0];
/** 主街中心线（北→南），并在 z=498 / z=330 两个街区界插入插值点。 */
const MAIN_EDGE: Vec2[] = [
  ...mainStreetSpec.points.map(([x, z]) => [x, z] as Vec2),
  [mainStreetX(498), 498] as Vec2,
  [mainStreetX(330), 330] as Vec2,
].sort((a, b) => b[1] - a[1]);
/** 横街中心线（西→东），两端各补一个场地包络点；南北街区共用这条边。 */
const CROSS_EDGE: Vec2[] = [
  [BAZAAR_BOUNDS.x0, 395.2],
  ...crossStreetSpec.points.map(([x, z]) => [x, z] as Vec2),
  [BAZAAR_BOUNDS.x1, 394.8],
];
const mainEdge = (zHigh: number, zLow: number): Vec2[] => MAIN_EDGE.filter(([, z]) => z <= zHigh && z >= zLow);
const crossWest: Vec2[] = CROSS_EDGE.filter(([x]) => x <= CENTER_X);
const crossEast: Vec2[] = CROSS_EDGE.filter(([x]) => x >= CENTER_X);
/** 反向遍历并跳过起点（用于共用边拼接，避免重复顶点）。 */
const backAfterStart = (pts: Vec2[]): Vec2[] => [...pts].reverse().slice(1);

/**
 * 七个街区：
 *   NW 民居/陶坊、NE 商队客栈/茶馆、N 仓栈、W 染坊/陶窑、E 货运院/修车院、
 *   S 市集/茶院、SE 货栈/茶院。
 * 多边形直接由 network 的主街/横街中心线推导，不另写一套街道坐标。
 * 西北角 (x<325, z>477) 是 A 金字塔外层壳体，从 NW 街区里挖掉。
 */
export const BAZAAR_BLOCKS: BazaarBlock[] = [
  {
    id: 'nw-houses',
    name: '西北民居/陶坊',
    polygon: [
      [BAZAAR_BOUNDS.x0, 477],
      [BAZAAR_BOUNDS.x0, CROSS_EDGE[0][1]],
      ...crossWest.slice(1),
      ...backAfterStart(mainEdge(545, 395)),
      [325, BAZAAR_BOUNDS.z1],
      [325, 477],
    ],
  },
  {
    id: 'w-dye',
    name: '西染坊/陶窑',
    polygon: [
      [BAZAAR_BOUNDS.x0, 330],
      [mainStreetX(330), 330],
      ...backAfterStart(mainEdge(395, 330)),
      ...backAfterStart(crossWest),
    ],
  },
  {
    id: 's-market',
    name: '南市集/茶院',
    polygon: [
      [BAZAAR_BOUNDS.x0, BAZAAR_BOUNDS.z0],
      [mainStreetX(BAZAAR_BOUNDS.z0), BAZAAR_BOUNDS.z0],
      ...backAfterStart(mainEdge(330, BAZAAR_BOUNDS.z0)),
      [BAZAAR_BOUNDS.x0, 330],
    ],
  },
  {
    id: 'se-freight',
    name: '东南货栈/茶院',
    polygon: [
      [mainStreetX(BAZAAR_BOUNDS.z0), BAZAAR_BOUNDS.z0],
      ...backAfterStart(mainEdge(330, BAZAAR_BOUNDS.z0)),
      [BAZAAR_BOUNDS.x1, 330],
      [BAZAAR_BOUNDS.x1, BAZAAR_BOUNDS.z0],
    ],
  },
  {
    id: 'e-freight',
    name: '东货运院/修车院',
    polygon: [
      [mainStreetX(330), 330],
      ...backAfterStart(mainEdge(395, 330)),
      ...crossEast.slice(1),
      [BAZAAR_BOUNDS.x1, 330],
    ],
  },
  {
    id: 'ne-khan',
    name: '东北商队客栈/茶馆',
    polygon: [
      [CENTER_X, 395],
      ...crossEast.slice(1),
      [BAZAAR_BOUNDS.x1, 498],
      ...mainEdge(498, 395).slice(0, 3),
    ],
  },
  {
    id: 'n-depot',
    name: '北仓栈',
    polygon: [
      [mainStreetX(498), 498],
      [BAZAAR_BOUNDS.x1, 498],
      [BAZAAR_BOUNDS.x1, BAZAAR_BOUNDS.z1],
      [mainStreetX(BAZAAR_BOUNDS.z1), BAZAAR_BOUNDS.z1],
      ...mainEdge(BAZAAR_BOUNDS.z1, 498).slice(1, 2),
    ],
  },
];

/** 多边形面积（鞋带公式，m²）。 */
const polygonArea = (polygon: Vec2[]): number => {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, z1] = polygon[i];
    const [x2, z2] = polygon[(i + 1) % polygon.length];
    sum += x1 * z2 - x2 * z1;
  }
  return Math.abs(sum) / 2;
};

/**
 * 有效核心面积（m²）：七个街区多边形并集（相邻共边、无重叠）。
 * 当前 97,980 m² ≥ 契约要求的 96,900 m²（场地包络 330×300=99,000，
 * 扣掉 A 金字塔壳体侵入角 15×68 m）。
 */
export const BAZAAR_CORE_AREA: number = Math.round(
  BAZAAR_BLOCKS.reduce((total, block) => total + polygonArea(block.polygon), 0),
);

/** C 点广场净空半径（r13 内只允许中心浅井）；与 BAZAAR_RADIUS 同值，供测试读取。 */
export const BAZAAR_PLAZA_CLEARANCE = 13;

/* ------------------------------------------------------------------ */
/* 建材配色（泥砖 / 赭灰 / 旧白灰 / 棕榈木 / 陶土 / 编织 / 靛蓝 / 茜草 / 褪色金属） */
/* ------------------------------------------------------------------ */

const MUD = '#a9754a';
const MUD_DARK = '#8f5f3c';
const OCHRE = '#b98d5c';
const WHITE_OLD = '#cfc2a8';
const PALM = '#8a6a45';
const PALM_DARK = '#6d5236';
const TERRACOTTA = '#b46a3c';
const TERRACOTTA_DARK = '#96542f';
const WEAVE = '#c2a05a';
const INDIGO = '#3b4d6b';
const MADDER = '#7a3a4a';
const METAL_FADED = '#6b6b5a';
const RUBBER = '#2c2c2c';
const CLOTH = '#b9a074';
const PRODUCE = '#7d8f4a';
const WELL_STONE = '#9c8a6a';

/* ------------------------------------------------------------------ */
/* 建筑：54 栋（51 栋可进入 + 3 栋 open 敞棚），高度 4..9，二层 8 栋     */
/* ------------------------------------------------------------------ */

/** 统一关掉小地图标签，只有街区地标自己打开。 */
const B = (
  id: string,
  name: string,
  x: number,
  z: number,
  w: number,
  d: number,
  height: number,
  roof: Building['roof'] = 'flat',
  extra: Partial<Building> = {},
): Building => building(id, name, x, z, w, d, height, roof, { label: false, ...extra });

export const bazaarBuildings: Building[] = [
  /* ---------------- NW 民居/陶坊（11）：横街北侧两排 + 北端窄排 ---------------- */
  // A 排（z404..418）：横街北侧临街宅 + 北市陶坊；lane-w 从两栋之间穿过
  B('bz-nw-house-a', '北街民居 A', 357, 406, 14, 13, 6, 'flat', { wallColor: MUD, roofColor: OCHRE }),
  B('bz-nw-house-b', '北街民居 B', 374, 404, 13, 12, 5, 'flat', { wallColor: MUD_DARK }),
  // 北市陶坊：旧 scenes.ts「北市陶坊」迁入；15×14 单层，南侧院摆陶窑/陶罐
  B('bz-nw-potter', '北市陶坊', 390, 404, 15, 14, 7, 'flat', {
    wallColor: TERRACOTTA_DARK,
    roofColor: OCHRE,
    label: true,
    labelAt: [397, 418],
  }),
  B('bz-nw-house-c', '北街窄宅', 409, 405, 14, 13, 5, 'flat', { wallColor: WHITE_OLD }),
  // B 排（z432..446）：风塔宅（二层）+ 西巷民居，南侧是 24 m 陶匠院
  B('bz-nw-house-d', '西巷民居 A', 313, 432, 14, 13, 6, 'flat', { wallColor: OCHRE }),
  // 风塔宅：二层 + 院角风塔（见 bz-windcatcher），西北巷视线地标
  B('bz-nw-house-e', '风塔宅', 332, 433, 15, 13, 9, 'flat', {
    wallColor: MUD_DARK,
    label: true,
    labelAt: [339, 446],
  }),
  B('bz-nw-house-f', '西巷民居 B', 356, 432, 14, 12, 5, 'flat', { wallColor: WHITE_OLD }),
  B('bz-nw-house-g', '陶工宅', 374, 433, 14, 13, 6, 'flat', { wallColor: MUD }),
  // C 排（z521..535）：金字塔壳体以东的北端窄排（x>=325，避开 A 外层基座）
  // open 敞棚：陶坊晾坯棚，柱子 + 背墙，本身不生成室内
  B('bz-nw-shed', '陶坊晾坯棚', 327, 521, 13, 12, 4, 'open', { wallColor: PALM_DARK }),
  B('bz-nw-store', '北巷货栈', 344, 522, 13, 13, 5, 'flat', { wallColor: OCHRE, roofColor: PALM_DARK }),
  B('bz-nw-house-h', '北巷宅院', 361, 521, 15, 14, 7, 'flat', { wallColor: MUD_DARK, label: true, labelAt: [368, 535] }),

  /* ---------------- W 染坊/陶窑（7）：横街南侧一排 ---------------- */
  B('bz-w-dye-workshop', '染布作坊', 313, 368, 14, 13, 6, 'flat', {
    wallColor: INDIGO,
    label: true,
    labelAt: [320, 381],
  }),
  B('bz-w-dye-store', '染料库', 332, 369, 13, 12, 5, 'flat', { wallColor: OCHRE }),
  // 西染坊院：旧 scenes.ts「西染坊院」迁入，二层 15×14（楼梯有位置）
  B('bz-w-dye-house', '西染坊院', 354, 368, 15, 14, 7, 'flat', {
    wallColor: MUD_DARK,
    roofColor: MUD,
    label: true,
    labelAt: [361, 382],
  }),
  B('bz-w-kiln', '陶窑作坊', 372, 369, 14, 13, 6, 'flat', { wallColor: TERRACOTTA }),
  B('bz-w-pottery', '陶器作坊', 389, 368, 13, 14, 7, 'flat', {
    wallColor: TERRACOTTA_DARK,
    roofColor: OCHRE,
    label: true,
    labelAt: [395, 382],
  }),
  B('bz-w-pottery-shop', '陶器铺', 405, 369, 15, 13, 5, 'flat', { wallColor: MUD }),
  B('bz-w-storehouse', '西货栈', 424, 368, 14, 12, 6, 'flat', { wallColor: OCHRE }),

  /* ---------------- S 市集/茶院（8）：南入口两排 ---------------- */
  // 南市客栈：旧 scenes.ts「南市客栈」迁入，南入口地标
  B('bz-s-inn', '南市客栈', 315, 252, 14, 12, 6, 'flat', {
    wallColor: MUD,
    roofColor: PALM_DARK,
    label: true,
    labelAt: [322, 264],
  }),
  B('bz-s-tea-court', '茶院厢房', 333, 253, 13, 12, 5, 'flat', { wallColor: WHITE_OLD }),
  B('bz-s-tea-shop', '南街茶院', 350, 252, 15, 13, 7, 'flat', { wallColor: MUD_DARK }),
  B('bz-s-bread', '南街面饼铺', 314, 308, 14, 13, 6, 'flat', { wallColor: WEAVE }),
  B('bz-s-spice', '香料铺', 332, 309, 13, 12, 5, 'flat', {
    wallColor: WEAVE,
    label: true,
    labelAt: [338, 321],
  }),
  B('bz-s-bakery', '面饼铺', 349, 308, 15, 13, 7, 'flat', { wallColor: WHITE_OLD }),
  // open 敞棚：摊贩拱廊，摊贩街的室内延伸
  B('bz-s-arcade', '摊贩拱廊', 367, 309, 14, 12, 5, 'open', { wallColor: PALM }),
  // 茶楼：二层 15×13，南市集团地标
  B('bz-s-tea-house', '茶楼', 384, 308, 15, 13, 7, 'flat', {
    wallColor: MUD,
    roofColor: PALM_DARK,
    label: true,
    labelAt: [391, 321],
  }),

  /* ---------------- SE 货栈/茶院（8） ---------------- */
  // 东货运仓：旧 scenes.ts「东货运仓」迁入
  B('bz-se-depot', '东货运仓', 488, 308, 14, 13, 6, 'flat', {
    wallColor: OCHRE,
    label: true,
    labelAt: [495, 321],
  }),
  B('bz-se-office', '货运调度', 505, 309, 15, 12, 7, 'flat', { wallColor: WHITE_OLD }),
  B('bz-se-warehouse', '货运仓', 523, 308, 14, 13, 5, 'flat', { wallColor: OCHRE }),
  B('bz-se-tire', '轮胎铺', 541, 309, 13, 12, 6, 'flat', { wallColor: RUBBER }),
  B('bz-se-store', '南货栈', 558, 308, 16, 14, 8, 'flat', {
    wallColor: METAL_FADED,
    label: true,
    labelAt: [566, 322],
  }),
  B('bz-se-carpet', '地毯铺', 578, 309, 14, 12, 5, 'flat', { wallColor: WHITE_OLD }),
  // 狮身考古院：旧 scenes.ts「sat-sphinx-camp」迁入 C，改名考古货栈（功能进集市）
  B('bz-se-archaeology', '考古货栈', 596, 308, 13, 13, 7, 'flat', {
    wallColor: MUD,
    label: true,
    labelAt: [603, 321],
  }),
  B('bz-se-court', '货院厢房', 612, 309, 15, 13, 6, 'flat', { wallColor: OCHRE }),

  /* ---------------- E 货运院/修车院（7） ---------------- */
  B('bz-e-garage', '修车棚', 488, 366, 15, 13, 7, 'flat', {
    wallColor: METAL_FADED,
    label: true,
    labelAt: [496, 379],
  }),
  B('bz-e-garage-two', '修车二棚', 506, 367, 14, 12, 6, 'flat', { wallColor: METAL_FADED }),
  B('bz-e-freight', '货运院', 524, 366, 15, 14, 8, 'flat', {
    wallColor: OCHRE,
    label: true,
    labelAt: [532, 380],
  }),
  B('bz-e-yard-shed', '货场敞棚', 543, 367, 13, 13, 5, 'open', { wallColor: PALM_DARK }),
  B('bz-e-tool', '工具房', 560, 366, 14, 12, 7, 'flat', { wallColor: METAL_FADED }),
  B('bz-e-warehouse', '货运仓库', 578, 367, 15, 13, 6, 'flat', { wallColor: OCHRE }),
  B('bz-e-gatehouse', '货运门房', 606, 366, 16, 14, 6, 'flat', {
    wallColor: OCHRE,
    roofColor: MUD,
    label: true,
    labelAt: [614, 380],
  }),

  /* ---------------- NE 商队客栈/茶馆（7）；x606..635 / z474..503 留开放停车场 ---------------- */
  B('bz-ne-khan', '商队客栈', 488, 414, 14, 12, 6, 'flat', {
    wallColor: MUD,
    roofColor: MUD_DARK,
    label: true,
    labelAt: [495, 426],
  }),
  // 客栈主楼：二层 16×12，主街东侧地标
  B('bz-ne-khan-main', '客栈主楼', 488, 430, 16, 12, 8, 'flat', {
    wallColor: MUD_DARK,
    roofColor: OCHRE,
    label: true,
    labelAt: [496, 442],
  }),
  B('bz-ne-tea', '东街茶楼', 488, 452, 14, 13, 7, 'flat', { wallColor: MUD, roofColor: PALM_DARK }),
  B('bz-ne-tea-garden', '茶院', 488, 474, 13, 12, 5, 'flat', { wallColor: WHITE_OLD }),
  B('bz-ne-bath', '驿站浴室', 488, 492, 15, 11, 5, 'flat', { wallColor: WHITE_OLD, roofColor: MUD }),
  B('bz-ne-caravan', '商队货栈', 600, 460, 14, 12, 5, 'flat', {
    wallColor: OCHRE,
    label: true,
    labelAt: [607, 472],
  }),
  B('bz-ne-guard', '客舍', 618, 458, 16, 13, 7, 'flat', { wallColor: MUD }),

  /* ---------------- N 仓栈（6）：北端货栈带 ---------------- */
  B('bz-n-warehouse-a', '北仓甲', 489, 522, 15, 13, 6, 'flat', { wallColor: OCHRE }),
  B('bz-n-warehouse-b', '北仓乙', 507, 521, 16, 14, 7, 'flat', {
    wallColor: OCHRE,
    label: true,
    labelAt: [515, 535],
  }),
  B('bz-n-cargo', '北货栈', 526, 522, 14, 13, 5, 'flat', { wallColor: MUD, roofColor: PALM_DARK }),
  B('bz-n-cargo-house', '北货栈厢房', 544, 522, 14, 13, 6, 'flat', { wallColor: OCHRE }),
  // 仓院主屋：二层 16×14，北端地标
  B('bz-n-khan-court', '仓院主屋', 600, 521, 16, 14, 9, 'flat', {
    wallColor: MUD_DARK,
    label: true,
    labelAt: [608, 535],
  }),
  B('bz-n-lodge', '北栈客房', 619, 522, 15, 13, 6, 'flat', { wallColor: WHITE_OLD }),
];

/* ------------------------------------------------------------------ */
/* 掩体：52 件（24 个 stall/canopy + 浅井/陶窑/风塔/陶罐/桌子/麻袋/货箱/轮胎/废车/路障） */
/* ------------------------------------------------------------------ */

export const bazaarCovers: Cover[] = [
  /* ---------------- C 点 r13 街心广场：圈内只有中心浅井 ---------------- */
  cover('well', 475, 395, 3, 3, 0, {
    id: 'bz-plaza-well',
    height: 0.9, // 低石台：世界生成器需按 height 处理 'well'，不要抬到通用 1.5 m
    variant: 'shallow-well',
    color: WELL_STONE,
    label: '街心浅井',
  }),

  /* ---------------- 广场环：四条对角线 r≈18.4 的 4×4 摊，环不闭合，N/S/W/E 街口全开 ---------------- */
  cover('stall', 462, 408, 4, 4, 0, {
    id: 'bz-stall-plaza-nw',
    height: 2.4,
    variant: 'produce',
    color: TERRACOTTA,
  }),
  cover('stall', 488, 408, 4, 4, 0, {
    id: 'bz-stall-plaza-ne',
    height: 2.4,
    variant: 'spice',
    color: WEAVE,
  }),
  cover('stall', 459, 385, 4, 4, 0, {
    id: 'bz-stall-plaza-sw',
    height: 2.4,
    variant: 'pottery',
    color: TERRACOTTA_DARK,
  }),
  cover('stall', 488, 382, 4, 4, 0, {
    id: 'bz-stall-plaza-se',
    height: 2.4,
    variant: 'tea',
    color: PALM,
  }),

  /* ---------------- NW 陶匠院：陶窑两座 + 陶罐/货箱/展销摊（24 m 院，院内可穿过） ---------------- */
  cover('dome', 428, 462, 6, 6, 0, {
    id: 'bz-kiln-1',
    height: 5,
    variant: 'pottery-kiln',
    color: TERRACOTTA_DARK,
  }),
  cover('dome', 441, 484, 5, 5, 0, {
    id: 'bz-kiln-2',
    height: 4.5,
    variant: 'pottery-kiln',
    color: TERRACOTTA,
  }),
  // 风塔（malkaf）：风塔宅南侧，西北巷的竖向地标
  cover('dome', 332, 450, 5, 5, 0, {
    id: 'bz-windcatcher',
    height: 7,
    variant: 'wind-catcher',
    color: PALM,
  }),
  cover('pots', 438, 470, 4, 3, 12, { id: 'bz-pots-yard-1', height: 1.4, color: TERRACOTTA }),
  cover('pots', 445, 500, 3.5, 3, -10, { id: 'bz-pots-yard-2', height: 1.3, color: TERRACOTTA_DARK }),
  cover('stall', 410, 505, 5, 4, 0, {
    id: 'bz-stall-pottery-yard',
    height: 2.3,
    variant: 'pottery',
    color: TERRACOTTA,
  }),
  cover('crate', 432, 508, 3, 3, 0, { id: 'bz-crate-pottery-yard', height: 1.3, color: PALM }),
  cover('pots', 412, 516, 4, 3, 16, { id: 'bz-pots-nw', height: 1.3, color: TERRACOTTA }),
  cover('stall', 428, 517, 5, 4, 0, {
    id: 'bz-stall-nw',
    height: 2.3,
    variant: 'pottery',
    color: TERRACOTTA_DARK,
  }),

  /* ---------------- W 染坊街口：横街南缘两条 5×3 展销摊 + 陶罐 ---------------- */
  cover('stall', 334, 384, 5, 3, 0, {
    id: 'bz-stall-dye-front',
    height: 2.2,
    variant: 'dye',
    color: MADDER,
  }),
  cover('stall', 416, 384, 5, 3, 0, {
    id: 'bz-stall-pottery-front',
    height: 2.2,
    variant: 'pottery',
    color: TERRACOTTA,
  }),
  cover('pots', 357, 386, 3, 2.5, 8, { id: 'bz-pots-front', height: 1.3, color: TERRACOTTA_DARK }),

  /* ---------------- S 茶院/市集：茶棚 + 茶桌 + 麻袋 + 两条展销摊 ---------------- */
  cover('stall', 358, 344, 5, 4, 0, {
    id: 'bz-stall-south-1',
    height: 2.3,
    variant: 'pottery',
    color: TERRACOTTA,
  }),
  cover('canopy', 382, 352, 9, 6, 0, {
    id: 'bz-canopy-tea-court',
    height: 3.2,
    variant: 'tea-arcade',
    color: CLOTH,
  }),
  cover('table', 392, 350, 3, 2, 0, { id: 'bz-table-tea-court', height: 1.4, color: PALM_DARK }),
  cover('sack', 372, 352, 2.5, 2.5, 20, { id: 'bz-sack-south', height: 1.4, color: WEAVE }),
  cover('stall', 404, 344, 5, 4, 0, {
    id: 'bz-stall-south-3',
    height: 2.3,
    variant: 'tea',
    color: PALM,
  }),
  cover('stall', 330, 284, 5, 4, 0, {
    id: 'bz-stall-s-market-1',
    height: 2.3,
    variant: 'pottery',
    color: TERRACOTTA,
  }),
  cover('stall', 342, 286, 4, 4, 0, {
    id: 'bz-stall-s-market-2',
    height: 2.2,
    variant: 'produce',
    color: PRODUCE,
  }),
  cover('pots', 356, 285, 4, 3, -12, { id: 'bz-pots-s', height: 1.3, color: TERRACOTTA_DARK }),
  cover('crate', 368, 284, 3, 3, 0, { id: 'bz-crate-s', height: 1.3, color: PALM }),

  /* ---------------- NE 商队院：客栈雨棚 + 香料/果蔬摊 + 茶桌 + 货箱 ---------------- */
  cover('canopy', 515, 455, 8, 6, 0, {
    id: 'bz-canopy-khan',
    height: 3.2,
    variant: 'khan-canopy',
    color: CLOTH,
  }),
  cover('stall', 508, 470, 5, 4, 0, {
    id: 'bz-stall-ne-1',
    height: 2.3,
    variant: 'spice',
    color: WEAVE,
  }),
  cover('stall', 520, 472, 4, 4, 0, {
    id: 'bz-stall-ne-2',
    height: 2.3,
    variant: 'produce',
    color: PRODUCE,
  }),
  cover('stall', 560, 424, 5, 4, 0, {
    id: 'bz-stall-ne-3',
    height: 2.3,
    variant: 'goods',
    color: WEAVE,
  }),
  cover('table', 532, 470, 3, 2, 0, { id: 'bz-table-ne', height: 1.4, color: PALM }),
  cover('crate', 515, 485, 3, 3, 14, { id: 'bz-crate-ne', height: 1.3, color: PALM_DARK }),

  /* ---------------- E 货运院开放货场：车棚 + 轮胎堆 + 废车 + 工具台 + 加油岛 ---------------- */
  cover('canopy', 500, 350, 9, 5, 0, {
    id: 'bz-canopy-garage',
    height: 3.2,
    variant: 'garage-bay',
    color: METAL_FADED,
  }),
  cover('tires', 516, 348, 3, 3, 0, { id: 'bz-tires-1', height: 1.5, color: RUBBER }),
  cover('tires', 523, 354, 3, 3, 20, { id: 'bz-tires-2', height: 1.4, color: RUBBER }),
  cover('wreck', 536, 350, 8, 4, 25, { id: 'bz-wreck-yard', height: 1.8, color: '#4a4437' }),
  cover('crate', 550, 352, 3, 3, 0, { id: 'bz-crate-yard', height: 1.3, color: PALM_DARK }),
  cover('stall', 566, 348, 3, 5, 90, {
    id: 'bz-stall-garage',
    height: 2.5,
    variant: 'garage',
    color: METAL_FADED,
  }),
  cover('table', 578, 356, 3, 2, 0, { id: 'bz-tool-bench', height: 1.4, color: PALM_DARK }),
  cover('barrier', 585, 352, 8, 2, 0, { id: 'bz-barrier-yard', height: 1.2, color: '#8b8477' }),
  cover('crate', 594, 356, 3, 3, 0, { id: 'bz-crate-yard-2', height: 1.3, color: PALM }),

  /* ---------------- SE 南端开放茶院：雨棚 + 果蔬/陶器摊 + 茶桌 + 麻袋 + 陶罐 ---------------- */
  cover('canopy', 505, 262, 8, 6, 0, {
    id: 'bz-canopy-se',
    height: 3.2,
    variant: 'market-canopy',
    color: CLOTH,
  }),
  cover('stall', 520, 264, 5, 4, 0, {
    id: 'bz-stall-se-1',
    height: 2.3,
    variant: 'produce',
    color: PRODUCE,
  }),
  cover('stall', 498, 270, 5, 4, 0, {
    id: 'bz-stall-se-2',
    height: 2.3,
    variant: 'pottery',
    color: TERRACOTTA,
  }),
  cover('table', 530, 262, 3, 2, 0, { id: 'bz-table-se', height: 1.4, color: PALM }),
  cover('sack', 490, 262, 2.5, 2.5, 0, { id: 'bz-sack-se', height: 1.4, color: WEAVE }),
  cover('pots', 542, 268, 4, 3, 18, { id: 'bz-pots-se', height: 1.3, color: TERRACOTTA_DARK }),
  cover('crate', 552, 262, 3, 3, 0, { id: 'bz-crate-se', height: 1.3, color: PALM }),

  /* ---------------- N 仓栈院：货栈雨棚 + 货箱 + 货摊（火箭箱净空在其南侧空地） ---------------- */
  cover('canopy', 552, 512, 8, 5, 0, {
    id: 'bz-canopy-n',
    height: 3.4,
    variant: 'warehouse-awning',
    color: CLOTH,
  }),
  cover('crate', 561, 506, 3, 3, 0, { id: 'bz-crate-n-1', height: 1.3, color: PALM }),
  cover('stall', 574, 508, 5, 4, 0, {
    id: 'bz-stall-n',
    height: 2.3,
    variant: 'goods',
    color: WEAVE,
  }),
  cover('crate', 590, 514, 3, 3, 12, { id: 'bz-crate-n-2', height: 1.3, color: PALM_DARK }),
];

/* ------------------------------------------------------------------ */
/* 道具：26 件（主街/横街灯柱 13、招牌 5、桶 4、托盘 3、加油岛 1）      */
/* ------------------------------------------------------------------ */

export const bazaarProps: Prop[] = [
  // 主街灯柱：全部站在 9 m 主街铺装+肩带边缘外 ≥1.5 m
  prop('lamp', 455, 340),
  prop('lamp', 466, 412),
  prop('lamp', 485, 412),
  prop('lamp', 460, 430),
  prop('lamp', 460, 470),
  prop('lamp', 486, 475),
  prop('lamp', 487, 530),
  // 横街灯柱：南缘 z<388、北缘 z>401
  prop('lamp', 410, 386),
  prop('lamp', 450, 385),
  prop('lamp', 426, 402),
  prop('lamp', 510, 403),
  prop('lamp', 545, 403),
  prop('lamp', 570, 385),
  // 店铺招牌（5 m 宽木招牌 + 4 m 立杆，底座贴铺装外缘）
  prop('sign', 484, 447, { label: '商队客栈' }),
  prop('sign', 486, 482, { label: '商队货栈' }),
  prop('sign', 412, 340, { label: '陶窑作坊' }),
  prop('sign', 482, 290, { label: '南市集' }),
  prop('sign', 590, 340, { label: '修车货运院' }),
  // 作坊/货院的桶与托盘
  prop('barrels', 543, 356),
  prop('barrels', 560, 514),
  prop('barrels', 532, 466),
  prop('barrels', 430, 352),
  prop('pallets', 505, 360),
  prop('pallets', 396, 486),
  prop('pallets', 610, 340),
  // 修车院加油岛（全部落在开放货场，不压街）
  prop('gas_station', 570, 356, { w: 6, d: 4, label: '修车院加油岛' }),
];

/* ------------------------------------------------------------------ */
/* 装饰面：4 张 atlas（布招/壁画小物/植物/市集货物）                    */
/* ------------------------------------------------------------------ */

/**
 * `y` 一律是「相对地面高度」——世界生成器会加 pharaohHeight(x,z)；
 * rot 为绕 +Y 的角度（0 朝 +z，90 朝 +x，180 朝 -z，-90 朝 -x）。
 * uv 按图集 2x2 分区给，材质组若改了 atlas 排布可直接改这四个数。
 * 面板 w/h 1–4 m、离地 2–5 m（与 QA 契约一致）。
 */
export const bazaarDecor: DecorPlane[] = [
  // 摊位遮阳布/布招（广场四摊、陶匠院、茶院、商队院、修车棚、南端茶院、北仓）
  { atlas: 'atlas_cloth_signs', x: 459, y: 2.8, z: 387.2, w: 3, h: 1.5, rot: 0, uv: [0, 0, 0.5, 0.5] },
  { atlas: 'atlas_cloth_signs', x: 488, y: 2.8, z: 406.2, w: 3, h: 1.5, rot: 180, uv: [0.5, 0, 0.5, 0.5] },
  { atlas: 'atlas_cloth_signs', x: 410, y: 2.9, z: 503.2, w: 4, h: 1.8, rot: 180, uv: [0, 0.5, 0.5, 0.5] },
  { atlas: 'atlas_cloth_signs', x: 428, y: 2.9, z: 515.2, w: 4, h: 1.8, rot: 180, uv: [0.5, 0.5, 0.5, 0.5] },
  { atlas: 'atlas_cloth_signs', x: 382, y: 3.3, z: 349.2, w: 4, h: 1.8, rot: 180, uv: [0, 0, 0.5, 0.5] },
  { atlas: 'atlas_cloth_signs', x: 404, y: 2.8, z: 342.2, w: 3, h: 1.5, rot: 180, uv: [0.5, 0, 0.5, 0.5] },
  { atlas: 'atlas_cloth_signs', x: 515, y: 3.3, z: 452.2, w: 4, h: 1.8, rot: 180, uv: [0, 0.5, 0.5, 0.5] },
  { atlas: 'atlas_cloth_signs', x: 574, y: 2.8, z: 506.2, w: 3.5, h: 1.6, rot: 180, uv: [0.5, 0.5, 0.5, 0.5] },
  { atlas: 'atlas_cloth_signs', x: 566, y: 2.8, z: 345.6, w: 3, h: 1.5, rot: 180, uv: [0, 0, 0.5, 0.5] },
  { atlas: 'atlas_cloth_signs', x: 520, y: 2.8, z: 262.2, w: 3.5, h: 1.6, rot: 180, uv: [0.5, 0, 0.5, 0.5] },

  // 墙面壁画/浮雕残片（贴在 7 栋地标的外墙面上，rot 与墙法线一致）
  { atlas: 'atlas_murals_objects', x: 368, y: 3.4, z: 535.4, w: 3, h: 2, rot: 0, uv: [0, 0, 0.5, 0.5] },
  { atlas: 'atlas_murals_objects', x: 350, y: 3.2, z: 535.4, w: 3.5, h: 2, rot: 0, uv: [0.5, 0, 0.5, 0.5] },
  { atlas: 'atlas_murals_objects', x: 379, y: 3.2, z: 382.4, w: 3.5, h: 2, rot: 0, uv: [0, 0.5, 0.5, 0.5] },
  { atlas: 'atlas_murals_objects', x: 496, y: 3.4, z: 429.6, w: 3.5, h: 2, rot: 180, uv: [0.5, 0.5, 0.5, 0.5] },
  { atlas: 'atlas_murals_objects', x: 515, y: 3.2, z: 520.6, w: 3.5, h: 2, rot: 180, uv: [0, 0, 0.5, 0.5] },
  { atlas: 'atlas_murals_objects', x: 607, y: 3.2, z: 459.6, w: 3, h: 2, rot: 180, uv: [0.5, 0, 0.5, 0.5] },
  { atlas: 'atlas_murals_objects', x: 495, y: 3.2, z: 321.4, w: 3, h: 2, rot: 0, uv: [0, 0.5, 0.5, 0.5] },

  // 边缘棕榈/灌木（atlas_plants，插在街区尽端与院角，不参与碰撞）
  { atlas: 'atlas_plants', x: 313, y: 2.4, z: 470, w: 3, h: 2, rot: 90, uv: [0.5, 0.5, 0.5, 0.5] },
  { atlas: 'atlas_plants', x: 636, y: 2.6, z: 470, w: 3, h: 2, rot: -90, uv: [0, 0, 0.5, 0.5] },
  { atlas: 'atlas_plants', x: 356, y: 2.5, z: 268, w: 3, h: 2, rot: 0, uv: [0.5, 0, 0.5, 0.5] },
  { atlas: 'atlas_plants', x: 602, y: 2.4, z: 270, w: 3, h: 2, rot: 180, uv: [0, 0.5, 0.5, 0.5] },

  // 市集货物面板（atlas_market_goods，挂在摊位货台后上方）
  { atlas: 'atlas_market_goods', x: 459, y: 2.6, z: 382.8, w: 3.5, h: 1.5, rot: 180, uv: [0.5, 0, 0.5, 0.5] },
  { atlas: 'atlas_market_goods', x: 498, y: 2.7, z: 268.2, w: 3.5, h: 1.6, rot: 180, uv: [0, 0.5, 0.5, 0.5] },
  { atlas: 'atlas_market_goods', x: 330, y: 2.7, z: 282.2, w: 3, h: 1.5, rot: 180, uv: [0.5, 0.5, 0.5, 0.5] },
];

export default {
  bazaarBuildings,
  bazaarCovers,
  bazaarProps,
  bazaarDecor,
  bazaarStreets,
  bazaarLanes,
  BAZAAR_BLOCKS,
};
