# 3D 灰盒

## 船坞 / DRYDOCK V1（2026-11-05）
- 数据驱动：`buildMap3D(docks)` 从 `src/maps/docks.ts` 生成。
- 含地形/水岸/道路、建筑体块、集装箱/沙袋/树/岩石、A/B/C 据点、双方出生区、载具位、MG 巢、特殊箱、龙门吊。
- 预览：`preview/maps-3d.html?map=docks`；截图 `previews/maps/3d-docks-*.png`；总览 `3d-docks-review.png`。
- 第一版只做体块/可读性，未贴图、未接碰撞/地图切换。
- 环绕审查：`previews/maps/3d-docks-orbit.gif`（64 帧，960×600）。
- 五视图：overview/top/A/B/C，总览 `3d-docks-review.png`。

## 四图灰盒 V1（2026-11-05）
- 船坞 / 断桥 / 花园 / 机场全部由 MapDef 生成体块：地形、水岸/河道、道路、建筑、掩体、据点、出生区、载具位、MG 巢、特殊箱、主要地标。
- 总览：`previews/maps/00-four-graybox.png`；每图 `3d-<map>-overview.png` / `-top.png`。
- 断桥加了桥面缺口/河道/塔/标志；花园加了喷泉/门/雕像/花坛；机场加了飞机/雷达/机库。
- 未贴图、未接碰撞/地图切换；等灰盒确认后进入贴图与碰撞。
- 补齐断桥塔/桥缺、花园喷泉/门/雕像、机场飞机/雷达等 prop 体块；四图总览 `00-four-graybox.png`。
- 灰盒路线层：页面切到“路线”叠加蓝/橙主攻/侧翼线；指北针 + 50m 比例尺。Docks 路线图 `3d-docks-routes.png`。
- A/B/C 近景：`previews/maps/00-cap-close-review.png`（四图 × 三点）。
- 断桥 B 已补完整西半幅桥面 + 护栏；A/B/C 近景更新为 V1.1。

## 地面差异化 V1.2
- 程序化大块地面材质：Garden = 白石/红砖/泥土/草地混合；Docks=混凝土/沥青/砾石；Broken Bridge=草/土/石；Airfield=混凝土/沥青/草。
- 不再统一白格；灰盒图 `00-four-graybox.png`，Garden `3d-garden-overview.png`。
- 这是灰盒材质分区，不是最终 32px 贴图。
- V1.3：地面主材质块放大到 ~28m，块内 4.5% 变化；花园形成大片白砖/红砖/泥土/草地。
- V1.3 地面大块分区；0.11.3 水面游泳。

## 边界 V1.4
- 四图灰盒四周加 8.5m 封边墙 + 角柱，不再处理界外；预览 Docks 已更新。

## 四图可玩接入（0.11.9）
- 大厅地图选择：训练场/船坞/断桥/花园/机场。
- 每张图通过 `buildMapArena` 复用灰盒场景：AABB 建筑/掩体碰撞、水域、三据点、出生点、封边墙、64×64 小地图平面。
- 四图 host+guest 实测 phase=live，A/B/C 与平面图正常，无页面错误。
