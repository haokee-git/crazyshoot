import type {MapDef} from './types';
import {capture, pad, route, spawn, special, mg} from './helpers';
import {bazaarBuildings,bazaarCovers,bazaarProps,bazaarDecor} from './pharaoh/bazaar';
import {oasisBuildings,oasisCovers,oasisProps,oasisTerrain} from './pharaoh/oasis';
import {serviceBuildings,serviceCovers,serviceProps,serviceTerrain} from './pharaoh/service';
import {pharaohTerrain,pharaohCovers,pharaohProps,pharaohRoutes} from './pharaoh/terrain';
import {pharaohRoads} from './pharaoh/roads';
import {PHARAOH_NAV_LINKS} from './pharaoh/nav-links';
import {sceneTerrain,templeCovers,templeProps,quarryCovers,quarryProps,sceneDecor,scenePads} from './pharaoh/scenes';
import {PHARAOH_LAYOUT, PHARAOH_SIZE} from './pharaoh/layout';

/**
 * 法老坟墓 · PHARAOH'S TOMB · 0.20.3
 *
 * 800×800 非对称七据点图：阶梯金字塔（A）、狮身人面像（B）、A–B 地下墓道、
 * 沙漠集市（C）、绿洲（D）、南部公路与驿站（E）、卡纳克列柱神庙（F）、
 * 帝王谷采石场（G）。地形/建筑/摊位/岩石/车位全部手工定义；
 * enhanceBattlefield 的自动撒掩体在本图关闭。
 *
 * 布局不是旧 1000 m 坐标统一乘 0.8：每个场景按 layout.ts 的新锚点重新落位，
 * 金字塔/狮身保持自己的体量，集市/绿洲/神庙/采石场/驿站分别扩建。
 * 所有道路来自 `pharaoh/network.ts` 的单一数据源，地形整平/铺装/平面图/测试共用。
 */
