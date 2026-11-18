/**
 * 法老坟墓 · 共享道路/街道数据源（0.20.3）
 *
 * **单一真相**：地形整平（pharaoh-height.ts）、MapDef.roads（roads.ts）、集市街道、
 * 平面图、导航审查、载具纵坡验收全部读取本文件。任何“只在 pharaoh.ts 总装里出现”的
 * 支路都是违规的——新增道路必须加到这里。
 *
 * 图结构（两个以上环路 + 多条跨区连接）：
 *   南部车辆主轴：蓝队 → E 驿站 → F 神庙 → 东部沙丘走廊 → 橙队
 *   西/北环：    蓝队 → D 绿洲干岸 → G 采石场 → A 金字塔 → 北环 → 橙队
 *   横向连接：   E → C、G → C、F → C、C → 东部走廊；A ↔ B 地表 + 地下分层
 *
 * 纵坡：所有点的 elevations 与地标平台同高，主路/次路逐段 ≤5%（测试会沿 2 m 采样）。
 * 肩带：main 2 m、secondary 1.2 m、path 0.6 m；集市/驿站/神庙内部为 local 低对比。
 */
import type { RoadKind, RoadVerge, TerrainKind } from '../types';

export type NetworkRoadKind = Extract<RoadKind, 'main' | 'secondary' | 'path'>;

export interface PharaohRoadSpec {
  /** 稳定 id；roads.ts / 测试 / 平面图都按 id 取用。 */
  id: string;
  points: [number, number][];
  width: number;
  kind: NetworkRoadKind;
  /** 与 points 等长的高程剖面（m）。 */
  elevations: number[];
  label: string;
  /** 每侧肩带宽度（m）；0 = 不画肩带。 */
  shoulder?: number;
  verge?: RoadVerge;
  /** 本路段的当地铺装；缺省按 kind 用沥青/混凝土。 */
  surface?: TerrainKind;
  /** 白色中线虚线；城镇/广场/步道关闭。 */
  markings?: boolean;
}

type P = [number, number];

const road = (
  id: string,
  points: P[],
  elevations: number[],
  width: number,
  kind: NetworkRoadKind,
  label: string,
  shoulder?: number,
  verge: RoadVerge = 'compacted',
): PharaohRoadSpec => {
  if (points.length !== elevations.length) {
    throw new Error(`pharaoh road ${id}: ${points.length} points vs ${elevations.length} elevations`);
  }
  return { id, points, elevations, width, kind, label, shoulder, verge };
};

/* ------------------------------------------------------------------ *
 * 南部车辆主轴：蓝队 → E → F → 东部沙丘走廊 → 橙队
 * ------------------------------------------------------------------ */

const MAIN_SOUTH: P[] = [
  [100, 140], [200, 155], [300, 160], [420, 175], [520, 205],
  [610, 220], [650, 220], [710, 245], [750, 300], [758, 380],
  [758, 470], [750, 550], [740, 610], [720, 650], [700, 670],
];
const MAIN_SOUTH_ELEV = [
  2.4, 2.6, 3.2, 3.35, 3.6,
  3.9, 4.0, 4.3, 4.7, 5.2,
  6.0, 6.8, 7.0, 7.5, 8.0,
];

/* ------------------------------------------------------------------ *
 * 西/北环：蓝队 → D → G → A → 北环 → 橙队
 * ------------------------------------------------------------------ */

const WEST_BLUE_OASIS: P[] = [
  [60, 140], [120, 150], [190, 160], [250, 185], [285, 220],
  [280, 255], [250, 280], [210, 288], [175, 290],
];
const WEST_BLUE_OASIS_ELEV = [2.4, 2.5, 2.6, 2.4, 2.0, 1.4, 1.0, 0.8, 0.6];

const WEST_OASIS_QUARRY: P[] = [
  [175, 290], [195, 320], [220, 350], [216, 385], [210, 420],
];
const WEST_OASIS_QUARRY_ELEV = [0.6, 1.2, 2.2, 2.8, 3.0];

