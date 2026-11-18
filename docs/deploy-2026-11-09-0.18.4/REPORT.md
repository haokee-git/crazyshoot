# 上线记录：0.18.4 / 779082b9c571ca43

2026-11-09。恢复歪头 20° 上半身旋转（第一人称枪/手绕前向轴滚 20°），同时保留镜头沿腰部枢轴圆弧平移（满偏横移 0.205m、下沉 0.036m、镜头不滚转）。

线上验证：`/version.json` = 0.18.4/779082b9c571ca43/voxel-halfgrid-v6；主 JS `game-CNVhLvBj.js` 本地/线上 SHA-256 一致 `9c8eb79a…`。

回滚：`ln -sfn releases/0.18.3-be037a4dcf4b7e96 /var/www/crazyshoot/current`
