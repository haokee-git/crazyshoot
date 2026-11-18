# 上线记录：0.18.7 / 708d77f4ded9a161

2026-11-10 凌晨。AI 载具卡死修复 + 载具行驶逻辑审查：
- 路线规划 750 格上限截断（红房子斜坡坦克拿到 2 点死路）、地面模型三套不一致、纯追踪切角/±30° 转向锥、姿态检测自锁。
- 新增 `vehicles/motion.ts`（唯一姿态/碰撞/贴地/嵌入脱困）、`ai/vehicle-pilot.ts`（前视点+1.3s 转弯弧预演+卡住倒车/原地转/重规划+绞盘兜底）、重写 `ai/vehicle-navigation.ts`（二叉堆 A*、可达标志、全图上限、分段余量、拉直）。
- 蓝方 APC/轻坦出生点南移 4m（z64→60）避开长树篱。
- 回归：红房子斜坡 30s 位移 13.2→47.5m，最长静止 8.05→0.8s；全图 60s 橙坦位移 72m/静止 2.3s；tsc 0、vitest 157/157。

线上验证：/version.json = 0.18.7/708d77f4ded9a161；主 JS game-DOftUONn.js SHA 与本地一致。

回滚：ln -sfn releases/0.18.6-2ed27be2d855163c /var/www/crazyshoot/current