const WEST_QUARRY_PYRAMID: P[] = [
  [210, 420], [235, 435], [250, 450], [230, 462], [190, 478],
];
const WEST_QUARRY_PYRAMID_ELEV = [3.0, 3.2, 3.6, 3.8, 4.0];

const NORTH_PYRAMID_ORANGE: P[] = [
  [190, 755], [260, 760], [350, 760], [450, 755], [540, 745],
  [610, 730], [660, 715], [685, 700], [700, 680], [700, 670],
];
const NORTH_PYRAMID_ORANGE_ELEV = [4.0, 4.2, 4.4, 4.6, 4.8, 5.2, 6.0, 6.8, 7.8, 8.0];

/* ------------------------------------------------------------------ *
 * 跨区连接
 * ------------------------------------------------------------------ */

const AB_SURFACE: P[] = [[322, 600], [350, 612], [370, 625], [385, 640]];
const AB_SURFACE_ELEV = [4.0, 4.0, 4.0, 4.0];

const BC_LINK: P[] = [
  [475, 395], [470, 460], [460, 510], [455, 550], [460, 590], [460, 614],
];
const BC_LINK_ELEV = [6.5, 6.1, 5.2, 4.6, 4.2, 4.0];

const B_ORANGE: P[] = [
  [535, 640], [570, 660], [610, 680], [650, 695], [680, 700], [700, 690], [700, 670],
];
const B_ORANGE_ELEV = [4.0, 4.3, 4.8, 5.6, 6.5, 7.6, 8.0];

const E_C: P[] = [
  [380, 165], [400, 210], [430, 260], [455, 310], [468, 350], [470, 380], [475, 395],
];
const E_C_ELEV = [3.2, 3.8, 4.8, 5.8, 6.4, 6.5, 6.5];

const G_C: P[] = [
  [210, 420], [235, 425], [265, 415], [295, 405], [320, 405], [350, 400], [380, 395],
];
const G_C_ELEV = [3.0, 3.1, 3.3, 4.3, 5.2, 6.5, 6.5];

const F_C: P[] = [
  [650, 220], [640, 255], [635, 290], [635, 330], [635, 360], [635, 395],
];
const F_C_ELEV = [4.0, 4.4, 5.0, 5.8, 6.4, 6.5];

const C_EAST: P[] = [
  [635, 395], [675, 420], [710, 455], [735, 500], [750, 550],
];
const C_EAST_ELEV = [6.5, 6.4, 6.6, 6.8, 6.8];

const EF_SOUTH: P[] = [
  [430, 120], [490, 90], [540, 60], [600, 55], [640, 60], [650, 67],
];
const EF_SOUTH_ELEV = [3.2, 3.3, 3.5, 3.7, 3.9, 4.0];

const F_EAST: P[] = [[720, 212], [735, 240], [745, 270], [750, 300]];
const F_EAST_ELEV = [4.0, 4.2, 4.4, 4.7];

/* ------------------------------------------------------------------ *
 * 集市内部：主街 / 横街 / 支巷（同样是地形整平与铺装来源）
 * ------------------------------------------------------------------ */

export const BAZAAR_MAIN_STREET: P[] = [
  [480, 545], [478, 510], [477, 470], [475, 430], [475, 395],
  [474, 360], [470, 320], [462, 280], [455, 245],
];
export const BAZAAR_CROSS_STREET: P[] = [
  [320, 395], [360, 394], [400, 393], [440, 394], [475, 395],
  [510, 394], [550, 393], [590, 394], [630, 395],
];
const BAZAAR_MAIN_ELEV = Array(BAZAAR_MAIN_STREET.length).fill(6.5);
const BAZAAR_CROSS_ELEV = Array(BAZAAR_CROSS_STREET.length).fill(6.5);

