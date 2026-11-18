/**
 * 千户苗寨 · authored plot catalog（唯一建筑布局数据源）。
 *
 * 两岸吊脚楼沿等高线成组布置，临河巷与山坡台地相接。
 * 每一栋都有稳定 id、分区、中心、yaw、面阔/进深、层数、首层标高、屋顶类型、
 * 门窗/阳台/楼梯/吊脚/室内配置。这里只描述“设计”，体素在世界生成器里展开。
 *
 * 行距来自任务书：山墙间距 2–5 m、排距 12–18 m、主街 7–9 m、横街 4–6 m、
 * 小巷 1.8–3.2 m。棚舍/猪场/剧场/桥梁/渡口是独立结构，不靠随机散点。
 */
import type { Building, CapturePoint, Route, SpawnZone, SpecialCrate, Team, VehiclePad, Polygon } from '../types';
import { miaoBaseHeight } from './height-base';
import { MIAO_BRIDGES, MIAO_FERRIES, quayStreetY, riverAt } from './river';
import { MIAO_ROADS } from './network';

export type DistrictId = 'A' | 'B' | 'C' | 'D' | 'E' | 'O';
export type PlotRoof = 'gable' | 'hip' | 'double-eave' | 'shed';
export type PlotInterior = 'shop' | 'house' | 'inn' | 'workshop' | 'hall' | 'shed' | 'pig-shed' | 'theater-back';

export interface MiaoPlot {
  id: string;
  district: DistrictId;
  districtName: string;
  x: number;
  z: number;
  baseY: number;
  yaw: number;
  /** 面阔（沿局部 x）。 */
  w: number;
  /** 进深（沿局部 z）。 */
  d: number;
  floors: 1 | 2 | 3;
  roof: PlotRoof;
  interior: PlotInterior;
  /** 吊脚方向：front = 门脸一侧（局部 +z）架空。 */
  stilt: 'front' | 'side' | 'none';
  balcony: boolean;
  /** 每层真实窗洞目标（验收用；双层主楼 18–26）。 */
  windowTarget: number;
  /** 底层出口数（前门 + 后门/侧门）。 */
  exits: number;
  sign?: string;
  /** 可通行/导航标记（棚舍也可通过真实开口）。 */
  navigable: boolean;
  /** 大型车辆不能进入的窄巷院落。 */
  vehicleBlocked?: boolean;
}

const DISTRICTS: Record<DistrictId, string> = {
  A: '游方市集', B: '田园打谷场', C: '河岸与芦笙场', D: '鼓藏堂坡地', E: '剧场片区', O: '寨边独栋',
};

const quantize = (v: number) => Math.round(v);
const clampBase = (v: number) => Math.max(1, Math.min(86, quantize(v)));
const baseAt = (x: number, z: number, offset = 0) => clampBase(miaoBaseHeight(x, z) + offset);

interface RowSpec {
  district: DistrictId;
  /** 每栋中心 x（局部 yaw 仍按 yaw 字段）。 */
  xs?: number[];
  z?: number;
  /** 或每栋中心 z（竖排）。 */
  zs?: number[];
  x?: number;
  yaw: number;
  floors: Array<1 | 2 | 3>;
  w: number;
  d: number;
  offset?: number;
  interior: PlotInterior;
  roof?: PlotRoof;
  sign?: string[];
  prefix: string;
}

const plots: MiaoPlot[] = [];
let rowSerial = 0;

function addRows(specs: RowSpec[]) {
  for (const spec of specs) {
    const rowTag = String(++rowSerial).padStart(2, '0');
    const centers: { x: number; z: number }[] = spec.xs
      ? spec.xs.map((x) => ({ x, z: spec.z! }))
      : spec.zs!.map((z) => ({ x: spec.x!, z }));
    if (centers.length !== spec.floors.length) {
      throw new Error(`miao layout: ${spec.prefix} floors ${spec.floors.length} != plots ${centers.length}`);
    }
    centers.forEach((c, i) => {
      const floors = spec.floors[i];
      const two = floors >= 2;
      plots.push({
        id: `${spec.district}-${spec.prefix}${rowTag}-${String(i + 1).padStart(2, '0')}`,
        district: spec.district,
        districtName: DISTRICTS[spec.district],
        x: c.x,
        z: c.z,
        baseY: baseAt(c.x, c.z, spec.offset ?? 0),
        yaw: spec.yaw,
        w: spec.w,
        d: spec.d,
        floors,
        roof: spec.roof ?? 'gable',
        interior: spec.interior,
        stilt: spec.interior === 'shed' || spec.interior === 'pig-shed' ? 'none' : i % 4 === 3 ? 'side' : 'front',
        balcony: two && spec.interior !== 'hall',
        windowTarget: floors === 3 ? 27 : floors === 2 ? 18 : 9,
        exits: floors >= 2 ? 2 : 1,
        sign: spec.sign?.[i],
        navigable: true,
        vehicleBlocked: spec.district === 'A' || spec.district === 'D',
      });
    });
  }
}

