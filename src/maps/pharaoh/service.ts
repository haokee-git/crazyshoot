/**
 * 法老坟墓 · E 公路驿站（800×800 新布局）
 *
 * 契约：docs/map-pharaoh/CONTRACT.md §2 / §4.4；共享道路只读 `network.ts`：
 *   service-ring  6 m 环场道（五边形：x=300 西腿、z=140 南腿、x=400 东腿、北端 (350,70)）
 *   service-front 8 m 进场道（(350,160) → (350,140)）
 *   main-south    南部车辆主轴沿场地北缘斜穿（x=350 处中心线 z≈166，南路肩缘 ≈159）
 *   ef-south      东缘 (430,120) 接神庙南仪式轴
 *
 * 场地：x 267..433 / z 45..165（166×120），E 点 (350,105) r12 地面 +3.2。
 *
 * 布局（8 栋 Building + 1 座加油棚 cover，四栋旧建筑保留尺度并改位）：
 *   环内：加油棚（cover canopy，20×14，4 个加油岛 + 4 台加油机）
 *         服务房 18×12（可进入）、维修库 20×14（open，北向开口）、餐馆 14×10（可进入）
 *   环外：办公/调度 12×9（东北）、货运棚 16×12（open，东南）、
 *         洗车/维修棚 14×10（open，西北）、器材库 16×10（西南）、员工宿舍 14×9（环北）
 *   油罐区：西侧场外 3 台立式储油罐 + 围堰；停车区：东侧 3 个中立载具位前场
 *          （Lead 预留 (395,125)/(410,125)/(425,125)）+ 挡轮块；东南 (395,150) 特武箱净空。
 *
 * 车辆：环场道 6 m + 进场道 8 m 全部留空；建筑/掩体距铺装边缘 ≥2.1 m（`clearOfRoads` 口径）。
 * E 点 r12 净空：任何实体 footprint 到圆心 ≥13 m（最近为中央前场沙袋 14.3 m）。
 *
 * 特殊地表（沥青场区 / 混凝土 / 油污地 / 碎石）全部 `preserveUnderRoads: true`：
 * 环场道、进场道与主路压过场区时保留作者铺面，不靠挪开驿站规避。
 */
import type { Building, Cover, CoverKind, Polygon, Prop, TerrainKind, TerrainPatch, Vec2 } from '../types';
import { building, cover, prop } from '../helpers';

/* ------------------------------------------------------------------ *
 * 基准
 * ------------------------------------------------------------------ */

export const SERVICE_POINT: Vec2 = [350, 105];
export const SERVICE_POINT_RADIUS = 12;
export const SERVICE_GROUND = 3.2;
/** E 点圈内净空：任何实体（建筑/掩体/道具）footprint 到圆心 ≥ r12 + 1 m。 */
export const SERVICE_POINT_CLEARANCE = 13;

/** 场地矩形包络（空间预算 / layout json / 载具通道复核）。 */
export const SERVICE_SITE = { x0: 267, z0: 45, x1: 433, z1: 165 };

/** 真实不规则场区边界（不是矩形：北缘贴主路、西南/东南随院区收角）。 */
export const SERVICE_SITE_POLYGON: Polygon = [
  [272, 50], [302, 46], [350, 47], [402, 49], [424, 54], [432, 66], [432, 118], [432, 142],
  [433, 159], [420, 163], [392, 162], [360, 162], [330, 160], [300, 155], [282, 146], [268, 128], [268, 96], [268, 70],
];

/** Lead 在总装里预留给 E 的 3 个中立载具位（东侧停车/维修院外场）。 */
export const SERVICE_RESERVED_PADS: Vec2[] = [[395, 125], [410, 125], [425, 125]];
/** Lead 在总装里预留给 E 的喷火器特殊武器箱（(395,150)，周围 ≥2 m）。 */
export const SERVICE_RESERVED_CRATES: Vec2[] = [[395, 150]];
/** E 真实场区面积（m²）。 */
export const SERVICE_SITE_AREA = Math.round(polygonArea(SERVICE_SITE_POLYGON));

/* ------------------------------------------------------------------ *
 * 局部工具
 * ------------------------------------------------------------------ */

/** 多边形面积（m²）。 */
function polygonArea(points: Polygon): number {
  let twice = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    twice += points[j][0] * points[i][1] - points[i][0] * points[j][1];
  }
  return Math.abs(twice) / 2;
}

