# CRAZYSHOOT 0.20.6 发布

- 版本：**0.20.6**
- BUILD_ID：`123a57989007113b`
- 身份：`MAP_REVISION=voxel-halfgrid-v11`、`MATERIAL_REVISION=7`
- 线上：https://crazyshoot.haokee.org
- 发布目录：`/var/www/crazyshoot/releases/0.20.6-123a57989007113b`
- 上一版：`0.20.2-46a9513643812fad`（`voxel-halfgrid-v10` / 材质 6）
- 发布时间：2026-11-13

## 内容（相对线上 0.20.2）

- **0.20.6 光影 rev3（Devin 修改并入本次发布）**：五档光影 `无/低/中/高/极致`；`ultra` 独立 HDR 管线——CSM 3 级联 + PCSS 柔影、GTAO、HDR bloom、重投影运动模糊、遮挡感知太阳眩光、PMREM 环境与曝光自适应；贴图派生法线/粗糙度/凹陷、体素天光烘焙、单主水面平面反射+折射+菲涅尔、最终调色。不支持 `EXT_color_buffer_float` 时自动回退 `high` 并在设置页提示；设置 rev3 迁移旧 `sunShadows/glow/...` 字段。
- **0.20.5**：击杀播报改 `personalEvent` 定向可靠投递；信令 protocol 2（`resumeToken`/180 s 宽限）；客机预测增量修正；Vector 机瞄后照门降低；AI 出生/巡逻夹在地图边界内；对局时长 1–60 min（常规 10、法老 20）可自定义。
- **0.20.4**：阵亡 ≥5 s 后必须手动点“部署”；载具擦墙滑行与量化坡修复；断线恢复（Ctrl/Cmd+W 拦截 + beforeunload）。
- **0.20.3**：法老图 800×800 最终布局（金字塔、狮身人面像、A–G 七据点，覆盖率 68.4%）。
- 世界/材质 revision 同时前置：`v11` / `7`，与 0.20.2 客户端不再互通（buildId 闸门本职）。

## 构建与产物

- `npm run build`：exit 0（tsc `--noEmit` + vite 8.3.5）。
- 主包：`assets/game-DXbespab.js`（1,480,126 B），SHA-256 `accd0595d34c42d6b3890e079026a1067bf81acce7833a4206a212f3ef171516`（线上实测一致）。
- 归档：`crazyshoot-0.20.6-123a57989007113b.tar`，39,475,200 B，SHA-256 `06e6d740082f224ce7df31ffe79d9ddd305dcfdd34da30aacbde114f09ef9db4`，1384 条目（1383 文件 + manifest）。
- 首次 stage 因 tar 未含 `release-manifest.json` 失败（`current` 未动），补入 manifest 重新打包后通过；废弃的半成品 release 目录已删除。

## 验证

| 项 | 结果 |
|---|---|
| `npm run build` | exit 0 |
| `npm test` | 40 文件 / **397 tests passed** |
| 光影回归 `lighting-regression --phase=visual` | **PASS**，`failures.json` 为空（证据 `docs/audit-2026-11-13-lighting/`） |
| 生产冒烟（Playwright，docks 4v4，ultra） | 版本/身份正确，`lighting=ultra` 生效（CSM+cinematic），`phase=prep`，无 pageerror/console error |
| 线上 `/version.json` | 0.20.6 / `123a57989007113b` / v11 / 7 |
| 线上主 JS SHA-256 | 与 manifest 一致 |
| 旧资源保留 | 上一版 73 个 assets 已复制进新 release，旧页面请求仍 200 |
| 信令 | 新 `server.cjs`（143,362 B）已部署并重启；`wss://crazyshoot.haokee.org/signal` hello 返回 `protocol:2, resume:true`，healthz `ok:true` |

## 步骤

1. `npm run build` → 生成 `dist/` + `version.json`；`npm run build:signal`。
2. 本地生成 `release-manifest.json`（identity + 逐文件 SHA-256），Python `tarfile` 只打普通文件。
3. `ssh haokee-server`（ssh-skill）上传 tar 与 `atomic-release.py`。
4. `atomic-release.py stage <tar> releases/0.20.6-123a57989007113b <sha> releases/0.20.2-46a9513643812fad` → 校验 1383 文件 + 保留旧 assets。
5. 上传信令包 → `systemctl --user restart crazyshoot-signal`。
6. `atomic-release.py activate` 原子切 `current` 软链。
7. 线上校验 `/version.json`、主 JS SHA、纹理资源、`/signal` hello、浏览器冒烟。

## 回滚

```bash
ln -sfn /var/www/crazyshoot/releases/0.20.2-46a9513643812fad /var/www/crazyshoot/current
```

信令若需回退：用 0.20.2 时期的 `server.cjs` 覆盖 `~/apps/crazyshoot-signal/server.cjs` 并重启（本次信令协议 2，旧客户端不依赖 resume 时仍可用）。

## 备注

- 历史 releases 未做清理（保留全部，回滚余地最大）；如需执行“保留最近 3 版”，另行确认后操作。
- 本次未重启 nginx；静态站点走软链切换，无需 reload。