addRows([
  // A 游方市集：南排临主街（5），北排两列（8+9），西南下排（8）= 30
  { district: 'A', prefix: 'F', z: 156, xs: [102, 115, 128, 141, 154], yaw: 0, floors: [2, 2, 2, 2, 3], w: 10, d: 9, interior: 'shop', sign: ['苗绣', '蜡染', '银饰坊', '米酒', '酸汤鱼'] },
  { district: 'A', prefix: 'N', z: 186, xs: [116, 129, 142, 155, 168, 181, 194], yaw: 180, floors: [2, 2, 2, 2, 2, 2, 2], w: 10, d: 9, interior: 'inn', sign: ['客栈', '茶叶', '竹编', '糍粑', '腊肉', '药材', '茶舍'] },
  { district: 'A', prefix: 'M', z: 200, xs: [104, 117, 130, 143, 156, 169, 182, 195], yaw: 180, floors: [2, 2, 2, 2, 2, 1, 1, 2], w: 10, d: 8, interior: 'house', sign: ['酒坊', '绣庄', '酸汤', '茶棚', '杂货', '米铺', '油坊', '药铺'] },
  { district: 'A', prefix: 'X', z: 156, xs: [167], yaw: 0, floors: [2], w: 10, d: 8, interior: 'shop', sign: ['茶舍'] },
  { district: 'A', prefix: 'Y', z: 126, xs: [176], yaw: 0, floors: [2], w: 10, d: 8, interior: 'inn', sign: ['客栈'] },
  { district: 'A', prefix: 'S', z: 140, xs: [98, 111, 124, 137, 150, 163, 176, 187], yaw: 0, floors: [2, 2, 2, 2, 2, 1, 1, 1], w: 10, d: 8, interior: 'workshop', sign: ['竹编', '银匠', '染坊', '木作', '酒窖', '粮行', '农具', '炭铺'] },
  // B 田园打谷场：6 双 / 4 单 = 10
  { district: 'B', prefix: 'H', z: 132, xs: [308], yaw: 0, floors: [2], w: 11, d: 9, interior: 'house', offset: -0.4 },
  { district: 'B', prefix: 'H', z: 138, xs: [348], yaw: 0, floors: [2], w: 11, d: 9, interior: 'house' },
  { district: 'B', prefix: 'H', z: 150, xs: [360], yaw: 90, floors: [2], w: 11, d: 9, interior: 'inn' },
  { district: 'B', prefix: 'H', z: 142, xs: [380], yaw: 0, floors: [2], w: 11, d: 9, interior: 'house' },
  { district: 'B', prefix: 'H', z: 160, xs: [300], yaw: 180, floors: [2], w: 10, d: 9, interior: 'house' },
  { district: 'B', prefix: 'H', z: 176, xs: [392], yaw: 180, floors: [2], w: 10, d: 9, interior: 'inn' },
  { district: 'B', prefix: 'H', z: 168, xs: [318], yaw: 0, floors: [1], w: 8, d: 7, interior: 'workshop' },
  { district: 'B', prefix: 'H', z: 188, xs: [344], yaw: 180, floors: [1], w: 8, d: 7, interior: 'house' },
  { district: 'B', prefix: 'H', z: 166, xs: [376], yaw: 270, floors: [1], w: 8, d: 7, interior: 'workshop' },
  { district: 'B', prefix: 'H', z: 200, xs: [398], yaw: 0, floors: [1], w: 8, d: 7, interior: 'house' },
  // C 河岸：西排 14（含 3F），东排 4 = 18
  { district: 'C', prefix: 'W', x: 200, zs: [215, 226, 237, 266, 277, 288, 299, 310, 321, 332], yaw: 90, floors: [2, 2, 2, 2, 2, 2, 2, 2, 1, 3], w: 9, d: 9, interior: 'shop', sign: ['客栈', '米酒', '酸汤', '蜡染', '苗绣', '茶舍', '银饰', '竹编', '糍粑', '腊肉'] },
  { district: 'C', prefix: 'B', x: 184, zs: [214, 225, 276, 287], yaw: 90, floors: [2, 2, 2, 2], w: 9, d: 9, interior: 'inn', sign: ['药材', '布庄', '杂货', '油坊'] },
  { district: 'C', prefix: 'E', x: 292, zs: [210, 225, 270, 285], yaw: 270, floors: [2, 2, 1, 1], w: 9, d: 9, interior: 'inn', sign: ['茶棚', '酒坊', '码头', '客栈'] },
  // D 鼓藏堂坡地：南排 7+7，西排 6 + 鼓藏堂，北排 7 = 28
  { district: 'D', prefix: 'S', z: 334, xs: [100, 112, 124, 136, 162, 174, 186], yaw: 0, floors: [2, 2, 2, 2, 3, 2, 2], w: 10, d: 9, interior: 'house' },
  { district: 'D', prefix: 'S', z: 346, xs: [110, 122, 134, 164, 176, 188, 200], yaw: 0, floors: [2, 2, 2, 2, 2, 1, 1], w: 10, d: 9, interior: 'workshop' },
  { district: 'D', prefix: 'W', x: 112, zs: [372, 384, 408, 420, 432], yaw: 90, floors: [2, 2, 2, 2, 1], w: 9, d: 9, interior: 'house' },
  { district: 'D', prefix: 'X', x: 94, zs: [448], yaw: 90, floors: [1], w: 9, d: 9, interior: 'house' },
  { district: 'D', prefix: 'N', z: 458, xs: [130, 142, 154, 166, 178, 190, 202], yaw: 180, floors: [2, 2, 2, 2, 2, 2, 2], w: 10, d: 9, interior: 'house' },
  // E 剧场：西 7 + 北 4 + 东 5 = 16
  { district: 'E', prefix: 'W', x: 340, zs: [300, 312, 324, 336, 368, 380, 392], yaw: 90, floors: [2, 2, 2, 2, 2, 2, 1], w: 9, d: 9, interior: 'inn' },
  { district: 'E', prefix: 'N', z: 304, xs: [384, 396, 408, 420], yaw: 180, floors: [2, 2, 2, 2], w: 9, d: 8, interior: 'shop' },
  { district: 'E', prefix: 'E', x: 420, zs: [320, 344, 356, 372, 384], yaw: 270, floors: [2, 2, 1, 1, 3], w: 9, d: 9, interior: 'house' },
  // O 寨边独栋/小群：6 双 / 4 单 = 10
  { district: 'O', prefix: 'H', z: 128, xs: [92], yaw: 0, floors: [2], w: 10, d: 8, interior: 'house' },
  { district: 'O', prefix: 'H', z: 196, xs: [74], yaw: 90, floors: [2], w: 10, d: 8, interior: 'house' },
  { district: 'O', prefix: 'H', z: 258, xs: [72], yaw: 0, floors: [2], w: 10, d: 8, interior: 'inn' },
  { district: 'O', prefix: 'H', z: 306, xs: [62], yaw: 0, floors: [2], w: 10, d: 8, interior: 'house' },
  { district: 'O', prefix: 'H', z: 350, xs: [66], yaw: 0, floors: [2], w: 10, d: 8, interior: 'workshop' },
  { district: 'O', prefix: 'H', z: 430, xs: [132], yaw: 180, floors: [2], w: 10, d: 8, interior: 'house' },
  { district: 'O', prefix: 'H', z: 60, xs: [194], yaw: 0, floors: [1], w: 9, d: 7, interior: 'house' },
  { district: 'O', prefix: 'H', z: 62, xs: [282], yaw: 90, floors: [1], w: 9, d: 7, interior: 'house' },
  { district: 'O', prefix: 'H', z: 120, xs: [444], yaw: 180, floors: [1], w: 9, d: 7, interior: 'inn' },
  { district: 'O', prefix: 'H', z: 170, xs: [452], yaw: 270, floors: [1], w: 9, d: 7, interior: 'workshop' },
]);

