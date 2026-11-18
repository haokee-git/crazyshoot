# 烟雾遮挡弹孔（renderOrder）— 旧 bug vs 新修复

对应修复：**弹孔贴花 / 弹着灰尘 / 烟云三者的绘制顺序**。
- 旧：烟云 `renderOrder = 0`，与弹孔同批（弹孔池实际是 1）→ 烟先画、弹孔后画，且烟 `depthWrite = false`，于是**贴着墙的弹孔会盖在烟云上，隔着烟能看见墙上弹孔**。
- 新（0.18.2）：弹孔 `1`、灰尘 `2`、烟云 `3`，烟最后画并由深度缓冲挡住"烟后面更远的墙"；烟本身仍不写深度，避免遮挡后续半透明。

## 实机复现（garden，本地 dev 0.18.2）

同一面墙、同一团烟、同一机位，只切 `smokeMesh.renderOrder`：
- 墙面：花园 x≈166 的石墙，法线 −X，`material = 1`
- 弹孔：`g.impacts.spawn(point, normal, 1, true)` 打 4 个（乘算贴花，正常 10s 淡出）
- 烟：`g.tactical.smokes[0]` + `g.tactical.smokeMeshes[0]`，贴墙前 2.2m
- 相机：沿墙法线后退 5.2m，`fov 58`

> 取景说明：游戏里烟球默认半径 **6m**，贴墙放置会把相机整个包进烟里（全屏灰）。为了能"看见墙 + 烟 + 弹孔"三者关系，截图时把 `smokeMesh.scale` 缩到 **0.22×（半径≈1.3m）**、`opacity 0.55`。**只改了缩放/透明度，没有改排序逻辑与材质设置。**

| 角度 | 旧 bug（renderOrder=0） | 新修复（renderOrder=3） |
| --- | --- | --- |
| 正面 5.2m | ![旧](smoke-front-OLD-bug-decal-over-smoke.png) | ![新](smoke-front-NEW-fixed-smoke-over-decal.png) |
| 侧向 32° | ![旧](smoke-oblique-OLD-bug-decal-over-smoke.png) | ![新](smoke-oblique-NEW-fixed-smoke-over-decal.png) |

**看点**：旧图里 4 个黑色弹孔清晰地浮在烟云上——这正是"隔着烟能看见弹孔"的 bug；新图同一团烟、同一位置，弹孔被烟完全盖住。

## 交替 GIF

![旧/新交替](smoke-old-vs-new.gif) — 每 1.5s 在旧/新之间切换（960 宽，正面对比）。

## 复现脚本

`/tmp/rev/smoke.mjs`：自动在花园里找一面 `|n.y|<0.2`、距相机 3.6–5.6m 的竖直墙 → 打 4 个弹孔 → 摆烟 → 依次用 `renderOrder=0` / `3` 渲染并截图。