const BAZAAR_LANES: { id: string; label: string; points: P[] }[] = [
  { id: 'bazaar-lane-nw', label: '集市西北巷', points: [[385, 450], [405, 480], [425, 510]] },
  { id: 'bazaar-lane-ne', label: '集市东北巷', points: [[545, 450], [565, 480], [585, 510]] },
  { id: 'bazaar-lane-sw', label: '集市西南巷', points: [[365, 340], [395, 330], [425, 330]] },
  { id: 'bazaar-lane-se', label: '集市东南巷', points: [[530, 340], [560, 330], [590, 330]] },
  { id: 'bazaar-lane-w', label: '集市西巷', points: [[350, 430], [350, 395], [350, 360]] },
  { id: 'bazaar-lane-e', label: '集市东巷', points: [[600, 430], [600, 395], [600, 360]] },
];

/* ------------------------------------------------------------------ *
 * 场地内部服务车道 / 步道
 * ------------------------------------------------------------------ */

const SERVICE_RING: P[] = [
  [300, 140], [300, 90], [350, 70], [400, 90], [400, 140], [350, 140], [300, 140],
];
const SERVICE_FRONT: P[] = [[350, 160], [350, 140]];
const SERVICE_ELEV = Array(SERVICE_RING.length).fill(3.2);
const SERVICE_FRONT_ELEV = [3.2, 3.2];

const TEMPLE_AXIS: P[] = [[650, 67], [650, 100], [650, 130], [650, 160]];
const TEMPLE_GATE: P[] = [[650, 213], [650, 220]];
const TEMPLE_EAST: P[] = [[700, 130], [740, 130], [760, 155], [750, 180], [740, 200], [720, 212]];
const TEMPLE_ELEV = Array(TEMPLE_AXIS.length).fill(4.0);
const TEMPLE_GATE_ELEV = [4.0, 4.0];
const TEMPLE_EAST_ELEV = [4.0, 4.0, 4.15, 4.35, 4.2, 4.0];

const QUARRY_HAUL: P[] = [[210, 420], [230, 440], [245, 455], [250, 460]];
const QUARRY_HAUL_ELEV = [3.0, 3.2, 3.5, 3.6];

const PYRAMID_FORECOURT: P[] = [[120, 470], [190, 478], [260, 470]];
const PYRAMID_WEST: P[] = [[58, 607], [90, 607], [120, 600]];
const PYRAMID_ELEV = Array(PYRAMID_FORECOURT.length).fill(4.0);
const PYRAMID_WEST_ELEV = Array(PYRAMID_WEST.length).fill(4.0);

const SPHINX_RING: P[] = [
  [378, 640], [375, 680], [390, 700], [420, 708], [460, 710],
  [500, 700], [525, 680], [535, 655], [535, 640],
];
const SPHINX_RING_ELEV = Array(SPHINX_RING.length).fill(4.0);

/* ------------------------------------------------------------------ *
 * 绿洲环湖干道 + 生态小径（避开湖面 ≥12 m，高程 0.3–0.6）
 * ------------------------------------------------------------------ */

export const OASIS_LOOP: P[] = [
  [175, 290], [200, 300], [210, 285], [210, 260], [210, 235],
  [200, 215], [185, 195], [168, 172], [145, 160], [120, 162],
  [95, 165], [72, 178], [36, 195], [38, 215], [36, 235],
  [42, 255], [55, 272], [72, 285], [92, 294], [118, 299],
  [145, 300], [165, 296], [175, 290],
];
const OASIS_LOOP_ELEV = [
  0.6, 0.8, 0.8, 0.75, 0.75,
  0.75, 0.75, 0.75, 0.8, 0.8,
  0.8, 0.8, 0.75, 0.75, 0.75,
  0.75, 0.75, 0.75, 0.75, 0.75,
  0.75, 0.7, 0.6,
];

export const OASIS_PATHS: P[] = [[175, 290], [195, 305], [215, 320], [225, 330]];

/* ------------------------------------------------------------------ *
 * 全部道路（顺序即铺装顺序：先主路，后街道/步道）
 * ------------------------------------------------------------------ */