// Two hillside clusters follow the river with staggered rows and stepped lanes.
addRows([
  { district: 'C', prefix: 'TW', x: 139, zs: [256, 270, 284], yaw: 270, floors: [2, 2, 1], w: 9, d: 8, interior: 'house' },
  { district: 'C', prefix: 'TW', x: 155, zs: [261, 275, 289, 303, 317], yaw: 270, floors: [2, 1, 2, 2, 2], w: 9, d: 9, interior: 'house' },
  { district: 'C', prefix: 'TW', x: 171, zs: [269, 283, 296, 309, 322], yaw: 270, floors: [1, 2, 2, 2, 1], w: 9, d: 8, interior: 'house' },
  { district: 'C', prefix: 'TE', x: 316, zs: [217, 232, 247, 263, 281], yaw: 90, floors: [2, 1, 2, 2, 2], w: 9, d: 8, interior: 'house' },
  { district: 'C', prefix: 'TE', x: 332, zs: [224, 239, 253, 269, 284], yaw: 90, floors: [2, 2, 1, 2, 2], w: 9, d: 9, interior: 'house' },
  { district: 'E', prefix: 'TE', x: 387, zs: [221, 236, 251, 267, 282], yaw: 90, floors: [1, 2, 2, 1, 2], w: 9, d: 8, interior: 'house' },
  { district: 'E', prefix: 'TE', x: 403, zs: [229, 245, 260, 276], yaw: 90, floors: [2, 1, 2, 2], w: 9, d: 8, interior: 'house' },
]);

