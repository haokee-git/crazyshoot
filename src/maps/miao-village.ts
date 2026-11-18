import type { MapDef, TerrainPatch } from './types';
import { rectPoly, route, special, terrain } from './helpers';
import {
  MIAO_BUILDING_COUNTS, MIAO_BUILDINGS, MIAO_CAPTURES, MIAO_FERRY_DATA, MIAO_LUSHENG_PLAZA,
  MIAO_PADDIES, MIAO_PIG_FARM, MIAO_PLOTS, MIAO_ROUTES, MIAO_SPAWNS, MIAO_SPECIAL_CRATES,
  MIAO_THEATER, MIAO_VEHICLE_PADS, MIAO_VEGETABLE_PATCHES,
} from './miao-village/layout';
import { MIAO_COVERS, MIAO_DECOR } from './miao-village/props';
import { MIAO_ROADS } from './miao-village/network';
import { MIAO_PIGS } from './miao-village/props';
import { MIAO_SIZE } from './miao-village/height';
import { MIAO_BRIDGES, MIAO_FERRY_BASINS, RIVER_SURFACE_Y, riverAt, riverPolygon } from './miao-village/river';
import { MIAO_MAX_Y, MIAO_MIN_Y } from './miao-village/height';
import type { WaterVolume } from './types';

const plazaPatches: TerrainPatch[] = [
  // 市集/芦笙场/祭祀坪/剧场：作者石铺，不允许道路沥青覆盖。
  terrain('stone', rectPoly(133, 156, 34, 28), 5, '游方市集石铺', 1),
  terrain('stone', rectPoly(MIAO_LUSHENG_PLAZA.x - 18, MIAO_LUSHENG_PLAZA.z - 16, 36, 32), 3.5, '芦笙场同心石铺', 1),
  terrain('stone', rectPoly(138, 351, 34, 28), 16, '祭祀坪石铺', 1),
  terrain('stone', rectPoly(348, 310, 34, 30), 9, '剧场观众坪', 1),
  terrain('stone', rectPoly(MIAO_THEATER.stageX - 21, MIAO_THEATER.stageZ - 10, 42, 20), 9, '剧场舞台基座', 1),
  terrain('dirt', rectPoly(MIAO_PIG_FARM.x - 13, MIAO_PIG_FARM.z - 10, 26, 20), 4.5, '猪场压实土', 1),
  terrain('stone', rectPoly(48, 48, 64, 56), 6, '蓝队营地铺装', 1),
  terrain('stone', rectPoly(384, 396, 64, 56), 12, '橙队营地铺装', 1),
  ...MIAO_VEGETABLE_PATCHES.map((p) => terrain('mud', rectPoly(p.x - p.w / 2, p.z - p.d / 2, p.w, p.d), 5.2, p.id, 1)),
];
for (const p of MIAO_PADDIES) plazaPatches.push(terrain('mud', rectPoly(p.x - p.w / 2, p.z - p.d / 2, p.w, p.d), p.levelY, p.id, 1));
for (const patch of plazaPatches) {
  patch.preserveUnderRoads = true;
  patch.surfacePriority = 4;
}

/** 多高度水域：主河 + 14 块梯田浅水（每块自己的 surfaceY/bedY）。 */
const waterVolumes: WaterVolume[] = [
  {
    id: 'bai-shui-river',
    kind: 'river',
    surfaceY: RIVER_SURFACE_Y,
    bedY: -4.2,
    material: 135,
    polygon: riverPolygon(),
    swim: true,
  },
  ...MIAO_FERRY_BASINS.map((b) => ({
    id: b.id, kind: 'pond' as const, surfaceY: b.surfaceY, bedY: b.bedY, material: 135,
    rect: { x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 }, swim: true,
  })),
  ...MIAO_PADDIES.map((p) => ({
    id: p.id,
    kind: 'paddy' as const,
    surfaceY: p.levelY + 0.28,
    bedY: p.levelY,
    material: 135,
    rect: { x0: p.x - p.w / 2, z0: p.z - p.d / 2, x1: p.x + p.w / 2, z1: p.z + p.d / 2 },
    swim: false,
  })),
];

const bridgePatches: TerrainPatch[] = MIAO_BRIDGES.flatMap((bridge) => [
  terrain('wood', rectPoly(bridge.x0, bridge.z - bridge.width / 2, bridge.x1 - bridge.x0, bridge.width), bridge.deckY, `${bridge.name}桥面`, 1),
]);

/**
 * 千户苗寨 · QIANHU MIAO VILLAGE
 *
 * 500×500 苗寨河谷：四面八方真实几何高山，白水河贯穿，三座静态桥、两座权威
 * 缆索渡船、五据点、成组的吊脚楼与棚舍。20 分钟默认时长（只影响本图），
 * scoreRate 0.18。世界扩展（height 108 / 山体 88 / 水面多标高 / 桥面 footprint）
 * 全部通过通用字段传入 terrain worker，不在 engine 里写地图特判。
 */
