# CRAZYSHOOT 0.20.7 发布报告

- 发布日期：2026-11-13（Asia/Shanghai）
- 线上：<https://crazyshoot.haokee.org>
- 版本：`0.20.7`；BUILD_ID：`39de9da35f543d48`；MAP_REVISION：`voxel-halfgrid-v13`；MATERIAL_REVISION：`7`。
- 发布目录：`/var/www/crazyshoot/releases/0.20.7-39de9da35f543d48`
- 上一版本：`/var/www/crazyshoot/releases/0.20.6-88917b7764d6f31e`
- 发布包 SHA-256：`4aa0984fcb61a5390b75cd986c33768a7ba5d6d25a2da4270b98c8670d6a8f8a`。
- 以原子发布脚本 stage、逐文件校验和 activate；1387 个文件验证通过，保留 73 个旧版 assets。未重启信令服务。

## 验证结果

- 本地构建通过；47 个测试文件、413 个单测通过。此前本机 40 人近车性能、AI、地图、水体和光影审计见 `docs/audit-2026-11-13-vehicle-40/`。
- 线上 `/version.json` 返回上述身份，`/game.html` 引用的主 JS SHA-256 为 `3f7157564564fe6ef83168ed749edbde56f976300c211899980d1faf9f5b151e`，与本地构建一致；旧版主 JS 仍可访问。
- 线上断桥浏览器冒烟成功：WebGL2、世界就绪、进入 live、无浏览器错误。
- `/healthz` 返回 `ok`；`wss://crazyshoot.haokee.org/signal` 返回 protocol 2 / resume true；信令服务 `active`。
- **公网双端联机回归未通过**：未额外注入丢包时，6 秒移动样本中出现 4 次大于 0.015 m 的反向位移，最大约 2.49 m；待确认输入达到 180 帧。人为注入 35–83 ms 延迟及约 6% 丢包的样本中最大反向位移约 5.11 m；强制中继的未注入丢包样本最大约 1.89 m。原始结果分别见 `public-normal.json`、`public-jitter.json`、`public-relay.json`。这是本机双浏览器连接线上服务的样本，根因与其他网络环境尚未验证，不能称公网联机无回退。

## SSH 配置

按用户选择，本机只保留 `Host haokee-server`，主机 `haokee.org`、用户、密钥及 `IdentitiesOnly yes` 保持原设置；工具已能识别生产环境。此前临时新增的 `crazyshoot-deploy` 已删除。原配置备份于 `~/.ssh/config.before-crazyshoot-20261113-202733-684836`；临时别名删除备份于 `~/.ssh/config.backup-20261113-202701`。

## 回滚

当前及上一版本均保留。需要回滚时可用发布脚本 `activate` 将 `/var/www/crazyshoot/current` 从本版本切回 `0.20.6-88917b7764d6f31e`；先确认当前链接没有被后续发布改变。没有删除历史版本。
