# 千户苗寨 · QIANHU MIAO VILLAGE · 交付报告

- 版本：`0.21.0`；`BUILD_ID=5a8e0374078786c2`（`dist/version.json`）
- 世界 revision：`MAP_REVISION=voxel-halfgrid-v14`
- 材质 revision：`MATERIAL_REVISION=8`
- 地图 id：`miao_village` / order **6** / size **500×500** / `assetBundle=miao-v1`
- 默认比赛：**1200 s（20 分钟）**，仅本图；`scoreRate=0.18`
- 生成日期：2026-11-18

> 结论：地图已注册、可加载、可联机、可通过 5 个据点与 20 分钟计分完成一局；138 栋建筑、三桥、两渡船、多高度水域、导航、Bot、载具、材质包与审计均已落地。**平衡性未经真人对抗验证，报告明确标注“平衡待真人调优”**；性能有一项超出典型预算、渡船双客户端乘客携带有一项未稳定复现，均列在 §14，不做隐瞒。

---

## 1. 实现范围与文件清单

### 新增（核心）

| 路径 | 作用 |
|---|---|
| `src/maps/miao-village.ts` | MapDef 汇总与注册（500 m、5 点、12 车、3 特武、扩展字段） |
| `src/maps/miao-village/river.ts` | 白水河控制点/单调插值、岸线、桥/渡船锚点、8+1 梯子、4 个渡船坞 |
| `src/maps/miao-village/height-base.ts` | 河谷/山体/盆地解析基础场 |
| `src/maps/miao-village/height.ts` | 1 m 预计算地形场：建筑台地、道路、河槽、桥头/渡船坞/梯田整平 |
| `src/maps/miao-village/network.ts` | 外环、横街、滨河、寨边、田间道路与坡度数据 |
| `src/maps/miao-village/layout.ts` | 138 栋 authored plot catalog、据点、出生区、车位、特武、LoS 锚点、routes |
| `src/maps/miao-village/props.ts` | 市集/田园/猪场/祭祀/剧场/植被/装饰 atlas 平面 |
| `src/maps/miao-village/coverage.ts` | 0.5 m 可达性 BFS + union 面积统计 |
| `src/game/world/miao-village-structures.ts` | 同源体素/半格生成：吊脚楼、棚舍、鼓藏堂、剧场、桥、堤岸、梯子、梯田、渡船坞、出生墙 |
| `src/game/world/miao-village-decor.ts` | 低模猪群（4 InstancedMesh，环境动作） |
| `src/game/world/map-structures.ts` | 通用手工地图世界 builder 注册表 |
| `src/game/world/capture-rules.ts` | 唯一的占点谓词（圆 ∩ footprint + floorY/垂直容差） |
| `src/game/mechanisms/river-ferry.ts` | 权威缆索渡船状态机/序列化/复位（纯逻辑） |
| `src/game/mechanisms/ferry-visual.ts` | 渡船甲板/船舷/栏杆/缆索表现 |
| `src/game/core/asset-bundles.ts` | 通用地图资源包注册表（pharaoh-v1 / miao-v1） |
| `src/content/materials/miao-village.ts` | 32 个体素材质 + 4 atlas、manifest、URL、颜色变体 |
| `tools/maps/miao-village-textures.py` | 原创程序化 32/64/128 PNG + manifest + 接缝/tile 证据 |
| `tools/maps/miao-village-coverage.ts` | 可重复 coverage 报告 |

### 新增（测试/审计）

- `tests/miao-village.test.ts`（16 项）：注册/计数/布局/河流/桥/梯子/水面/出生 LoS/coverage/C 谓词。
- `tests/miao-walk.test.ts`（9 项）：112 主楼逐门逐层逐梯、26 棚舍、鼓藏堂、9 梯上下、三桥步行、APC 双向、摩托/APC 中央廊桥、出生门、导航全连通。
- `tests/miao-assets.test.ts`（5 项）：32+4 材质、三档 PNG、palette/average/hash/seam、资源包隔离。
- `tests/river-ferry.test.ts`（6 项）：状态机、8 s/2 s/16 s、不倒转、呼叫、复位、快照。
- `tests/miao-scoring.test.ts`（5 项）：0.18、1200 s、0.216/0.432/0.54/0.648/1.08、1157 s/926 s 示例。
- `docs/map-miao-village/audit/*`：浏览器性能、生命周期、双客户端渡船 JSON 与截图。

### 修改（通用能力，不影响旧图数据）

