# 法老坟墓 · 材质包 pharaoh-v1

> **54 个图案** = 50 个体素材质（block id **72–121**）+ 4 个装饰图集；**162 张真实 PNG**（54 × 32/64/128）。
> 运行时目录 `public/textures/pharaoh-v1/{32,64,128}/`，manifest 同目录。
> 生成器：`tools/maps/pharaoh-textures.py`（程序化、确定性、可重跑）。

## 1. 生成方法

```bash
# 重新生成 162 张 PNG + manifest + 平铺/接缝证据（约 30 s）
/Users/haokee/.dsh/dsh-runtimes/dsh-next-primary-runtime/dependencies/python/bin/python3 \
  tools/maps/pharaoh-textures.py

# 只校验现有产物是否与生成器逐字节一致
/Users/haokee/.dsh/dsh-runtimes/dsh-next-primary-runtime/dependencies/python/bin/python3 \
  tools/maps/pharaoh-textures.py --check
```

- 全部图案在**环面域**上用周期噪声/Worley/整数频率波构造，天然无缝。
- 32 档原生 32×32 生成；64/128 各自原生生成（非放大），`manifest.detailVs32` 可查。
- **32/64 档统一走低对比后处理（`calm`）**：压平瓦片尺度的亮暗块、轻度中值去噪、按 family 限制通道偏差、量化到 13–15 色。因此 64 档比 128 更柔和、噪点更少，重复贴图不会出现明显亮暗块。
- 沙地色相锁定为中性金黄（不受 worldTint 影响）：R≈200–215、G≈178–190、B≈130–145，低对比。

## 2. 档位与 manifest

| 字段 | 说明 |
|---|---|
| `version` / `generator` | 1 / 生成器标识 |
| `nativeGrid` | 32 |
| `textures[].name/family` | 图案名 / desert·ancient·bazaar·oasis·service·atlas |
| `textures[].palette`,`paletteColors` | 实际调色板与色数（128 档；12–24） |
| `textures[].average` | 128 档平均反照率 |
| `textures[].files` | `{32,64,128}` URL |
| `textures[].source` / `masterSha256` | 生成源 / 128 档 PNG SHA-256 |
| `textures[].seam` | wrap / 50% offset 接缝指标 |
| `textures[].atlas` | 4 个装饰图集为 `true` |

## 3. 颜色与对比（本轮重点）

- 色数：128 档 12–24；**32/64 档普通材质 13–15 色（要求 10–16）**。
- 32 档：色数 13–15，最大通道偏差 **12.9 RGB**，平均 9.9。
- 64 档：色数 13–15，最大通道偏差 **13.5 RGB**（≤14 预算），平均 10.8。
- 162 张 PNG 合计 **702 KB**；单档 54 张（≤100 张/分辨率）。
- 沙地平均色（128 档，已金黄化、低对比、无深棕斑块）：

| 沙地变体 | average | 色数 |
|---|---|---:|
| `sand_fine` | [209, 185, 135] | 15 |
| `sand_ripple` | [209, 183, 133] | 15 |
| `sand_compact` | [210, 186, 138] | 15 |
| `sand_ultrafine` | [213, 189, 139] | 15 |
| `sand_ripple_soft` | [211, 186, 136] | 15 |
| `sand_compact_dark` | [203, 179, 131] | 15 |
| `sand_damp` | [201, 180, 141] | 15 |

- 道路实际材质（由 `src/maps/pharaoh.ts` 决定，本轮未改）：`asphalt = 4`（经典 asphalt_fine）、`gravel = 22`（经典 gravel_pale）；本法老包的 `79 asphalt_buried`/`100 pavement_oil`/`119 asphalt_clean`/`120 pavement_plain` 保留但本图道路不使用。
- 其余地面辅助材质：`sand=72`、`stone=80`、`dirt=77`、`mud=78`、`rubble=85`、`concrete=100`、`grass=96`、`flowers=97`、`water=98`。

