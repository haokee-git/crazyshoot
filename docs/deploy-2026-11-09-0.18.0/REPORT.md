# 上线记录：0.18.0 / 9f50151d5224e349

2026-11-09，Asia/Shanghai。已上线 **0.18.0 / 9f50151d5224e349**：[打开游戏](https://crazyshoot.haokee.org/game.html)。站点目录 `/var/www/crazyshoot/releases/0.18.0-9f50151d5224e349`，切换前为 `0.17.0-0a553de4fb7df3a3`，上一版保留可直接回滚。

本轮内容：四张地图建筑统一改造。所有非 `open` 建筑默认整栋可进入，南北墙 4m×3m 门洞（贴邻建筑改 3m 侧门）、四面墙 2m×2m 窗洞；净高 ≥8m 自动生成二层与 2m 宽、4 级×1m 楼梯；按 id/name 分类布置家具、隔墙与不碰撞的地毯/墙饰；新增 plaster / concrete-floor / wood-planks / rug / wall-art / industrial-sign / wall-map 七张 64px 室内材质，其中前三张同时作为 68–70 号体素材质。完整说明见 [MAP_DESIGN.md](../../docs/MAP_DESIGN.md) 与 [README.md](../../README.md)。

## 发布步骤

1. `package.json` 版本 0.17.0 → 0.18.0，`npm test`（17 文件 / 122 测试）与 `npm run build` 通过，`dist/version.json` = 0.18.0 / `9f50151d5224e349`。
2. 为 `dist/` 逐文件生成 `release-manifest.json`（1220 个文件 SHA-256 + 身份），用 Python `tarfile` 逐文件打包（1221 个条目，只含普通文件，无目录/._），34,047,468 字节，SHA-256 `66c9f086…`。
3. 上传压缩包与 `deploy/atomic-release.py` 到 `/tmp`，服务器端 `sha256sum` 与本地一致。
4. `stage`：校验压缩包 SHA 与 `current` 未变，解包后逐文件校验 1220 个哈希，保留上一版 29 个带哈希资源；此时线上仍为 0.17.0。
5. `activate`：临时软链 + `os.replace` 原子切换 `current`，切换前再次校验 `current == previous`。

## 线上验证

| 项目 | 结果 |
| --- | --- |
| `/version.json` | `0.18.0` / `9f50151d5224e349` / `voxel-halfgrid-v5` |
| `/`、`/game.html` | 200 |
| 主 JS `/assets/game-iyMCVb_B.js` | 200，1,109,757 B，SHA-256 与本地一致（`7a004b33…`） |
| 室内 manifest 与 plaster.png | 200，SHA/字节与本地一致 |
| `/signal` WebSocket 升级 | 101（HTTP/1.1） |
| 7 张室内材质请求 | 全部 200，浏览器实际请求 7/7 |
| 公网浏览器冒烟 | 0 页面错误 / 0 失败请求；大厅显示 PRE-ALPHA 0.18.0 / BUILD 9f50151d；约 8s 进入船坞整备 |

公网实机截图：

![线上大厅](online-check.png)
![线上游戏 HUD](online-hud.png)

## 回滚

```bash
ln -sfn releases/0.17.0-0a553de4fb7df3a3 /var/www/crazyshoot/current
```

或对上一版重新执行一次 `atomic-release.py`（`previous` 传当前版本）。

## 备注

- 信令服务未重启，保持 `active`。
- 本地保留发布包 `docs/deploy-2026-11-09-0.18.0/0.18.0-9f50151d5224e349.tar.gz`。
- 服务器 `releases/` 历史版本未清理。
