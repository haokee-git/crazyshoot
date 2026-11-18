> **历史文档（0.19–0.20.2 时代）：以下内容含旧 1000 m/五据点数据，已被 0.20.3 取代。当前事实见 [README.md](README.md) 与 [ACCEPTANCE-0.20.3.md](ACCEPTANCE-0.20.3.md)。**

# 法老坟墓 · 最终验收记录

- 日期：2026-11-10
- 版本：**0.20.0**
- BUILD_ID：**`02eb73a1417e793d`**（`dist/version.json`，与截图/性能同一构建）
- `MAP_REVISION`：`voxel-halfgrid-v10`
- `MATERIAL_REVISION`：`6`
- 硬件：Apple M5 Pro / 24 GB；Chrome 157.0.8103.39 headless（不声称 J1900/低端机通过）

## 1. 构建与回归

| 命令 | 结果 | 证据 |
|---|---|---|
| `npm run build` | ✅ exit 0 | `dist/version.json` = 0.20.0 / 73a40f07225cdf34 |
| `npm test` | ✅ 27 files / **251 tests passed** | 终端日志；最终源码 |
| `npm run test:water` | ✅ 四图 + pharaoh；pharaoh `waterBlocks 20649 / openFaces 0 / navigable 8103 / missingExit 0 / traps 0 / escapeFailures 0` | `/tmp/final-water.log`、`docs/map-pharaoh/oasis-service-layout.json` |
| `npm run test:vehicles` | ✅ 全项通过，errors=[] | `/tmp/final-vehicles.log` |
| `npm run test:audit` | ✅ core / maps / network / lifecycle 各段通过（maps 对喷泉中心改为“中心或环带可达”；network 移除污染后续输入测试的旧梯子探针，梯子由 `tests/ladders.test.ts` 覆盖） | `docs/audit-2026-11-06/*.json` |

法老专项测试：

| 文件 | 结果 |
|---|---|
| `tests/pharaoh-map.test.ts` | ✅ 25/25（注册、5 点、32 车位、材质 32/96、四图不加载 pharaoh 包、chunk 160） |
| `tests/pharaoh-walk.test.ts` | ✅ 34/34（正式 PlayerController：五点到点、A 四门/环路、两条登顶、B 四入口/内殿、A–B 墓道、两个中途出口、占点高度、摩托过墓道/吉普 MBT 被挡、水面） |
| `tests/pharaoh-spawn.test.ts` | ✅ 15/15（返回取消、45s、占用 2s 重试、40 上限、56 对象、排队去重、reset、host 独占） |

## 2. 真实 world 截图

- 目录：`docs/map-pharaoh/render/`
- `index.md` / `manifest.json` 逐张记录 **BUILD_ID 73a40f07225cdf34**、相机坐标/四元数/FOV/far/雾、res=128、quality=high、draw calls/tris、车辆数。
- 27 个场景：总览 2、金字塔 5、狮身 4、墓道 + 2 出口、集市 4、绿洲 3、公路/驿站 4、双方基地 2；另 5 张材质（contact sheet + 4 张代表 2×2）。
- 失败场景 0；全部来自正式 `game.html` 的体素世界，不是预览/概念图。

关键图：
- [金字塔近景（含西面 4m 大阶梯）](render/11-pyramid-near.png)
- [狮身人面像侧面（参考版）](render/20-sphinx-side.png)
- [A 墓室](render/13-pyramid-a-chamber.png)
- [B 内殿](render/23-sphinx-b-chamber.png)
- [墓道内部](render/30-tunnel-interior.png)
- [集市主街](render/40-bazaar-main-street.png)
- [绿洲](render/50-oasis-bank.png)
- [驿站](render/60-service-area.png)
- [全图斜俯视](render/00-overview-oblique.png)

## 3. 平面图

`docs/map-pharaoh/plans/`（均 2400×1800 SVG+PNG）：

- `pharaoh-surface`：1000 网格、等高线、道路、5 据点、双方出生、32 载具点、5 路线
- `pharaoh-underground`：金字塔 +5/+20/顶 +52、狮身内殿/头室、A–B 墓道 + 两个中途出口、竖向标高、纵剖面
- `pharaoh-height`：2 m 等高线、主路逐段纵坡、沙丘坡度分位、A–A′/B–B′ 剖面

生成：`npx tsx tools/maps/pharaoh-plans.ts`（坐标直接读 builder 导出常量）。

## 4. 性能（真实采样）

命令：`npx tsx tools/game/audit/pharaoh-performance.ts`；每跑 60 s 真实 live；1280×720 画布、quality=low、res=64、60 fps 上限。

