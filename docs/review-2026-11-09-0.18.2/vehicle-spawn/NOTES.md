# 载具不再嵌进绿化带/残骸

对应修复：载具出生走 `vehicleSpawn()` 的**间隙搜索**——以地图作者的 pad 为圆心，半径 0→20m、每圈 24 个方向逐步外扩，要求地形可用、`footprintBlocked` 为空、且与其它载具 AABB 不重叠，才落位。作者手摆的 pad 有几个正好压在建 hedge/wreck 上，旧版直接把车摆在 pad 上，车头/炮管就插进树篱里。

## 修复前

![APC 嵌在树篱里](before-apc-inside-hedge.png)

`/tmp/tour/apc-side.png`（19:42 抓的旧机位）：APC 车身贴在树篱/路边，炮管与绿化带没有间距，属于典型的"人马一体"停放。

## 修复后（本地 dev 0.18.2，自由相机）

| 图 | 机位 | 看点 |
| --- | --- | --- |
| ![蓝队 4 车俯视](after-four-vehicles-overview.png) | 148,44,8 → 148,1,62 | 蓝队 4 辆（摩托/吉普/APC/轻坦）沿泊位一字排开，各自与树篱、木箱有可见间隙 |
| ![俯视高](after-four-vehicles-overview-high.png) | 148,62,26 → 148,1,62 | 同区域更高机位，能看出 4 车与后方树篱/建筑的距离 |
| ![摩托+吉普](after-moto-jeep-from-plaza.png) | 106,7.5,47 → 106,1,62 | 摩托与吉普：车身停在铺装上，树篱在车后有明显空隙，箱子不压车 |
| ![APC+轻坦](after-apc-tank-from-plaza.png) | 190,8.5,46 → 190,1.6,60.5 | APC 与轻坦并排：**炮管/车体都不再插入树篱**，与树篱墙面留出间隔 |
| ![沿街侧看](after-line-from-east.png) | 246,22,62 → 150,1.2,62 | 从东侧沿泊位方向看，4 车前后都脱离绿化和残骸 |

> 说明：4 辆车横跨约 105m（x=95…200），单张 1280×720 里要"能看出车身/炮管与树篱的间距"就必须分组近距离拍。上面 `moto-jeep` / `apc-tank` 两张成对图覆盖全部 4 辆，`four-vehicles-overview`（+high）给全局位置，`line-from-east` 是从泊位东端沿街侧看。

## 数值检测：视觉 AABB × 掩体 detail box

方法（对齐 `/tmp/check_veh_overlap.mjs`）：把每辆车的 `model.userData.collisionParts` 的盒子 8 个角点乘上世界矩阵，求并得到**视觉 AABB**；再与 `arena.scene.userData.collisionDetails` 里每个 detail box（含 hedge / wreck / planter / 石台）做三轴重叠，任一轴重叠 > 0.12m 记为相交。

结果（完整 JSON 见 [overlap-report.json](overlap-report.json)）：

```
8 辆车（蓝 4 + 橙 4） → 相交数 totalHits = 0
```

| 载具 | pad (x,z) | 实际落位 (x,z) | 偏移 | 相交 |
| --- | --- | --- | --- | --- |
| motorcycle-0 | 98,64 | 95.1,63.2 | 3.0m | 0 |
| jeep-1 | 118,64 | 116.5,61.4 | 2.9m | 0 |
| apc-2 | 182,64 | 180.0,60.5 | 4.0m | 0 |
| light_tank-3 | 202,64 | 200.0,60.5 | 4.0m | 0 |
| motorcycle-4 | 98,250 | 98.5,250.9 | 1.1m | 0 |
| jeep-5 | 118,250 | 118.5,251.9 | 2.0m | 0 |
| apc-6 | 182,250 | 182.8,252.9 | 3.0m | 0 |
| light_tank-7 | 202,250 | 202.8,252.9 | 3.0m | 0 |

**偏移量就是间隙搜索起作用的证据**：pad 上有绿化带，车被推到最近的可放置点，因此相对 pad 位移 1–4m，但不与任何掩体相交。

脚本：`/tmp/rev/vehicle.mjs`（检测 + 机位）、`/tmp/rev/veh_overview.mjs`（俯视总览）。
