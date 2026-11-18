# 上线记录：0.18.1 / 419c5e1b9fc7813c

2026-11-09，Asia/Shanghai。已上线 **0.18.1 / 419c5e1b9fc7813c**：[打开游戏](https://crazyshoot.haokee.org/game.html)。站点目录 `/var/www/crazyshoot/releases/0.18.1-419c5e1b9fc7813c`，切换前为 `0.18.0-9f50151d5224e349`，上一版保留可直接回滚。

本轮内容：

- **步兵武器平衡**：M16 更名 M16A4（内部 id 仍 m16）；Uzi 30 发弹匣、1250 RPM、伤害 16；Mk14 400 RPM；UMP45 800 RPM；MP5 900 RPM、伤害 22；M249 伤害 27；标准携弹统一为狙击 30 / 精确射手 120 / 突击步枪与轻机枪 180 / 冲锋枪 200。
- **喷火器更新**：火焰改为从喷口向前扩张的锥形范围判定（14m，锥面 + 头/躯干球半径容差）；只有正面头部被锥体覆盖才触发 **1.5 秒重度视野压制**，背后只掉血；AI 会真正失明并丢失目标；房主通过 `burn` 广播给客机，锥体判定与面部朝向逻辑抽到 `src/game/combat/flame.ts` 并有 8 项单测。

## 发布步骤

1. `package.json` 版本 0.18.0 → 0.18.1，`npm test`（18 文件 / 130 测试）与 `npm run build` 通过，`dist/version.json` = 0.18.1 / `419c5e1b9fc7813c`。
2. 为 `dist/` 逐文件生成 `release-manifest.json`（1220 个文件 SHA-256 + 身份），用 Python `tarfile` 逐文件打包（1221 条目，只含普通文件，无目录/._），34,048,159 字节，SHA-256 `33573ccc…`。
3. 上传压缩包与 `deploy/atomic-release.py` 到 `/tmp`，服务器端 `sha256sum` 与本地一致。
4. `stage`：校验压缩包 SHA 与 `current` 未变，解包后逐文件校验 1220 个哈希，保留上一版 31 个带哈希资源；此时线上仍为 0.18.0。
5. `activate`：临时软链 + `os.replace` 原子切换 `current`，切换前再次校验 `current == previous`。

## 线上验证

| 项目 | 结果 |
| --- | --- |
| `/version.json` | `0.18.1` / `419c5e1b9fc7813c` / `voxel-halfgrid-v5` |
| `/`、`/game.html` | 200 |
| 主 JS `/assets/game-CttWBfkA.js` | 200，1,112,219 B，SHA-256 与本地一致（`beed2001…`） |
| 室内 manifest / 贴图 | 200 |
| `/signal` WebSocket 升级 | 101（HTTP/1.1） |
| 构建产物标记 | 包含 `M16A4`、`burnBlind`、`igniteFace` |
| 公网浏览器冒烟 | 0 页面错误 / 0 失败请求；大厅显示 PRE-ALPHA 0.18.1；进入整备后当前武器 M16A4，flameJet / igniteFace / burnBlind 均存在 |

公网实机截图：

![线上大厅](online-check.png)
![线上游戏 HUD](online-hud.png)

## 回滚

```bash
ln -sfn releases/0.18.0-9f50151d5224e349 /var/www/crazyshoot/current
```

## 备注

- 信令服务未重启，保持 `active`。
- 本地保留发布包 `docs/deploy-2026-11-09-0.18.1/0.18.1-419c5e1b9fc7813c.tar.gz`。
- 服务器 `releases/` 历史版本未清理。
