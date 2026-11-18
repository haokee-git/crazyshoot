# CRAZYSHOOT 0.19.0 发布报告（法老坟墓）

- 日期：2026-11-10
- 版本：0.19.0
- BUILD_ID：`73a40f07225cdf34`
- MAP_REVISION：`voxel-halfgrid-v9`
- MATERIAL_REVISION：`5`
- 站点：https://crazyshoot.haokee.org
- 发布目录：`/var/www/crazyshoot/releases/0.19.0-73a40f07225cdf34`
- 上一版：`0.18.9-b34d21c5ba8e4fae`

## 发布包

- 归档：`/tmp/crazyshoot-0.19.0-73a40f.tar.gz`
- SHA-256：`25a594ee1f430478f3a42e5be06d4eb74067b00bda6fbcf0b47ed4540f30edb2`
- 1317 个普通文件 + `release-manifest.json`（逐文件 SHA-256 + identity）
- `release-manifest.json` identity 与 `dist/version.json` 完全一致。

## 步骤

1. 本地 `npm run build`（exit 0），生成 `dist/version.json`。
2. 打包 `dist/` 为 tar（仅普通文件，无 `._`/绝对路径/`..`）。
3. `ssh_skill.py upload` 到服务器 `/tmp`，远程 SHA-256 校验一致。
4. `atomic-release.py stage` → `verifiedFiles: 1317`、`retainedOldAssets: 46`、`currentUnchanged: 0.18.9`。
5. `atomic-release.py activate` → `current` 软链切到 `0.19.0-73a40f07225cdf34`。
6. 线上验证：
   - `/version.json` = `{"version":"0.19.0","buildId":"73a40f07225cdf34","mapRevision":"voxel-halfgrid-v9","materialRevision":5}`
   - `/game.html` 200
   - `/textures/pharaoh-v1/128/sand_fine.png` 200
   - `/assets/terrain-worker-DxFZCWMW.js` 200，本地 SHA-256 `dd225fd4b47b807c71fd9c571fcebffb8bbb32b08123eb29a2bbc3793dc7a800`
   - 生产环境真实加载 `game.html?map=pharaoh`：1000×1000、5 据点、32 初始载具、Worker buildMs ~9.0 s、无页面错误；截图 `docs/audit-2026-11-10/prod-pharaoh.png`。
7. 信令服务未重启；`/signal` 沿用现有 18789 服务。

## 回滚

```bash
ln -sfn releases/0.18.9-b34d21c5ba8e4fae /var/www/crazyshoot/current
# 验证 /version.json 回到 0.18.9 / b34d21c5ba8e4fae
```

归档保留最近 3 版；0.19.0 的旧资产（worker/chunk）已由 stage 保留 46 个文件，便于旧客户端过渡。

## 已知性能差距

`docs/audit-2026-11-10/pharaoh-performance.md`：draw calls p95 102–106 达标；sim step p95 2.4–5.4 ms，未达 <1 ms。该差距已写入交付文档，不隐藏。