/** 作者铺面：一律保留原材质，不让公路/环道把沥青场区、混凝土、油污地、碎石盖掉。 */
function surface(
  id: string,
  kind: TerrainKind,
  polygon: Polygon,
  label: string,
  surfacePriority = 2,
): TerrainPatch {
  return { id, kind, polygon, elevation: 0, opacity: 1, label, preserveUnderRoads: true, surfacePriority };
}

let seq = 0;
function eCover(kind: CoverKind, x: number, z: number, w: number, d: number, rot: number, extra: Partial<Cover>): Cover {
  return cover(kind, x, z, w, d, rot, { id: `service-${++seq}`, ...extra });
}

/* ------------------------------------------------------------------ *
 * 建筑（8 组：3 栋可进入 + 3 座 open 棚 + 1 栋器材库 + 1 座加油棚）
 * ------------------------------------------------------------------ */

export const serviceBuildings: Building[] = [
  // 环内东：18×12 便利服务房（可进入）
  building('svc-shop', '驿站服务房', 372, 96, 18, 12, 5, 'flat', {
    enterable: true,
    labelAt: [381, 104],
  }),
  // 环内西：20×14 开放式维修库（北向开口，车辆可开进库前；南墙让开环道）
  building('svc-repair', '维修库', 307, 118, 20, 14, 6.5, 'open', {
    label: true,
    labelAt: [317, 128],
  }),
  // 环内东南：14×10 餐馆/休息室（可进入）
  building('svc-diner', '驿站餐馆', 372, 120, 14, 10, 4.5, 'flat', {
    enterable: true,
    labelAt: [379, 127],
  }),
  // 环外东北：12×9 办公/调度（可进入）
  building('svc-office', '调度办公室', 407, 84, 12, 9, 4.2, 'flat', {
    enterable: true,
    labelAt: [413, 90],
  }),
  // 环外东南：16×12 货运棚（open，开口朝北接停车区）
  building('svc-freight', '货运棚', 407, 146, 16, 12, 6, 'open', {
    label: true,
    labelAt: [415, 154],
  }),
  // 环外西北：14×10 洗车/维修棚（open，开口朝北）
  building('svc-wash', '洗车维修棚', 271, 70, 14, 10, 5, 'open', {
    label: true,
    labelAt: [278, 77],
  }),
  // 环外西南：16×10 器材库（可进入）
  building('svc-depot', '器材库', 273, 120, 16, 10, 5, 'flat', {
    enterable: true,
    labelAt: [279, 127],
  }),
  // 环外北：14×9 员工宿舍/值班室（可进入；环道北端顶点之外，不压环道）
  building('svc-crew', '员工宿舍', 344, 54, 14, 9, 5, 'flat', {
    enterable: true,
    labelAt: [351, 60],
  }),
];

/* ------------------------------------------------------------------ *
 * 掩体 / 设施
 * ------------------------------------------------------------------ */

/** 加油棚：cover canopy（四角柱 + 5.6 m 轻质顶，棚下净空，车辆可穿过不压顶）。 */
const canopy: Cover[] = [
  eCover('canopy', 317, 104, 20, 14, 0, { height: 5.6, color: '#b98d5c', label: '驿站加油棚' }),
];

/** 四个加油岛（棚内两排，0.55 m 矮台；岛面可走人，车辆不压岛）。 */
const fuelIslands: Cover[] = [
  eCover('pump', 312, 101, 4.4, 1.4, 0, { height: 0.55, variant: 'fuel-island', label: '加油岛 1' }),
  eCover('pump', 322, 101, 4.4, 1.4, 0, { height: 0.55, variant: 'fuel-island', label: '加油岛 2' }),
  eCover('pump', 312, 107, 4.4, 1.4, 0, { height: 0.55, variant: 'fuel-island', label: '加油岛 3' }),
  eCover('pump', 322, 107, 4.4, 1.4, 0, { height: 0.55, variant: 'fuel-island', label: '加油岛 4' }),
];

/** 西侧场外油罐区：3 台立式储油罐 + 西/北围堰（东侧留 6 m 检修口）。 */
const fuelTanks: Cover[] = [
  eCover('fuel_tank', 277, 90, 6, 6, 0, { height: 4.6, variant: 'fuel-tank', label: '储油罐 1' }),
  eCover('fuel_tank', 277, 102, 6, 6, 0, { height: 4.6, variant: 'fuel-tank', label: '储油罐 2' }),
  eCover('fuel_tank', 277, 114, 6, 6, 0, { height: 4.6, variant: 'fuel-tank', label: '储油罐 3' }),
  eCover('wall', 271, 100, 1.2, 32, 0, { height: 1.1, variant: 'low-wall', label: '油罐区西围堰' }),
  eCover('wall', 277, 84, 16, 1.2, 0, { height: 1.1, variant: 'low-wall', label: '油罐区北围堰' }),
];

