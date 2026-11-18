import type { MapDef } from './types';
import {
  building,
  cover,
  mg,
  pad,
  prop,
  route,
  sandbagLine,
  spawn,
  special,
  terrain,
  wallLine,
} from './helpers';

/**
 * 机场 / AIRFIELD
 *
 * 坐标：x 向东、y 向北，0..300。
 * 一条东西向主跑道（09/27）横贯中部，北侧滑行道之外是橙队航站/货运/塔台区，
 * 南侧滑行道之外是蓝队双机库/维修区。A 塔台在东北、C 油库在西南，互为镜像；B 在跑道正中。
 */
export const airfield: MapDef = {
  id: 'airfield',
  order: 4,
  schemaVersion: 1,
  name: '机场',
  nameEn: 'AIRFIELD',
  size: 300,
  baseTerrain: 'grass',
  theme: '军民两用机场 / 09-27 主跑道 / 航站区与机库区',
  summary:
    '一条东西向主跑道横贯中部，北侧是航站楼、安检与塔台的橙队航站区，南侧是双机库与维修棚的蓝队机库区。A 塔台居东北、C 油库居西南、B 在跑道正中，双方出生区到 B 均约 121 米。',
  asymmetry:
    '北侧航站楼、安检、货运区房间碎、遮蔽多，短兵与绕后更强；南侧机库跨度大、门洞宽，长枪和载具整备更舒服。西侧油库有防爆墙与管线可绕，东侧塔台围场正面窄、两翼长，谁先占住围栏谁就能压 A。',
  balance:
    'A 距橙队出生区约 100 米、距蓝队约 198 米，C 正好互换，两点互为镜像；B 到双方均约 121 米。蓝队机库前坪到 B 约 55–65 米，橙队航站坪约 64–76 米，蓝队载具略占先手，用来抵消橙队对 A 的近距优势。',
  terrain: [
    // 南侧机库停机坪（蓝队）
    {
      ...terrain('asphalt', [[84, 14], [214, 14], [214, 112], [84, 112]], 0, '南侧机库坪'),
      preserveUnderRoads: true,
    },
    // 北侧航站坪（橙队）
    {
      ...terrain('asphalt', [[38, 188], [216, 188], [216, 253], [38, 253]], 0, '北侧航站坪'),
      preserveUnderRoads: true,
    },
    // 东侧塔台与货运场
    {
      ...terrain('concrete', [[212, 186], [284, 186], [284, 250], [212, 250]], 0, '塔台·货运场'),
      preserveUnderRoads: true,
    },
    // 西南油库围场
    terrain('gravel', [[46, 66], [94, 66], [94, 108], [46, 108]], 0, '油库围场'),
    // 员工停车场
    {
      ...terrain('concrete', [[42, 196], [86, 196], [86, 224], [42, 224]], 0, '员工停车场'),
      preserveUnderRoads: true,
    },
    // 跑道两端防冲砂地
    terrain('sand', [[24, 130], [42, 130], [42, 170], [24, 170]], 0, '西端防冲区'),
    terrain('sand', [[270, 130], [288, 130], [288, 170], [270, 170]], 0, '东端防冲区'),
    // 侧翼草地与土场
    terrain('grass', [[14, 108], [40, 108], [40, 192], [14, 192]], 0, '西侧草地'),
    terrain('grass', [[250, 98], [292, 98], [292, 178], [250, 178]], 0, '东侧草地'),
    terrain('dirt', [[16, 24], [44, 24], [44, 58], [16, 58]], 0, '西南土场'),
  ],
  roads: [
    // 两条联络道先画，跑道覆盖中段，只露出南北两个道口
    { points: [[78, 116], [78, 184]], width: 10, kind: 'taxiway', label: '' },
    { points: [[238, 116], [238, 184]], width: 10, kind: 'taxiway', label: '' },
    // 主跑道 09/27：分两段绘制，让标签落在 B 点以东
    { points: [[40, 150], [80, 150]], width: 36, kind: 'runway' },
    { points: [[80, 150], [272, 150]], width: 36, kind: 'runway', label: '09/27' },
    // 南北滑行道
    { points: [[78, 184], [238, 184]], width: 10, kind: 'taxiway', label: '北滑行道' },
    { points: [[78, 116], [238, 116]], width: 10, kind: 'taxiway', label: '南滑行道' },
    // 队属服务路
    { points: [[150, 44], [150, 116]], width: 8, kind: 'secondary', label: '机库道' },
    { points: [[143, 253], [143, 188]], width: 8, kind: 'secondary', label: '航站楼道' },
  ],
  buildings: [
    // 南侧机库区（蓝队）
    building('hangar-1', '机库 1', 94, 66, 44, 28, 11, 'gable', { enterable:true, labelAt: [116, 80] }),
    building('hangar-2', '机库 2', 162, 66, 44, 28, 11, 'gable', { labelAt: [184, 80] }),
    building('east-hangar', '东侧机棚', 212, 66, 26, 26, 9, 'sawtooth', { labelAt: [225, 79] }),
    building('maint', '维修棚', 84, 96, 14, 12, 5, 'flat', { enterable:true, labelAt: [91, 102] }),
    building('tool', '工具间', 206, 98, 20, 11, 4, 'flat', { labelAt: [216, 103.5] }),
    building('fire', '消防站', 26, 58, 26, 18, 7, 'flat', { labelAt: [39, 67] }),
    building('fuel-store', '油料间', 24, 84, 26, 16, 4, 'flat', { labelAt: [37, 92] }),
    building('blue-barracks', '蓝队兵营', 80, 22, 26, 18, 5, 'flat', { labelAt: [93, 31] }),
    building('blue-supply', '蓝队补给库', 206, 20, 26, 18, 5, 'flat', { labelAt: [219, 29] }),
    // 北侧航站区（橙队）
    building('terminal-w', '航站楼·西', 80, 230, 50, 18, 12, 'glass', { labelAt: [105, 239] }),
    building('terminal-e', '航站楼·东', 156, 230, 54, 18, 12, 'glass', { labelAt: [183, 239] }),
    building('security', '安检·行李', 214, 228, 24, 16, 6, 'flat', { labelAt: [226, 236] }),
    building('control', '管制塔台', 242, 214, 16, 16, 26, 'flat', { labelAt: [250, 222] }),
    building('radar-room', '雷达站房', 266, 232, 14, 12, 4, 'flat', { labelAt: [273, 238] }),
    building('cargo-shed', '货运棚', 184, 191, 30, 16, 8, 'sawtooth', { labelAt: [199, 199] }),
    building('cargo-office', '货运办公', 266, 198, 14, 12, 4, 'flat', { labelAt: [273, 204] }),
    building('ground-garage', '地勤车库', 90, 194, 20, 12, 4, 'flat', { labelAt: [100, 200] }),
    building('north-depot', '北侧仓库', 32, 226, 34, 22, 9, 'gable', { labelAt: [49, 237] }),
    building('orange-barracks', '橙队兵营', 28, 260, 26, 20, 5, 'flat', { labelAt: [41, 270] }),
    building('orange-supply', '橙队补给库', 206, 266, 26, 18, 5, 'flat', { labelAt: [219, 275] }),
  ],
  covers: [
    // ── 跑道中段 / B 点 ──────────────────────────────────
    cover('sandbag', 150, 137.5, 16, 2.2, 0),
    cover('sandbag', 150, 162.5, 16, 2.2, 0),
    cover('barrier', 138, 150, 7, 2, 90),
    cover('barrier', 162, 150, 7, 2, 90),
    cover('crate', 143, 143, 3.6, 3.6, 0),
    cover('crate', 157, 157, 3.6, 3.6, 0),
    cover('trench', 132, 157, 9, 6, 15),
    cover('trench', 168, 142, 8, 6, -12),
    cover('wreck', 118, 165, 9, 4, 10),
    cover('wreck', 184, 166, 8, 4, -8),
    cover('container', 78, 144, 13, 2.8, 0, { color: '#5c4d3a' }),
    cover('container', 232, 150, 13, 2.8, 0, { color: '#5a6242' }),
    cover('sandbag', 112, 138, 10, 2.2, 0),
    cover('sandbag', 192, 162, 10, 2.2, 0),
    cover('crate', 82, 166, 4.4, 4.4, 0),
    cover('crate', 236, 142, 4.4, 4.4, 0),
    cover('barrier', 66, 158, 6, 2, 80),
    cover('barrier', 248, 156, 6, 2, 95),
    // ── 两座重机枪的沙袋翼 ───────────────────────────────
    cover('sandbag', 172, 174, 10, 2.2, 0),
    cover('sandbag', 200, 174, 10, 2.2, 0),
    cover('sandbag', 100, 126, 10, 2.2, 0),
    cover('sandbag', 128, 126, 10, 2.2, 0),
    // ── A 塔台围场 ────────────────────────────────────
    cover('sandbag', 222, 195.5, 10, 2.2, 0),
    cover('sandbag', 238, 195.5, 10, 2.2, 0),
    cover('sandbag', 230, 224.5, 14, 2.2, 0),
    cover('sandbag', 215.5, 210, 13, 2.2, 90),
    cover('sandbag', 243, 208, 8, 2.2, 90),
    cover('crate', 226, 189, 4, 4, 0),
    cover('barrier', 238, 192, 8, 2, 0),
    cover('crate', 250, 196, 4, 4, 0),
    // ── C 油库 ────────────────────────────────────────
    cover('fuel_tank', 57, 83, 9, 9, 0),
    cover('fuel_tank', 83, 79, 8, 8, 0),
    cover('fuel_tank', 79, 100, 7, 7, 0),
    cover('fuel_tank', 56, 101, 7, 7, 0),
    wallLine(54, 68, 90, 68, 1.6),
    wallLine(88, 68, 88, 86, 1.6),
    cover('sandbag', 70, 105.5, 18, 2.2, 0),
    cover('crate', 53, 93, 4.4, 4.4, 0),
    cover('crate', 52, 104, 4, 4, 0),
    // ── 蓝队基地 / 机库前坪 ─────────────────────────────
    cover('sandbag', 136, 50, 12, 2.2, 0),
    cover('sandbag', 164, 50, 12, 2.2, 0),
    cover('container', 74, 58, 12, 2.8, 0, { color: '#3e6668' }),
    cover('container', 74, 66, 12, 2.8, 0, { color: '#7c4e34' }),
    cover('crate', 94, 60, 4, 4, 0),
    cover('crate', 210, 58, 4, 4, 0),
    cover('crate', 242, 56, 4, 4, 0),
    cover('barrier', 226, 54, 8, 2, 0),
    cover('wreck', 256, 90, 8, 4, 30),
    cover('sandbag', 234, 102, 12, 2.2, 0),
    // ── 北侧航站坪 / 停车场 ─────────────────────────────
    cover('barrier', 52, 202, 4.6, 2.2, 0),
    cover('barrier', 64, 202, 4.6, 2.2, 0),
    cover('barrier', 52, 212, 4.6, 2.2, 0),
    cover('barrier', 64, 212, 4.6, 2.2, 0),
    cover('barrier', 78, 202, 4.6, 2.2, 0),
    cover('container', 54, 220, 10, 2.8, 0, { color: '#5c4d3a' }),
    cover('sandbag', 170, 226, 16, 2.2, 0),
    cover('crate', 114, 222, 4.4, 4.4, 0),
    cover('barrier', 94, 220, 8, 2, 0),
    cover('sandbag', 200, 222, 10, 2.2, 0),
    // ── 东侧货运 / A 侧翼 ───────────────────────────────
    cover('container', 262, 196, 12, 2.8, 90, { color: '#5a6242' }),
    cover('crate', 252, 192, 4.4, 4.4, 0),
    cover('wreck', 232, 172, 8, 4, 25),
    cover('crate', 212, 222, 4, 4, 0),
    cover('barrier', 168, 196, 8, 2, 0),
    // ── 跑道两端 ──────────────────────────────────────
    cover('sandbag', 34, 154, 12, 2.2, 90),
    cover('rock', 26, 140, 6, 5, 0),
    cover('tree', 24, 168, 5, 5, 0),
    cover('barrier', 34, 178, 8, 2, 0),
    cover('sandbag', 278, 154, 10, 2.2, 90),
    cover('rock', 284, 142, 5, 4, 0),
    cover('tree', 286, 168, 4.5, 4.5, 0),
    cover('barrier', 278, 178, 8, 2, 0),
    // ── 场外绿化 ──────────────────────────────────────
    cover('tree', 20, 44, 5, 5, 0),
    cover('tree', 28, 34, 4.5, 4.5, 0),
    cover('tree', 36, 46, 4, 4, 0),
    cover('tree', 292, 262, 4.5, 4.5, 0),
    cover('tree', 286, 276, 4, 4, 0),
    cover('tree', 20, 286, 5, 5, 0),
  ],
  props: [
    // 跑道中段的废弃机骸
    prop('aircraft', 106, 146, { w: 38, d: 28, rot: 6, label: '废弃运输机' }),
    prop('aircraft', 206, 152, { w: 32, d: 24, rot: -12, label: '坠毁机骸' }),
    // 塔台雷达
    prop('radar', 272, 254, { w: 14 }),
    // 跑道边灯
    prop('lamp', 60, 170),
    prop('lamp', 150, 170),
    prop('lamp', 246, 170),
    prop('lamp', 60, 130),
    prop('lamp', 150, 130),
    prop('lamp', 246, 130),
    // 机坪照明
    prop('lamp', 100, 60),
    prop('lamp', 200, 60),
    prop('lamp', 100, 220),
    prop('lamp', 200, 220),
    // 基地门
    prop('flag', 128, 20, { team: 'blue' }),
    prop('flag', 150, 282, { team: 'orange' }),
  ],
  capturePoints: [
    { id: 'A', name: '塔台', x: 230, y: 210, radius: 12, initialOwner: 'neutral' },
    { id: 'B', name: '跑道中心', x: 150, y: 150, radius: 13, initialOwner: 'neutral' },
    { id: 'C', name: '油库', x: 70, y: 90, radius: 12, initialOwner: 'neutral' },
  ],
  spawns: [
    spawn('blue', 122, 12, 56, 34, '机库基地'),
    spawn('orange', 122, 254, 56, 34, '航站基地'),
  ],
  vehiclePads: [
    pad('blue', 'motorcycle', 106, 102, 0),
    pad('blue', 'jeep', 128, 102, 0),
    pad('blue', 'apc', 172, 102, 0),
    pad('blue', 'mbt', 196, 102, 0),
    pad('orange', 'motorcycle', 106, 214, 180),
    pad('orange', 'jeep', 128, 214, 180),
    pad('orange', 'apc', 172, 214, 180),
    pad('orange', 'mbt', 196, 214, 180),
  ],
  mgNests: [
    mg(186, 174, 270, '北跑道重机枪'),
    mg(114, 126, 90, '南跑道重机枪'),
  ],
  specialCrates: [
    special('amr', 78, 112, '反器材狙击'),
    special('amr', 254, 148, '反器材狙击'),
    special('rocket', 56, 148, '火箭筒'),
    special('rocket', 238, 184, '火箭筒'),
  ],
  routes: [
    route('blue', '主攻 B', [[150, 50], [150, 116], [150, 134]], 'main'),
    route('blue', '西侧 C', [[102, 50], [88, 66], [78, 84], [72, 94]], 'flank'),
    route('blue', '东侧 A', [[206, 46], [246, 70], [250, 110], [248, 150], [236, 188]], 'flank'),
    route('orange', '主攻 B', [[143, 252], [143, 196], [146, 170]], 'main'),
    route('orange', '西侧 C', [[116, 252], [96, 220], [76, 190], [64, 164], [60, 132], [60, 110], [66, 100]], 'flank'),
    route('orange', '东侧 A', [[186, 260], [214, 252], [246, 248], [262, 240], [263, 226], [261, 214], [246, 203]], 'flank'),
  ],
  assetBundle: 'map-airfield',
  tags: ['airfield', 'runway', 'industrial', 'open'],
  gamemodes: ['capture', 'conquest'],
  notes: [
    '09/27 主跑道横贯东西（x 40–272），是全图最长视距；中段用沙袋、弹坑、废弃机骸与拖车打断纯开阔。',
    'A 塔台到橙队约 100 米、到蓝队约 198 米；C 油库正好互换；B 到双方出生区均约 121 米。',
    '南北两条滑行道是载具主通道，x≈78 / 238 的联络道可横穿跑道，坦克别停在跑道中线。',
    '南侧机库跨度大、门洞宽，适合载具整备与长枪架点；北侧航站楼/安检/货运区房间碎，短兵与绕后更多。',
    '两座重机枪分列跑道南北两侧，各由沙袋围合；特殊武器：蓝侧南滑行道西口 AMR、橙侧东跑道端 AMR、蓝侧西跑道端火箭筒、橙侧北滑行道东口火箭筒。',
    '每队仅 1 台主战坦克，冷却长；橙队主力载具从航站坪出发，注意不要堵住航站楼中央的出兵通道。',
  ],
};

export default airfield;