| 场景 | 玩家 | 载具 | calls p95 | tris p95 | sim p95 / p99 | heap | GPU g/t/p | deadFrames | overload |
|---|---:|---:|---:|---:|---:|---:|---|---:|---:|
| 8v8 | 16 | 34 | 102 | 633,926 | **2.4 / 4.8 ms** | 289.8 MB | 136/63/43 | 0 | 0 |
| 8v8 4×CPU | 16 | 34 | 102 | 634,622 | 7.8 / 17.3 ms | 285.8 MB | 136/63/43 | 0 | 1.07 s |
| 12v12 | 24 | 34 | 105 | 636,363 | **5.3 / 8.0 ms** | 294.6 MB | 140/67/43 | 0 | 0 |
| 12v12+40 辆 | 24 | 40 | 105 | 636,379 | **5.4 / 8.2 ms** | 314.4 MB | 140/67/43 | 0 | 0 |

- Worker `buildMs` 9.29–9.69 s；voxels 81,510,912 B；chunks **53**；navLayers 4。
- draw calls p95 **102–106**，远低于 ≤150 典型目标；tris p95 ~636k。
- **未达到 sim step p95 <1 ms 目标**：中位数 0.6–0.9 ms，p95 2.4–5.4 ms，p99 4.8–8.2 ms；峰值来自开场/寻路缓存未热时的 300–370 ms。
- 已做的优化：160 m 地形分块（53 chunks）、detail 合并进地形 chunk、载具 420 m 距离裁剪、导航 4 层 + CSR 反向邻接 + 自适应流场缓存（24）+ BFS 队列复用、仅本图动态载具刷新、12v12 无持续 overload。
- 未做/下一步：把 Bot 全图流场改为分层/目标共享字段（当前 5 点 + 临时 hold 点会淘汰缓存），或把流场计算移入 Worker。这是 p95 未达 1 ms 的主要剩余项，报告中不掩盖。

## 5. 载具刷新实机证据

`docs/audit-2026-11-10/pharaoh-spawn-live.log`：

- 初始 32；车位 0 车辆移出 30 m → `occupied` 倒计时 20 s → `respawning` 15 s → **40 s 时生成 `dyn-motorcycle-0-1`，总数 33**。
- 状态机三态（ready/occupied/respawning）来自真实 host manager；客机只收快照/`vehSpawn`/`vehReset`。

## 6. 纹理

- `public/textures/pharaoh-v1/{32,64,128}`：**32 图案 × 3 = 96 PNG**；manifest SHA-256 `6374df07b3727b8a5f1c6c035418f4a8f46e576ac48762865f438bb5e239b750`（注意：最终 manifest 以文件为准）。
- 30 体素（id 72–101）+ 2 图集；12–24 色；接触表/2×2/50% offset 证据在 `materials/`。
- 其他四图/训练场不下载 pharaoh 包；法老图 `usedMaterialNames` 实测 50 个材质，不加载未使用层。

## 7. 已知差距（不隐藏）

1. **sim p95 > 1 ms**（见上）；典型 draw calls 达标，模拟仍有寻路缓存抖动。
2. 狮身/金字塔在 1 m 体素 + 0.5 m detail 下的近景/远景可读性有限：金字塔为 24 级阶梯金字塔，狮身面部在 300 m 外主要靠色块；高于此保真度需要 0.5 m 体素或更高预算。
3. 4× CPU 节流下 p95 7.8 ms、overload 1.07 s/60 s；低端真机未验收。
4. 浏览器 QA 实走工具为补充证据；正式 34/34 PlayerController 契约测试在 Node 中执行并全绿。

## 8. 浏览器 QA 补充证据

`docs/audit-2026-11-10/pharaoh-walk-final/pharaoh-walk.json`：30/33 通过。3 个失败是浏览器直线按键 walker 的路径问题（A 西南阶梯第一段 1 m 台阶、狮身东门内侧 1.4 m、墓道 B 口石墩），对应 Node `PlayerController` 契约测试均通过（`tests/pharaoh-walk.test.ts` 34/34）；不把工具路径问题冒充实走失败，也不隐藏。正式验收以 Node 真实控制器 + 真实游戏截图 + 线上 smoke 为准。

## 9. 线上发布

- 发布目录：`/var/www/crazyshoot/releases/0.20.0-73a40f07225cdf34`
- 上一版：`0.18.9-b34d21c5ba8e4fae`（回滚切回即可）
- 归档：`/tmp/crazyshoot-0.20.0-73a40f.tar.gz`，SHA-256 `25a594ee1f430478f3a42e5be06d4eb74067b00bda6fbcf0b47ed4540f30edb2`
- 线上 `/version.json`、`/game.html`、pharaoh 贴图、terrain-worker 均 200；生产环境真实加载 pharaoh：1000×1000、5 点、32 初始载具、buildMs 9.0 s、无页面错误。
- 线上证据：`docs/audit-2026-11-10/prod-pharaoh.png`。

## 10. 回滚

- 源码备份：`backup/pre-pharaoh-0.20.0-20261110-1605.tar.gz`
- 线上发布采用 `deploy/atomic-release.py`；回滚切换 `current` 到上一 release。
