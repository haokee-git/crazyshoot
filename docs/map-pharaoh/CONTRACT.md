> **历史文档（0.19–0.20.2 时代）：以下内容含旧 1000 m/五据点数据，已被 0.20.3 取代。当前事实见 [README.md](README.md) 与 [ACCEPTANCE-0.20.3.md](ACCEPTANCE-0.20.3.md)。**

# CRAZYSHOOT · 法老坟墓（pharaoh）实施契约 v1

> 所有子任务共享本文件。**坐标、层高、材质 ID、文件所有权以本契约为准**。发现契约不可行时先通知 Lead，不得各自改口径。

## 1. 目标与硬约束

- 新地图 `pharaoh`：1000×1000 m，五个据点 A–E，地表 + 地下双层通路，正式 `game.html` 可玩。
- 世界同源：渲染、碰撞、支撑、导航、子弹 DDA 全部来自同一份 `TerrainData`（体素 + `detailBoxes`）。
- 房主权威：载具生成/刷新/伤害/占点只在 host。
- 既有四图 + 训练场零回归。
- 视觉与性能都要真实：不能以“地图大”为由放弃优化；最终报告用真实采样。
- **本图不使用 `enhanceBattlefield()` 的自动撒掩体**；主要建筑/掩体/摊位/岩石/载具点手工定义。
- 垂直范围仅本图：`minY=-12`、`height=72`（y ∈ [-12, 60)）；最高实体 ≤ +58。
- 版本：`0.19.0`，`MAP_REVISION='voxel-halfgrid-v9'`，`MATERIAL_REVISION=5`。

## 2. 坐标与基准高度

世界：x 向东，z 向北；MapDef 的 `y` 字段 = 世界 z。可玩范围 0..1000。

| 区域 | 中心 | 基准地面 | 说明 |
|---|---:|---:|---|
| 蓝队出生 | (90,110) | **+2.4** | 110×110，公路南侧远征基地 |
| 橙队出生 | (905,895) | **+12.0** | 110×110，东北沙丘后营地 |
| A 金字塔墓室 | (330,690) | 平台 **+4.0**，墓室地面 **+5.0** | 基座 132×132，顶 **+52.0** |
| B 狮身人面像内殿 | (610,650) | 平台 **+4.0**，内殿地面 **+4.0** | 全长 110–116，宽 40–44，头顶 **+33** |
| C 集市街心 | (700,385) | **+6.5** | 范围约 190×170 |
| D 绿洲湖畔 | (235,320) | **+0.6** | 湖面 **-2.0**，湖底最低 **-6.0** |
| E 公路驿站 | (560,145) | **+3.2** | 服务区约 100×70，公路北侧 |

- A/B 平台、C/D/E 点由高度函数做自然整平掩膜（不能出现圆形平台硬边）；生成器还会做一次建筑/车位/出生区/据点整平。
- 金字塔/狮身人面像体量由专用 builder 从平台顶开始堆，不依赖 `buildings`。
- 湖面 -2，水体材质使用新的 `water_shallow`（id 98）。
- 公路主路宽 10 m，两侧 3–5 m 沙砾路肩；主路纵坡 ≤5%。公路控制点见 `src/maps/pharaoh/roads.ts`。

## 3. 文件所有权（禁止越界）

