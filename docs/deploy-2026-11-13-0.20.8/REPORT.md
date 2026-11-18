# CRAZYSHOOT 0.20.8 发布报告

- 日期：2026-11-13（Asia/Shanghai）。站点：https://crazyshoot.haokee.org
- 版本：`0.20.8`；BUILD_ID：`edafa9550701d56a`；MAP_REVISION：`voxel-halfgrid-v13`；MATERIAL_REVISION：`7`。
- 发布目录：`/var/www/crazyshoot/releases/0.20.8-edafa9550701d56a`。
- 上一版：`/var/www/crazyshoot/releases/0.20.7-39de9da35f543d48`，保留供回滚。
- 发布包 SHA-256：`e33d55f04553d8269f90776c678be891434151e672ce5385a1c0c297daa7e947`；40,908,800 字节；1383 个文件加 manifest。

## 内容及发布

修复输入确认与物理状态错位、历史状态污染当前预测、旧输入重发窗口恢复受限、SCTP 队列滞留和旁观者速度外推回滑；同步 active/aiming，隔离传送前旧输入，精简 AI 快照。详见 `../audit-2026-11-13-network-movement/REPORT.md`。

通过 ssh-skill 对 `haokee-server`（production）预览后执行：Python tarfile 打包普通文件；上传包及 atomic-release.py；stage 验证 1383 个逐文件 SHA-256 并保留 78 个旧 assets；activate 检查上一版链接后原子切换 current。信令及 nginx 没有重启；未删除历史 releases。

## 验证

| 项目 | 结果 |
| --- | --- |
| 本地构建及身份重算 | 通过；当前 src/public 内容哈希与上线 BUILD_ID 一致 |
| Vitest | 48 个文件、419 测试通过 |
| core / maps / network / lifecycle 浏览器回归 | 全部 exit 0 |
| 三人、额外 RTT 80–96 ms、无人工丢包、生产包四种移动场景 | 21 项检查通过 |
| 三真人连接 + 37 AI，直走、连续转向 | 11 项检查通过，三个视角无直走回滑 |
| 线上 version.json / game.html / 主 JS | 0.20.8 正确，主 JS SHA-256 与本地一致 |
| 旧版主 JS | HTTP 200 |
| healthz / signal | ok / WebSocket 101，protocol 2，resume true |
| 线上三人移动回归 | 21 项全部通过，直走/转向/跳跃/蹲起，未额外注入延迟或丢包 |

线上主 JS：`assets/game-CmAhA0MH.js`，SHA-256：`8a87f6d1fba98394e5809b319b985213cf5526d991a7727469cd43cb08fbd397`。HTTP 与信令原始结果见 `http-signal.json`。

线上两个客机在四个场景的同输入序号历史位置误差为 0；快照到达引起的相机位置及角度跳变为 0；三个观察视角的直线反向位移为 0。原始逐模拟步与逐渲染帧轨迹见 `online-three-peers/`。

上述三端验收使用本机三个独立 Chromium 进程连接线上服务，未冒充三台物理机器的局域网实测。既有对局仍运行旧脚本，参与者须刷新到 0.20.8 后重新建房。

## 回滚

上一版和本版均保留。使用同一原子发布脚本的 activate 模式，将目标设为 `0.20.7-39de9da35f543d48`，previous 设为当前 `0.20.8-edafa9550701d56a`。执行前核对 current，若后续已有发布则重新检查，不能盲目覆盖。
