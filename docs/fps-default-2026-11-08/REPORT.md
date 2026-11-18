# 默认帧率改为不限并上线 0.16.4

已上线 **0.16.4 / 2bf788a87d5b2484**：[打开游戏](https://crazyshoot.haokee.org/game.html)。发布目录 `releases/0.16.4-2bf788a87d5b2484`，上一版 `releases/0.16.3-3498f5a1c03de72e` 保留，可回滚。信令服务未重启。

## 改动

- 帧率上限默认值从 30 改为 **0（不限）**；设置面板仍可再选 30 / 60。
- 旧存档迁移：上一版会把默认 30 一并写进本地设置，即使玩家只改过灵敏度。读取无版本标记的旧存档时，仍为 30 的帧率上限迁移为不限；玩家主动选择过 60 的保持 60。迁移只执行一次，之后手动选 30 会被正常保留（存档写入 `rev: 2`）。
- 版本号升至 0.16.4，README 同步更新。

## 验证

- 86 项单元测试通过（新增 4 项帧率默认/迁移测试），`tsc --noEmit` 与生产构建通过。
- 公网 `/version.json` 返回 0.16.4 与正确构建哈希；game.html 引用的 JS/CSS 与本地交付文件 SHA 一致；`frameLimit:0` 已在线上 bundle 中，未出现默认 `frameLimit:30`；`/healthz` 200。
- 公网浏览器检查（全新配置）：大厅显示 0.16.4 / BUILD 2bf788a8，设置中帧率上限为 **不限**，无页面错误。
- 公网浏览器检查（模拟旧存档 `{frameLimit:30,sensitivity:1.2}`）：刷新后帧率上限为不限，灵敏度 1.2 保留。

## 发布

- 1211 个文件逐一 SHA-256 校验后解包，`current` 原子切换；保留上一版 23 个带哈希资源给未刷新的客户端。
- 构建日志、发布计划、上传/暂存/切换回执、HTTP 与浏览器验证见本目录；截图 [全新配置](online-settings-default.png)、[旧存档迁移](online-settings-migrated.png)。

回滚：`ln -sfn /var/www/crazyshoot/releases/0.16.3-3498f5a1c03de72e /var/www/crazyshoot/current`。
