import type { MapDef, Vec2 } from './types';
import {
  building,
  cover,
  hedgeLine,
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

/** 中央喷泉广场：正八边形石铺，半径 17 m。 */
const PLAZA_R = 17;
const plaza: Vec2[] = Array.from({ length: 8 }, (_, i) => {
  const a = (Math.PI / 4) * i + Math.PI / 8;
  return [
    Number((150 + PLAZA_R * Math.cos(a)).toFixed(2)),
    Number((150 + PLAZA_R * Math.sin(a)).toFixed(2)),
  ] as Vec2;
});

/** 西侧果园：两列错位果树，供橙队西门→A 的路线穿插。 */
const orchardTrees = [50, 62].flatMap((x, column) =>
  [182, 196, 210, 224, 238].map((y) => cover('tree', x, y + column * 8, 4.6, 4.6)),
);

/** 围墙外西侧小果园（橙队出生区外侧）。 */
const outerOrchard = [8, 16].flatMap((x) =>
  [200, 214, 228, 242].map((y) => cover('tree', x, y, 4.2, 4.2)),
);

/** 园内散树，主要补南花园与东侧长视线。 */
const estateTrees = [
  [86, 240],
  [104, 244],
  [44, 88],
  [56, 64],
  [86, 96],
  [104, 60],
  [172, 76],
  [240, 74],
  [226, 182],
  [188, 212],
  [182, 246],
].map(([x, y]) => cover('tree', x, y, 5, 5));

export const garden: MapDef = {
  id: 'garden',
  order: 3,
  schemaVersion: 1,
  name: '花园',
  nameEn: 'GARDEN',
  size: 300,
  baseTerrain: 'grass',
  theme: '围墙庄园 / 玻璃温室 / 喷泉广场 / 果园',
  summary:
    '一座带石墙的庄园：东侧是规整的主楼、马厩与服务院，西侧是野趣果园与玻璃温室，中央喷泉广场是 B 点。四门皆可进，A 温室与 C 庄园前庭互为镜像，B 到双方基地等距；载具只能走外环与门房前庭。',
  asymmetry:
    '东半区是庄园主楼、马厩、马车房与修剪树篱，路线直、长枪视野好；西半区是果园、工具房、野树与碎石路，掩体碎、绕后多。蓝队由东门进、橙队由西门进，但 A 靠橙队、C 靠蓝队，双方都必须打一次长距离换点。',
  balance:
    'A 与 C 关于场地中心镜像：橙队到 A、蓝队到 C 均约 89 m，反方向均约 185 m；B 到双方均约 131 m。温室与前庭各留 6 m 以上通道，两座重机枪分别压制 B 北侧与 C 南侧，载具无法驶入中央花园。',
  terrain: [
    // 东西向主径
    terrain('gravel', [
      [40, 147], [260, 147], [260, 153], [40, 153],
    ]),
    // 南北向主径
    terrain('gravel', [
      [147, 45], [153, 45], [153, 255], [147, 255],
    ]),
    // 中央广场石铺
    {...terrain('stone', plaza), preserveUnderRoads: true},
    // 庄园前庭与抬高的露台
    {
      ...terrain('stone', [
        [178, 90], [222, 90], [222, 121], [178, 121],
      ]),
      preserveUnderRoads: true,
    },
    {
      ...terrain('stone', [
        [178, 115], [222, 115], [222, 121], [178, 121],
      ], 1.2),
      preserveUnderRoads: true,
    },
    // 温室碎石场
    terrain('gravel', [
      [72, 172], [130, 172], [130, 214], [72, 214],
    ]),
    // 西侧果园泥地
    terrain('dirt', [
      [44, 158], [74, 158], [74, 250], [44, 250],
    ]),
    // 东侧服务院
    {
      ...terrain('concrete', [
        [262, 52], [298, 52], [298, 112], [262, 112],
      ]),
      preserveUnderRoads: true,
    },
    // 西侧农院
    terrain('dirt', [
      [2, 52], [38, 52], [38, 112], [2, 112],
    ]),
    // 东/西门内前庭（载具可短暂停留，不进入核心）
    {
      ...terrain('concrete', [
        [236, 134], [260, 134], [260, 166], [236, 166],
      ]),
      preserveUnderRoads: true,
    },
    {
      ...terrain('concrete', [
        [40, 134], [64, 134], [64, 166], [40, 166],
      ]),
      preserveUnderRoads: true,
    },
    // 树篱花圃底色
    terrain('flowers', [
      [125, 180], [143, 180], [143, 196], [125, 196],
    ]),
    terrain('flowers', [
      [158, 184], [180, 184], [180, 196], [158, 196],
    ]),
    terrain('flowers', [
      [120, 104], [142, 104], [142, 120], [120, 120],
    ]),
  ],
  roads: [
    { points: [[26, 30], [279, 30]], width: 7, kind: 'secondary', label: '南乡道' },
    { points: [[26, 270], [279, 270]], width: 7, kind: 'secondary', label: '北乡道' },
    { points: [[276.5, 26], [276.5, 274]], width: 5, kind: 'path' },
    { points: [[23.5, 26], [23.5, 274]], width: 5, kind: 'path' },
    { points: [[260, 150], [276.5, 150]], width: 8, kind: 'secondary' },
    { points: [[23.5, 150], [40, 150]], width: 8, kind: 'secondary' },
    { points: [[150, 30], [150, 45]], width: 8, kind: 'secondary' },
    { points: [[150, 255], [150, 270]], width: 8, kind: 'secondary' },
  ],
  buildings: [
    // 温室 A：南北双垄玻璃，中间 12 m 走道
    building('greenhouse-n', '温室·北垄', 76, 198, 42, 10, 7, 'glass', { enterable:true, labelAt: [97, 203] }),
    building('greenhouse-s', '育苗床', 76, 180, 42, 6, 4.5, 'glass', { label: false }),
    // 庄园 C：主楼 + 双翼 + 南向前庭
    building('manor-main', '庄园主楼', 178, 121, 44, 22, 12, 'gable', { enterable:true, labelAt: [200, 132] }),
    building('manor-west', '庄园西翼', 164, 99, 14, 22, 9, 'gable', { label: false }),
    building('manor-east', '庄园东翼', 222, 99, 14, 22, 9, 'gable', { label: false }),
    // 四门门房
    building('gate-e-n', '东门房', 246, 160, 12, 14, 4.5, 'flat', { labelAt: [252, 167] }),
    building('gate-e-s', '东门房·南', 246, 126, 12, 14, 4.5, 'flat', { label: false }),
    building('gate-w-n', '西门房', 42, 160, 12, 14, 4.5, 'flat', { label: false }),
    building('gate-w-s', '西门房', 42, 126, 12, 14, 4.5, 'flat', { labelAt: [48, 133] }),
    building('gate-s', '南门房', 126, 48, 14, 14, 4.5, 'flat', { labelAt: [133, 55] }),
    building('gate-n', '北门房', 158, 238, 14, 14, 4.5, 'flat', { labelAt: [165, 245] }),
    // 东南服务院
    building('stable', '马厩', 176, 58, 26, 18, 7, 'gable', { labelAt: [189, 67] }),
    building('carriage', '马车房', 212, 60, 20, 18, 6, 'gable', { labelAt: [222, 69] }),
    building('tool-shed', '园艺工具房', 236, 84, 14, 14, 4, 'flat', { label: false }),
    // 西南园丁区
    building('cottage', '园丁小屋', 46, 106, 18, 16, 5, 'gable', { labelAt: [55, 114] }),
    // 东北花园
    building('pump-house', '水泵房', 196, 196, 14, 14, 4, 'flat', { label: false }),
    building('pavilion', '观景亭', 214, 216, 14, 12, 4, 'open', { labelAt: [221, 222] }),
    building('orchard-shed', '果园工具房', 66, 240, 14, 10, 3.5, 'flat', { label: false }),
    building('flower-house', '花房', 236, 196, 14, 12, 3.5, 'glass', { label: false }),
    // 围墙外东侧服务院
    building('east-garage', '东院车库', 282, 54, 16, 16, 5, 'gable', { labelAt: [290, 62] }),
    building('east-shed', '东院工具棚', 282, 86, 14, 14, 3.5, 'flat', { label: false }),
    // 围墙外西侧农院
    building('west-barn', '西侧谷仓', 2, 54, 16, 18, 7, 'gable', { labelAt: [10, 63] }),
    building('west-shed', '西侧农具棚', 2, 86, 14, 14, 3.5, 'flat', { label: false }),
  ],
  covers: [
    // 庄园围墙（东西南北各留 14 m 门洞）
    wallLine(40, 45, 143, 45, 2.4),
    wallLine(157, 45, 260, 45, 2.4),
    wallLine(40, 255, 143, 255, 2.4),
    wallLine(157, 255, 260, 255, 2.4),
    wallLine(40, 45, 40, 143, 2.4),
    wallLine(40, 157, 40, 255, 2.4),
    wallLine(260, 45, 260, 143, 2.4),
    wallLine(260, 157, 260, 255, 2.4),
    // 园内旧石墙
    wallLine(96, 72, 124, 72, 1.4),
    wallLine(236, 176, 252, 176, 1.4),
    // 围绕 B 的四组树篱花圃（各有开口，可斜穿）
    hedgeLine(124, 198, 144, 198, 2),
    hedgeLine(144, 176, 144, 198, 2),
    hedgeLine(124, 176, 138, 176, 2),
    hedgeLine(156, 198, 182, 198, 2),
    hedgeLine(182, 180, 182, 198, 2),
    hedgeLine(168, 180, 182, 180, 2),
    hedgeLine(118, 102, 144, 102, 2),
    hedgeLine(118, 102, 118, 122, 2),
    hedgeLine(118, 122, 132, 122, 2),
    hedgeLine(154, 100, 162, 100, 2),
    hedgeLine(162, 100, 162, 116, 2),
    // 广场四角矮树篱，形成四个轴向入口
    hedgeLine(134, 163, 143, 163, 1.8),
    hedgeLine(157, 163, 166, 163, 1.8),
    hedgeLine(134, 137, 143, 137, 1.8),
    hedgeLine(157, 137, 166, 137, 1.8),
    // 果园分隔树篱（留 8 m 缺口）
    hedgeLine(74, 158, 74, 182, 2),
    hedgeLine(74, 196, 74, 236, 2),
    // 两基地北缘绿篱
    hedgeLine(4, 190, 36, 190, 2.2),
    hedgeLine(264, 196, 274, 196, 2.2),
    ...orchardTrees,
    ...outerOrchard,
    ...estateTrees,
    // 花坛
    cover('planter', 136, 160, 6, 2, 45),
    cover('planter', 164, 160, 6, 2, -45),
    cover('planter', 136, 140, 6, 2, -45),
    cover('planter', 164, 140, 6, 2, 45),
    cover('planter', 186, 96, 4, 2, 0),
    cover('planter', 218, 96, 4, 2, 0),
    cover('planter', 132, 188, 8, 4, 0),
    cover('planter', 168, 190, 8, 4, 0),
    cover('planter', 83, 196, 8, 3, 0),
    cover('planter', 111, 196, 8, 3, 0),
    // 雕像
    cover('statue', 184, 104, 5, 5),
    cover('statue', 216, 104, 5, 5),
    // 木箱 / 干草
    cover('crate', 128, 202, 4, 4),
    cover('crate', 270, 106, 4, 4),
    cover('crate', 294, 106, 3, 3),
    cover('crate', 18, 104, 4, 4),
    cover('crate', 58, 156, 4, 4),
    cover('crate', 66, 160, 3, 3),
    cover('crate', 204, 64, 4, 4),
    // 沙袋（两座 MG + 门内掩体）
    sandbagLine(236, 136, 250, 136, 2.2),
    sandbagLine(50, 136, 64, 136, 2.2),
    // 景石
    cover('rock', 30, 248, 6, 5, 10),
    cover('rock', 150, 88, 5, 4, 15),
    cover('rock', 162, 96, 3.5, 3, 0),
    cover('rock', 140, 108, 4, 3.5, 40),
    cover('rock', 44, 160, 5, 4, 0),
        // 东北草坪园中园
    hedgeLine(190, 212, 214, 212, 2),
    hedgeLine(190, 212, 190, 232, 2),
    cover('planter', 202, 222, 8, 4, 0),
    // 路障
    cover('barrier', 240, 162, 8, 2, 0),
    cover('barrier', 60, 138, 8, 2, 0),
    cover('barrier', 163, 222, 8, 2, 0),
    // 农场废车
    cover('wreck', 286, 114, 8, 4, 10, { color: '#4a4437' }),
  ],
  props: [
    prop('fountain', 150, 150, { w: 16, d: 16 }),
    prop('lamp', 150, 68),
    prop('lamp', 150, 232),
    prop('lamp', 52, 150),
    prop('lamp', 248, 150),
    prop('lamp', 114, 150),
    prop('lamp', 186, 150),
    prop('lamp', 150, 116),
    prop('lamp', 150, 184),
    prop('gate', 150, 45, { w: 14, d: 3, rot: 0 }),
    prop('gate', 150, 255, { w: 14, d: 3, rot: 0 }),
    prop('flag', 290, 124, { team: 'blue' }),
    prop('flag', 10, 124, { team: 'orange' }),
  ],
  capturePoints: [
    { id: 'A', name: '温室', x: 100, y: 192, radius: 12, initialOwner: 'neutral' },
    { id: 'B', name: '喷泉广场', x: 150, y: 150, radius: 12, initialOwner: 'neutral' },
    { id: 'C', name: '庄园前庭', x: 200, y: 108, radius: 12, initialOwner: 'neutral' },
  ],
  spawns: [
    spawn('blue', 266, 118, 30, 64, '东门营地'),
    spawn('orange', 4, 118, 30, 64, '西果园营地'),
  ],
  vehiclePads: [
    pad('blue', 'motorcycle', 266.5, 62, 90),
    pad('blue', 'jeep', 266.5, 78, 90),
    pad('blue', 'apc', 266.5, 94, 90),
    pad('orange', 'motorcycle', 33.5, 62, 90),
    pad('orange', 'jeep', 33.5, 78, 90),
    pad('orange', 'apc', 33.5, 94, 90),
  ],
  mgNests: [mg(181, 92, 210, '庄园前庭重机枪'), mg(160, 173, 250, '喷泉北重机枪')],
  specialCrates: [
    special('amr', 248, 190, '反器材狙击'),
    special('amr', 66, 172, '反器材狙击'),
    special('rocket', 138, 208, '火箭筒'),
    special('rocket', 82, 232, '火箭筒'),
    special('flamethrower', 172, 136, '喷火器'),
  ],
  routes: [
    route('blue', 'B 东门主攻', [
      [294, 150], [278, 150], [260, 150], [240, 150], [212, 150], [184, 150], [160, 150],
    ]),
    route('blue', 'A 北门侧翼', [
      [292, 180], [284, 236], [284, 268], [210, 268], [160, 268], [150, 258],
      [150, 236], [150, 210], [150, 180], [146, 172], [124, 172], [121, 182],
      [121, 190], [110, 190],
    ], 'flank'),
    route('blue', '东院载具外环', [
      [266.5, 108], [276.5, 108], [276.5, 270], [200, 270], [150, 270],
    ], 'vehicle'),
    route('orange', 'A 西门果园', [
      [4, 150], [20, 150], [40, 150], [56, 152], [66, 162], [70, 176],
      [74, 188], [88, 190],
    ]),
    route('orange', 'C 南花园侧翼', [
      [6, 120], [16, 134], [30, 146], [40, 150], [58, 148], [70, 134],
      [72, 112], [74, 96], [86, 88], [110, 82], [140, 84], [164, 92], [186, 100],
    ], 'flank'),
    route('orange', '西院载具外环', [
      [33.5, 108], [23.5, 108], [23.5, 30], [100, 30], [150, 30],
    ], 'vehicle'),
  ],
  notes: [
    '石墙不可翻越，四门是唯一入口；东、西门为主攻门，南、北门供外环载具与绕后步兵。',
    'B 喷泉广场：圆形水池 + 四角树篱花坛，四条轴向通道全开，斜向另有空隙，共 6 条以上进入路线，不是死迷宫。',
    'A 温室为南北双垄玻璃结构，中央 12 m 走道可横穿；南侧入口开阔，一颗烟雾弹就能封住整条花圃走廊。',
    'C 庄园前庭由主楼与双翼围合，露台抬高 1.2 m；重机枪架在露台下方，同时压制南、西两条接近路。',
    '载具只走外环乡道与四门前庭，不能驶入中央花园；东、西服务院各 3 个载具位，APC 适合强攻主门。',
    'A 靠橙队、C 靠蓝队，两处互为镜像；B 到双方等距，谁能守住外环补给谁就能持续压点。',
    '特殊武器：东院观景亭北侧 AMR（蓝）、西果园中部 AMR（橙）、B 广场南出口外火箭筒（蓝）、南花园西端火箭筒（橙），庄园主楼西侧另有喷火器。',
  ],
  assetBundle: 'map-garden',
  tags: ['manor', 'garden', 'hedge', 'asym'],
  gamemodes: ['capture'],
};

export default garden;