export const pharaoh:MapDef={
 id:'pharaoh',
 order:5,
 schemaVersion:1,
 name:'法老坟墓',
 nameEn:"PHARAOH'S TOMB",
 size:PHARAOH_SIZE,
 baseTerrain:'sand',
 theme:'埃及 · 热带沙漠 · 考古发掘区',
 summary:'800 米非对称七据点：可登顶的阶梯金字塔、扩大的狮身人面像、A–B 地下墓道、三倍街区面积的沙漠集市、带森林过渡的绿洲、南部公路驿站、卡纳克列柱神庙与帝王谷采石场。地表与地下双层通路，中立载具与自动刷新。',
 asymmetry:'蓝队西南公路基地，橙队东北沙丘营地；A 中立、B/橙近、D/E/蓝近。通过入口数量、掩体密度、地下绕行与载具可达性补偿距离差，不镜像复制建筑。',
 balance:'A 双方等距；B 橙队方向优势但西侧墓道给蓝队潜行路线；C 四向街口与七个街区抵消距离差；D/E 蓝队近，橙队可用南部主轴与中立载具快速转场；F/G 各自两条以上地面通路。',
 terrain:[
  ...pharaohTerrain.filter(p=>p.kind!=='water'),
  ...oasisTerrain.filter(p=>p.kind!=='water'),
  ...serviceTerrain,
  ...sceneTerrain,
  // 水面最后应用（体素生成器跳过 water patch，只在最后按折线补洞）。
  ...oasisTerrain.filter(p=>p.kind==='water'),
  ...pharaohTerrain.filter(p=>p.kind==='water'),
 ],
 roads:pharaohRoads,
 buildings:[...bazaarBuildings,...oasisBuildings,...serviceBuildings],
 covers:[...pharaohCovers,...bazaarCovers,...oasisCovers,...serviceCovers,...templeCovers,...quarryCovers],
 props:[...pharaohProps,...bazaarProps,...oasisProps,...serviceProps,...templeProps,...quarryProps],
 decor:[...bazaarDecor,...sceneDecor],
 capturePoints:[
  capture('A','金字塔墓室',PHARAOH_LAYOUT.A.x,PHARAOH_LAYOUT.A.z,12,5,3),
  capture('B','狮身人面像内殿',PHARAOH_LAYOUT.B.x,PHARAOH_LAYOUT.B.z,11,4,3),
  capture('C','沙漠集市街心',PHARAOH_LAYOUT.C.x,PHARAOH_LAYOUT.C.z,13),
  capture('D','绿洲湖畔',PHARAOH_LAYOUT.D.x,PHARAOH_LAYOUT.D.z,10),
  capture('E','公路驿站',PHARAOH_LAYOUT.E.x,PHARAOH_LAYOUT.E.z,12),
  capture('F','卡纳克列柱神庙',PHARAOH_LAYOUT.F.x,PHARAOH_LAYOUT.F.z,12),
  capture('G','帝王谷采石场',PHARAOH_LAYOUT.G.x,PHARAOH_LAYOUT.G.z,12),
 ],
 scenePads,
 spawns:[
  spawn('blue',25,30,110,110,'西南远征基地'),
  spawn('orange',655,655,110,110,'东北沙丘营地'),
 ],
 vehiclePads:[
  // 蓝队 8：2 摩托 / 2 吉普 / APC / IFV / 轻坦 / MBT
  pad('blue','motorcycle',55,70,20),pad('blue','motorcycle',68,68,15),
  pad('blue','jeep',82,74,10),pad('blue','jeep',102,80,5),
  pad('blue','apc',115,90,0),pad('blue','ifv',120,105,0),
  pad('blue','light_tank',105,120,0),pad('blue','mbt',82,126,0),
  // 橙队 8
  pad('orange','motorcycle',690,745,200),pad('orange','motorcycle',705,748,195),
  pad('orange','jeep',675,735,190),pad('orange','jeep',680,720,185),
  pad('orange','apc',675,700,180),pad('orange','ifv',690,680,180),
  pad('orange','light_tank',715,678,180),pad('orange','mbt',735,688,180),
  // 中立 16：金字塔南前庭 4
  pad('neutral','motorcycle',140,462,0),pad('neutral','motorcycle',155,462,0),
  pad('neutral','jeep',170,462,0),pad('neutral','jeep',185,462,0),
  // 狮身考古营地 3
  pad('neutral','motorcycle',390,590,0),pad('neutral','motorcycle',405,590,0),
  pad('neutral','jeep',420,590,0),
  // 集市东货运院 3
  pad('neutral','motorcycle',620,480,0),pad('neutral','motorcycle',630,480,0),
  pad('neutral','jeep',620,495,0),
  // 绿洲南便道 3
  pad('neutral','motorcycle',200,330,0),pad('neutral','motorcycle',215,330,0),
  pad('neutral','jeep',230,330,0),
  // 公路驿站停车区 3
  pad('neutral','jeep',395,125,0),pad('neutral','jeep',410,125,0),
  pad('neutral','motorcycle',425,125,0),
 ],
 mgNests:[
  mg(315,470,270,'金字塔南前庭重机枪'),
  mg(535,675,180,'狮身东南侧重机枪'),
  mg(650,470,210,'集市东侧重机枪'),
 ],
 specialCrates:[
  special('amr',75,465,'金字塔西侧发掘场'),
  special('amr',520,690,'狮身考古营地'),
  special('rocket',610,500,'集市货运院'),
  special('rocket',245,318,'绿洲南便道'),
  special('flamethrower',395,150,'驿站储油区'),
 ],
 routes:[
  ...pharaohRoutes,
  {team:'blue',label:'蓝队 → F 神庙东侧',points:[[100,140],[250,160],[420,175],[520,205],[610,220],[650,220],[700,240],[720,212],[700,180],[675,160],[650,150]],kind:'flank'},
  {team:'orange',label:'橙队 → F 神庙',points:[[700,670],[720,650],[740,610],[750,550],[758,470],[750,300],[745,270],[735,240],[720,212],[700,180],[675,160],[650,150]]},
  {team:'blue',label:'蓝队 → G 采石场',points:[[100,140],[110,150],[180,170],[240,200],[270,240],[255,275],[210,288],[175,290],[195,320],[220,350],[210,420]],kind:'main'},
  {team:'orange',label:'橙队 → G 采石场',points:[[700,670],[690,690],[660,715],[610,730],[540,745],[450,755],[350,760],[260,760],[190,755],[160,690],[150,620],[140,540],[150,470],[190,478],[210,450],[210,420]],kind:'flank'},
  {team:'blue',label:'蓝队 → C 集市',points:[[100,140],[200,155],[300,160],[380,165],[400,210],[430,260],[455,310],[470,380],[475,395]],kind:'main'},
  {team:'orange',label:'橙队 → C 集市',points:[[700,670],[700,690],[680,700],[650,695],[610,680],[570,660],[535,640],[520,620],[480,580],[470,545],[475,510],[475,395]],kind:'flank'},
 ],

 notes:[
  '金字塔顶/上层廊道/地下墓道不占 A；狮身头部/地下不占 B。',
  'A、B 各至少 3/4 条入口；A–B 墓道有两个中途地表出口。',
  '初始 32 辆载具（双方各 8 + 中立 16），冲出 24m 持续 20s 后 15s 刷新，毁损 45s。',
  '本图不使用 enhanceBattlefield 自动撒掩体。',
  '所有道路进入 PHARAOH_NETWORK，地形整平/铺装/平面图/测试同源。',
 ],
 terrainMaterials:{sand:72,gravel:75,stone:80,dirt:104,mud:105,asphalt:4,rubble:85,concrete:100,grass:96,flowers:97,water:98},
 scoreRate:.5,
 navLinks:PHARAOH_NAV_LINKS,
 assetBundle:'pharaoh-v1',
 tags:['desert','egypt','monuments','underground','800m'],
 gamemodes:['capture'],
 extensions:{
  artStyle:'realistic-pixel-voxel',
  vertical:{minY:-12,height:72},
  navigationLayers:4,
  chunkSize:160,
  captureScoreMultiplier:.5,
  recommendedPlayers:[8,12],
  matchSeconds:1200,
  minimumPlayers:4,
 },
};
