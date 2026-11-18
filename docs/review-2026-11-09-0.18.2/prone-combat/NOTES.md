# 趴下时移动 + 开镜 + 开火同时进行（0.18.2 实机）

本地玩家在断桥 **A 高地西侧公路**（95,195，海拔 8m）趴下，按住右键开镜、按住 W 前进、按住左键全自动射击。AKM + 红点（`setLoadout({weaponId:'akm',opticId:'red_dot'})`）。

- `prone-combat.gif`：**12 fps / 2.5s（30 帧）/ 720×405**，3.3MB。
- `prone-still.png`：1280×720 单帧（p=0.33s 附近的开火帧，可见枪口火光/后坐）。

## 看点

- 趴姿视线只有约 0.48m 高（画面贴地），红点镜仍居中；0.18.2 不再把“趴下移动”和“开镜/开火”做成互斥。
- 画面持续向前移动：路面白色标线、右侧石桥/树篱不断掠过。
- 全自动 600 RPM：2.5s 打掉 24 发（30→6），准星/镜圈每发上跳，后坐力可见。

## 实测（`/tmp/combat-stats.json`）

- `controller.prone = true`、`ads = true`、`viewmodel.adsBlend = 1.0`，且 `reloading = false` —— 三个动作同时成立。
- 移动速度 **1.25 m/s**（趴姿固定速度），2.5s 位移约 3.1m。
- 弹药 30 → 6；30 帧中有 **13 帧**检测到枪口火光（`viewmodel.flashTime > 0`）。
- 说明：开镜时枪口在镜体下方，火光被枪身挡掉一部分，只有约 1/3 的帧能看到明显的橙色闪焰；后坐力/准星跳动每一发都在。

## 抓法

`game.html?map=broken_bridge&prep=999&bots=0&res=64` → 单人开局 → 取消 rAF → 60Hz 逐帧 `simulate` + `presentation.render`，每 5 帧截一张。按住 Z 约 1.3s 完成趴下过渡后再开始录。脚本 `/tmp/combat-capture.mjs`。
