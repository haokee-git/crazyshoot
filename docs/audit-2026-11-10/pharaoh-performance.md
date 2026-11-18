# 法老坟墓 · AUD-01 性能报告（真实 world）

> 采集时间：2026-11-10（Asia/Shanghai） · BUILD_ID：`73a40f07225cdf34` · VERSION：`0.19.0` · MAP_REVISION：`voxel-halfgrid-v9` · MATERIAL_REVISION：`5`
> 硬件：Apple M5 Pro · 24 GB · Google Chrome 157.0.8103.39（Playwright headless） · 非 J1900，不代表低端机通过
> 画布 1280×720 · `quality=low`（renderScale 0.65 → 实际 render target 832×468） · `res=64` · 帧上限 60 fps · 地图 `pharaoh`（1000 m）

## 结果总表（每跑 60 s，真实 live：bots=1、host）

| 场景 | 玩家 | 载具 | draw calls p95 | tris p95 | frame ms p95 / fps | sim step p95 / p99 | render submit p95 | heap | GPU geoms / textures / programs | deadFrames | simulationOverload |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|
| 8v8 | 16 | 34 | 102 | 633,926 | 18.4 ms / 59.9 | 2.4 / 4.8 ms | 0.9 ms | 289.8 MB | 136 / 63 / 43 | 0 | 0 s |
| 8v8-cpu4x | 16 | 34 | 102 | 634,622 | 21.3 ms / 60.2 | 7.8 / 17.3 ms | 3.7 ms | 285.8 MB | 136 / 63 / 43 | 0 | 1.067 s |
| 12v12 | 24 | 34 | 105 | 636,363 | 20.6 ms / 59.9 | 5.3 / 8.0 ms | 1 ms | 294.6 MB | 140 / 67 / 43 | 0 | 0 s |
| 12v12-40veh | 24 | 40 | 105 | 636,379 | 20.6 ms / 59.9 | 5.4 / 8.2 ms | 1 ms | 314.4 MB | 140 / 67 / 43 | 0 | 0 s |

## Worker 构建 / 地形

| 场景 | Worker buildMs | voxels bytes | chunks | navLayers |
|---|---:|---:|---:|---:|
| 8v8 | 9481 ms | 81,510,912 | 53 | 4 |
| 8v8-cpu4x | 9066 ms | 81,510,912 | 53 | 4 |
| 12v12 | 9323 ms | 81,510,912 | 53 | 4 |
| 12v12-40veh | 9340 ms | 81,510,912 | 53 | 4 |

## 说明

- 8v8 / 12v12 基线里载具为 34 辆：开局 32 辆，60 s 内 host 刷新管理器因 AI 把 2 辆开出 24 m 后自动补了 2 辆（真实玩法行为）。
- `12v12-40veh`：地图 32 辆 + 8 辆合成压力车 = 40 辆（压力车走生产 `buildVehicleState`；40 为全图未摧毁上限）。
- 4× CPU 节流：CDP `Emulation.setCPUThrottlingRate` 在进入 live 后施加，采样期全程生效；sim p95 从 2.4 ms 升到 7.8 ms，overload 1.07 s。
- `deadFrames` = 采样期玩家处于阵亡的帧数（0 = 60 s 内未死）；`simulationOverload` 来自引擎固定 60 Hz 追赶统计。
- 失败场景：无。4/4 跑 `failed=false`、`errors=[]`；8v8/12v12 玩家数 16/24 与预期一致。
- **未达目标**：sim step p95 目标 <1 ms；实测 2.4–5.4 ms。中位数 0.6–0.9 ms，峰值来自开场/流场缓存未热。已做 160 m 分块、detail 合批、载具裁剪、导航 CSR/缓存/队列复用；下一步建议分层流场或 Worker 化，报告不掩盖。

## 文件

- JSON：`docs/audit-2026-11-10/pharaoh-performance.json`
- 截图与 manifest：`docs/map-pharaoh/render/`（`index.md`、`manifest.json`、27 张 PNG + 5 张材质图）