| 范围 | Owner | 文件 |
|---|---|---|
| 系统/世界核心 | Lead | `src/maps/types.ts`、`src/maps/battlefield-design.ts`、`src/maps/index.ts`、`src/maps/pharaoh.ts`、`src/game/world/voxel-map-data.ts`、`src/game/world/map-arena.ts`、`src/game/world/arena.ts`、`src/game/main.tsx`、`src/version.ts`、`vite.config.ts`、`package.json`、`src/game/world/pharaoh-structures.ts`、`src/maps/pharaoh/landmarks.ts` |
| 地形 | terrain | `src/maps/pharaoh-height.ts`、`src/maps/pharaoh/terrain.ts`、`src/maps/pharaoh/roads.ts` |
| 集市 | bazaar | `src/maps/pharaoh/bazaar.ts` |
| 绿洲+驿站 | oasis-service | `src/maps/pharaoh/oasis.ts`、`src/maps/pharaoh/service.ts` |
| 金字塔 | pyramid | `src/game/world/pharaoh-pyramid.ts` |
| 狮身人面像 | sphinx | `src/game/world/pharaoh-sphinx.ts` |
| 地下墓道 | tunnel | `src/game/world/pharaoh-tunnel.ts` |
| 引擎/HUD/载具刷新 | engine | `src/game/engine.ts`、`src/game/ui/hud.tsx`、`src/game/ui/game.css`、`src/game/vehicles/spawn-manager.ts`、`tests/vehicle-spawn-manager.test.ts` |
| 材质/资源 | materials | `src/content/materials/pharaoh.ts`、`src/content/materials/battlefield.ts`、`src/game/core/loading.ts`、`src/game/world/voxel-map-render.ts`、`src/game/world/pharaoh-decor.ts`、`public/textures/pharaoh-v1/**`、`tools/maps/pharaoh-textures.py`、`tests/material-assets.test.ts`、`tests/pharaoh-assets.test.ts` |
| 验收测试 | qa | `tests/pharaoh-map.test.ts`、`tests/pharaoh-*.test.ts`、`tools/game/audit/pharaoh-walk.ts` |
| 平面图 | plans | `tools/maps/pharaoh-plans.ts`、`docs/map-pharaoh/plans/**` |
| 截图/性能 | audit | `tools/game/audit/pharaoh-capture.ts`、`tools/game/audit/pharaoh-performance.ts`、`docs/map-pharaoh/render/**`、`docs/audit-2026-11-10/pharaoh-*` |
| 文档 | Lead | `docs/map-pharaoh/**`（除 plans/render 子目录） |

> 需要改别人的文件时：先在共享任务里说明，等 Owner 确认；**不要并发改同一文件**。

## 4. 世界生成扩展（Lead 提供，teammate 按此编码）

### 4.1 高度函数

`src/maps/pharaoh-height.ts` 导出：

```ts
export function pharaohHeight(x:number,z:number):number;
export interface PharaohRoadSpec {id:string;points:[number,number][];width:number;kind:'main'|'secondary'|'path'|'shoulder';elevations?:number[];}
export const PHARAOH_ROADS:PharaohRoadSpec[];       // 主路 + 支路（地形整平与 MapDef 共用）
export const PHARAOH_WATER_POLYGONS:[number,number][][]; // 与湖面/湿地一致
export function pharaohWaterSurface(x:number,z:number):boolean; // 预测水覆盖（测试用）
```

- `battlefieldHeight('pharaoh',x,z)` 直接委托 `pharaohHeight`。
- 高度函数必须自己保证：出生区、A/B 平台、C/D/E、建筑/车位附近是自然整平（生成器还会兜底 pad 整平）。
- 公路整平必须按 `PHARAOH_ROADS` 的折线 + 高程剖面做平滑混合，主路纵坡 ≤5%。
- 不要逐格高频随机；用低频各向异性沙丘 + domain warp + 少量手工大沙丘。
- 普通沙地 0–6，大沙丘脊 12–22；最高自然地形 ≤22。金字塔/狮身人面像体量由 builder 叠加。

### 4.2 材质覆盖

`MapDef.terrainMaterials?: Partial<Record<TerrainKind, number>>`。生成器用它把 terrain patch / baseTerrain / 道路替换成新材质。法老图建议：

```
sand:72, gravel:75, stone:80, dirt:77, mud:78, asphalt:79, rubble:85, concrete:100
```

道路材质由 `RoadKind` 决定：`main/secondary/path → asphalt override`，`shoulder → gravel override`；主路中线仍是 WHITE。

### 4.3 结构 builder 接口

`src/game/world/pharaoh-structures.ts`（Lead 写 orchestrator）导出：

