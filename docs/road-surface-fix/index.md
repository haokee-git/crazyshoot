# 跨地图道路表层合成修复 · before / after

> 范围：`src/game/world/voxel-map-data.ts` 的道路/patch 合成 + 四张旧图的 `preserveUnderRoads` 元数据。
> 不涉及法老图文件、玩法、桥梁/机场规则或载具系统。
> 最终版本另包含 Lead 的 `cover` 高度下限 1.5→0.25（v11 的一部分），after 截图与测试均已覆盖。

## BUILD_ID（终版 0.20.3）

| 阶段 | 版本 / MAP_REVISION | 源文件 BUILD_ID | dist/version.json | 说明 |
|---|---|---|---|---|
| before | 0.20.2 / `voxel-halfgrid-v10` | `0f7421f59d285035` | `46a9513643812fad` | 改代码前采集；旧构建 46a951（09:36） |
| after | 0.20.3 / `voxel-halfgrid-v11` | `44cb0012f3292061` | `44cb0012f3292061` | 终版代码（含 Road.surface/markings、cover 低掩体）采集；源文件、dist、dev server 三者一致 |
| 最终 build | 0.20.3 / `voxel-halfgrid-v11` | `44cb0012f3292061` | `44cb0012f3292061` | Lead 验收：`npm run build` 通过，`npx vitest run` 285/285 全绿 |

- 源文件 BUILD_ID 与 `vite.config.ts` 同算法（`src` + `public` 内容 SHA-256 前 16 位）。
- after 截图的 `manifest.json.ownedFileSha256` 与终版 owned 文件逐项核对：**7/7 SAME**（voxel-map-data、四旧图、road-surface 测试、截图工具）。
- before 采集时页面控制台有一条并行法老编辑造成的 `buildPyramid` 导出错误（只影响 pharaoh 模块，旧四图截图正常）；after 采集无错误。
- **本目录不是 Git 仓库**：`git status` / `git diff` / `git log` / `git stash` 全部不可用，改动无法用 commit/diff 追溯；改前备份在 `backup/pre-roadfix-20261111/files.tar.gz`，文件清单与 sha256 见 `manifest.json.ownedFileSha256`。

## 同机位对比

| 场景 | before | after |
|---|---|---|
| 船坞 · 东码头（EAST QUAY RD + PIER A 横穿混凝土码头） | [before/docks-east-pier.png](before/docks-east-pier.png) | [after/docks-east-pier.png](after/docks-east-pier.png) |
| 断桥 · 加油站前庭（镇前道路斜切混凝土场坪） | [before/broken-bridge-gas-station.png](before/broken-bridge-gas-station.png) | [after/broken-bridge-gas-station.png](after/broken-bridge-gas-station.png) |
| 断桥 · 桥面与河谷（后置桥体箱，水体不被道路填色） | [before/broken-bridge-deck.png](before/broken-bridge-deck.png) | [after/broken-bridge-deck.png](after/broken-bridge-deck.png) |
| 花园 · 东服务院（外环 path 纵穿混凝土院坪） | [before/garden-service-yard.png](before/garden-service-yard.png) | [after/garden-service-yard.png](after/garden-service-yard.png) |
| 花园 · 东门房前庭（外环 secondary 压到门庭混凝土） | [before/garden-east-gate.png](before/garden-east-gate.png) | [after/garden-east-gate.png](after/garden-east-gate.png) |
| 机场 · 南机坪 / 机库道 / 09-27 跑道与滑行道 | [before/airfield-runway-taxiway.png](before/airfield-runway-taxiway.png) | [after/airfield-runway-taxiway.png](after/airfield-runway-taxiway.png) |

### 船坞 · 东码头

before：主路与 PIER A 在白色混凝土码头上压出黑色沥青十字（连码头场坪一起被盖）。
after：混凝土码头连续保留，道路只在场坪外继续铺装。

![船坞东码头 before](before/docks-east-pier.png)
![船坞东码头 after](after/docks-east-pier.png)

