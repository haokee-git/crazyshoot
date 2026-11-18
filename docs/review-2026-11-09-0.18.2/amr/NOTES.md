# AMR 独立模型 + 特殊武器换回

对应实现（0.18.2）：AMR 有自己的第一人称/世界模型（`models.ts buildAMR` + `presentation.amr`），不再是 AWM 换皮；特殊武器（RPG/AMR/喷火器）打空后自动换回主武器。

## 一、模型对照（实验室渲染，纯模型、无场景干扰；2560×720 双联拼版）

| 图 | 内容 |
| --- | --- |
| ![侧面](compare-lab-side.png) | 左 AWM / 右 AMR 侧面同尺度对照：AMR 全长 1.91m（AWM 1.51m）、宽 0.36（0.20）、高 0.54（0.38）；沙色护木枪托、深灰机匣、宽扁大制退器、两脚架、大盒弹匣 |
| ![腰射](compare-hip.png) | 腰射姿态下两把枪的第一人称体积对比 |
| ![冲刺](compare-sprint.png) | 冲刺姿态下的对比（AMR 明显更长更重） |

## 二、游戏内（实机 1280×720）

| 图 | 内容 |
| --- | --- |
| ![AMR 腰射](game-amr-hip.png) | 游戏内持 AMR 腰射：大制退器 + 高瞄镜 + 两脚架 |
| ![AMR 开镜](game-amr-ads.png) | 游戏内 AMR 开镜（8x） |

## 三、拾取 → 打空 → 自动换回（本次补拍）

同一场景、同一视角，只改武器状态：

| 图 | 状态 | 实测 |
| --- | --- | --- |
| ![AWM 主武器](game-AWM-primary-before-pickup.png) | 配装期把主武器设为 AWM（8x） | `weapon=awm`、`viewmodel=awm`、弹 5 |
| ![拾取 AMR](game-AMR-picked-after.png) | 走到 AMR 补给箱（248,190）按 E 拾取 | `weapon=amr`、`viewmodel=amr`、弹 5、`stowed=awm`；HUD 显示「反器材狙击枪 / .50」 |
| ![打空换回](game-AWM-reverted-after-ammo-out.png) | AMR 连打 5 发打空 | `weapon=awm`、`viewmodel=awm`、`stowed=null`（自动换回主武器，不再出现"拿着空 AMR 没法开火"） |

看点：三张里准星位置、背景一致，只有手里那把枪换了；第三张能直接看出"短一截的 AWM"回来了。

脚本：`/tmp/rev/amr.mjs`。