```ts
export interface PharaohOps {
  ground(x:number,z:number):number;                 // 地形表面高度（整数）
  put(x:number,y:number,z:number,id:number):void;
  column(x:number,z:number,y0:number,y1:number,id:number):void;   // [y0,y1)
  box(x0:number,z0:number,x1:number,z1:number,y0:number,y1:number,id:number):void; // [x0,x1)
  carve(x0:number,z0:number,x1:number,z1:number,y0:number,y1:number):void;         // AIR
  detail(id:string,cx:number,cz:number,w:number,d:number,y:number,h:number,
         material:number,angle?:number,solid?:boolean):void;     // 0.5 m 栅格
  setPrimary(x:number,z:number,y:number):void;       // 载具/导航第一层地面
  addLamp(x:number,y:number,z:number):void;          // 静态发光点（不建动态灯）
}
export function buildPharaohStructures(map:MapDef,ops:PharaohOps):void;
```

子 builder：

```ts
// src/game/world/pharaoh-pyramid.ts
export function buildPyramid(ops:PharaohOps):void;
// src/game/world/pharaoh-sphinx.ts
export function buildSphinx(ops:PharaohOps):void;
// src/game/world/pharaoh-tunnel.ts
export function buildTunnel(ops:PharaohOps):void;
```

- builder 内的所有体素/0.5 m 细节都同时进入渲染 + 碰撞 + 支撑；`solid:false` 的 detail 只渲染不碰撞（草/帘子/装饰）。
- `primary` 只用于载具/导航第一层：金字塔/狮身人面像整体保持平台高度（+4），确保载具不能爬；**墓道内部**把 primary 设到墓道地面（允许摩托进入），墓道顶部地表仍由 `heights`/support 提供。
- 楼梯每级 ≤1.0 m（玩家 MAX_STEP=1.05）；金字塔外表面用 2 m 台坎（>1.05）保证玩家只能走楼梯。
- 所有门洞净空真实：主通道 ≥4 m 宽，支路 ≥2.5–3 m；A/B 各至少 3/4 个入口。
- builder 不要改 `heights`；只写 voxels / detailBoxes / primary / lamps。
- 石材建议：金字塔 80/81/82/85/86；狮身 80/81/83/85；墓道 81/82/84/86；广场 75/80/100。

### 4.4 结构坐标

**金字塔**：中心 (330,690)，基座 132×132（x 264..396，z 624..756），平台 +4，顶 +52（12×12 平台）。2m 台坎外壳，内部填实后挖空：
- 墓室 32×26，x 314..346，z 677..703，地面 +5，净高 8–10。
- 南主门 6×4 在 z=624 一侧，通道到墓室；西入口 4×3.5（x=264）；东入口 4×3.5（x=396）。
- 南前厅、西陶罐储藏、东盗洞/塌陷、北雕像廊、上层侧廊 +20、内部竖梯/楼梯通顶。
- 西南破损面考古阶梯：沿 SW 棱线 (264,624)→(330,690) 外侧，3 m 宽，0.5 m 级高，3 个休息平台，直达顶。
- 北侧施工栈道：北面 (264,756)→(330,690) 或 (330,756) 上行到 +20 门，进上层廊道，再内部楼梯到顶。
- 顶部 12×12，不设据点/特武/载具；低矮残缺女儿墙，不形成堡垒。

**狮身人面像**：中心 (610,650)，面向 +x；x 555..672，z 630..670，平台 +4，头顶 +33。体量：
- x 555..615 后部/臀部 + 后腿；x 615..650 胸/前腿；x 650..665 头颈；x 650..672 双前爪（z 636..644、656..664）。
- 胸直立到 +24；头 +27..33；nemes 头巾向两侧下垂到 +20；尾部残座。
- B 内殿 28×18，x 596..624，z 641..659，地面 +4，净高 ~8；中央低祭台 + 残柱；前后环路。
- 入口：西后侧（接墓道）、北侧坡道、南侧塌陷口、东侧双爪之间；胸部楼梯通头部小室（+28..32，观察口少）。
- 车辆不得进入内殿（真实石墩/窄门/台阶）。

