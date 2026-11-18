> **0.20.4 补丁说明：只改死亡→部署流程（手动点击“部署”，保留至少 5 秒等待），地图 world/道路/截图基线不变。补丁验收见 [docs/audit-2026-11-11-manual-deploy/REPORT.md](../audit-2026-11-11-manual-deploy/REPORT.md)。**

# 法老坟墓 0.20.3 · 800 m 七据点重构验收

- 版本：**0.20.3**
- BUILD_ID：**`44cb0012f3292061`**
- MAP_REVISION：**`voxel-halfgrid-v11`**
- MATERIAL_REVISION：`6`
- 本目录不是 Git 仓库；改前备份在 `backup/pre-pharaoh-800-20261111/`、`backup/pre-*/`。
- **未部署线上。**

> 本文件替代 `ACCEPTANCE-0.20.md` / `ACCEPTANCE.md` / `CONTRACT.md` 中的 1000 m、
> 五据点、旧锚点口径。旧文件保留为历史审计档案，并已加“历史文档”横幅。

## 1. 布局：重排，不缩放

旧 1000×1000 / A–E 五点 → **800×800 / A–G 七点**。没有把旧坐标统一乘 0.8；
每个场景按新锚点重新落位，保留各自体量并扩建：

| 场景 | 新锚点 | 最终尺度 / 关键量 |
|---|---|---|
| 蓝队基地 | (80, 85) | 110×110，地面 +2.4 |
| 橙队营地 | (710, 710) | 110×110，地面 +8.0 |
| A 金字塔 | (190, 610) | 外层 264×264、外顶 +58；原 132 m 内核/墓室/外廊/两条登顶路线保留 |
| B 狮身人面像 | (460, 640) | 本体 150×52、头顶 +41、内殿 40×24 净高 9.5；四入口 + 头室 |
| C 沙漠集市 | (475, 395) | 330×300、7 街区 54 栋；核心 97,980 m²（≥96,900） |
| D 绿洲 | (175, 290) | 湖 140×110 / 水面 −2 / 湖底 −6；生态区 59,319 m²；8 出水口 |
| E 公路驿站 | (350, 105) | 165×120；8 栋建筑 + 23 掩体；环场道 6 m / 进场道 8 m |
| F 卡纳克神庙 | (650, 130) | 185×165；42 柱（40 根 8.4–11.2 m + 2 断桩）、2 方尖碑 15/13.5 m |
| G 帝王谷采石场 | (210, 420) | 200×175 包络；三级台阶 3.9/4.8/5.7、7 m 车辆坡道、巨像 26×20×14 |

主要联动：
- 金字塔 builder 改为**局部坐标 + 整体平移**（dx −140 / dz −80），只平移不缩放；
  墓室、三条外廊、西南/北面外部大阶梯、A–B 东门全部保留。
- 狮身人面像重写：头/胸/臀/腿/爪/头巾重新分配体量，内殿扩为 40×24，头部不占 B。
- A–B 墓道按新 A/B 距离重算：`TUNNEL_LENGTH ≈ 265 m`，两处中途出口坐标由 builder 现算；
  西口与狮身西入口对齐 (385,640)，摩托可过、吉普/MBT 被 2 m 石墩/门槛挡住。
- 中央空白改为 3–8 m 低沙丘/沙谷/岩脊；东部车辆走廊两侧 7.4–8.6 m 低沙脊，
  主路藏在沙谷里；没有 12–22 m 旧大沙丘、规则条纹或等距圆锥。

## 2. 覆盖率（1 m 栅格 union，重叠只算一次）

工具：`tools/maps/pharaoh-coverage.ts` → `docs/map-pharaoh/plans/coverage.json`

| 项 | 数值 |
|---|---:|
| 设计覆盖 | **437,790 / 640,000 = 68.4%** |
| 场景场地 | 356,968 m² |
| 道路走廊 | 63,512 m² |
| 生态区 | 59,319 m² |
| 沙丘/岩脊 | 72,160 m² |
| 重叠（多算格次） | 114,178 m² |
| 未设计空地 | 202,210 m² |
| 建筑 footprint | 11,578 m²（1.81%） |
| 掩体 footprint | 17,913 m²（2.8%） |
| 湖泊 | 11,649 m² |

口径：不计 `baseTerrain:'sand'`、纯噪声沙地、场景包络里没有设计的空隙；
“场景覆盖”与“建筑铺满”分开报告。

## 3. 同源 DDA 视线

工具：`tools/maps/pharaoh-los.ts` → `docs/map-pharaoh/plans/los.json`
（体素 + `detailBoxes`，与 `VoxelWorldQueries.ray/line` 同口径）

- 10 个中央脊/台地代表点；单脊最多控制 **2** 个露天据点；`failures: []`。
- 据点被中央脊看到次数：C 2 / D 1 / E 5 / F 3 / G 2。
- A/B 只查入口/前庭：A 1、B 3（不做“墓室被实体挡住”的地形视线冒充）。
- 主推进路线 15 条，平均暴露 **20.2%**，最高 66.7%；不是全程暴露在同一高地之下。

