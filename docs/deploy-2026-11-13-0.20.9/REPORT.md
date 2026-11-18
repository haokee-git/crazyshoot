# CRAZYSHOOT 0.20.9 发布

- 日期：2026-11-13（Asia/Shanghai）；https://crazyshoot.haokee.org
- BUILD_ID：`9ae7471a9bd1f041`；MAP_REVISION `voxel-halfgrid-v13`；MATERIAL_REVISION `7`。本次不改变地图或材质。
- 目录：`/var/www/crazyshoot/releases/0.20.9-9ae7471a9bd1f041`。
- 上一版：`/var/www/crazyshoot/releases/0.20.8-edafa9550701d56a`，保留供回滚。
- 包 SHA-256：`c23952a9e5dbb99d4928f8e7e5c9a12d7ba2ecdea1f6d82776ec0d27455c242c`；40,908,800 字节。

本次修复断桥 C 点装甲长期留守、后车倒车堵路及坦克前视路径切过农舍拐角；占完家点立即前推，装甲分工并保持跟车间距。技术细节及本地验收见 `../audit-2026-11-13-armored-frontline/REPORT.md`。

通过 ssh-skill 对 haokee-server 生产目标预览后，上传普通文件 tar 并用既有 atomic-release.py stage/activate 发布。1383 文件逐项 SHA-256 校验通过；保留 79 个旧版 assets；没有重启 nginx 或信令，也没有删除历史发布。

构建通过；50 文件、427 单测通过；专项三场景及既有载具 AI 审计通过。源内容哈希已重算，与上线 BUILD_ID 相同。

线上 version.json、game.html、主 JS 验证通过，主 JS `assets/game-DT2GqxkR.js` 的 SHA-256 为 `1e25da9895f9e5a8cd12b1e579c1002155842b5075bcf63818898e3990bac97e`，与本地一致。healthz 为 ok，WebSocket 为 101，protocol 2 / resume true；0.20.8 主 JS 仍为 HTTP 200。原始结果见 `http-signal.json`。

线上生产包自然 40 人开局：坦克约 35 秒、装甲车约 45 秒进入桥面。直接放回 C 坡拥堵位置、桥上放置橙方坦克：装甲车约 20 秒、坦克约 25 秒进入桥面。两组专项复验均通过；原始轨迹、检测脚本的伤害关闭条件和验收限制见专项报告，不能当作真人实机完整比赛的胜负平衡结果。

回滚可通过同一原子发布脚本 activate 上一目录，previous 指向本版；执行前重新核对 current，防止覆盖后续发布。旧对局继续使用旧脚本，所有玩家需刷新到 0.20.9 后重新建房。