**A–B 墓道**：建议 (396,680)→(440,620)→(505,615)→(552,650)；主宽 4.5–5，净高 3.5；地面从 +5 缓降到约 +1，再升到 B +4。
- 至少一个前室、一个塌陷大厅、一条短支路；在 (445,622)、(505,625) 附近两个地表出口（真实楼梯/坡道）。
- 隧道内每 30–40 m 放 2 个石墩，留 1.6 m 净宽：摩托（0.8 + 规划 margin 0.7）可过，吉普/坦克不可。
- 出口外有岩石/矮墙/沙丘背坡保护。
- 地下与湖体不连通；`primary` 设为墓道地面。
- 静态灯：`addLamp`，低对比暖光；约 15–20 个。

**集市**：中心 (700,385)，约 190×170（x 605..795，z 300..470）。26–32 栋可进入建筑，5 个不规则组团；主街 8–10 m，支巷 3–5 m；高度 4–10 m，部分二层；平屋顶 + 少量穹顶/拱廊/木阳台/风塔。C 点 (700,385) r13，街心小广场：浅井/低石台 + 摊位环 + ≥4 条通道 + 东南沙袋。18–24 个手工摊位（陶器/香料/染布/茶馆/修车/果蔬）。
**绿洲**：D (235,320) r10，东北岸，地面 +0.6；湖心 (190,275)，不规则 120×90，水面 -2，湖底 -6；≥6 个出水点；44–58 棵棕榈/金合欢，70–100 组草/芦苇/灌木；小水泵房、木栈桥、取水台。
**驿站**：E (560,145) r12，公路北侧约 100×70；加油棚 24×16、四加油岛、服务房 22×14、维修库 24×18、餐馆/休息室、水塔、轮胎堆、停车区、储油罐在外侧；载具可绕场但不能冲进所有室内。

## 5. 材质契约（32 图案 / 96 PNG）

新增 30 个体素材质 + 2 个装饰图集，全部放在 `public/textures/pharaoh-v1/{32,64,128}/<name>.png`，manifest 同目录。**现有材质 ID 不变**。

| ID | name | 类别 | 用途 |
|---:|---|---|---|
| 72 | sand_fine | 沙漠地表 | 细沙 base |
| 73 | sand_ripple | 沙漠地表 | 风纹沙 |
| 74 | sand_compact | 沙漠地表 | 压实沙/道路肩 |
| 75 | sand_gravel | 沙漠地表 | 沙砾/路肩 |
| 76 | limestone_dust | 沙漠地表 | 石灰岩尘 |
| 77 | earth_cracked | 沙漠地表 | 干裂土 |
| 78 | mud_wet | 沙漠地表 | 湖岸湿泥 |
| 79 | asphalt_buried | 沙漠地表 | 沙埋沥青 |
| 80 | limestone_shell | 古迹 | 金字塔外壳 |
| 81 | sandstone_block | 古迹 | 砂岩砌块 |
| 82 | rock_strata | 古迹 | 层理岩 |
| 83 | granite_dark | 古迹 | 花岗岩 |
| 84 | tomb_plaster | 古迹 | 墓室旧灰泥 |
| 85 | relief_fragment | 古迹 | 浮雕残片 |
| 86 | stone_soot | 古迹 | 烟熏石面 |
| 87 | mudbrick | 集市 | 泥砖 |
| 88 | plaster_ochre | 集市 | 赭色泥灰 |
| 89 | plaster_white_old | 集市 | 旧白灰泥 |
| 90 | palm_wood | 集市 | 棕榈木 |
| 91 | terracotta | 集市 | 陶土 |
| 92 | basket_weave | 集市 | 编织篮纹 |
| 93 | metal_faded | 集市 | 褪色金属 |
| 94 | palm_bark | 绿洲 | 棕榈树皮 |
| 95 | palm_leaf | 绿洲 | 棕榈叶 |
| 96 | reed_grass | 绿洲 | 芦苇草 |
| 97 | oasis_soil | 绿洲 | 绿洲湿土 |
| 98 | water_shallow | 绿洲 | 浅水（水材质，必须进 isWaterMaterial） |
| 99 | enamel_sun | 驿站 | 晒旧搪瓷 |
| 100 | pavement_oil | 驿站 | 油污路面 |
| 101 | rubber_worn | 驿站 | 橡胶/旧工业面 |