`src/maps/types.ts`（Capture footprint、WaterVolume）、`src/maps/index.ts`（注册 order6）、`src/maps/battlefield-design.ts`（vertical/heightClamp/navigationStep/exposure/雾/动态载具）、`src/game/world/voxel-map-data.ts`（builder 注册表、多高度水域、vertical maxBuildTop、miao 填充材质、thin detail 最小半格）、`voxel-world-queries.ts`（volumeSurface/volumeBed、support columnTop 快路径）、`terrain-worker.ts`（nav step/maxSupportY/volume 转移）、`map-arena.ts`（footprint、渡船数据、曝光、miao minimap）、`arena.ts`（ferry/updateAmbient/nav step/exposure）、`pharaoh-decor.ts`（miao atlas + unlit）、`engine.ts`（C footprint、渡船 host 状态机/快照/交互/平台携带/清理、auditPerf/auditView/auditLighting）、`loading.ts`（bundle registry）、`battlefield.ts`（BLOCK_TEXTURES/MATERIAL_RECORDS/materialUrl/isWaterMaterial 135）、`controller.ts`（platform `manualCarry`）、`spawn-manager.ts`（按载具类型刷新时间）、`src/version.ts`/`vite.config.ts`/`package.json`、`src/ui/App.tsx`、`AGENTS.md`。
旧四图测试契约仍全量通过；`building-interiors` 只排除有 authored interior 系统的苗寨（由 `miao-walk` 更强地覆盖），旧图断言未放宽。

---

## 2. 地图摘要

| 项目 | 值 |
|---|---|
| 尺寸 | 500×500 m（x 东、z 北；主体 0…500） |
| 垂直 | `minY=-8`，height=108，可站最高 88；`heightClamp [-8,88]` |
| 导航 | 5 层，chunkSize 100，nav step 4 |
| 默认天空 | `morning`（雨后晨光/薄雾/柔和暖太阳/冷灰山体） |
| 雾 | `#a7b6b2`，density 0.00165；camera far 900 |
| 地图 | A(150,170) y5、B(335,150) y4、C(244,250) floorY3、D(155,365) y16、E(365,325) floorY9 |
| 出生 | 蓝 rect x48–112 / z48–104（中心 80,76）；橙 rect x384–448 / z396–452（中心 416,424） |
| 桥 | 南 z112 x202–254 y3.2；中央 z250 x210–278 y3.0；北 z392 x236–292 y4.0 |
| 渡船 | 南 z205 x212/252；北 z335 x246/286；甲板 y=-1.15，5×6 m |
| 水域 | 主河 surface -2；14 块梯田 surface=level+0.28；4 个渡船坞 |
| 车位 | 12（蓝 4 / 橙 4 / 中立 4），只有摩托/吉普/APC |
| 特武 | B RPG、D RPG、芦笙场喷火器；无 AMR、无 MG |
| 建筑 | 138 栋（112 主楼 + 26 棚舍），计数见 §4 |

### 出生区与 LoS

- 蓝队 64×56 m 石铺营地，三个门：北 x80、东 z80、南 x60；橙队 64×56 m 坡地营地，三个门：南 x407、西 z400、东 z430。
- 两侧营地有真实 4.5 m 石墙/木瓦墙（橙队南/西 8 m、北 12 m 的挡土墙），门洞为 4 m 高隧道，门内两道错位 4.4 m 挡板（dog-leg），门洞真实可走（nav + 单测）。
- 用 99 个 authored 视点（5 据点、4 个三层窗、全部阳台、鼓藏堂/剧场/桥亭）对 50 个出生内部采样点做射线：**0 条直接视线**（`tests/miao-village.test.ts`）。不使用隐形墙。

---

## 3. 可活动面积（覆盖统计）

方法（`src/maps/miao-village/coverage.ts`）：

- 0.5 m 栅格，共 1000×1000 小区；
- 从双方出生区四邻 BFS，单步高差 ≤1.05 m（引擎 `MAX_STEP`），排除高差过大的纯装饰山体（高度 >40 m 的陡坡）；
- 陆地按地形顶面计；室内只按底层投影计一次（138 栋 footprint union）；桥面按真实 deck 矩形；水域按 `waterVolumes` 的 surfaceY（河流/梯田/渡船坞）；
- 同一水平位置只计一次，不累加楼层；排除不可达悬崖、地图外、屋顶。

实测（0.5 m，`docs/map-miao-village/plans/coverage.json`）：