const NETWORK_RAW: PharaohRoadSpec[] = [
  road('main-south', MAIN_SOUTH, MAIN_SOUTH_ELEV, 10, 'main', '南部车辆主轴', 2, 'compacted'),

  road('west-blue-oasis', WEST_BLUE_OASIS, WEST_BLUE_OASIS_ELEV, 8, 'secondary', '蓝队—绿洲干岸', 1.2, 'compacted'),
  road('west-oasis-quarry', WEST_OASIS_QUARRY, WEST_OASIS_QUARRY_ELEV, 8, 'secondary', '绿洲—采石场', 1.2, 'compacted'),
  road('west-quarry-pyramid', WEST_QUARRY_PYRAMID, WEST_QUARRY_PYRAMID_ELEV, 8, 'secondary', '采石场—金字塔南门', 1.2, 'compacted'),
  road('north-pyramid-orange', NORTH_PYRAMID_ORANGE, NORTH_PYRAMID_ORANGE_ELEV, 8, 'secondary', '金字塔北环—橙队', 1.2, 'compacted'),

  road('ab-surface', AB_SURFACE, AB_SURFACE_ELEV, 6, 'path', 'A–B 地表联络道', 0.6, 'local'),
  road('bc-link', BC_LINK, BC_LINK_ELEV, 6, 'path', '集市—狮身南口', 0.6, 'local'),
  road('b-orange', B_ORANGE, B_ORANGE_ELEV, 8, 'secondary', '狮身—橙队', 1.2, 'compacted'),
  road('e-c', E_C, E_C_ELEV, 8, 'secondary', '驿站—集市', 1.2, 'compacted'),
  road('g-c', G_C, G_C_ELEV, 7, 'secondary', '采石场—集市', 1.0, 'compacted'),
  road('f-c', F_C, F_C_ELEV, 8, 'secondary', '神庙—集市', 1.2, 'compacted'),
  road('c-east', C_EAST, C_EAST_ELEV, 8, 'secondary', '集市—东部走廊', 1.2, 'compacted'),
  road('ef-south', EF_SOUTH, EF_SOUTH_ELEV, 7, 'secondary', '驿站—神庙南缘', 1.0, 'compacted'),
  road('f-east', F_EAST, F_EAST_ELEV, 7, 'path', '神庙东门—主路', 0.6, 'local'),

  road('bazaar-main-street', BAZAAR_MAIN_STREET, BAZAAR_MAIN_ELEV, 9, 'secondary', '集市主街', 0.4, 'local'),
  road('bazaar-cross-street', BAZAAR_CROSS_STREET, BAZAAR_CROSS_ELEV, 8, 'secondary', '集市横街', 0.4, 'local'),
  ...BAZAAR_LANES.map((lane) => road(lane.id, lane.points, Array(lane.points.length).fill(6.5), 4, 'path', lane.label, 0, 'local')),

  road('service-ring', SERVICE_RING, SERVICE_ELEV, 6, 'path', '驿站环场道', 0.5, 'local'),
  road('service-front', SERVICE_FRONT, SERVICE_FRONT_ELEV, 8, 'path', '驿站进场道', 0.6, 'local'),
  road('temple-axis', TEMPLE_AXIS, TEMPLE_ELEV, 6, 'path', '卡纳克仪式轴', 0.4, 'local'),
  road('temple-gate', TEMPLE_GATE, TEMPLE_GATE_ELEV, 8, 'path', '神庙北门', 0.6, 'local'),
  road('temple-east', TEMPLE_EAST, TEMPLE_EAST_ELEV, 6, 'path', '神庙东侧院道', 0.4, 'local'),
  road('quarry-haul', QUARRY_HAUL, QUARRY_HAUL_ELEV, 6, 'path', '采石场运输便道', 0.5, 'local'),
  road('pyramid-forecourt', PYRAMID_FORECOURT, PYRAMID_ELEV, 6, 'path', '金字塔南前庭', 0.5, 'local'),
  road('pyramid-west', PYRAMID_WEST, PYRAMID_WEST_ELEV, 5, 'path', '金字塔西考古道', 0.4, 'local'),
  road('sphinx-ring', SPHINX_RING, SPHINX_RING_ELEV, 5, 'path', '狮身考古环道', 0.4, 'local'),

  road('oasis-loop', OASIS_LOOP, OASIS_LOOP_ELEV, 4, 'path', '绿洲环湖干道', 0.3, 'local'),
  road('oasis-east-path', OASIS_PATHS, [0.6, 0.5, 0.4, 0.4], 3, 'path', '绿洲东岸小径', 0.2, 'local'),
];