export const miaoVillage: MapDef = {
  id: 'miao_village',
  order: 6,
  schemaVersion: 1,
  name: '千户苗寨',
  nameEn: 'QIANHU MIAO VILLAGE',
  size: MIAO_SIZE,
  baseTerrain: 'grass',
  theme: '贵州 · 苗岭河谷 · 晴日',
  summary:
    '500 米河谷苗寨：吊脚楼沿坡地成组展开，白水河三桥两渡，五据点从河岸市集、梯田打谷场到鼓藏堂与剧场。20 分钟、0.18 计分倍率，步兵与轻载具在真实街巷、梯田与风雨桥之间争夺。',
  asymmetry:
    '蓝队东南河谷营地（y6），橙队西北坡地（y12）。A 近蓝、D 近橙，B/E 分别略偏一方，C 是双方等距的桥面点；渡船与泳渡提供侧翼，桥梁承担车辆。',
  balance:
    '距离差由三条主环线、两条滨河步道、两座渡船和三座桥补偿；任何高地窗口都有至少两条登坡路与近身巷战反制。',
  terrain: [...plazaPatches, ...bridgePatches],
  roads: MIAO_ROADS.map((r) => ({
    points: r.points.map((p) => [p.x, p.z] as [number, number]),
    width: r.width,
    kind: r.kind,
    surface: r.surface,
    shoulder: 0,
    markings: false,
    verge: 'local',
    label: r.label,
  })),
  buildings: MIAO_BUILDINGS,
  covers: MIAO_COVERS,
  props: [
    { id: 'flag-blue', kind: 'flag', x: 56, y: 58, team: 'blue', w: 2, d: 2 },
    { id: 'flag-orange', kind: 'flag', x: 440, y: 444, team: 'orange', w: 2, d: 2 },
    { id: 'lamp-a', kind: 'lamp', x: 132, y: 182 },
    { id: 'lamp-b', kind: 'lamp', x: 336, y: 168 },
    { id: 'lamp-c', kind: 'lamp', x: 198, y: 246 },
    { id: 'lamp-d', kind: 'lamp', x: 166, y: 384 },
    { id: 'lamp-e', kind: 'lamp', x: 378, y: 316 },
  ],
  decor: MIAO_DECOR,
  capturePoints: MIAO_CAPTURES,
  spawns: MIAO_SPAWNS,
  vehiclePads: MIAO_VEHICLE_PADS,
  mgNests: [],
  specialCrates: MIAO_SPECIAL_CRATES,
  routes: MIAO_ROUTES.map((r) => route(r.team, r.label, r.points, r.kind)),
  notes: [
    `${MIAO_BUILDING_COUNTS.total} 栋建筑：主楼 ${MIAO_BUILDING_COUNTS.main}（双 ${MIAO_BUILDING_COUNTS.two} / 单 ${MIAO_BUILDING_COUNTS.one} / 三 ${MIAO_BUILDING_COUNTS.three}）+ 棚舍 ${MIAO_BUILDING_COUNTS.sheds}。`,
    'C 只有中央廊桥桥面可占（footprint + floorY 联合判定）；水面、towpath、屋顶、桥外道路不可占。',
    'E 观众坪 floorY=9、垂直容差 1.2：舞台面 11.5 m 不可隔空占点。',
    '主河水面 -2；梯田浅水 0.15–0.35 m，独立 surfaceY，不套用 -2。',
    '两座缆索渡船 host 权威：40 m / 2.5 m/s / E 呼叫或发船 / 2 s 倒计时；只有步兵。',
    '所有道路 markings:false；没有沥青与白色交通虚线。',
    '平衡待真人调优；本图 scoreRate 0.18、默认 1200 秒。',
  ],
  terrainMaterials: {
    grass: 138, stone: 132, dirt: 136, mud: 137, gravel: 131, wood: 125, water: 135, rubble: 130, concrete: 131, sand: 136, asphalt: 132, flowers: 138,
  },
  scenePads: [],
  scoreRate: 0.18,
  assetBundle: 'miao-v1',
  tags: ['village', 'river', 'miao', 'ferry', '500m', 'bridges'],
  gamemodes: ['capture'],
  waterVolumes,
  extensions: {
    artStyle: 'realistic-pixel-voxel',
    interiorSystem: 'authored',
    vertical: { minY: MIAO_MIN_Y, height: 108 },
    heightClamp: [MIAO_MIN_Y, MIAO_MAX_Y],
    navigationLayers: 5,
    captureScoreMultiplier: 0.18,
    recommendedPlayers: [8, 12],
    bestExperience: 8,
    matchSeconds: 1200,
    minimumPlayers: 4,
    sky: 'noon',
    initialOwner: 'neutral',
    ferries: MIAO_FERRY_DATA,
    bridges: MIAO_BRIDGES,
    pigs: MIAO_PIGS.length,
    pigPositions: MIAO_PIGS.map((p) => ({ x: p.x, z: p.z, yaw: p.yaw, color: p.color, phase: p.phase })),
    buildings: MIAO_BUILDING_COUNTS,
    plots: MIAO_PLOTS.length,
    riverControl: riverAt(250),
    theater: MIAO_THEATER,
    pigFarm: MIAO_PIG_FARM,
  },
};

export { MIAO_BUILDING_COUNTS };