| 项 | 面积 |
|---|---:|
| 总图 | 250,000 ㎡ |
| **可活动 union** | **176,267 ㎡ · 70.5%** |
| 陆地 | 162,588 ㎡ |
| 水面 | 13,350 ㎡ |
| 室内底层投影 | 11,243 ㎡ |
| 桥面 | 1,618 ㎡ |
| A 游方市集 | 12,737 ㎡ (5.1%) |
| B 田园打谷场 | 22,384 ㎡ (9.0%) |
| C 河岸与芦笙场 | 20,287 ㎡ (8.1%) |
| D 鼓藏堂坡地 | 19,825 ㎡ (7.9%) |
| E 剧场片区 | 15,600 ㎡ (6.2%) |
| 寨边/外围 | 85,434 ㎡ (34.2%) |

`playablePct=70.5`，落在 68–72% 目标区间。重复命令：`npx tsx tools/maps/miao-village-coverage.ts`。

---

## 4. 建筑

### 计数（`MIAO_BUILDING_COUNTS` + 单测）

| 分区 | 主楼 | 双层 | 单层 | 三层 | 棚舍 |
|---|---:|---:|---:|---:|---:|
| A 游方市集 | 30 | 24 | 5 | 1 | 6 |
| B 田园打谷场 | 10 | 6 | 4 | 0 | 10 |
| C 河岸与芦笙场 | 18 | 14 | 3 | 1 | 4 |
| D 鼓藏堂坡地 | 28 | 22 | 5 | 1 | 3 |
| E 剧场片区 | 16 | 12 | 3 | 1 | 2 |
| 寨边独栋 | 10 | 6 | 4 | 0 | 1 |
| **合计** | **112** | **84** | **24** | **4** | **26** |

总计 **138**。每栋 plot 有稳定 id、分区、中心/yaw、面阔/进深、层数、baseY、屋顶、室内类型、门/窗/阳台/楼梯、吊脚/出口配置，保存在 `layout.ts`（不是只剩最终体素）。

### 户型与真实结构

- 民宅 10–14 m 面阔 / 8–11 m 进深；楼面 base+1 / +5 / +9；檐口 base+5 / +9 / +13；0.5 m 踏步楼梯；门净宽 1.3–1.7 m、净高 2.2–2.4 m；窗洞 1.3–1.4 × 1.5–1.6 m（真实半格洞，窗台 0.9 m）。
- 双层主楼 **18–20 个真实窗洞**（目标 18–26），三层 27；窗框/窗台为真实实体，细木棂为 `solid:false` 装饰（报告中明确不宣称逐根碰撞）。
- 每栋双层有前门 + 侧门两个地面出口、两跑/三跑楼梯；三层使用后墙第一跑 + 前墙第二跑的错层楼梯，避免第二跑压住第一跑净高。
- 阳台有真实挑出楼板、支撑、栏杆、美人靠；阳台门与窗分开；屋顶为阶梯式坡屋顶、出檐 1.25 m，公共建筑重檐。
- 鼓藏堂 24×14 m 木构、石台基、双檐、6 m 前排开口、铜鼓/长凳，不提供 Buff、不可摧毁。
- 棚舍/猪棚有真实前开口，内部储物；不把家具/楼梯出口堵死。

### 验收

`tests/miao-walk.test.ts` 用正式 `buildVoxelMapData` + `VoxelWorldQueries` + `PlayerController`：

- 112 主楼逐栋：中心落地、每层支撑、前/侧门洞（在门槛以上 1.8 m 身体通过）、每级楼梯**实走**到上层、阳台支撑/栏杆、窗洞真实且不堵；
- 26 棚舍前开口 + 屋顶；
- 鼓藏堂楼面/前开口；
- 逐项输出问题列表，测试断言为空。所有 112 栋楼梯、门、窗均通过（`485 tests` 全绿的一部分）。

---

## 5. 河流、水域、桥梁、梯子

### 数据源

`src/maps/miao-village/river.ts`：给定 10 个 `(z, 中心x, 半宽)` 控制点，Fritsch–Carlson 单调三次插值（C1，不过冲）。`riverAt(z)` 同时给出河槽、towpath、挡土墙、街面标高；地形、水、桥、梯子、渡船、导航、测试共用。控制点半宽 10–13，河宽 20–26 m。

### 水域

- 主河 surfaceY `-2`，河床 -3.6…-4.8；`WaterVolume(kind='river', swim=true)`。
- 14 块梯田各自 `surfaceY=levelY+0.28`、`bedY=levelY`（0.28 m 浅水，`swim=false`）；渲染为 detail 水薄板 + 泥面 + 田埂/稻秧；查询读 `volumeSurface/volumeBed`，不套用 -2。
- 4 个渡船坞 surface -2、bed -3.6；5 m 甲板停 -1.15，不埋进街面。
- `npm run test:water` 结果：miao **waterBlocks 28,773 / openFaces 0 / leaks [] / navigable 10,996 / missingExit 0 / traps [] / escapeTrials 32 / escapeFailures []**。

