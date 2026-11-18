# CRAZYSHOOT 0.21.0 发布 · 千户苗寨

- 日期：2026-11-18（Asia/Shanghai）
- 站点：https://crazyshoot.haokee.org
- 版本：`0.21.0`
- BUILD_ID：`5a8e0374078786c2`
- MAP_REVISION：`voxel-halfgrid-v14`
- MATERIAL_REVISION：`8`
- 本版：`/var/www/crazyshoot/releases/0.21.0-5a8e0374078786c2`
- 上一版：`/var/www/crazyshoot/releases/0.20.10-7867408bd6239fa6`
- 发布包：`crazyshoot-0.21.0-5a8e0374078786c2.tar`，40,048,640 字节，SHA-256 `57ad05fd8eb18ebf09cf9d32ebddf34877a3a78ae1056180e4e446b693933555`
- 文件：1492 个（`release-manifest.json` 逐文件 SHA-256 校验全部通过）
- 保留旧 assets：82 个（0.20.10 旧客户端仍可请求旧 hash 文件）

## 发布内容

- 新增第 6 张正式图 **千户苗寨 `miao_village`**：500×500、5 个中性据点、20 分钟、138 栋 authored 建筑、三桥、两艘房主权威缆索渡船、9 架河岸/桥侧梯、14 块浅水梯田与主河多高度水域。
- 新增 32 个原创程序化体素材质（122–153）+ 4 个装饰 atlas，原生 32/64/128 PNG，独立 `miao-v1` 资源包。
- 大厅加入第 6 张地图；地图平面图 `previews/maps/06-miao_village.svg/png` 已更新为 `06/06`。
- 通用能力：`MapDef` capture footprint、多高度 `WaterVolume`、通用 map-world builder registry、通用 asset bundle、`capturePointAllows` 单一占点谓词、渡船快照/权威协议。
- 详细实现、截图与已知问题：[`../map-miao-village/REPORT.md`](../map-miao-village/REPORT.md)。

## 发布前验证

- `npm run build`：通过；`dist/version.json` 与发布 manifest identity 完全一致。
- `npm test`：**56 个 Vitest 文件 / 485 项测试全过**。
- `npm run test:water`：miao `openFaces 0 / leaks [] / traps [] / missingExit 0 / escapeFailures []`，32 次出水试验通过。
- 布局/建筑/材质/渡船/计分专项：`miao-village`、`miao-walk`、`miao-assets`、`river-ferry`、`miao-scoring` 全过。
- 已知非阻塞缺口（未在发布中隐藏）：8v8 draw calls 201 > 典型 150；12v12 211；ultra 292；双客户端 headless 手动步进下 host 乘客甲板最大滞后 25.4 m，但视觉位置 p95 0.019 m，单客户端乘客携带完全一致；**平衡待真人调优**。详见地图报告 §14。

## 部署过程

通过 `ssh-skill` 对 `haokee-server` 做只读预览后执行原子 stage / activate：

1. 远程确认 `current` 为 `0.20.10-7867408bd6239fa6`，目标 release 不存在，磁盘可用 24 GB。
2. 上传归档与 `atomic-release.py`，远程 SHA-256 与本地一致。
3. `stage`：1492 文件校验通过，保留 82 个旧 assets，**current 未动**。
4. 校验 staged `version.json`、miao 材质、主 JS SHA-256。
5. `activate`：原子切 `current` 到 `0.21.0-5a8e0374078786c2`。
6. **未重启 nginx / 信令服务，未修改 nginx 配置，未删除历史 release。**

## 线上验证

| 检查 | 结果 |
|---|---|
| `https://crazyshoot.haokee.org/version.json` | `0.21.0 / 5a8e0374078786c2 / v14 / 8` |
| `game.html` | HTTP 200 |
| 新主 JS `assets/game-BgFEosor.js` | HTTP 200；SHA-256 `7e0d6176fd6f9eab5f0f0c197c63ad8b63f23a44be527b303fb5b6b6a17ceab8`，与本地一致 |
| 旧主 JS `assets/game-DfeR_fVR.js` | HTTP 200（旧 assets 保留） |
| `textures/miao-v1/128/water_jade_river.png` | HTTP 200 |
| `textures/miao-v1/manifest.json` | HTTP 200 |
| `healthz` | `ok` |
| `/signal` WebSocket | `101 Switching Protocols` |
| 线上浏览器加载 miao | HTTP 200；`map=miao_village`、`phase=live`、12 车、5 点、2 渡船；无页面错误 |

线上 miao 截图：`online-miao.png`。原始 JSON：`release.json`、`http-signal.json`。

## 回滚

当前线上为 `0.21.0-5a8e0374078786c2`，上一版 `0.20.10-7867408bd6239fa6` 完整保留。回滚前先确认 current 未被后续发布改变，然后执行原子 activate（`activate` 模式下 archive/sha 参数不读取，但脚本参数必填）：

```bash
ssh haokee-server
readlink -f /var/www/crazyshoot/current
python3 /tmp/crazyshoot-atomic-release.py activate \
  /tmp/crazyshoot-0.21.0-5a8e0374078786c2.tar \
  /var/www/crazyshoot/releases/0.20.10-7867408bd6239fa6 \
  57ad05fd8eb18ebf09cf9d32ebddf34877a3a78ae1056180e4e446b693933555 \
  /var/www/crazyshoot/releases/0.21.0-5a8e0374078786c2
```

## 说明

- 本次发布通过静态 symlink 切换完成，**没有 git commit / push**；发布内容是本机 `dist/` 归档。
- 新客户端需刷新页面；旧客户端可继续取旧 assets，但联机开局会因 `buildId` 不同被拒绝，这是既有联机闸门。
- 旧对局需刷新并重新建房后才会加载 0.21.0 世界；本报告的地图/性能/网络审计均基于本地 0.21.0 构建与线上静态资源 smoke。
