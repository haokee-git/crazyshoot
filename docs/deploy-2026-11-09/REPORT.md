# 上线记录：0.16.6 / 7a4b061e6e2270d3

2026-11-09，Asia/Shanghai。已上线 **0.16.6 / 7a4b061e6e2270d3**：[打开游戏](https://crazyshoot.haokee.org/game.html)。站点目录 `/var/www/crazyshoot/releases/0.16.6-7a4b061e6e2270d3`，切换前为 `0.16.4-2bf788a87d5b2484`，该目录保留可直接回滚。

本轮内容：地图方块严格像素化、Q/E 歪头 20°（含联机同步）、蹲/趴空格起身与趴下互斥、AI 按角色配枪/拉侧/战术投掷、弹着灰尘与弹孔（灰尘亮度重新配平）。

## 发布步骤

1. `npm run build`，生成 `dist/version.json` = 0.16.6 / `7a4b061e6e2270d3`。
2. 为 `dist/` 逐文件生成 `release-manifest.json`（1212 个文件 SHA-256 + 身份），打成 tar.gz（1213 个条目：1212 文件 + 清单）。
3. 上传压缩包与 `deploy/atomic-release.py` 到 `/tmp`，服务器端 `sha256sum` 与本地一致（`5e88e022…`）。
4. `stage`：校验压缩包 SHA 与 `current` 未变，解包后逐文件校验 1212 个哈希，保留上一版 25 个带哈希资源供在途客户端使用；此时线上仍为 0.16.4。
5. `activate`：用临时软链 + `os.replace` 原子切换 `current`，切换前再次校验 `current == previous`。

第一次打包用了 macOS `tar`，包里带了目录条目和 `._` 元数据，`stage` 在解包前拒绝并中止；已清理这次产生的空壳目录（`current` 未受影响），改用 Python `tarfile` 只打包文件后重新上传。生产在成功激活前始终停留在 0.16.4。

## 线上验证

| 项目 | 结果 |
| --- | --- |
| `/version.json` | `0.16.6` / `7a4b061e6e2270d3` / `voxel-halfgrid-v5` |
| `/`、`/game.html`、`/textures/fx/bullet_hole.png` | 200 |
| 主 JS `/assets/game-01o_voHF.js` | 200，SHA-256 与本地构建一致 |
| `/signal` WebSocket 升级 | 101（HTTP/1.1） |
| 公网浏览器冒烟 | 无页面错误；方块材质 `magFilter=1003`；Q 歪头 `roll=19.9°`、镜头滚转 0；开一枪生成 1 个弹孔 + 3 团灰尘，贴图 256 |

公网实机截图：

![线上验证](online-check.png)

## 回滚

```bash
ln -sfn releases/0.16.4-2bf788a87d5b2484 /var/www/crazyshoot/current
```

或重新对 0.16.4 执行一次 `atomic-release.py`（`previous` 传当前版本）。

## 备注

- 信令服务未重启，保持 `active`。
- 服务器磁盘 68G 已用 45G（66%），`releases/` 现有 103 个历史版本约 811MB；本轮未清理，需要的话可按「保留最近 3 个」另行处理。