| id | name | family | 色数(128) | 平均色 | 接缝 wrap/offset |
|---:|---|---|---:|---|---|
| 72 | `sand_fine` | desert | 15 | `#d1b987` | 0.18/0.29 |
| 73 | `sand_ripple` | desert | 15 | `#d1b785` | 0.19/0.14 |
| 74 | `sand_compact` | desert | 15 | `#d2ba8a` | 0.30/0.23 |
| 75 | `sand_gravel` | desert | 15 | `#c1b499` | 0.19/0.16 |
| 76 | `limestone_dust` | desert | 15 | `#c3bba7` | 0.13/0.17 |
| 77 | `earth_cracked` | desert | 15 | `#ae997b` | 0.10/0.11 |
| 78 | `mud_wet` | desert | 15 | `#8f8673` | 0.23/0.09 |
| 79 | `asphalt_buried` | desert | 15 | `#7a7366` | 0.19/0.13 |
| 80 | `limestone_shell` | ancient | 17 | `#b8b0a1` | 0.23/0.36 |
| 81 | `sandstone_block` | ancient | 17 | `#c3a883` | 0.24/0.25 |
| 82 | `rock_strata` | ancient | 17 | `#84735b` | 0.19/0.21 |
| 83 | `granite_dark` | ancient | 17 | `#7e7d7f` | 0.16/0.13 |
| 84 | `tomb_plaster` | ancient | 17 | `#c2b59f` | 0.10/0.07 |
| 85 | `relief_fragment` | ancient | 17 | `#b79e7b` | 0.38/0.08 |
| 86 | `stone_soot` | ancient | 17 | `#a49580` | 0.22/0.10 |
| 87 | `mudbrick` | bazaar | 17 | `#866d50` | 0.06/0.04 |
| 88 | `plaster_ochre` | bazaar | 17 | `#cba475` | 0.19/0.13 |
| 89 | `plaster_white_old` | bazaar | 17 | `#dad5c8` | 0.07/0.06 |
| 90 | `palm_wood` | bazaar | 17 | `#886745` | 0.11/0.16 |
| 91 | `terracotta` | bazaar | 17 | `#be7951` | 0.11/0.08 |
| 92 | `basket_weave` | bazaar | 17 | `#b49a67` | 0.33/0.33 |
| 93 | `metal_faded` | bazaar | 16 | `#626e64` | 0.10/0.08 |
| 94 | `palm_bark` | oasis | 18 | `#7e725f` | 0.13/0.15 |
| 95 | `palm_leaf` | oasis | 18 | `#627f46` | 0.14/0.15 |
| 96 | `reed_grass` | oasis | 18 | `#9ba060` | 0.23/0.08 |
| 97 | `oasis_soil` | oasis | 18 | `#635842` | 0.07/0.11 |
| 98 | `water_shallow` | oasis | 18 | `#5ea69b` | 0.16/0.18 |
| 99 | `enamel_sun` | service | 18 | `#c8c3b4` | 0.29/0.06 |
| 100 | `pavement_oil` | service | 18 | `#787774` | 0.17/0.06 |
| 101 | `rubber_worn` | service | 18 | `#403f40` | 0.10/0.13 |
| 102 | `sand_ultrafine` | desert | 15 | `#d5bd8b` | 0.14/0.23 |
| 103 | `sand_ripple_soft` | desert | 15 | `#d3ba88` | 0.18/0.21 |
| 104 | `sand_compact_dark` | desert | 15 | `#cbb383` | 0.26/0.23 |
| 105 | `sand_damp` | desert | 15 | `#c9b48d` | 0.09/0.18 |
| 106 | `sandstone_fine` | ancient | 17 | `#b7a081` | 0.23/0.17 |
| 107 | `limestone_pale` | ancient | 17 | `#c6beb0` | 0.26/0.12 |
| 108 | `limestone_weathered` | ancient | 17 | `#a0988a` | 0.05/0.09 |
| 109 | `rock_strata_pale` | ancient | 17 | `#a19583` | 0.27/0.27 |
| 110 | `mudbrick_pale` | bazaar | 17 | `#a59074` | 0.05/0.05 |
| 111 | `mudbrick_dark` | bazaar | 17 | `#705c46` | 0.06/0.05 |
| 112 | `plaster_ochre_worn` | bazaar | 17 | `#b39371` | 0.13/0.18 |
| 113 | `plaster_white_clean` | bazaar | 17 | `#d7d1c3` | 0.15/0.07 |
| 114 | `palm_wood_old` | bazaar | 17 | `#7a6650` | 0.17/0.17 |
| 115 | `terracotta_pale` | bazaar | 17 | `#bc8a6d` | 0.12/0.09 |
| 116 | `oasis_grass` | oasis | 18 | `#697d4d` | 0.13/0.10 |
| 117 | `oasis_mud` | oasis | 18 | `#665e4b` | 0.08/0.08 |
| 118 | `reed_dry` | oasis | 18 | `#ae9c6f` | 0.26/0.09 |
| 119 | `asphalt_clean` | service | 18 | `#6d6d6f` | 0.15/0.25 |
| 120 | `pavement_plain` | service | 18 | `#a6a49e` | 0.15/0.17 |
| 121 | `enamel_worn` | service | 18 | `#b6b2a3` | 0.27/0.11 |
| — | `atlas_cloth_signs` | atlas | 16 | `#a3917c` | 0.45/0.48 |
| — | `atlas_murals_objects` | atlas | 16 | `#907f6f` | 0.35/0.36 |
| — | `atlas_plants` | atlas | 18 | `#aba379` | 0.12/0.16 |
| — | `atlas_market_goods` | atlas | 16 | `#c1b39d` | 0.42/0.41 |

