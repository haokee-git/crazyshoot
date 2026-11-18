import type { MapDef } from './types';
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
  treeRow,
  wallLine,
} from './helpers';

export const brokenBridge: MapDef = {
  id: 'broken_bridge',
  order: 2,
  schemaVersion: 1,
  name: '断桥',
  nameEn: 'BROKEN SPAN',
  size: 300,
  baseTerrain: 'grass',
  theme: '河谷断桥 / 北岸集镇 / 南岸农场',
  summary:
    '东西向河谷横贯中部，断桥西半幅尚可通行，东半幅整段塌入水中。北岸是橙队的收费站集镇，南岸是蓝队的磨坊农场；西岭俯瞰桥面，东侧浅滩是唯一的第二渡口。三点分布在桥北、桥心、桥南。',
  asymmetry:
    '橙队北岸是密集街巷与二层建筑，短枪、室内与屋顶压制更强；蓝队南岸农场开阔，中远距离与载具机动更舒服。西岭高地视野极佳但上坡路线只有两条；东侧浅滩人人都能过，却全程暴露在岭上与镇口火力下。',
  balance:
    'A 距橙队约 87 米、C 距蓝队约 83 米，各自守家点；B 在完整桥面中央，双方到 B 均为 117–121 米，家点与公共点互换补平总路程。北队想拿 C、南队想拿 A 都必须先过桥或绕浅滩，绕行距离接近。载具能过桥和浅滩，但桥面仅 40 米宽，坦克上桥极易被火箭筒与地雷反制。',
  terrain: [
    // 河滩泥边（先画，水面覆盖其上，留下泥边）
    terrain('mud', [
      [0, 135], [45, 131], [90, 136], [135, 132], [180, 137], [225, 131], [270, 136], [300, 133],
      [300, 168], [270, 172], [225, 167], [180, 171], [135, 166], [90, 171], [45, 166], [0, 169],
    ], 0, '河滩'),
    // 河谷水面：不可通行
    terrain('water', [
      [0, 140], [45, 136], [90, 141], [135, 137], [180, 142], [225, 136], [270, 141], [300, 138],
      [300, 163], [270, 167], [225, 162], [180, 166], [135, 161], [90, 166], [45, 161], [0, 164],
    ], 0, '河谷 / 不可通行'),
    // 浅滩两岸泥滩
    terrain('mud', [[250, 116], [278, 114], [282, 136], [252, 138]], 0, '南岸泥滩'),
    terrain('mud', [[250, 164], [282, 162], [286, 186], [254, 188]], 0, '北岸泥滩'),
    // 东侧浅滩（沙洲，可涉水）
    terrain('sand', [[230, 124], [254, 122], [256, 178], [232, 180]], 0, '浅滩 / FORD'),
    // 完整桥面（西半幅）
    {
      ...terrain('concrete', [[110, 130], [150, 130], [150, 170], [110, 170]], 0, '完整桥面'),
      preserveUnderRoads: true,
    },
    // 西岭：外坡 +4，岭顶 +8
    terrain('stone', [
      [6, 168], [30, 164], [52, 174], [68, 186], [72, 202], [64, 220], [46, 234], [20, 230], [6, 210],
    ], 4, '西岭外坡'),
    terrain('grass', [
      [12, 182], [32, 178], [48, 188], [50, 198], [40, 208], [22, 206], [12, 196],
    ], 8, '西岭顶'),
    // 镇区铺装
    terrain('gravel', [[74, 205], [208, 205], [212, 240], [78, 242]], 0, '镇前广场'),
    {
      ...terrain('concrete', [[144, 206], [184, 204], [186, 226], [146, 228]], 0, '加油站'),
      preserveUnderRoads: true,
    },
    // 农场土场与磨坊砂石场
    terrain('dirt', [[86, 56], [146, 54], [152, 104], [90, 106]], 0, '农家庭院'),
    terrain('gravel', [[178, 90], [242, 88], [246, 124], [182, 126]], 0, '磨坊场院'),
    // 基地铺装
    terrain('gravel', [[92, 14], [208, 14], [208, 60], [92, 60]], 0, '蓝队营地'),
    terrain('gravel', [[92, 244], [208, 244], [208, 292], [92, 292]], 0, '橙队营地'),
    // 断口两侧的坍塌堆积
    terrain('rubble', [[150, 118], [190, 116], [192, 140], [152, 142]], 0, '南侧坍台'),
    terrain('rubble', [[150, 160], [190, 158], [192, 182], [152, 184]], 0, '北侧坍台'),
  ],
  roads: [
    // 主路：蓝基地 → 南岸 → 桥面 → 镇 → 橙基地（不挂标签，避免压在 B 上）
    {
      points: [
        [150, 52], [150, 84], [142, 104], [132, 124], [132, 150], [132, 174],
        [128, 192], [130, 212], [138, 230], [148, 244], [150, 252],
      ],
      width: 9,
      kind: 'main',
    },
    {
      points: [[38, 98], [74, 102], [108, 104], [146, 104]],
      width: 7,
      kind: 'secondary',
      label: '南岸路 SOUTH BANK',
    },
    { points: [[146, 104], [178, 104], [198, 106], [204, 104]], width: 7, kind: 'secondary' },
    {
      points: [[44, 192], [78, 196], [106, 198], [134, 200], [164, 202], [190, 204]],
      width: 7,
      kind: 'secondary',
    },
    {
      points: [[248, 112], [252, 140], [250, 164], [248, 190], [240, 210], [232, 218]],
      width: 5,
      kind: 'path',
      label: '浅滩便道 FORD',
    },
    { points: [[50, 130], [58, 108], [70, 86], [84, 64]], width: 4, kind: 'path', label: '西坡小径' },
    { points: [[60, 170], [58, 190], [62, 212], [72, 230]], width: 4, kind: 'path', label: '西岭土路' },
    { points: [[10, 212], [30, 216], [50, 208], [62, 196]], width: 3, kind: 'path', label: '山脊道' },
  ],
  buildings: [
    // —— 北岸集镇（橙队）——
    building('north-toll', '收费站雨棚', 78, 208, 34, 14, 5.5, 'flat', {
      labelAt: [95, 215],
      roofColor: '#59605c',
    }),
    building('gas-station', '加油站', 146, 208, 34, 14, 5, 'flat', {
      labelAt: [163, 215],
      roofColor: '#4e5754',
    }),
    building('church', '圣马可教堂', 204, 212, 24, 26, 12, 'gable', { labelAt: [216, 225] }),
    building('house-w', '民居·西', 78, 226, 18, 12, 4.5, 'gable', { enterable:true, labelAt: [87, 232] }),
    building('house-m', '民居·中', 138, 226, 16, 12, 4.5, 'gable', { labelAt: [146, 232] }),
    building('house-e', '民居·东', 186, 182, 18, 14, 4.5, 'gable', { labelAt: [195, 189] }),
    building('town-store', '镇公所仓库', 104, 226, 26, 12, 6.5, 'sawtooth', { enterable:true, labelAt: [117, 232] }),
    building('orange-gate', '橙队门房', 84, 258, 26, 20, 4.5, 'flat', { labelAt: [97, 268] }),
    building('orange-garage', '橙队车库', 194, 258, 28, 20, 5, 'flat', { labelAt: [208, 268] }),
    // —— 南岸农场（蓝队）——
    building('barn', '谷仓', 94, 74, 34, 24, 9, 'gable', { labelAt: [111, 87] }),
    building('farmhouse', '农舍', 166, 74, 24, 18, 4.5, 'gable', { labelAt: [178, 84] }),
    building('mill', '磨坊主屋', 210, 92, 26, 24, 11, 'gable', { labelAt: [223, 105] }),
    building('workshop', '农机车间', 240, 60, 26, 22, 6, 'flat', { labelAt: [253, 72] }),
    building('shed', '工具棚', 108, 110, 16, 12, 3.5, 'flat', { label: false }),
    building('blue-depot', '蓝队仓库', 84, 22, 28, 22, 5, 'flat', { labelAt: [98, 34] }),
    building('blue-office', '蓝队调度室', 194, 22, 28, 22, 4, 'flat', { labelAt: [208, 34] }),
    // —— 西岭 ——
    building('bunker', '旧碉堡', 24, 196, 18, 14, 3.2, 'flat', { labelAt: [33, 204] }),
    building('ridge-shed', '守林屋', 58, 214, 14, 12, 3, 'flat', { labelAt: [65, 221] }),
    // —— 东岸 ——
    building('ford-hut', '浅滩看闸房', 264, 170, 14, 12, 3.5, 'flat', { labelAt: [271, 177] }),
    building('east-barn', '东岸草料棚', 262, 220, 22, 16, 5, 'gable', { labelAt: [273, 229] }),
  ],
  covers: [
    // 西岭林带与旧阵地
    ...treeRow(12, 222, 4, 6, 5, 4.2),
    ...treeRow(14, 180, 3, 7, 6, 4),
    cover('tree', 34, 174, 4.5, 4.5),
    cover('tree', 34, 52, 4.5, 4.5),
    cover('rock', 58, 192, 7, 5, 20),
    cover('rock', 50, 216, 6, 5, 0),
    cover('rock', 36, 228, 5, 4, 15),
    sandbagLine(22, 212, 44, 212, 2.2),
    cover('trench', 60, 204, 14, 3.4, 12),
    cover('crate', 30, 204, 5, 5),
    cover('wall', 58, 176, 10, 1.4, 90),
    cover('tree', 66, 174, 4, 4),
    // 桥头与断口
    sandbagLine(108,126,121,126,2.2),sandbagLine(139,126,150,126,2.2),
    sandbagLine(108,174,121,174,2.2),sandbagLine(139,174,148,174,2.2),
    wallLine(124,132,124,168,.5),
    wallLine(136,132,136,168,.5),
    cover('wreck', 142, 120, 8, 4, 20),
    cover('wreck', 168, 122, 9, 4, -15),
    cover('wreck', 172, 180, 9, 4, 60),
    cover('barrier', 106, 136, 8, 2, 90),
    cover('barrier', 106, 164, 8, 2, 90),
    cover('barrier', 158, 176, 8, 2, 20),
    cover('crate', 152, 126, 4, 4),
    // 南岸农场
    wallLine(90, 62, 90, 100, 1.2),
    hedgeLine(132, 66, 146, 66, 1.8),
    hedgeLine(212, 64, 238, 64, 1.8),
    cover('crate', 100, 64, 6, 6),
    cover('crate', 118, 68, 5, 5),
    cover('silo', 163, 108, 9, 9),
    cover('silo', 176, 106, 8, 8),
    cover('wreck', 204, 88, 10, 5, 15),
    hedgeLine(206, 122, 244, 122, 1.8),
    cover('crate', 214, 84, 5, 5),
    cover('crate', 232, 70, 4, 4),
    wallLine(238, 58, 238, 84, 1.2),
    cover('crate', 176, 116, 4, 4),
    cover('tree', 120, 120, 4, 4),
    cover('tree', 86, 118, 4.5, 4.5),
    // 蓝队营地前沿
    sandbagLine(138, 56, 150, 56, 2.2),
    cover('barrier', 108, 48, 8, 2, 0),
    cover('barrier', 192, 48, 8, 2, 0),
    cover('wreck', 206, 52, 8, 4, 10),
    // 北岸集镇
    sandbagLine(88, 174, 118, 174, 2.2),
    cover('crate', 84, 204, 4, 4),
    cover('planter', 134, 204, 6, 6),
    cover('planter', 206, 186, 6, 6),
    wallLine(72, 224, 92, 224, 1.2),
    wallLine(206, 178, 238, 178, 1.2),
    cover('wreck', 232, 196, 9, 4, 15),
    cover('crate', 216, 186, 5, 5),
    cover('tree', 236, 242, 4.5, 4.5),
    cover('tree', 256, 262, 4.5, 4.5),
    cover('tree', 72, 244, 4, 4),
    cover('crate', 60, 236, 5, 5),
    cover('wreck', 156, 198, 9, 4, 20),
    cover('sandbag', 166, 232, 12, 2.2, 0),
    cover('planter', 96, 206, 6, 6),
    cover('barrier', 120, 232, 8, 2, 0),
    // 东侧浅滩
    cover('rock', 230, 124, 6, 5),
    hedgeLine(260, 130, 268, 138, 1.8),
    hedgeLine(256, 170, 266, 180, 1.8),
    sandbagLine(256, 128, 268, 128, 2.2),
    cover('wreck', 258, 182, 8, 4, 40),
    cover('tree', 274, 196, 4.5, 4.5),
    cover('barrier', 256, 206, 8, 2, 90),
    // 道路与河岸散兵掩体
    cover('barrier', 96, 104, 8, 2, 90),
    cover('barrier', 214, 112, 8, 2, 0),
    cover('rock', 86, 108, 5, 4, 10),
    hedgeLine(40, 120, 66, 120, 1.8),
    cover('wreck', 82, 96, 8, 4, 35),
    cover('crate', 104, 96, 4, 4),
    cover('tree', 58, 178, 4, 4),
  ],
  props: [
    prop('bridge_gap', 168, 150, { w: 36, d: 24, label: '断口 COLLAPSED SPAN' }),
    prop('tower', 232, 216, { w: 10, d: 10, label: '钟楼' }),
    prop('lamp', 150, 90),
    prop('lamp', 150, 200),
    prop('lamp', 112, 106),
    prop('lamp', 196, 212),
    prop('lamp', 96, 66),
    prop('lamp', 204, 76),
    prop('sign', 126, 118, { w: 6, d: 2 }),
    prop('sign', 136, 182, { w: 6, d: 2 }),
    prop('flag', 150, 24, { team: 'blue' }),
    prop('flag', 150, 280, { team: 'orange' }),
  ],
  capturePoints: [
    { id: 'A', name: '北收费站', x: 105, y: 195, radius: 12, initialOwner: 'neutral' },
    { id: 'B', name: '断桥中心', x: 130, y: 150, radius: 5, initialOwner: 'neutral' },
    { id: 'C', name: '南磨坊', x: 195, y: 105, radius: 12, initialOwner: 'neutral' },
  ],
  spawns: [
    spawn('blue', 118, 18, 64, 34, '南岸农场'),
    spawn('orange', 118, 252, 64, 34, '北岸集镇'),
  ],
  vehiclePads: [
    pad('blue', 'motorcycle', 98, 64, 0),
    pad('blue', 'jeep', 118, 64, 0),
    pad('blue', 'apc', 182, 48, 0),
    pad('blue', 'light_tank', 202, 60, 0),
    pad('orange', 'motorcycle', 98, 250, 180),
    pad('orange', 'jeep', 118, 250, 180),
    pad('orange', 'apc', 182, 250, 180),
    pad('orange', 'light_tank', 202, 250, 180),
  ],
  mgNests: [
    mg(146, 178, 270, '北桥头重机枪'),
    mg(116, 122, 90, '南桥头重机枪'),
  ],
  specialCrates: [
    special('amr', 196, 112, '反器材狙击'),
    special('amr', 172, 190, '反器材狙击'),
    special('rocket', 92, 118, '火箭筒'),
    special('rocket', 236, 170, '火箭筒'),
  ],
  routes: [
    route('blue', '主攻 B', [[150, 56], [146, 88], [136, 116], [130, 146]], 'main'),
    route(
      'blue',
      '西翼 A',
      [[104, 58], [80, 92], [72, 122], [104, 138], [114, 146], [116, 168], [104, 184]],
      'flank',
    ),
    route(
      'blue',
      '浅滩绕后',
      [[176, 58], [204, 74], [226, 98], [240, 124], [244, 150], [248, 176], [226, 196], [206, 202]],
      'flank',
    ),
    route('orange', '主攻 B', [[150, 246], [142, 212], [132, 190], [130, 160]], 'main'),
    route(
      'orange',
      '桥南 C',
      [[132, 236], [126, 206], [126, 178], [126, 158], [122, 138], [120, 116], [140, 106], [166, 104], [186, 106]],
      'flank',
    ),
    route(
      'orange',
      '浅滩 C',
      [[186, 240], [214, 222], [236, 198], [246, 172], [244, 150], [236, 126], [220, 110], [204, 104]],
      'flank',
    ),
  ],
  assetBundle: 'map-broken-bridge',
  tags: ['bridge', 'river', 'rural', 'town', 'highland'],
  gamemodes: ['capture'],
  notes: [
    '河谷水面不可通行；越界 5 秒警告后掉血。',
    '桥面西半幅完整（x110–150），东半幅塌入水中，断口有路障与残骸。',
    '东侧浅滩可步行与载具通过，但速度受限且全程暴露。',
    '西岭 +8 米，上坡只有两条土路；岭顶可俯瞰 B 与北岸镇口。',
    '载具经桥面或浅滩过河，桥宽 40 米，坦克上桥等于送靶。',
    '特殊武器：蓝侧南岸磨坊场院东侧 AMR、橙侧北岸集镇东段 AMR、蓝侧南岸桥西火箭筒、橙侧东侧浅滩北岸火箭筒。',
  ],
};

export default brokenBridge;