### 桥梁

| 桥 | 数据 | 通行 | 验收 |
|---|---|---|---|
| 南桥 | z112 x202–254，宽9，deck3.2 | APC/吉普单行；双向 | `miao-walk` APC 双向实走 |
| 中央风雨廊桥 | z250 x210–278，宽8，deck3.0 | 步兵/摩托；桥头石墩净宽约 2.0 m，APC 被真实石墩挡住 | 摩托实走通过；APC 实走被挡；桥内 68 m 长廊/窗洞/长椅/双檐/桥亭 |
| 北桥 | z392 x236–292，宽9，deck4.0 | APC/吉普单行；双向 | `miao-walk` APC 双向实走 |

桥头/桥面陆地用 `height.ts` 的最后桥面 pad 整平到 deckY（只改陆地，不填河床），车辆才能从引道开上桥；桥体 deck 的 `primary` 已写入，支撑/导航/子弹同源。

### 梯子

- 8 架河岸梯：z=150/230/315/372（北桥 z387.5–396.5 覆盖 z390，故第四对放在桥南侧 z372，报告中说明）两岸各一；`bottom=-1.4`（towpath -1.2），顶部为实际街面 `quayStreetY`，出口在墙后 1.6 m。
- 中央廊桥南侧下水梯 1 架：towpath ↔ 桥面 3.0 m。
- 共 9 架；`tests/miao-walk.test.ts` 逐架上下（PlayerController），顶部/底部有真实站立空间；`tests/miao-village.test.ts` 校验出口支撑。

---

## 6. 道路、导航、Bot

- 道路全部 `markings:false`，只用 `stone/dirt/gravel`；**无 asphalt、无白色交通虚线、无斑马线**（测试断言 MapDef 与 terrain patch）。
- 主环：蓝队 → A → 南桥西 → 南桥东 → B → E 外侧 → 北桥东 → 北桥西 → D → 西岸坡地 → A；橙队有三条接入（E、北桥、B）。
- 主车道宽 6.5–8 m，主线最大纵坡 ≤12%（`maxRoadGrade` 测试）；D 用 z 字形盘山路。
- `tests/miao-walk.test.ts` 用正式 `Navigation`（step4，5 层，maxSupportY 100）验证：双方出生、5 点、6 个出生门全部互相可达；Bot 走静态桥，不依赖渡船。
- 导航与渲染/碰撞/支撑共用 `VoxelWorldQueries`；未另造碰撞清单。
- Bot 目标权重在 `miaoVillage.routes` 提供 A/B/C/D/E 多路；本报告只做静态图与可达性，**未做多轮 8v8 Bot 长时统计**（见 §14）。

---

## 7. 据点与 20 分钟计分

所有 `initialOwner='neutral'`；引擎 CapState 初始化仍 neutral，不覆盖地图。

- **C** 使用 `capturePointAllows`：圆半径 10.5 ∩ footprint `x212–276,z246.2–253.8` + `floorY=3`、tol1.2。水面/towpath/屋顶/桥外道路均 false；桥面 240,250 为 true；A 的 y9 楼层不能隔空占 A。单测覆盖。
- **E** `floorY=9`、tol1.2：舞台面 11.5 m 不能占点。
- 公式（源码 `updateCapture`）：`scorePerSecond = 1.2 × scoreRate × ownedCaps`，`scoreRate=0.18`：

| 点数 | 分/秒 | 20min 理论 |
|---:|---:|---:|
| 1 | 0.216 | 259.2 |
| 2 | 0.432 | 518.4 |
| 2.5 | 0.540 | 648 |
| 3 | 0.648 | 777.6 |
| 5 | 1.080 | 1,296（先到 1000） |

- 击杀团队 +5；胜利 1000；中立占满 8 s、完整翻盘 16 s（引擎常数未改）。
- 3 点 + 50 击杀：(1000−250)/0.648 ≈ **1157 s ≈ 19.3 min**；5 点无击杀：1000/1.08 ≈ **926 s ≈ 15.4 min**；3 点 + 40 击杀 ≈ 1234 s > 1200 → 进入时限判定。`tests/miao-scoring.test.ts` 覆盖。
- 房主自定义时长仍有效；`matchSecondsForMap('miao_village')=1200`，普通图仍 600。

---

## 8. 缆索渡船（新玩法）

### 状态机

`FerrySystem`：`dockedWest/dockedEast → countdownWest/East (2 s) → movingEast/West (40 m / 2.5 m/s = 16 s) → 到岸 dwell 8 s → 自动折返`。移动/倒计时中 `requestById` 返回 false，不能反复倒转。空船可由对岸呼叫（host 校验距离）。初始：南西岸、北东岸；`reset()` 回到初始岸；第二局 `startLive` 调用 `resetFerries`。