### 花园 · 东服务院

before：外环 path 纵穿混凝土院坪，把整条院坪切成两半。
after：院坪保持混凝土，path 只在院坪外的草地上可见。

![花园服务院 before](before/garden-service-yard.png)
![花园服务院 after](after/garden-service-yard.png)

### 断桥 · 加油站 / 桥面

before：镇前道路从加油站混凝土前庭北缘切进去，压出沥青楔形。
after：混凝土前庭完整；桥面仍是后置 box 的混凝土，河床没有被铺成沥青。

![断桥加油站 before](before/broken-bridge-gas-station.png)
![断桥加油站 after](after/broken-bridge-gas-station.png)

### 机场 · 南机坪 / 跑道

before：机库道在机坪沥青上保留白漆中线（场坪被道路语义切开）。
after：机坪沥青连续、白漆只留在机坪外；09/27 跑道与滑行道仍然覆盖机坪边缘（runway/taxiway 例外）。

![机场跑道 before](before/airfield-runway-taxiway.png)
![机场跑道 after](after/airfield-runway-taxiway.png)

## 行为摘要

1. **作者地表保留**：patch 应用阶段逐格写 `preserveUnderRoads` 标志（`Uint8Array`，不按材质 id 猜）。道路核心遇到该格跳过材质覆盖，地形高度仍按上游道路整平。
2. **patch 排序**：逐格记录 `surfacePriority`（`Int8Array`，默认 -128）；高优先级覆盖低优先级，平手保持「后 patch 覆盖前者」。
3. **肩带**：只有 `road.shoulder > 0` 才画，范围 `width/2 .. width/2 + shoulder`。`verge:'local'` 保持底层；`'compacted'` 只把松散自然地表换低对比变体（沙 72/73/102/103/105→74，砾 75/76→76，土 77/78/97/117→104），草/花/泥/石/混凝土/沥青/水不动；preserve 格不改。
4. **当地铺装/标线**：`Road.surface` 指定 stone/concrete/gravel 时，核心优先用 `map.terrainMaterials?.[surface] ?? terrainMaterial(surface)`；`Road.markings:false` 不画白漆中线（缺省保持旧行为）。preserve 命中时核心与标线一起跳过；跑道/滑行道例外始终胜出。
5. **水体保护**：水面 patch 区域与 `heights < -2` 的低洼格跳过道路核心/肩带；断桥桥面是后置 box，不受影响。
6. **低掩体**：Lead 将 cover 高度下限从 1.5 m 改为 0.25 m（尊重作者 height），终版测试/截图包含该变更，旧四图回归通过。

## 验证

| 项 | 结果 |
|---|---|
| `npx vitest run` | **285/285 全绿**（Lead 终版验收；含 pharaoh-walk 31、building-interiors 10、road-surface 11） |
| `npm run build` | **通过**；`dist/version.json` = 0.20.3 / `44cb0012f3292061` / `voxel-halfgrid-v11` / materialRevision 6 |
| `npx vitest run tests/road-surface.test.ts` | **11/11 passed**（0.20.3 / v11 / 44cb 上复跑；真实 `buildVoxelMapData` + `blockAt`/`columnTop`/`heights`） |
| 截图/终版文件一致性 | after manifest 的 7 个 owned sha256 与终版**逐项一致** |

## 文件

- `src/game/world/voxel-map-data.ts`：patch 标志/优先级、水体跳过、肩带与压实变体、Road.surface/markings、跑道例外；含 cover 高度下限调整。
- `src/maps/docks.ts`、`src/maps/broken-bridge.ts`、`src/maps/garden.ts`、`src/maps/airfield.ts`：仅给作者场坪加 `preserveUnderRoads: true`。
- `tests/road-surface.test.ts`：跨地图表层契约（11 个测试）。
- `tools/game/audit/road-surface-capture.ts`：before/after 真实 world 截图。
- `docs/road-surface-fix/**`：本证据目录（manifest.json / before/ / after/）。