装饰图集（不属于体素材质，无 BLOCK id）：

- `atlas_cloth_signs`：布匹/遮阳布/招牌（集市摊位、拱廊）
- `atlas_murals_objects`：壁画/小物件（墓室、内殿）

要求：
- 每个 32/64/128 真实 PNG；32 原生像素网格，64/128 保留细节；普通材质 12–24 色（≤24）；无缝（periodic）；无文字/水印/整物体。
- manifest 字段：`version, generator, textures:[{name,family,palette,paletteColors,average,nativeGrid,files:{32,64,128},source,masterSha256,atlas?}]`。
- 其他四图不得下载 pharaoh 资源；`preloadWorld` 只在 `map.assetBundle==='pharaoh-v1'` 时加载 pharaoh bundle。
- `voxelMaterials` 只加载本图实际用到的材质名（从 chunks/detailBoxes 统计），不得把 30 个新材质加到所有地图。
- 每张可平铺材质必须生成 2×2 拼接图、50% offset 接缝图、contact sheet；人工/多模态检查。

## 6. 占点 / HUD / 载具契约

- `CapturePoint` 新增 `floorY?`、`verticalTolerance?`。A/B 设置 floorY 5/4、tolerance 3；C/D/E 不设，沿用旧“脚下地面”行为。
- `HudState` 用 `captures: {id,owner,progress}[]` 替代 captureA/B/C；旧三图只显示 3 个，不出现空白 D/E。
- 本图 `scoreRate=0.6`（每点 0.72 分/秒）；只对本图生效。
- `VehiclePad.team` 允许 `'neutral'`；载具状态、HUD、小地图、上下车都要支持。
- 初始 32 辆：每队 2 摩托/2 吉普/1 APC/1 IFV/1 轻坦/1 MBT；中立 16 辆（金字塔西 4、狮身营地 3、集市东 3、绿洲南 3、驿站 3）。
- 刷新管理器（host only）：离开 24 m 持续 20 s → 15 s 倒计时；返回 24 m 取消；毁损 45 s；占用每 2 s 重试；最多 40 未摧毁；每车位最多 1 个排队；新车上位旧车解绑；新一局清动态车并恢复 32；客机只收快照/主机消息，不自行生成。
- 车位状态进 HudState（可用/刷新中/被占用），小地图/整备页至少能区分。

## 7. 视觉/性能验收

- 真实 `game.html` 截图：全图斜俯视 1；金字塔 5；狮身 4；墓道+中途出口；集市 4；绿洲 3；公路/驿站 4；双方基地各 1；材质 contact sheet + 2×2。
- 每图记录 BUILD_ID、相机坐标/朝向、画质、贴图分辨率。
- 性能：M5 Pro + headless Chromium 真实采样；4× CPU 节流参考；报告 draw calls / 三角形 / sim p95 / Worker 构建 / heap / GPU 对象。不声称低端机通过。
- 地形 chunk 128 m（可在基准后调整）；detail 几何合并进 terrain chunk；远景载具距离裁剪；植被 detail `solid:false` 不参与碰撞。

## 8. 共享命令

```bash
npm run build
npm test
npm run test:water
npm run test:vehicles
npm run test:audit
BENCH_MAP=pharaoh BENCH_SIZE=8 npm run test:performance
BENCH_MAP=pharaoh BENCH_SIZE=12 npm run test:performance
```

开发服务器：`npm run dev -- --host 127.0.0.1 --port 5174`；截图/审计脚本默认 5174。