### 平台与乘客

- 甲板 5×6 m，deckY=-1.15，与 towpath -1.2 平接；`arena.platformAt` 与载具共用平台查询；`PlayerController` 复用平台携带逻辑。额外给渡船平台 `manualCarry`，由 `updateFerries` 显式携带旧甲板 XZ 范围内的乘客，避免半格堤岸边缘卡住。
- 只有步兵可交互；载具不在 `vehicleGroundAt` 甲板上，不能登船。乘客可射击/歪头/跳水；栏杆有动态碰撞，中段登船开口与船头/船尾开口保留。
- 船不占点、不加分、不可摧毁；无爆炸/冲撞伤害。
- `dispose` 移除 mesh、材质/几何，清空 `ferries` 与 `ferrySystem`；`reset` 清空载客平台位置（乘客是玩家 controller，不额外保存引用）。

### 联机协议与权威

- host 60 Hz 推进；host 校验 `ferryCall`：`matchId`、发送者、存活、非载具、距任一端 ≤5.5 m、phase=docked。
- `snap` 新增 `ferries: [{id,phase,t,x,z,yaw}]`；客机只 `applySnapshot` + 视觉平滑/大误差 snap，不预测 phase；客机 local player 平台预测与 host 权威分离。
- 交互优先级：拾取 crate → 渡船 → 载具，HUD prompt 与之一致。

### 双客户端结果

`docs/map-miao-village/audit/ferry-network.json`（两个独立 Chromium，本地 loopback，host 手动固定步进排除 headless rAF 节流）：

- 房间成功建立，guest 相位跟随 host：`countdownWest → movingEast → dockedEast → countdownEast → movingWest`；
- 移动中 guest 再次 `ferryCall` 被 host 拒绝，相位不变；
- 视觉位置 **p95 = 0.019 m，max = 0.019 m**（目标 ≤0.25 m，达成；以 host 权威 `ferrySystem.x` 对 guest 甲板 visual x）；
- 单客户端 host 乘客：PlayerController 在甲板上连续 900 帧（15 s）与甲板 x 完全一致，y=-1.15，platform=`ferry-south`；
- **双客户端手动步进下 host 乘客最大甲板滞后 25.4 m**：报告为未解决/待复测项（§14），不把“单客户端通过”冒充双客户端通过；
- reset 后 south 回 `dockedWest x=212`，north 回 `dockedEast x=286`，visual 同步。

---

## 9. 载具与特殊武器

- 12 辆：蓝 2 摩托 + 吉普 + APC；橙同；中立 4 摩托。无 MBT/IFV/轻坦。
- 载具位在出生墙外真实道路/停车坪；host 动态刷新管理器按摩托 45 s / 吉普 60 s / APC 90 s（`arena.vehicleRespawnDelays`，泛化 `VehicleSpawnManager` 的 `destroyedDelayMs(kind)`）。
- 南/北桥 APC 双向实走（`miao-walk` 的 `advanceVehiclePose` + 真实 APC 尺寸）通过；中央廊桥摩托通过、APC 在桥头真实石墩前被挡。**本轮未另跑 miao 专用 Playwright 载具脚本**；载具行为以 Node 世界/控制器的 9 项实走为准，旧图 `test:vehicles` 未替代它。
- B RPG、D RPG、芦笙场喷火器；不放 AMR/固定机枪；crate `rocket` 与 weapon `rpg` 映射沿用 existing `isSpecialWeaponId/specialWeaponFor/crateLabel`。
- Bot 不捡特殊武器（既有约束未改）。

---

## 10. 材质包 miao-v1

- 32 个体素材质 id **122–153**，`MATERIAL_SLOTS=160`；4 个装饰 atlas（不占体素槽）。
- 每张材质：原创程序化、环面域、32/64/128 **原生** PNG（不是放大）、NearestFilter、palette ≤8、average、seam 指标、`masterSha256`、生成参数。manifest：`public/textures/miao-v1/manifest.json`。
- 包 SHA-256（manifest+全部 PNG）：`c382e5d1609691e06f040e5c1586f2e678fb2ccab446bb92fb71e9b57846725d`。
- 资源包注册表：`miao-v1` 独立加载 36 个 URL；`pharaoh-v1` 仍 54 URL；classic 56 URL；互不串包。
- 32/128 切换截图：`34-materials-32.png` / `35-materials-128.png`；3×影棚 `36-lighting-off/high/ultra.png`。

