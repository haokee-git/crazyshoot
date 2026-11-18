# CRAZYSHOOT 0.20.0 发布报告（法老第二轮修复 + 房间系统）

- 版本：0.20.0
- BUILD_ID：`02eb73a1417e793d`
- MAP_REVISION：`voxel-halfgrid-v10`
- MATERIAL_REVISION：`6`
- 发布目录：`/var/www/crazyshoot/releases/0.20.0-02eb73a1417e793d`
- 上一版：`0.20.0-bebb33c651976a93`（同版本前一构建，保留回滚）
- 站点：https://crazyshoot.haokee.org

## 内容

- 264×264 大金字塔外层、西/北外部大阶梯、三条外围门廊；内部两处真环线，三门可进，A–B 墓道贯通。
- 7 据点 A–G；新增 F 卡纳克列柱神庙、G 帝王谷采石场；场景外缘扩展（狮身柱廊、集市外廊、绿洲南岸、驿站货场）。
- 54 图案 / 162 PNG，金色沙地、经典沥青、低对比 64 档；法老载具提速（120/100/80/60/55/50 km/h）与坡度平面拟合。
- 大厅入口只保留房间码 + 创建/加入；房间 4–100/侧、地图、AI 补位、拖拽分队；赛后返回房间（5s 自动）/大厅；解散/退出。
- 法老 20 分钟，其他图 7 分钟。

## 线上验证

- `/version.json` = 0.20.0 / 02eb73a1417e793d / v10 / 6。
- 正常入口：`.lobby-solo` 数量 0，创建/加入两个按钮。
- 房间：房间码 7436，地图列表 5 张（含法老），每侧默认 8。
- 开局：7 据点 A–G、`matchRemaining=1200`、32 初始载具、蓝队、无页面错误。
- 信令已从小旧的 `crazyshoot-signal` 更新到 200 人版本并重启；房间 `capacity` 协议不再报 Unknown type。
- 回滚：`current` 切 `/var/www/crazyshoot/releases/0.20.0-bebb33c651976a93`。

## 归档

- 归档：`/tmp/crazyshoot-0.20.0-02eb73.tar.gz`，SHA-256 `e034e55808853af8c4d758f44c66bc362b194a9429b7852c4d0090323cb79c3f`。
- 截图 31 场景 @ 02eb73：`docs/map-pharaoh/render/index.md`。
- 性能 4 跑 @ 02eb73：`docs/audit-2026-11-10/pharaoh-performance.json`。