/** 让集市/神庙/前庭/绿洲走当地铺装，而不是把整张图刷成沥青。 */
const LOCAL_SURFACE: Record<string, TerrainKind> = {
  'bazaar-main-street': 'stone', 'bazaar-cross-street': 'stone',
  'bazaar-lane-nw': 'stone', 'bazaar-lane-ne': 'stone', 'bazaar-lane-sw': 'stone',
  'bazaar-lane-se': 'stone', 'bazaar-lane-w': 'stone', 'bazaar-lane-e': 'stone',
  'temple-axis': 'stone', 'temple-gate': 'stone', 'temple-east': 'stone',
  'pyramid-forecourt': 'stone', 'pyramid-west': 'stone', 'sphinx-ring': 'stone',
  'service-ring': 'concrete', 'service-front': 'concrete',
  'oasis-loop': 'gravel', 'oasis-east-path': 'gravel', 'quarry-haul': 'gravel',
  'ab-surface': 'gravel', 'bc-link': 'gravel', 'f-east': 'gravel',
};
const NO_MARKINGS = new Set(Object.keys(LOCAL_SURFACE));

export const PHARAOH_NETWORK: PharaohRoadSpec[] = NETWORK_RAW.map((spec) => ({
  ...spec,
  surface: LOCAL_SURFACE[spec.id],
  markings: !NO_MARKINGS.has(spec.id),
}));

/** 集市对外主街（其余模块按名字取用，避免复制坐标）。 */
export const BAZAAR_STREETS = PHARAOH_NETWORK.filter((r) => r.id.startsWith('bazaar-'));

/** 供场景作者数据避让道路：点到最近道路铺装边缘的距离（米）。 */
const SEGMENTS = PHARAOH_NETWORK.flatMap((spec) =>
  spec.points.slice(1).map((b, i) => {
    const a = spec.points[i];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l2 = dx * dx + dz * dz || 1;
    return { ax: a[0], az: a[1], dx, dz, l2, hw: spec.width / 2 + (spec.shoulder ?? 0), id: spec.id };
  }),
);

export function roadDistance(x: number, z: number): number {
  let best = Infinity;
  for (const s of SEGMENTS) {
    let t = ((x - s.ax) * s.dx + (z - s.az) * s.dz) / s.l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - s.ax - s.dx * t, z - s.az - s.dz * t) - s.hw;
    if (d < best) best = d;
  }
  return best;
}

/** 场景作者数据摆放建筑/掩体时使用：距离道路铺装/肩带边缘 ≥ margin。 */
export function clearOfRoads(x: number, z: number, margin = 2): boolean {
  return roadDistance(x, z) >= margin;
}

/** 场景平台与主路的接口节点（平面图/验收共用）。 */
export const PHARAOH_ROAD_NODES = {
  blueGate: {x: 100, z: 140},
  serviceGate: {x: 300, z: 160},
  templeNorth: {x: 650, z: 220},
  orangeSouth: {x: 700, z: 670},
  oasisPoint: {x: 175, z: 290},
  quarryPoint: {x: 210, z: 420},
  pyramidSouth: {x: 190, z: 478},
  pyramidNorth: {x: 190, z: 755},
  sphinxWest: {x: 385, z: 640},
  sphinxSouth: {x: 460, z: 614},
  bazaarCenter: {x: 475, z: 395},
} as const;


export default PHARAOH_NETWORK;