| id | name | family | palette | mean RGB |
|---:|---|---|---:|---|
| 122 | fir_dark_oiled | wood | 8 | (86, 58, 36) |
| 123 | fir_honey_worn | wood | 8 | (134, 93, 58) |
| 124 | fir_grey_weathered | wood | 8 | (69, 67, 58) |
| 125 | wood_plank_floor | wood | 8 | (94, 66, 43) |
| 126 | wood_lattice | wood | 8 | (121, 91, 60) |
| 127 | tile_blue_grey | tile | 8 | (95, 105, 106) |
| 128 | tile_grey_weathered | tile | 8 | (103, 105, 94) |
| 129 | tile_moss_edges | tile | 8 | (97, 105, 84) |
| 130 | stone_rubble_wall | stone | 8 | (56, 58, 49) |
| 131 | stone_cut_grey | stone | 8 | (94, 100, 90) |
| 132 | paving_bluestone | stone | 8 | (91, 103, 105) |
| 133 | paving_cobble | stone | 8 | (63, 66, 59) |
| 134 | paving_wet | stone | 8 | (74, 84, 86) |
| 135 | water_jade_river | water | 8 | (53, 95, 89) |
| 136 | earth_compacted | earth | 8 | (126, 98, 71) |
| 137 | mud_paddy | earth | 8 | (103, 85, 62) |
| 138 | grass_mountain | vegetation | 8 | (62, 81, 50) |
| 139 | rice_young | vegetation | 8 | (69, 114, 49) |
| 140 | rice_gold | vegetation | 8 | (137, 123, 54) |
| 141 | vegetable_dark | vegetation | 8 | (59, 80, 49) |
| 142 | bamboo_leaf | vegetation | 8 | (89, 119, 71) |
| 143 | bamboo_culm | vegetation | 8 | (146, 146, 83) |
| 144 | foliage_maple | vegetation | 8 | (135, 80, 47) |
| 145 | foliage_camphor | vegetation | 8 | (74, 108, 64) |
| 146 | reed_river | vegetation | 8 | (97, 93, 55) |
| 147 | straw_thatch | straw | 8 | (104, 85, 48) |
| 148 | brick_grey_old | masonry | 8 | (145, 137, 124) |
| 149 | plaster_lime_worn | masonry | 8 | (183, 179, 162) |
| 150 | bamboo_wicker | craft | 8 | (141, 115, 70) |
| 151 | ceramic_brown | craft | 8 | (137, 85, 59) |
| 152 | cloth_indigo | cloth | 8 | (60, 86, 119) |
| 153 | cloth_madder | cloth | 8 | (142, 63, 69) |

pack sha256: c382e5d1609691e06f040e5c1586f2e678fb2ccab446bb92fb71e9b57846725d
block records: 32 atlas records: 4

> 接缝说明：所有材质在环面域生成；`manifest.seam.wrapDelta/wrapRatio` 记录边缘差异与邻域差异。高频砖/石/水纹的 wrapRatio 可能 >1（这是正常像素梯度而非断线），实际 2×2 tile 证据在 `docs/map-miao-village/materials/tile_*.png`；不把照片或外部素材当纹理。

---

## 11. 性能、渲染、生命周期

硬件：**Apple M5 Pro / 24 GB / macOS 26.6.2**；浏览器为 headless **Google Chrome + SwiftShader**（软件 GL）。draw call/triangle 数量有效；**GPU 帧时间不代表真机/独显**。分辨率 1280×720；bots=1，双方 AI 填满；光照默认 medium；`res=64`。

| 场景 | 玩家 | 车辆 | draw calls (min/med/max) | triangles | sim p50/p95/p99/max | textures / geometries |
|---|---:|---:|---|---:|---|---|
| 8v8 | 16 | 12 | 199 / **201** / 201 | 2,349,366 | 0.2 / **0.5** / 0.8 / 23.2 ms | 50 / 177 |
| 12v12 | 24 | 12 | 209 / **211** / 211 | 2,356,342 | 0.3 / **0.8** / 1.9 / 30.7 ms | 58 / 185 |

- 模拟 p95 **0.5/0.8 ms**，满足 <1 ms 目标；p99/最大值有加载/追赶尖峰。
- **draw calls 201/211 超出典型 ≤150**（8v8 超 34%），12v12 在激战 ≤250 内；ultra 生命周期视图 292 calls（>250），见 §14。未通过提高预算掩盖；尝试了猪群/装饰/角色的 InstancedMesh/合批、36 个地形 chunk、12 车、固定材质数组。
- 生命周期 `docs/map-miao-village/audit/lifecycle.json`：32/64/128 反复切换 6 次，textures 26–35、geometries 162 稳定，worldVisible=true，截图亮度稳定，无控制台错误；光照 off/low/medium/high/ultra 实际打开，ultra `effective=ultra`，csm/cinematic=true；无灰块/黑帧/源网格消失；ferry reset 回初始岸。
- 加载：`buildVoxelMapData` 约 7.8 s、Navigation 约 9.8 s（本机 Node/Worker 基准），页面 headless 约 20–30 s；生产机器/设备未测。

