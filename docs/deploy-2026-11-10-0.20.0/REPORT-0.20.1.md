# CRAZYSHOOT 0.20.1 补丁（平面/战术图 1:1）

- 版本：**0.20.1**
- BUILD_ID：`5f8eee7b85f1c452`
- 线上：https://crazyshoot.haokee.org
- 发布目录：`/var/www/crazyshoot/releases/0.20.1-5f8eee7b85f1c452`
- 上一版：`0.20.0-02eb73a1417e793d`

## 修复

- 平面图三张（地表/地下/高程）统一为 **2400×2400**、viewBox 1:1；不再 2400×1800 横向压扁。
- 游戏内战术地图画布取窗口短边成正方形（线上 1920×1080 下实测 canvas `1080×1080`、CSS `1080×1080`），两侧留黑边，世界不再拉伸。
- 战术图仍显示七据点 A–G、载具、AMR/RPG/喷火器。

## 验证

- `npm run build` exit 0；`npm test` **269 passed**。
- 线上 `/version.json` = 0.20.1 / `5f8eee7b85f1c452`。
- 线上战术图 canvas 1080×1080；`docs/map-pharaoh/render/72-tactical-map.png`。
- 平面 PNG：`file` 均 2400×2400。
- 回滚切 `current` 到 `0.20.0-02eb73a1417e793d`。
