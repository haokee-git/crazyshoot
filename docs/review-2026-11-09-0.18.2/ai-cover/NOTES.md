# AI 蹲掩体 · 沙袋后蹲下并保持（0.18.2 实机）

- 版本：0.18.2（本地 dev，http://127.0.0.1:5174）；地图：断桥 broken_bridge。
- 场景：蓝队营地前沿沙袋线 (138–162, z=56；顶面 y=3.5、地面 y=2.0，高 1.5 m)。
  - 玩家在沙袋北侧 (150, 70，眼高≈3.6)，敌 bot 在沙袋南侧 (150, 54)，相距 16 m；
  - 冻结 bot 移动（覆盖 `localNavigation.steer`），威胁注入为玩家位置（`threats.set(localNetId,{weight:4})`）；
  - `botCoverStance` 判定「站立时 1.62 m / 1.45 m 两条视高线可见，蹲下后 1.15 m / 1.4 m 两条视高线全被沙袋挡住」→ `stanceIntent=crouch`。
- 相机：玩家侧平视 3/4 视角（眼高 3.52 m，距沙袋 5.2 m、距 bot 约 7.2 m），HUD 隐藏；前 0.4 s 为未注入威胁的站立段。

## 文件
| 文件 | 看点 |
| --- | --- |
| `ai-cover-crouch.gif` | 3.0 s / 10 fps / 960×540 / 240 KB：站立（头肩露出沙袋顶沿）→ 下沉 → 蹲姿完全藏进沙袋后 → 保持不动 |
| `still-1-stand-front.png` | 正面站姿静帧：上半身与枪露出沙袋顶，正是「站着露头」 |
| `still-1-stand-top.png` | 站姿俯视：身体贴沙袋后方，脚位未动 |
| `still-2-crouch-front.png` | 蹲下后正面：沙袋顶沿以上无任何身体/头盔露出（全藏） |
| `still-2-crouch-top.png` | 蹲下后俯视：仍贴住沙袋背侧，位置未漂移 |

## 实测（同场景脚本统计，逐帧记录）
- `stanceIntent`：注入威胁后的下一个决策帧即切到 **`crouch`**，并在尾部 2.6–3.0 s 持续为 `crouch`，**没有反复站起**（姿态锁定期 1.7 s，期间不横拉暴露）。
- 身位高度：**1.80 m → 1.25 m**（`controller.bodyHeight`），过渡 **约 0.6 s**（实测采样；过渡曲线本身约 0.55 s），眼高 1.62 → 1.12 m。
- 蹲下后 bot 位置 (150, 54)、y=2.0 保持不变；期间 `targetId=null`、**0 次开火**（本场景只验证姿态决策，威胁来自记忆而非视野）。
- 对照：站立时玩家→bot 的 1.62 m 视高线 `sightBlocked=false`（可见）；蹲姿 1.15 m 视高线 `sightBlocked=true`（完全隐蔽）。

## 复现命令
```bash
node /tmp/cap-aicover.mjs        # 输出 /tmp/frames-ai-cover
ffmpeg -y -framerate 10 -i /tmp/frames-ai-cover/side_%03d.png \
  -vf "scale=960:-1,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 ai-cover-crouch.gif
```