---

## 12. 构建、测试与审计命令（真实结果）

```bash
npm run build
# ✓ tsc --noEmit + vite build；dist/version.json = 0.21.0 / 5a8e0374078786c2 / v14 / 8

npm test
# Test Files 56 passed (56); Tests 485 passed (485); 32.7 s

npm run test:water
# 六图全部；miao: waterBlocks 28773, openFaces 0, leaks [], navigable 10996,
# missingExit 0, traps [], escapeTrials 32, escapeFailures []

npm run test:audit
# core/maps/network/lifecycle 回归执行；lifecycle checks 全 pass；errors []

npm run maps
# previews/maps/06-miao_village.svg/.png；5 caps/12 pads/3 specials

npx tsx tools/maps/miao-village-coverage.ts
# 70.5%（176,267/250,000）

node tmp/miao-perf.mjs
# 8v8/12v12；见 §11 JSON docs/map-miao-village/audit/performance-*.json
```

双客户端渡船、生命周期、性能的原始 JSON 在 `docs/map-miao-village/audit/`。

---

## 13. 截图索引（真实渲染，37 张；4 张问题机位归档）

目录：`docs/map-miao-village/screenshots/`；缩略联系表 `contact-sheet.png`。全部为真实 WebGL 渲染（不是平面图），使用 `window.__game.auditView` 固定机位；HUD 与第一人称枪模在截图时隐藏。

| # | 文件 | 内容 |
|---:|---|---|
| 01 | `01-overview-valley.png` | 全图河谷/群山/村落总览 |
| 02 | `02-overview-village.png` | 村寨与梯田总览 |
| 03 | `03-blue-spawn.png` | 蓝队出生区/墙/门 |
| 04 | `04-orange-spawn.png` | 橙队出生区/高墙/门 |
| 05 | `05-a-market-street.png` | A 市集主街/木构立面/窗 |
| 06 | `06-a-market-plaza.png` | A 市集广场与店铺 |
| 08 | `08-a-side-alley.png` | A 窄巷 |
| 09 | `09-a-shop-interior.png` | 河岸店铺室内 |
| 10 | `10-b-paddy-fields.png` | B 梯田/水位/稻秧/菜地 |
| 11 | `11-b-pig-farm.png` | B 猪场三栏两棚/猪 |
| 13 | `13-c-covered-bridge-inside.png` | 廊桥内部/长椅/窗洞/屋顶 |
| 14 | `14-c-bridge-deck.png` | C 桥面据点 |
| 15 | `15-c-lusheng-plaza.png` | 芦笙场石铺/芦笙柱 |
| 17 | `17-river-ladder.png` | 河岸梯（下/上） |
| 18 | `18-d-drum-hall.png` | 鼓藏堂/祭祀坪 |
| 19 | `19-d-slope-houses.png` | D 坡地群楼 |
| 20 | `20-e-theater.png` | E 剧场观众坪/舞台 |
| 21 | `21-e-stage.png` | 舞台/木构/后台入口 |
| 23 | `23-south-bridge.png` | 南桥 |
| 24 | `24-north-bridge.png` | 北桥 |
| 25 | `25-ferry-south-west-dock.png` | 南渡船西岸甲板/船坞 |
| 26 | `26-ferry-south-passenger.png` | 南渡船乘客视角 |
| 27 | `27-ferry-north-east-dock.png` | 北渡船东岸 |
| 28 | `28-ferry-north-passenger.png` | 北渡船乘客视角 |
| 29 | `29-outskirts-dirt-road.png` | 寨边土路/独栋 |
| 30 | `30-three-storey-balconies.png` | 三层楼/阳台/木构 |
| 31 | `31-aerial-paddies.png` | 梯田航拍 |
| 32 | `32-overview-mountains.png` | 外围山体/河谷 |
| 33 | `33-spawn-wall-exterior.png` | 出生墙/木瓦/门 |
| 34–35 | `34-materials-32.png` / `35-materials-128.png` | 同机位 32 vs 128 材质 |
| 36 | `36-lighting-off/high/ultra.png` | off/high/ultra 代表画面 |
| 37–38 | `37-ferry-south-aerial.png` / `38-ferry-north-aerial.png` | 渡船坞航拍 |
| 39 | `39-c-covered-bridge-from-bank.png` | 西岸看廊桥 |

