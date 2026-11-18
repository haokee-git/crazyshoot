# AI 反制狙击 · 扫描 → 发现 → 首发精准 → 后续散布

- 版本：0.18.2（本地 dev，http://127.0.0.1:5174）
- 地图：断桥 broken_bridge；玩家在 A 高地 (105, 195，地面 y=8)，敌 bot 在 (233, 200，平地 y=2)，跨河直线视距约 128 m。
- 场景：`addPlayer('probe-bot', … , 'orange', true)` + AWM/8x 狙击手配装；冻结移动（覆盖 `localNavigation.steer`），以 `threats.set(localNetId,{weight:4,longRange:true})` 注入玩家威胁；玩家设为不可击杀靶（拦截对本地玩家的伤害，便于 AI 连续开火）。
- 相机：自由相机，位于 bot 侧后方约 6.8 m、高 2.3 m、fov 44°；HUD 隐藏。首帧前 1.5 s 为无威胁控制段。
- 说明：为聚焦反狙链路，本场景把 `botUpdateStance` 置空（保持站姿），不影响瞄准/开火逻辑。

## 文件
| 文件 | 看点 |
| --- | --- |
| `ai-counter-side.gif` | 7.8 s / 10 fps / 960×540 / 917 KB：站立待机 → 威胁注入后 180° 转头扫描 → 锁定抬枪 → 首发（枪口焰）→ 后续连发 |
| `still-1-scan-side.png` | 「扫描转向中」：bot 正从背对（yaw≈-90°）转向目标方向，头部仍在转 |
| `still-2-first-shot-front.png` | 「首发瞬间」正面：枪口焰清晰，射线指向山脊上的玩家 |
| `still-2-first-shot-top.png` | 首发瞬间俯视：身体朝向西侧目标、枪口对准 |
| `still-2-first-shot-wide.png` | 首发瞬间广角：把 bot、掩体与 128 m 外的山脊目标一起带进画面 |
| `still-3-burst-front.png` / `-top.png` | 「后续连发」：第 2/3 发，后续弹着散布（首发后不再零散布） |
| `still-0-aim-front.png` / `-top.png` | 锁定后、开火前的抬枪瞄准姿态 |

## 实测（同一场景，脚本内统计）
- **无威胁记忆**：控制段 4 s（验证脚本口径）/ 本片 1.5 s 内 `targetId` 始终为 `null`，**0 次发现、0 发子弹**。
- **有威胁发现**：注入威胁后 **617 ms** 锁定（远远在 6.5 s 上限内）。bot 起始背对目标，先按 0.9–1.3 s 扫描窗口以 4 rad/s 转头，进入 1.3 rad 视锥后立即 `observeBotTarget`。
- **首发反应**：锁定 → 首发 **1200 ms**（AWM 狙击手反应延迟 900–1400 ms），实测 1.20 s。
- **首发角误差**：**0.000°**（零散布 + 枪口级下坠补偿，并回写 yaw/pitch 让模型同步）。
- **后续散布**：第 2–4 发对完美弹道的角误差 **0.459° / 1.288° / 1.178°**（0.3–1.3° 区间，非激光）。
- **命中**：首发射向静止胸口 128 m，实测命中 1 发（伤害 95，AWM），后续散布弹自然脱靶 —— 与「首发精准、后续散布」的修复目标一致。

## 复现命令
```bash
node /tmp/cap-aicounter2.mjs     # 输出 /tmp/frames-ai-counter2
ffmpeg -y -framerate 10 -i /tmp/frames-ai-counter2/gif_%03d.jpg \
  -vf "scale=960:-1,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 ai-counter-side.gif
```
