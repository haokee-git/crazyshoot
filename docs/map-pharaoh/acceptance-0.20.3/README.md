# 法老坟墓 0.20.3 · 800 m 七据点 · 视觉与实走验收

> BUILD_ID `44cb0012f3292061` · MAP_REVISION `voxel-halfgrid-v11` · MATERIAL_REVISION `6`
> 工具：`tools/maps/pharaoh-plans.ts` · `tools/game/audit/pharaoh-capture.ts` · `pharaoh-walk.ts` · `pharaoh-performance.ts`
> 所有截图来自真实 `game.html?map=pharaoh` 体素世界（非概念图/预览模型），HUD 隐藏、引擎循环冻结后手动设相机。

## 1. 平面图（`docs/map-pharaoh/plans/`）

| 文件 | 内容 | 尺寸 |
|---|---|---|
| `pharaoh-surface.svg / .png` | 800 m 地表：七据点 A–G、15 条路线、32 载具位、新路网/新湖/3–10 m 沙丘、264 m 外层金字塔、狮身人面像 | 2400×2400 |
| `pharaoh-underground.svg / .png` | 金字塔 264 m 外层 + 内核 +5/+20/+58、狮身内殿 40×24、A–B 墓道 L≈265.8 m + 2 个中途出口、竖向连接 −6…+58 | 2400×2400 |
| `pharaoh-height.svg / .png` | `pharaohHeight()` 高程热力（−6.0…8.6 m）+ 2 m 等高线 + 坡度 + 纵剖面 + 1:1 地形剖面 | 2400×2400 |
| `README.md` | 数据版本、锚点表、命令与关键采样（自动生成） | — |

- 主路图例已按最终数据改为 **10 m 沥青 + 每侧 2 m 窄肩（总宽 14 m）**。
- 生成命令：`npx tsx tools/maps/pharaoh-plans.ts`。

## 2. 真实 world 截图（`docs/map-pharaoh/render/`）

- **38 张**，`index.md` / `manifest.json` 记录 BUILD_ID、相机、FOV/far/雾、calls/tris、bytes。
- 分组：总览 2 · A 金字塔 5（含墓室/上层）· B 狮身 5（含 3/4 南侧、正侧比例图、内殿）· C 集市 5 · D 绿洲 3 · E 驿站 4 · F 神庙 4 · G 采石场 4 · 墓道 4 · 基地 2。
- 每张 > 727 KB（远大于 10 KB 黑屏阈值）；draw calls 28–118，triangles 5.3 万–93.8 万。
- 机位说明：A 外层西阶梯/顶、B 东侧正面与双爪、C 主街/横街/街心、D 湖面/岸线、E 加油棚/维修库/停车区、F 柱厅/方尖碑/南门楼、G 三级台阶/装车台/半埋巨像、墓道主通道 + 两个中途出口 + B 口。
- 已知表现：狮身面部在 1 m 体素下呈台阶化方块（如实记录）；部分高空总览可见地图边缘（有限体素地图的正常边界）。

## 3. 实走验收（`docs/map-pharaoh/acceptance-0.20.3/pharaoh-walk/`）

- 结果：**34/34 passed · 0 skipped · 0 failed**，浏览器错误 0；JSON + 17 张过程截图。
- 覆盖：A 南/西/东三门进墓室、外层西大阶梯 108×0.5 m 上顶（+59）、北面外阶梯壳 +20、A/B 占点高度门控、B 四入口（含东侧双爪间 2 m 石门错位门厅）、A–B 墓道全程实走、两个中途出口爬升、C 主街→街心占点、D 下水/上岸、E/F/G 地面通路、蓝/橙出生区、M 小地图。
- 已知几何口径：
  - B 东门（前庭 x516..535）已按“石门偏南 z641..643”的真实错位改成 z642 路线，玩家可过 2 m 石门并到达 hall（34/34）。
  - 北侧施工栈道（builder 内层 `north-ramp-a/b`）位于 264 m 外层壳内部，实走不可达；验收改用实际可达的外层阶梯壳（北面爬到 +36.5）。
- 命令：`PHARAOH_AUDIT_OUT=docs/map-pharaoh/acceptance-0.20.3/pharaoh-walk npx tsx tools/game/audit/pharaoh-walk.ts`。

## 4. 性能采样（`pharaoh-performance.json`）

| 场景 | 玩家 | 载具 | calls p95 | tris p95 | sim p95 | fps | dead frames |
|---|---:|---:|---:|---:|---:|---:|---:|
| 8v8 | 16 | 34 | 102 | 798,764 | 1.0 ms | 59.9 | 0 |
| 8v8 + 4× CPU | 16 | 34 | 102 | 798,764 | 3.6 ms | 60.2 | 0 |
| 12v12 | 24 | 34 | 107 | 802,260 | 1.3 ms | 59.9 | 0 |
| 12v12 + 8 压力车 | 24 | 40 | 115 | 807,756 | 1.4 ms | 59.9 | 0 |

- 结果均为 `failed=false`、`errors=[]`；采样 60 s/场景，1280×720、low/64、60 fps 上限。
- 命令：`npx tsx tools/game/audit/pharaoh-performance.ts`（默认写到本目录）。
- 硬件口径：Apple M5 Pro / Chromium headless，不是 J1900 目标机。

## 5. 结论 / 遗留

- 平面图、38 张真实 world 截图、34/34 实走、4 组性能均完成，身份一致为 0.20.3 / 44cb0012f3292061 / v11。
- 仍需 src 侧确认（本工具不改 src）：北侧内层施工栈道 `north-ramp-a/b` 被 264 m 外层壳包裹，实走不可达；验收使用实际可达的外层北阶梯。
- 未部署。
