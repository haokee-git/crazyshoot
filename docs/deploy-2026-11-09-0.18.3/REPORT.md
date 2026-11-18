# 上线记录：0.18.3 / be037a4dcf4b7e96

2026-11-09。修复载具可见准星与弹着点不一致：`vehicleHud.actual` 由「炮管方向投影」改为钉在弹道收敛点（屏幕中心），吉普 MG 白点/30mm「实炮方向」环与墙上弹着点重合（实测 50/50）。

线上验证：`/version.json` = 0.18.3/be037a4dcf4b7e96/voxel-halfgrid-v6；`game.html` 200；主 JS `game-DIa0LWIy.js` SHA-256 与本地一致 `12612ed2…`。

回滚：`ln -sfn releases/0.18.2-983d7394ad8ecd7c /var/www/crazyshoot/current`