/** 附属棚舍 26：A6 / B10 / C4 / D3 / E2 / O1。 */
const shedSpecs: { district: DistrictId; x: number; z: number; yaw: number; interior: PlotInterior; w?: number; d?: number }[] = [
  // A 6
  { district: 'A', x: 78, z: 206, yaw: 0, interior: 'shed' },
  { district: 'A', x: 112, z: 232, yaw: 0, interior: 'shed' },
  { district: 'A', x: 168, z: 227, yaw: 180, interior: 'shed' },
  { district: 'A', x: 202, z: 180, yaw: 0, interior: 'shed' },
  { district: 'A', x: 198, z: 142, yaw: 0, interior: 'shed' },
  { district: 'A', x: 84, z: 170, yaw: 0, interior: 'shed' },
  // B 10（含猪场两棚）
  { district: 'B', x: 367, z: 116, yaw: 0, interior: 'pig-shed', w: 10, d: 5 },
  { district: 'B', x: 381, z: 116, yaw: 0, interior: 'pig-shed', w: 10, d: 5 },
  { district: 'B', x: 330, z: 96, yaw: 0, interior: 'shed' },
  { district: 'B', x: 344, z: 92, yaw: 0, interior: 'shed' },
  { district: 'B', x: 358, z: 88, yaw: 30, interior: 'shed' },
  { district: 'B', x: 372, z: 84, yaw: 0, interior: 'shed' },
  { district: 'B', x: 398, z: 96, yaw: 90, interior: 'shed' },
  { district: 'B', x: 390, z: 150, yaw: 90, interior: 'shed' },
  { district: 'B', x: 400, z: 192, yaw: 0, interior: 'shed' },
  { district: 'B', x: 370, z: 200, yaw: 180, interior: 'shed' },
  // C 4
  { district: 'C', x: 176, z: 212, yaw: 0, interior: 'shed' },
  { district: 'C', x: 224, z: 320, yaw: 0, interior: 'shed' },
  { district: 'C', x: 304, z: 310, yaw: 90, interior: 'shed' },
  { district: 'C', x: 218, z: 340, yaw: 0, interior: 'shed' },
  // D 3
  { district: 'D', x: 104, z: 398, yaw: 90, interior: 'shed' },
  { district: 'D', x: 122, z: 470, yaw: 0, interior: 'shed' },
  { district: 'D', x: 214, z: 452, yaw: 180, interior: 'shed' },
  // E 2
  { district: 'E', x: 338, z: 292, yaw: 0, interior: 'shed' },
  { district: 'E', x: 444, z: 336, yaw: 90, interior: 'shed' },
  // O 1
  { district: 'O', x: 70, z: 326, yaw: 0, interior: 'shed' },
];

