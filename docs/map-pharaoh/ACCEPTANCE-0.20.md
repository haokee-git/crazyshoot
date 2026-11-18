> **历史文档（0.19–0.20.2 时代）：以下内容含旧 1000 m/五据点数据，已被 0.20.3 取代。当前事实见 [README.md](README.md) 与 [ACCEPTANCE-0.20.3.md](ACCEPTANCE-0.20.3.md)。**

# 法老坟墓 0.20.0 · 第二轮实测修复验收

- 版本：**0.20.1**
- BUILD_ID：**`5f8eee7b85f1c452`**
- MAP_REVISION：`voxel-halfgrid-v10`
- MATERIAL_REVISION：`6`
- 线上目标：https://crazyshoot.haokee.org

## 本轮用户实测问题 → 结果

| 用户问题 | 处理 | 证据 |
|---|---|---|
| 金字塔内部死路、只有一个出入口、到不了狮身 | 南/西/东三个门洞石墩贴墙；储藏室/塌陷间各凿 10/12 m 新门接北廊，两条单向闭合环；东门 x399–408 岩体封死段凿开 18 m 直段；A 口前庭 + 顶板 | `tests/pharaoh-walk.test.ts` 34/34；`tools/maps/pharaoh-tunnel-probe.ts --walk` |
|  pyramids 太小、场景太远 | 外层大金字塔 **264×264**、顶 +58，原 132 m 内核/墓室保留；西/北两条 108 级外部大阶梯；南/西/东 66 m 外围门廊 | `docs/map-pharaoh/render/10-pyramid-far.png`、`11-pyramid-near.png` |
| 地图时间不够 | 法老图 **1200 s**（其他图 420 s），HUD/整备即显示 20:00 | `tests/pharaoh-map.test.ts`、`room-flow` 的 duration=1200 |
| 狮头上方缺半块 | 前脸补到 y33、连续实体零空洞；眼窝 1 m、嘴 1 m 浅槽；三层椭圆顶、删前垂带 | `render/21-sphinx-front.png`、`sphinx-face-close.png`、probe 46/46 |
| 空气墙不让坦克进室内 | 法老建筑门洞净高 3→4 m，门外加 3 m 实体石坡并同步 `primary`；无隐形禁行 | `door-ramp-*` detail；MBT 实驶进入服务房 |
| 贴图 64 丑/对比高/粑粑色/沥青丑 | 54 图案/162 PNG；沙金化；64 档地面最大通道差 11.5、13–15 色；道路改经典 `asphalt_fine`(4)、暖砾石(75)；worldTint 归中性 | `docs/map-pharaoh/materials/contact_sheet_64.png`、`render/00` |
| 两个新场景 + 7 据点 | F 卡纳克列柱神庙（26 柱/4 道石梁/方尖碑/围墙）；G 帝王谷采石场（半埋巨像头/采石台阶/石料）；据点 A–G | `render/44`–`47`、`tests/pharaoh-map` 7 点 |
| 每侧人数上限 100 | 房间/引擎/信令全部 4–100（总 200）；房间页 4–100 步进器、AI 补位、拖队 | `tools/game/audit/room-flow-check.ts` 11 步全绿 |
| 大厅只能输入房码/创建或加入 | 入口仅房间码 + 创建/加入；单人/旧模式入口删除（仅 audit=1 保留测试钩子） | `docs/audit-2026-11-10/room-flow/01-entry.png` |
| 赛后只能回大厅 | 返回房间（5s 自动）+ 返回大厅；房主解散/成员退出；换图/人数再开 | `room-flow` 11 步 |
| 坦克斜/大坡卡住 | 9 点最小二乘平面拟合，MBT/轻坦 36°/32°；均匀 25/35° 斜向可走，40°+ 拒绝；真实 broken_bridge 坡验证 | `tests/vehicle-slope.test.ts` 15/15；`vehicle-motion/route/pilot` 全绿 |
| 法老图载具提速 | 摩托 120、吉普 100、APC 80、IFV 60、轻坦 55、MBT 50 km/h；加速度按极速增幅的 1/2 提升 | `PHARAOH_VEHICLE_PERFORMANCE` |

## 验证

| 命令 | 结果 |
|---|---|
| `npm run build` | ✅ 0.20.0 / bebb33 |
| `npm test` | ✅ 28 文件 / **269 tests** |
| `pharaoh-walk.test.ts` | ✅ 34/34（含三门外进入墓室、两条环线、外层西/北登顶、A–B 墓道） |
| `room-flow-check.ts` | ✅ 11 步：入口/建/加/拖队/开局/赛后回房/换图/5s自动/退出/解散/满员 |
| `pharaoh-performance.ts` | ✅ 4/4 跑（真实 60 s） |
| 真实截图 | ✅ **31 场景** @ bebb33，`render/index.md` |

## 性能（M5 Pro / Chrome headless，1280×720 low/res64）

| 场景 | calls p95 | tris p95 | sim p95/p99 | heap |
|---|---:|---:|---:|---:|
| 8v8 | 110 | 878,143 | **3.7 / 5.8 ms** | 312 MB |
| 8v8 4×CPU | 110 | 878,267 | **16.5 / 30.2 ms** | 328 MB |
| 12v12 | 114 | 880,935 | **5.4 / 8.5 ms** | 312 MB |
| 12v12+40 | 113 | 880,255 | **5.5 / 9.1 ms** | 306 MB |

- 目标 **sim p95 <1 ms 仍未达到**；大金字塔外层/两个新场景使 tris 从 636k 升到 ~880k，p95 从 2.4–5.4 升到 3.7–5.5 ms。已如实记录，不修改口径。
- 低端真机未验收。

## 已知取舍

- 大金字塔外层/狮身/巨像均为 1 m 体素块面，近看仍有台阶感；狮身正脸是“方块化人脸”，不是写实雕刻。
- 建筑门外石坡是真实几何，不是隐形墙；仍有少数 1.5 m 窄门（狮身内殿）按设计不通载具。
- 100v100 的数据/协议支持已落地，但未做 200 人实机性能验收。
- 浏览器 QA 直线 walker 未重跑全部 F/G；Node 正式控制器和截图为准。
