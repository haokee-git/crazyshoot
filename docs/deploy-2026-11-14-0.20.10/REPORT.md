# CRAZYSHOOT 0.20.10 发布

- 日期：2026-11-14（Asia/Shanghai）；站点 https://crazyshoot.haokee.org
- BUILD_ID：`7867408bd6239fa6`；MAP_REVISION `voxel-halfgrid-v13`；MATERIAL_REVISION `7`。
- 本版：`/var/www/crazyshoot/releases/0.20.10-7867408bd6239fa6`。
- 上一版：`/var/www/crazyshoot/releases/0.20.9-9ae7471a9bd1f041`。
- 发布包 SHA-256：`d59e5ed0b0982fe1e0983703456b06b09e6523db23e2bee18935d7cef31ffc10`；40,919,040 字节。

发布内容为局势驱动的步兵、载具及火控决策，保留原有执行能力与物理约束。设计见 `../AI_TACTICS.md`，验证见 `../audit-2026-11-14-tactical-brain/REPORT.md`。

通过 ssh-skill 对 haokee-server 预览并执行原子 stage / activate。1383 文件校验通过，保留 80 个旧 assets；没有重启信令或 nginx，没有删除历史 releases。

构建与 444 项单测通过，资源边界另有 21 项单测和 9 项运行时复验。四图 24 组新旧决策对抗的分地图累计得分均未下降；这属于 120 秒样本，不是长期胜率结论。

线上版本及主 JS `assets/game-DfeR_fVR.js` 与本地一致，SHA-256 `1b343561bbf8f5d24964e36bec7a8ea786047772f30bdd6848017adcb17e945c`。healthz ok，WebSocket 101 / protocol 2 / resume true，旧 0.20.9 主 JS 仍为 HTTP 200。见 `http-signal.json`。

线上三人（本机三独立 Chromium 进程）直走、转向验证：11 项检查全部通过，历史位置误差、快照镜头位移/角度跳变与直走反向位移均为 0。原始轨迹见 `online-three-peers/`。线上 AI 情境见 `online-ai/report.json`。

原子回滚可使用同一发布脚本 activate 上一版，previous 填本版；先核对 current 未被后续发布改变。旧对局需刷新到 0.20.10 后重新建房才会运行新代码。