for (const [i, spec] of shedSpecs.entries()) {
  const w = spec.w ?? 5;
  const d = spec.d ?? 4;
  plots.push({
    id: `${spec.district}-SH${String(i + 1).padStart(2, '0')}`,
    district: spec.district,
    districtName: DISTRICTS[spec.district],
    x: spec.x,
    z: spec.z,
    baseY: baseAt(spec.x, spec.z, spec.interior === 'pig-shed' ? -0.5 : 0),
    yaw: spec.yaw,
    w,
    d,
    floors: 1,
    roof: 'shed',
    interior: spec.interior,
    stilt: 'none',
    balcony: false,
    windowTarget: 0,
    exits: 1,
    navigable: true,
    vehicleBlocked: true,
  });
}

/** 鼓藏堂（公共建筑）作为 D 的 1 栋单层主楼，替换西排的一个住宅 plot。 */
const drumHall: MiaoPlot = {
  id: 'D-HALL01',
  district: 'D',
  districtName: DISTRICTS.D,
  x: 145,
  z: 385,
  baseY: 16,
  yaw: 0,
  w: 24,
  d: 14,
  floors: 1,
  roof: 'double-eave',
  interior: 'hall',
  stilt: 'none',
  balcony: false,
  windowTarget: 12,
  exits: 3,
  navigable: true,
};
plots.push(drumHall);

/** 剧院（独立于建筑地块统计）。 */
export const MIAO_THEATER = {
  x: 380,
  z: 335,
  stageX: 384,
  stageZ: 348,
  stageW: 42,
  stageD: 20,
  stageY: 11.5,
  groundY: 9,
  backstageZ: 366,
} as const;

export const MIAO_PLOTS: readonly MiaoPlot[] = plots;
export const MIAO_PLOT_BY_ID = new Map(plots.map((p) => [p.id, p]));

export function plotPolygon(p: MiaoPlot): Polygon {
  const c = Math.cos((p.yaw * Math.PI) / 180);
  const s = Math.sin((p.yaw * Math.PI) / 180);
  const hw = p.w / 2;
  const hd = p.d / 2;
  const corners: [number, number][] = [
    [-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd],
  ];
  return corners.map(([u, v]) => [p.x + u * c - v * s, p.z + u * s + v * c] as [number, number]);
}

export const MIAO_ENTRY_HALF_WIDTH = 1;
export const MIAO_ENTRY_TREAD = 0.65;

export function groundDoorAlong(plot: MiaoPlot, side: 'front' | 'right'): number {
  return side === 'front' ? plot.w * 0.14 : 0;
}

/** MapDef 建筑：同一 plot 数据的旋转 polygon，不丢原始 authored 字段。 */
export const MIAO_BUILDINGS: Building[] = plots.map((p) => ({
  id: p.id,
  name: p.sign ?? p.districtName,
  polygon: plotPolygon(p),
  height: Math.max(4, (p.floors === 3 ? 13 : p.floors === 2 ? 9 : 5)),
  roof: p.roof === 'shed' ? 'open' : 'gable',
  enterable: true,
  label: true,
  labelSize: p.district === 'O' ? 5 : 6,
}));

/* ------------------------------------------------------------------ *
 * 据点 / 出生区 / 载具 / 特武
 * ------------------------------------------------------------------ */

export const MIAO_CAPTURES: CapturePoint[] = [
  { id: 'A', name: '游方市集', x: 150, y: 170, radius: 14, initialOwner: 'neutral', floorY: 5, verticalTolerance: 2.5 },
  { id: 'B', name: '田园打谷场', x: 335, y: 150, radius: 13, initialOwner: 'neutral', floorY: 4, verticalTolerance: 2.5 },
  {
    id: 'C', name: '白水河风雨桥', x: 244, y: 250, radius: 10.5, initialOwner: 'neutral', floorY: 3, verticalTolerance: 1.2,
    // 只有中央桥面可占：z 246–254、x 210–278 的真实桥面范围。
    footprint: { x0: 212, z0: 246.2, x1: 276, z1: 253.8 },
  },
  { id: 'D', name: '鼓藏堂祭祀坪', x: 155, y: 365, radius: 13, initialOwner: 'neutral', floorY: 16, verticalTolerance: 2.5 },
  { id: 'E', name: '美丽西江剧场', x: 365, y: 325, radius: 14, initialOwner: 'neutral', floorY: 9, verticalTolerance: 1.2 },
];

