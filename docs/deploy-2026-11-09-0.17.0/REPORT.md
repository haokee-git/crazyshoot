# 上线记录：0.17.0 / 0a553de4fb7df3a3

2026-11-09，Asia/Shanghai。已上线 **0.17.0 / 0a553de4fb7df3a3**：[打开游戏](https://crazyshoot.haokee.org/game.html)。站点目录 `/var/www/crazyshoot/releases/0.17.0-0a553de4fb7df3a3`，切换前为 `0.16.6-7a4b061e6e2270d3`，该目录保留可直接回滚。

本轮内容：载具生存性重做（普通子弹可打炸非装甲车、低血冒烟、摧毁爆炸 + 全黑残骸 + 范围伤害、高速下车摔伤）；火箭筒与喷火器实装；AMR 伤害调整为对 APC/IFV 3 枪、轻坦 5 枪、主战 7 枪；四图特殊武器点位重排（AMR×2 + 火箭筒×2，删除反坦克地雷，船坞/花园保留喷火器）；小地图与全屏战术地图显示三种特殊武器图标；载具武器散布（30mm 连射、120mm、载具机枪）；全屏战术地图支持拖动与滚轮缩放。

## 发布步骤

1. `package.json` 版本 0.16.6 → 0.17.0，`npm run build`，生成 `dist/version.json` = 0.17.0 / `0a553de4fb7df3a3`。
2. 为 `dist/` 逐文件生成 `release-manifest.json`（1212 个文件 SHA-256 + 身份），用 Python `tarfile` 逐文件打包（1213 条目，只含普通文件），34,011,284 字节，SHA-256 `e57815f3…`。
3. 上传压缩包与 `deploy/atomic-release.py` 到 `/tmp`，服务器端 `sha256sum` 与本地一致。
4. `stage`：校验压缩包 SHA 与 `current` 未变，解包后逐文件校验 1212 个哈希，保留上一版 27 个带哈希资源；此时线上仍为 0.16.6。
5. `activate`：临时软链 + `os.replace` 原子切换 `current`，切换前再次校验 `current == previous`。

## 线上验证

| 项目 | 结果 |
| --- | --- |
| `/version.json` | `0.17.0` / `0a553de4fb7df3a3` / `voxel-halfgrid-v5` |
| `/`、`/game.html` | 200 |
| 主 JS `/assets/game-CqPgM2h2.js` | 200，SHA-256 与本地一致（`738c2456…`） |
| `/signal` WebSocket 升级 | 101（HTTP/1.1） |
| 公网浏览器冒烟 | 无页面错误，加载 4.5s；船坞 5 个特殊武器箱（AMR×2 / RPG×2 / FLM×1），小地图 `crates=5`，M 战术地图正常打开 |

公网实机截图：

![线上验证](online-check.png)

## 回滚

```bash
ln -sfn releases/0.16.6-7a4b061e6e2270d3 /var/www/crazyshoot/current
```

或对 0.16.6 重新执行一次 `atomic-release.py`（`previous` 传当前版本）。

## 备注

- 信令服务未重启，保持 `active`。
- 本地保留发布包 `docs/deploy-2026-11-09-0.17.0/0.17.0-0a553de4fb7df3a3.tar.gz`。
- 服务器 `releases/` 历史版本未清理。
