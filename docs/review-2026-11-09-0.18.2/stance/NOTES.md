# 蹲/趴过渡 + 双手撑地（0.18.2 实机）

第三人称远端角色（`addPlayer('probe','PROBE','orange',true)`，固定站桩）在断桥 A 高地平坦草地（105,191）播放 `applyStanceTransition`。正面/侧面各一台固定自由相机，逐帧驱动 `updateRemotes(1/60)`，HUD 与第一人称枪模已隐藏。

## 动图（每段 站 ↔ 蹲/趴 一个完整往返）

| 文件 | 内容 | 规格 |
| --- | --- | --- |
| `front-crouch.gif` | 正面 站→蹲→站 | 12 fps / 2.58s（31 帧）/ 880×495 |
| `front-prone.gif` | 正面 站→趴→站 | 12 fps / 2.58s / 880×495 |
| `side-crouch.gif` | 侧面 站→蹲→站 | 12 fps / 2.58s / 880×495 |
| `side-prone.gif` | 侧面 站→趴→站 | 12 fps / 2.58s / 880×495 |

时间轴：下蹲/趴下 1.10s → 保持 0.10s → 起身 1.10s → 回稳 0.28s。

看点：中段双手先离枪、伸到身前地面撑住，再落定/起身；起身时手先撑地再把身体推起来（`direction='up'` 的撑地峰值在 p≈0.38）。侧面版本最清楚。

## 关键帧（1280×720，每组 10 张）

`keys/<front-crouch|front-prone|side-crouch|side-prone>/down-p000/025/050/075/100.png` 与 `up-p000/025/050/075/100.png`：
- `down-*`：站立 → 蹲/趴的下落方向，p=0/.25/.5/.75/1；
- `up-*`：蹲/趴 → 站立的起身方向，p=0/.25/.5/.75/1。

## 实测（手腕世界高度，地面为 0）

| 过渡进度 | 左手腕高度 | 右手腕高度 |
| --- | --- | --- |
| p=0.25 | +0.56 m | +0.56 m |
| **p=0.50** | **+0.07 m** | **+0.07 m** |
| p=0.75 | −0.05 m | −0.08 m |

p=0.5 时双手腕正好落在 `PLANT_Y=0.07m`，就是“掌心撑地”的接触点；与动画里 `PLANT_FORWARD=0.35m / PLANT_SPREAD=0.22m` 的设计一致。

## 已有的辅助静帧

- `front.png` / `frontlow.png` / `side.png` / `side2.png`：站桩与过渡中的正面/侧面大图。
- `stand-crouch-down-low-dbg.png`、`prone-stand-up-low-dbg.png`：动画模块直出的 5 连帧条带（青色=左手、红色=右手，调试配色），撑地接触最直观。
- `stand-prone-down-three.png`、`stand-prone-down-side.png`、`crouch-stand-up-three.png`、`prone-stand-up-three.png`：实机三连/侧视补充。

> 备注：角色是方块模型、无手指，且当前画质下没有接触阴影，手掌与草地的接触主要靠手腕高度和手臂姿态判断；GIF 里看黑色手套落到草地高度即可。
