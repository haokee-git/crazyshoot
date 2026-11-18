# 换弹移速 / 疾跑（0.18.2 实机）

断桥 **A 高地公路**，本地玩家从 (95,195) 面朝西（+X 的反方向，路面白色标线作参照）。所有数值都是逐帧驱动 60Hz 模拟后从 `controller.velocity` 实测的。

## 文件

| 文件 | 内容 | 规格 |
| --- | --- | --- |
| `reload-speed.gif` | 按住右键 + W：先 ADS 走 1s（2.35 m/s），随后 `g.ammo=0; g.startReload()` 继续走 1.5s（5.3 m/s） | 12 fps / 2.5s（30 帧）/ 720×405，3.7MB |
| `sprint.gif` | 站立 0.25s → Shift+W 疾跑 2s（7.9 m/s） | 12 fps / 2.25s（27 帧）/ 720×405，3.5MB |
| `reload-still.png` | 换弹中（HUD 红色 RELOAD），1280×720 | 静帧 |
| `sprint-still.png` | 疾跑持枪姿态 + 世界快速后掠，1280×720 | 静帧 |

## 实测速度（`/tmp/combat-stats.json`）

换弹流程（x 为世界坐标，每 0.25s 采样）：

| 时间 | 状态 | 速度 | x |
| --- | --- | --- | --- |
| 0.00 s | ADS 走路 | 2.35 m/s | 94.89 |
| 0.75 s | ADS 走路 | 2.35 m/s | 93.20 |
| 1.00 s | 触发换弹（ADS 自动关闭） | 4.32 m/s（加速中） | 92.44 |
| 1.50 s | 换弹行走 | **5.30 m/s** | 89.87 |
| 2.25 s | 换弹行走 | **5.30 m/s** | 85.89 |

- ADS 1s 位移 ≈ **2.35m**；换弹后 1s 位移 ≈ **5.3m**，速度差 2.25 倍，GIF 里前 1s 慢、后 1.5s 明显加快（画面里白色路面标线掠过速度翻倍）。
- 机制：`ADS 走路 = 2.35 m/s`（`controller.aiming`），`换弹时 ADS 被强制关闭 → 普通走路 5.3 m/s`（注释在 engine.ts:3835 附近：换弹不能开镜，所以保持全速）。

疾跑：

- 站立 0.25s 后 Shift+W，`velocity = 7.90 m/s`（`SPRINT_SPEED`），2s 位移约 15.4m；GIF 中持枪姿态切换为疾跑抱枪。
- 参考坐标：x 从 95 跑到约 79.6（仍在 A 高地上）。

## 抓法

`map=broken_bridge&prep=999&bots=0&res=64`，单人 → 取消 rAF → 60Hz 手动 `simulate`；每 5 帧截一张（12fps）；HUD 每帧刷新。换弹用 `g.ammo=0; g.startReload()` 触发（`reloading=true`、HUD 显示 RELOAD）。脚本 `/tmp/combat-capture.mjs`。