## 4. 接缝检查

每张图三档均生成：
- `tiles/<name>_(32, 64, 128)_2x2.png`；`seams/<name>_(32, 64, 128)_offset50.png`。

指标：wrap 边平均通道差 / 纹理自身最强 1% 梯度（`neighborP99`）。结论：

- 54 图案 wrap 比最大 **0.45**，50% offset 比最大 **0.48**（阈值 1.15）；
- 目视 32/64/128 contact sheet、2×2 与 offset 图：无田字格、无错位断裂；图集按 2×2 面板设计，不要求整张平铺。

## 5. 图集（4 个）

- 图集尺寸 32/64/128；内部 4×4 像素格，但每 **0.5×0.5 UV 象限 = 一个完整图案面板**（`PHARAOH_ATLAS_PANEL_SPAN=0.5`）。`DecorPlane.uv` 用 0.5 象限即可。
- `atlas_cloth_signs`：红/米遮阳布、靛蓝/米遮阳布、垂挂旗幡、拼布市集布。
- `atlas_murals_objects`：彩绘横饰带、星顶、翼形徽记、器物壁龛。
- `atlas_plants`：棕榈叶、芦苇丛、沙漠灌木、草簇（彩绘植物板）。
- `atlas_market_goods`：陶器排、篮筐、布匹卷、香料袋/木箱。
- 渲染：`src/game/world/pharaoh-decor.ts`，每图集 1 个 InstancedMesh（全图最多 4 draw calls），支持 32/64/128 切换与 dispose，不参与碰撞；`rot` 角度制。

## 6. 地面变体导出（给世界生成）

`src/content/materials/pharaoh.ts` 导出：

```ts
PHARAOH_GROUND_VARIANTS: { sand, gravel, stone, mudbrick, plaster, soil, vegetation }
pharaohGroundVariant(kind, hash) // 稳定取一个 id
```

| kind | ids | 用途 |
|---|---|---|
| `sand` | 72,73,74,102,103,104,105 | 细沙/风纹/压实/浅湿沙，轻微色差 |
| `gravel` | 75,76 | 暖灰沙砾 / 石灰尘（低对比） |
| `stone` | 80,81,82,106,107,108,109 | 石灰岩/砂岩/层理岩（大面、门框、台阶） |
| `mudbrick` | 87,110,111 | 泥砖深浅 |
| `plaster` | 88,89,112,113 | 赭灰/旧白灰/干净白灰 |
| `soil` | 77,78,97,117 | 干裂土/湿泥/绿洲土/绿洲湿泥 |
| `vegetation` | 95,96,116,118 | 棕榈叶/芦苇/绿洲草/干芦苇 |

建议世界生成：`terrainMaterials.sand` 仍用 72，其他 zone 用 `pharaohGroundVariant('sand', zoneHash(x,z,seed))` 做轻微变化；每个变体只改色调/纹理，不做大色差。

## 7. 懒加载与 AO

- `preloadWorld(..., assetBundle)`：仅当 `assetBundle === 'pharaoh-v1'` 时加载 54 张；经典四图/训练场零额外下载。
- `voxelMaterials` 只加载 `usedMaterialNames(data)` 实际引用的材质（chunk + detailBoxes）。
- `MATERIAL_SLOTS = 160`（72–121 法老，68–71 室内，1–67 经典）。
- `TerrainData.aoStrength`（`BATTLEFIELDS[map.id].worldAoStrength`）由 `voxel-map-render` 初始化与分辨率切换应用；**pharaoh 建议 0.18–0.20**，formula 不变。

## 8. 证据与边界

- 贴图总览：`contact_sheet_32.png` / `contact_sheet_64.png` / `contact_sheet_128.png`。
- 真实 world 截图：`render/00-overview-oblique.png`、`render/01-overview-top.png`、`render/10-pyramid-far.png`、`render/11-pyramid-near.png`、`render/12-pyramid-summit.png`（最后成功抓取版本；此后大厅 UI 改为“创建房间”，audit 抓图脚本的 `.lobby-solo` 选择器失效，需 QA 更新抓图脚本后重拍）。
- 图集为不透明 RGB，无 alpha 镂空；water_shallow 的透明度/动画依赖引擎水面 shader。
- 生成器只依赖 bundled numpy + Pillow；`--check` 需同一环境。