export const MIAO_SPAWNS: SpawnZone[] = [
  { team: 'blue', x: 48, y: 48, w: 64, d: 56, label: '蓝队 · 河谷营地' },
  { team: 'orange', x: 384, y: 396, w: 64, d: 56, label: '橙队 · 西江坡地' },
];

export const MIAO_SITE_HEIGHTS = { A: 5, B: 4, C: 3.5, D: 16, E: 9, blue: 6, orange: 12 } as const;

export const MIAO_VEHICLE_PADS: VehiclePad[] = [
  { team: 'blue', vehicleId: 'motorcycle', x: 90, y: 118, angle: 70 },
  { team: 'blue', vehicleId: 'motorcycle', x: 64, y: 116, angle: 60 },
  { team: 'blue', vehicleId: 'jeep', x: 126, y: 92, angle: 80 },
  { team: 'blue', vehicleId: 'apc', x: 56, y: 116, angle: 45 },
  { team: 'orange', vehicleId: 'motorcycle', x: 454, y: 414, angle: 250 },
  { team: 'orange', vehicleId: 'motorcycle', x: 454, y: 430, angle: 250 },
  { team: 'orange', vehicleId: 'jeep', x: 398, y: 386, angle: 230 },
  { team: 'orange', vehicleId: 'apc', x: 438, y: 386, angle: 200 },
  { team: 'neutral', vehicleId: 'motorcycle', x: 214, y: 120, angle: 90 },
  { team: 'neutral', vehicleId: 'motorcycle', x: 300, y: 120, angle: 20 },
  { team: 'neutral', vehicleId: 'motorcycle', x: 260, y: 270, angle: 0 },
  { team: 'neutral', vehicleId: 'motorcycle', x: 318, y: 286, angle: 280 },
];

export const MIAO_SPECIAL_CRATES: SpecialCrate[] = [
  { id: 'rocket-b', weaponId: 'rocket', x: 318, y: 120, label: 'B 外围农具棚后' },
  { id: 'rocket-d', weaponId: 'rocket', x: 178, y: 430, label: 'D 盘山路暴露位' },
  { id: 'flamethrower-c', weaponId: 'flamethrower', x: 188, y: 262, label: '芦笙场边缘' },
];

/** 任务书明确不放 AMR / 固定机枪。 */
export const MIAO_MG_NESTS = [];

/* ------------------------------------------------------------------ *
 * 广场 / 芦笙场 / 猪场 / 梯田
 * ------------------------------------------------------------------ */

export const MIAO_LUSHENG_PLAZA = { x: 176, z: 250, w: 36, d: 32, y: 3.5 } as const;
export const MIAO_A_PLAZA = { x: 150, z: 170, w: 34, d: 28, y: 5 } as const;
export const MIAO_D_PLAZA = { x: 155, z: 365, w: 34, d: 28, y: 16 } as const;
export const MIAO_E_PLAZA = { x: 365, z: 325, w: 34, d: 30, y: 9 } as const;
export const MIAO_PIG_FARM = { x: 375, z: 120, w: 26, d: 20, y: 4.5 } as const;

export interface PaddyField {
  id: string;
  x: number;
  z: number;
  w: number;
  d: number;
  levelY: number;
  /** 水稻颜色：young 嫩绿 / gold 稻金。 */
  rice: 'young' | 'gold';
}

/** 14 块梯田：东岸台地，水位/泥面各自独立（不是全图统一 -2）。 */
export const MIAO_PADDIES: readonly PaddyField[] = (() => {
  const out: PaddyField[] = [];
  const cols = [411, 427];
  const rows = [84, 98, 112, 126, 140, 154, 168];
  let i = 0;
  for (const x of cols) {
    for (const [row, z] of rows.entries()) {
      out.push({
        id: `paddy-${String(++i).padStart(2, '0')}`,
        x, z, w: 12, d: 10,
        levelY: 7.4 - row * 0.28 + (x === 423 ? 0.12 : 0),
        rice: row < 3 ? 'young' : 'gold',
      });
    }
  }
  return out;
})();

/** 4 块菜地（不打水，只做垄和深色土）。 */
export const MIAO_VEGETABLE_PATCHES = [
  { id: 'veg-1', x: 340, z: 62, w: 14, d: 9 },
  { id: 'veg-2', x: 358, z: 62, w: 14, d: 9 },
  { id: 'veg-3', x: 376, z: 62, w: 14, d: 9 },
  { id: 'veg-4', x: 395, z: 64, w: 12, d: 9 },
] as const;

