# CRAZYSHOOT 0.20.2 发布

- 版本：0.20.2
- BUILD_ID：`bddc712ac7882b1a`
- 线上：https://crazyshoot.haokee.org
- 发布目录：`/var/www/crazyshoot/releases/0.20.2-bddc712ac7882b1a`
- 上一版：`0.20.1-5f8eee7b85f1c452`

## 内容

- 金字塔外层改 1 m 台阶，可直接沿坡面跑上；修正外门框横堵坡面。
- 所有玩家/载具取消 550 m/360–420 m 隐藏裁剪；远景角色只做位置 LOD，不做骨骼动画；视锥内一律渲染。
- 100v100 AI LOD：三组共享目标、非战斗低频、交火保留瞄准；不再每 Bot 全图选点/BFS；狙击 360 m 视距。
- 载具高速过坎撞击伤害：≤12 m/s 不扣血，单次 ≤10% 最大血，1.4 s 冷却，不再连续帧爆车。
- 战术图每图独立配色（不再全局橄榄绿）、256 底图 + 平滑；平面/战术图统一 1:1。
- 100 Bot 出生按黄金角分散，减少出生点拥堵。

## 验证

- `npm run build` exit 0；`npm test` **270 passed**。
- 线上 `/version.json` = 0.20.2 / bddc712ac7882b1a。
- 100v100 真实 host：sim p95 **7.5 ms**、p99 13.7、60 tick/s、render p95 3.3 ms、60 fps；详见 `docs/audit-2026-11-10/pharaoh-100v100.md`。
- 回滚 `current` 到 `0.20.1-5f8eee...`。