/** E 点中央前场低掩体（全部 ≥14 m；留出四向绕行通道）。 */
const courtSandbags: Cover[] = [
  eCover('sandbag', 336, 92, 12, 2.2, 0, { height: 1.05, variant: 'sandbag-row', label: '中央前场沙袋' }),
  eCover('sandbag', 362, 122, 10, 2.2, 0, { height: 1.05, variant: 'sandbag-row', label: '南前场沙袋' }),
  eCover('sandbag', 334, 118, 9, 2.2, 90, { height: 1.0, variant: 'sandbag-row', label: '维修院沙袋' }),
];

/** 停车区挡轮块（3 个中立载具位前场，z=133；低于载具底盘，不挡车）。 */
const parkingStops: Cover[] = [
  eCover('barrier', 410, 133, 2.6, 0.8, 0, { height: 0.35, variant: 'parking-stop' }),
  eCover('barrier', 418, 133, 2.6, 0.8, 0, { height: 0.35, variant: 'parking-stop' }),
  eCover('barrier', 426, 133, 2.6, 0.8, 0, { height: 0.35, variant: 'parking-stop' }),
];

/** 轮胎堆（维修院东侧，两摞）+ 废胎杂物。 */
const tires: Cover[] = [
  eCover('tires', 334, 126, 2.4, 2.4, 0, { height: 1.5, variant: 'tires-stack' }),
  eCover('tires', 338, 123, 2.2, 2.2, 18, { height: 1.2, variant: 'tires-stack' }),
];

/** 场界矮墙：东停车区外缘、西北场界。 */
const lowWalls: Cover[] = [
  eCover('wall', 424, 140, 8, 1.2, 0, { height: 1.1, variant: 'low-wall', label: '停车区矮墙' }),
  eCover('wall', 288, 58, 12, 1.2, 0, { height: 1.1, variant: 'low-wall', label: '西北场界矮墙' }),
];

/** 杂项：维修库东侧垃圾箱、货运棚前木箱、特武箱旁石墩。 */
const yardClutter: Cover[] = [
  eCover('dumpster', 391, 112, 2.6, 1.4, 0, { height: 1.4 }),
  eCover('crate', 408, 140, 3, 3, 12, { height: 1.2, label: '货运木箱' }),
  eCover('crate', 392, 155, 2.6, 2.6, -8, { height: 1.1, label: '货运木箱' }),
];

export const serviceCovers: Cover[] = [
  ...canopy,
  ...fuelIslands,
  ...fuelTanks,
  ...courtSandbags,
  ...parkingStops,
  ...tires,
  ...lowWalls,
  ...yardClutter,
];

/* ------------------------------------------------------------------ *
 * 道具
 * ------------------------------------------------------------------ */

export const serviceProps: Prop[] = [
  // 四台加油机，坐在四个加油岛上
  prop('gas_station', 312, 101, { w: 2.2, d: 1.2, label: '' }),
  prop('gas_station', 322, 101, { w: 2.2, d: 1.2, label: '' }),
  prop('gas_station', 312, 107, { w: 2.2, d: 1.2, label: '' }),
  prop('gas_station', 322, 107, { w: 2.2, d: 1.2, label: '' }),
  // 维修库旁卧式油罐（与场外三台立罐区分）
  prop('fuel_tank', 332, 88, { w: 5, d: 2.6, rot: 0, label: '' }),
  prop('fuel_tank', 332, 92, { w: 5, d: 2.6, rot: 0, label: '' }),
  // 东停车区水塔
  prop('tower', 427, 152, { w: 8, d: 8, label: '水塔' }),
  // 灯柱：进场道两侧、环外场界
  prop('lamp', 340, 150, { w: 1.4, d: 1.4, label: '' }),
  prop('lamp', 360, 154, { w: 1.4, d: 1.4, label: '' }),
  prop('lamp', 292, 64, { w: 1.4, d: 1.4, label: '' }),
  prop('lamp', 408, 78, { w: 1.4, d: 1.4, label: '' }),
  prop('lamp', 322, 64, { w: 1.4, d: 1.4, label: '' }),
  prop('lamp', 376, 64, { w: 1.4, d: 1.4, label: '' }),
  // 入口指示牌（主路南侧、进场道西侧）
  prop('sign', 330, 152, { w: 5, d: 1, label: '公路驿站' }),
  // 维修院/货运院杂物
  prop('barrels', 330, 100, { label: '' }),
  prop('barrels', 386, 114, { label: '' }),
  prop('pallets', 428, 100, { w: 2.2, d: 1.25, label: '' }),
  prop('pipes', 426, 110, { w: 5, d: 1, rot: 0, label: '' }),
];