/* ------------------------------------------------------------------ *
 * 视野检查锚点 / routes
 * ------------------------------------------------------------------ */

export interface Viewpoint {
  id: string;
  kind: 'cap' | 'floor3' | 'balcony' | 'authored';
  x: number;
  y: number;
  z: number;
  label: string;
}

export const MIAO_VIEWPOINTS: Viewpoint[] = (() => {
  const out: Viewpoint[] = [];
  for (const cap of MIAO_CAPTURES) {
    out.push({ id: `cap-${cap.id}`, kind: 'cap', x: cap.x, y: (cap.floorY ?? 5) + 1.65, z: cap.y, label: `${cap.id} 据点` });
  }
  for (const plot of plots) {
    if (plot.floors === 3) {
      out.push({ id: `f3-${plot.id}`, kind: 'floor3', x: plot.x, y: plot.baseY + 10.6, z: plot.z, label: `${plot.id} 三层窗` });
    }
    if (plot.balcony && plot.floors >= 2) {
      out.push({ id: `bal-${plot.id}`, kind: 'balcony', x: plot.x, y: plot.baseY + 6.6, z: plot.z + Math.cos((plot.yaw * Math.PI) / 180) * (plot.d / 2 + 1), label: `${plot.id} 阳台` });
    }
  }
  out.push(
    { id: 'drum-hall', kind: 'authored', x: 145, y: 21, z: 385, label: '鼓藏堂' },
    { id: 'theater-stage', kind: 'authored', x: 384, y: 15, z: 348, label: '剧场舞台' },
    { id: 'bridge-pavilion', kind: 'authored', x: 244, y: 8.6, z: 250, label: '廊桥桥亭' },
  );
  return out;
})();

/** 出生区内部采样点（LoS 审计目标，不是出生点本身）。 */
export function spawnInteriorSamples(spawn: SpawnZone): { x: number; y: number; z: number }[] {
  const out: { x: number; y: number; z: number }[] = [];
  for (let ix = 0; ix < 5; ix++) {
    for (let iz = 0; iz < 5; iz++) {
      const x = spawn.x + spawn.w * (0.16 + 0.17 * ix);
      const z = spawn.y + spawn.d * (0.16 + 0.17 * iz);
      out.push({ x, y: groundYForSpawn(spawn.team) + 1.65, z });
    }
  }
  return out;
}

function groundYForSpawn(team: Team): number {
  return team === 'blue' ? MIAO_SITE_HEIGHTS.blue : MIAO_SITE_HEIGHTS.orange;
}

/** 外环 / 中央横线 / 渡口接驳 / 寨边绕后。 */
export const MIAO_ROUTES: Route[] = [
  { team: 'blue', label: '蓝队 → A', kind: 'main', points: [[80, 104], [92, 126], [110, 148], [132, 162], [150, 168]] },
  { team: 'blue', label: '蓝队 → 南桥 → B', kind: 'vehicle', points: [[112, 80], [140, 86], [166, 96], [188, 106], [200, 112], [228, 112], [256, 112], [268, 120], [282, 132], [300, 142], [322, 146]] },
  { team: 'blue', label: '蓝队 → C 芦笙场/廊桥', kind: 'main', points: [[80, 104], [94, 124], [112, 144], [134, 160], [150, 168], [154, 188], [160, 210], [168, 230], [178, 244], [188, 250], [200, 250], [210, 250]] },
  { team: 'blue', label: '蓝队 → D 西坡', kind: 'flank', points: [[150, 168], [142, 186], [130, 206], [118, 226], [108, 248], [98, 270], [90, 292], [92, 314], [102, 334], [112, 352], [124, 368], [136, 382], [148, 390], [155, 365]] },
  { team: 'blue', label: '蓝队 → E 外环', kind: 'vehicle', points: [[80, 104], [92, 126], [110, 148], [132, 162], [150, 168], [190, 170], [212, 168], [220, 152], [214, 132], [204, 116], [200, 112], [256, 112], [300, 142], [322, 146], [350, 170], [356, 220], [358, 270], [365, 318], [368, 338]] },
  { team: 'orange', label: '橙队 → E', kind: 'main', points: [[416, 424], [410, 408], [402, 392], [390, 376], [380, 360], [374, 358]] },
  { team: 'orange', label: '橙队 → 北桥 → D', kind: 'vehicle', points: [[416, 424], [410, 408], [402, 392], [390, 376], [380, 360], [374, 358], [366, 378], [348, 388], [322, 392], [300, 392], [294, 392], [264, 392], [236, 392], [228, 404], [222, 418], [214, 432], [200, 442], [184, 442], [170, 434], [160, 420], [156, 402], [158, 388], [158, 376], [155, 365]] },
  { team: 'orange', label: '橙队 → B', kind: 'main', points: [[400, 416], [388, 404], [374, 390], [362, 376], [352, 360], [350, 340], [352, 316], [350, 292], [348, 268], [350, 252], [352, 244], [356, 220], [356, 195], [350, 170], [338, 152], [322, 146]] },
  { team: 'orange', label: '橙队 → C 东岸', kind: 'flank', points: [[416, 424], [400, 416], [388, 404], [374, 390], [362, 376], [352, 360], [350, 340], [352, 316], [350, 292], [348, 268], [350, 252], [340, 250], [320, 250], [302, 258], [294, 252], [286, 250], [278, 250]] },
];