> 07/12/16/22 的早期机位因墙体遮挡归档到 `screenshots/archive/`，不计入 37 张。

> 截图只作视觉证据，不替代测试；部分场景（剧场布景、堤岸近景）仍有美术提升空间，见 §14。

---

## 14. 已知问题、未验证项与后续调优

### 必须如实说明的缺点

1. **平衡待真人调优**：没有真人 6v6/8v8/12v12 对抗样本；本文只给出距离、可达性、理论计分与 Bot 可达性。不得把这些当作竞技公平结论。
2. **draw calls 超标**：8v8 201 > 典型 150；12v12 211 ≤ 激烈 250；ultra 292 > 250；三角形约 2.35 M。已做 InstancedMesh/合批/chunk，但仍超；后续优先合并透明水体 chunk、降低 detail 面数/LOD、按可见性调整 chunkSize，不通过提高预算解决。
3. **双客户端乘客甲板携带未稳定**：单客户端 host 在甲板上 900 帧与甲板完全一致；双客户端固定步进测试中 host 乘客最大滞后 25.4 m（视觉 p95 0.019 m 达成）。怀疑与 host 在 headless 后台被手动步进/平台查询时序有关，需在真实前台双机重测；如果复现，应直接在 `updateFerries` 用 ferry id 绑定乘客（而不是只靠旧甲板范围），并加单测。未把“单客户端通过”写成双客户端通过。
4. **剧场布景偏弱**：舞台/后台/观众坪可玩，但节庆 textile backdrop 在截图中不够醒目，近景美观度不足；后续补更清晰的布幔/纹样几何或确认 miao atlas 在舞台墙前的 UV/遮挡。
5. **水面视觉**：水材质为深青玉色，近看仍有明显 1 m 网格重复；更细的水面法线/UV 缩放与堤岸近景需要美术迭代。
6. **车辆过桥**：APC 双向能通过，但接触/blocked 帧较多（桥头 0.2 m 台阶/护栏），属于“能过但不够顺”；后续加宽引道/优化桥头 pad。
7. **动画/环境**：猪群有 4 个 InstancedMesh 的非战斗低头/转身，但动作简单；非核心。
8. **性能/网络设备**：headless SwiftShader 无 GPU 帧时间代表性；真实网络仅 loopback 两客户端，未测 4G/丢包；J1900/低端机未验收。
9. **加载**：世界构建+导航约 18 s 本机基准；未针对低端机做预算验收。
10. **其他地图材质**：通用 `detail` 的最小半格厚度使旧图部分细木棂/栏杆变厚（视觉），旧图功能测试全过；若旧图美术回归发现变化，是此次通用修复的可接受副作用，需要旧图专项视觉复核。

### 已通过但不应夸大的项

- 8v8/12v12 性能只在当前 headless 软栈采样；不是“所有设备保证”。
- 37 张截图是画面证据，不是自动化逐帧验收；自动化验收见 `miao-village`/`miao-walk`/`miao-assets`/`river-ferry`/`miao-scoring` 与 Playwright JSON。
- Bot 长时多轮“不只攻 C”未做统计；本报告只验证可达性、静态路线和初始目标权重。

### 后续优先顺序

1. 修复/复现双客户端乘客甲板携带（前台两机，guest/host 同时抓位置）。
2. 合并透明水面/玻璃 draw call，detail LOD，目标 8v8 ≤150。
3. 舞台/廊桥/堤岸近景美术迭代与水面 UV/法线。
4. 真人 8v8/12v12 平衡采样（A/D 距离、B/E 掩体、渡船绕后强度、C 桥面火力封闭性）。
5. 低端机/真实网络验收与加载优化。

---

## 15. 版本与部署

- `package.json` 0.21.0；`src/version.ts` 与 `vite.config.ts` 同步 v14/8。
- `BUILD_ID` 由构建自动生成；当前 `dist/version.json`：`{"version":"0.21.0","buildId":"5a8e0374078786c2","mapRevision":"voxel-halfgrid-v14","materialRevision":8}`。
- **已发布 0.21.0**：https://crazyshoot.haokee.org，release `0.21.0-5a8e0374078786c2`；发布证据见 [`../deploy-2026-11-18-0.21.0/REPORT.md`](../deploy-2026-11-18-0.21.0/REPORT.md)。未 commit、未 push；未删除 dist/docs/previews/backup。
- 构建/测试/审计命令见 §12；证据根目录 `docs/map-miao-village/`。