## 4. 跨地图公路 / 路肩 / 特殊地表修复

共享修复在 `src/game/world/voxel-map-data.ts`：
- `TerrainPatch.preserveUnderRoads` 逐格标志 + `surfacePriority`；
  道路核心穿过人工场坪时保留混凝土/石铺/油污地/沥青场坪；跑道/滑行道仍按自身语义覆盖。
- `Road.shoulder` 每侧肩带 + `verge:'local'|'compacted'`；不再用 18 m 沙砾垫底模拟路肩。
  法老主路 10 m 沥青 + 每侧 2 m 窄肩，沙地使用 `sand_compact` 类低对比材质；
  草地/镇区/码头/机场/湿地保持当地地表。
- 水体不被道路填色；`Road.surface` 支持集市石铺、神庙石铺、驿站混凝土、绿洲砾石。
- 旧四图只加 `preserveUnderRoads` 元数据：docks 东码头/作业区、broken_bridge
  桥面/加油站、garden 石铺/前庭、airfield 机坪/塔台场。
- 回归：`tests/road-surface.test.ts` 11/11 通过（真实 `buildVoxelMapData` + `blockAt`）。
- 同机位 before/after 6 张：`docs/road-surface-fix/`，after 为终版 44cb…，
  owned 文件 sha256 7/7 一致。

## 5. 验证结果

| 项 | 结果 |
|---|---|
| `npm run build` | ✅ 0.20.3 / `44cb0012f3292061` |
| `npm test` | ✅ 31 文件 / **285 tests** 全绿 |
| `tests/pharaoh-map.test.ts` | ✅ 24/24（800 m、A–G、32 车位、97,980 集市核心、湖/生态/建筑/道路） |
| `tests/pharaoh-walk.test.ts` | ✅ 31/31（A/B 室内、A–B 墓道、七点导航、绿洲出水、E/F/G 实走、道路 MBT） |
| `tests/pharaoh-coverage.test.ts` | ✅ 5/5（68.4%，重叠只算一次） |
| `tests/pharaoh-los.test.ts` | ✅ 4/4（单脊 ≤2 据点，入口检查，路线暴露） |
| `tests/building-interiors.test.ts` | ✅ 10/10（含 pharaoh 65 栋门/楼梯/家具） |
| `tests/road-surface.test.ts` | ✅ 11/11 |
| `npm run test:water` | ✅ pharaoh 33,385 水块 / 11,765 可游格 / 0 缺出口 / 32 试游 0 失败 |
| 真实浏览器走查 | ✅ **34/34**，`docs/map-pharaoh/acceptance-0.20.3/pharaoh-walk/pharaoh-walk.json` |
| 性能（headless Chromium） | ✅ `pharaoh-performance.json`：8v8 sim p95 **1.0 ms** / 8v8×4 CPU **3.6 ms** / 12v12 **1.3 ms** / 12v12+40 车 **1.4 ms**；calls p95 **102–115**；tris p95 **798–808k**；59.9–60.2 fps；deadFrames 0 |
| 七场景截图 | ✅ 37 张，`docs/map-pharaoh/render/`，BUILD_ID 44cb… |
| 平面图 | ✅ 800 m / 七据点 / 32 车位 / 33 路段 / 83 地表 patch，`docs/map-pharaoh/plans/` |

> `npm run test:audit` 的 network-regression 在本机一次复跑中卡在复活无敌倒计时 UI
> 30 s 超时（与法老地图无关的既有浏览器计时用例）；core/maps-regression 已跑过四旧图
> + 训练场，未见地图回归。该条不冒充“全绿”。

## 6. 交付截图

- 总览：`render/00-overview-oblique.png`、`01-overview-top.png`
- A 金字塔：`10`–`14`、`a-*` 室内/顶
- B 狮身：`20`–`23`、`b-inner-temple`
- 隧道：`90`–`93`、`tunnel-mid`
- C 集市：`40`–`44`
- D 绿洲：`50`–`52`
- E 驿站：`60`–`63`
- F 神庙：`70`–`73`
- G 采石场：`80`–`83`
- 双方基地：`95`、`96`
- 索引：`docs/map-pharaoh/render/index.md`

## 7. 已知取舍

- 狮身人面像比例正确、卧姿可读，但正脸仍是方块化人脸；本次没有做写实雕刻。
- G 真实不规则场地 26,072 m²，小于 200×175 包络的 35,000 m²；z 452–478 留作
  A 南门前庭与 4 个中立车位，未计入采石工作面。
- E 停车位 `(395,125)` 5×7 footprint 与环场道东腿铺装边约 1 m 重叠（坐标由 Lead 给定），
  车位中心仍在路外；未为这 1 m 挪动建筑/道路。
- 金字塔外层/狮身/巨像均为 1 m 体素块面，近看有台阶感。
- 本机（M5 Pro / headless Chromium）验收；未做低端真机保证、未部署线上。