/** 出生区三个出口（数据/审计共用）。 */
export const MIAO_SPAWN_EXITS = [
  { team: 'blue' as Team, id: 'blue-main', x: 80, z: 108, label: '北向主路' },
  { team: 'blue' as Team, id: 'blue-east', x: 116, z: 80, label: '东向车道' },
  { team: 'blue' as Team, id: 'blue-south', x: 60, z: 44, label: '南向步行巷' },
  { team: 'orange' as Team, id: 'orange-south', x: 407, z: 392, label: '南向主路' },
  { team: 'orange' as Team, id: 'orange-west', x: 380, z: 400, label: '西向车道' },
  { team: 'orange' as Team, id: 'orange-east', x: 452, z: 430, label: '东向步行巷' },
];

/** 桥梁/渡口数据再导出，避免工具与测试复制坐标。 */
export const MIAO_BRIDGE_DATA = MIAO_BRIDGES;
export const MIAO_FERRY_DATA = MIAO_FERRIES;
export { quayStreetY, riverAt };

/** 道路与 plot 的快速空间索引（覆盖统计/审计用）。 */
export interface PlotFootprint {
  plot: MiaoPlot;
  /** 旋转后的世界 AABB。 */
  x0: number; x1: number; z0: number; z1: number;
}

export const MIAO_PLOT_FOOTPRINTS: readonly PlotFootprint[] = plots.map((plot) => {
  const poly = plotPolygon(plot);
  return {
    plot,
    x0: Math.min(...poly.map((p) => p[0])),
    x1: Math.max(...poly.map((p) => p[0])),
    z0: Math.min(...poly.map((p) => p[1])),
    z1: Math.max(...poly.map((p) => p[1])),
  };
});

/** 道路走廊检查：距离主路中心线多近（供布局断言）。 */
export function distanceToRoads(x: number, z: number): number {
  let best = Infinity;
  for (const road of MIAO_ROADS) {
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1];
      const b = road.points[i];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2));
      best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t) - road.width / 2);
    }
  }
  return best;
}

/** 设计数量契约（测试直接读，不复制）。 */
export const MIAO_BUILDING_COUNTS = (() => {
  const main = plots.filter((p) => p.interior !== 'shed' && p.interior !== 'pig-shed');
  const sheds = plots.filter((p) => p.interior === 'shed' || p.interior === 'pig-shed');
  const by = (floors: number) => main.filter((p) => p.floors === floors).length;
  const district = (id: DistrictId) => ({
    main: main.filter((p) => p.district === id).length,
    two: main.filter((p) => p.district === id && p.floors === 2).length,
    one: main.filter((p) => p.district === id && p.floors === 1).length,
    three: main.filter((p) => p.district === id && p.floors === 3).length,
    sheds: sheds.filter((p) => p.district === id).length,
  });
  return {
    total: plots.length,
    main: main.length,
    sheds: sheds.length,
    two: by(2),
    one: by(1),
    three: by(3),
    A: district('A'), B: district('B'), C: district('C'), D: district('D'), E: district('E'), O: district('O'),
  };
})();