/* ------------------------------------------------------------------ *
 * 地面材质（全部保留原材质，跨地图 preserveUnderRoads 验收点）
 * ------------------------------------------------------------------ */

export const serviceTerrain: TerrainPatch[] = [
  // 场区沥青：不规则院区轮廓，覆盖环道内场与停车/货运院
  surface('service-yard-asphalt', 'asphalt', [
    [272, 52], [302, 47], [350, 48], [402, 50], [424, 61], [430, 88], [431, 118],
    [431, 142], [432, 158], [420, 162], [392, 161], [360, 161], [330, 159], [300, 154],
    [282, 145], [270, 128], [268, 96], [268, 70],
  ], '驿站场区沥青', 2),
  // 进场道加宽铺面（service-front 8 m 之外的站内侧停车带）
  surface('service-front-apron', 'asphalt', [
    [343, 158], [357, 158], [356, 141], [344, 141], [342, 150],
  ], '驿站进场道铺面', 3),

  // 混凝土：加油棚、维修库、服务房、餐馆、货运棚、办公、洗车棚、器材库前场
  surface('service-canopy-apron', 'concrete', [
    [304, 95], [329, 94], [330, 112], [326, 115], [305, 113],
  ], '加油棚混凝土', 3),
  surface('service-repair-apron', 'concrete', [
    [305, 116], [331, 116], [332, 134], [304, 134],
  ], '维修场地混凝土', 3),
  surface('service-shop-forecourt', 'concrete', [
    [370, 94], [392, 94], [392, 110], [371, 111], [369, 101],
  ], '服务房前庭混凝土', 3),
  surface('service-diner-apron', 'concrete', [
    [369, 118], [388, 118], [389, 132], [370, 132],
  ], '餐馆前庭混凝土', 3),
  surface('service-freight-yard', 'concrete', [
    [404, 144], [426, 143], [428, 159], [404, 159], [403, 152],
  ], '货运院混凝土', 3),
  surface('service-office-apron', 'concrete', [
    [405, 82], [421, 82], [421, 95], [405, 95], [404, 89],
  ], '调度办公室前庭混凝土', 3),
  surface('service-wash-apron', 'concrete', [
    [269, 68], [287, 68], [287, 82], [269, 82], [268, 75],
  ], '洗车棚混凝土', 3),
  surface('service-depot-apron', 'concrete', [
    [274, 118], [291, 118], [291, 132], [274, 132], [273, 125],
  ], '器材库前庭混凝土', 3),

  // 油污地：维修库内、油罐区、垃圾箱位
  surface('service-repair-oil', 'dirt', [
    [308, 119], [326, 119], [326, 131], [308, 131], [307, 125],
  ], '维修库油污地', 4),
  surface('service-tankfarm-oil', 'dirt', [
    [270, 84], [284, 84], [284, 118], [270, 118], [269, 101],
  ], '油罐区油污地', 4),
  surface('service-dumpster-oil', 'dirt', [
    [390, 110], [396, 110], [396, 116], [390, 116], [389, 113],
  ], '垃圾箱位油污地', 4),

  // 碎石：废胎杂物院、维修库后场、场界碎石带
  surface('service-tire-yard', 'rubble', [
    [398, 138], [418, 138], [422, 146], [404, 148], [396, 144],
  ], '废胎杂物堆碎石', 3),
  surface('service-repair-rubble', 'rubble', [
    [306, 134], [324, 134], [326, 142], [306, 142], [305, 138],
  ], '维修库后场碎石', 3),
  surface('service-north-gravel', 'gravel', [
    [272, 50], [302, 48], [350, 49], [402, 51], [424, 62], [426, 66],
    [420, 68], [380, 64], [330, 62], [292, 62], [274, 58],
  ], '驿站北缘碎石路肩', 1),
  surface('service-west-gravel', 'gravel', [
    [270, 68], [294, 68], [294, 142], [282, 144], [274, 132], [270, 110],
  ], '驿站西缘碎石带', 1),
  surface('service-east-gravel', 'gravel', [
    [406, 62], [426, 66], [430, 90], [430, 138], [426, 142], [406, 138],
  ], '驿站东缘碎石停车带', 1),
  surface('service-southeast-gravel', 'gravel', [
    [404, 144], [430, 144], [430, 158], [416, 160], [404, 156],
  ], '驿站东南碎石场', 1),
];
