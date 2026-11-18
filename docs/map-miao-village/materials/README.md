# miao-v1 材质包

原创程序化生成，无照片、无外部下载；32/64/128 三档都是原生分辨率（不是放大）。
每张 32 底色板 ≤8 色，全部在环面域上生成，左右/上下 wrap 无缝。

| id | name | family | palette | mean RGB |
|---:|---|---|---|---|
| 120 | fir_dark_oiled | wood | 8 | (86, 58, 36) |
| 121 | fir_honey_worn | wood | 8 | (134, 93, 58) |
| 122 | fir_grey_weathered | wood | 8 | (69, 67, 58) |
| 123 | wood_plank_floor | wood | 8 | (94, 66, 43) |
| 124 | wood_lattice | wood | 8 | (121, 91, 60) |
| 125 | tile_blue_grey | tile | 8 | (95, 105, 106) |
| 126 | tile_grey_weathered | tile | 8 | (103, 105, 94) |
| 127 | tile_moss_edges | tile | 8 | (97, 105, 84) |
| 128 | stone_rubble_wall | stone | 8 | (56, 58, 49) |
| 129 | stone_cut_grey | stone | 8 | (94, 100, 90) |
| 130 | paving_bluestone | stone | 8 | (91, 103, 105) |
| 131 | paving_cobble | stone | 8 | (63, 66, 59) |
| 132 | paving_wet | stone | 8 | (74, 84, 86) |
| 133 | water_jade_river | water | 8 | (53, 95, 89) |
| 134 | earth_compacted | earth | 8 | (126, 98, 71) |
| 135 | mud_paddy | earth | 8 | (103, 85, 62) |
| 136 | grass_mountain | vegetation | 8 | (62, 81, 50) |
| 137 | rice_young | vegetation | 8 | (69, 114, 49) |
| 138 | rice_gold | vegetation | 8 | (137, 123, 54) |
| 139 | vegetable_dark | vegetation | 8 | (59, 80, 49) |
| 140 | bamboo_leaf | vegetation | 8 | (89, 119, 71) |
| 141 | bamboo_culm | vegetation | 8 | (146, 146, 83) |
| 142 | foliage_maple | vegetation | 8 | (135, 80, 47) |
| 143 | foliage_camphor | vegetation | 8 | (74, 108, 64) |
| 144 | reed_river | vegetation | 8 | (97, 93, 55) |
| 145 | straw_thatch | straw | 8 | (104, 85, 48) |
| 146 | brick_grey_old | masonry | 8 | (145, 137, 124) |
| 147 | plaster_lime_worn | masonry | 8 | (183, 179, 162) |
| 148 | bamboo_wicker | craft | 8 | (141, 115, 70) |
| 149 | ceramic_brown | craft | 8 | (137, 85, 59) |
| 150 | cloth_indigo | cloth | 8 | (60, 86, 119) |
| 151 | cloth_madder | cloth | 8 | (142, 63, 69) |

验收：`npx vitest run tests/miao-assets.test.ts`；接缝指标见 `manifest.json` 的 `seam`。
运行：`python3 tools/maps/miao-village-textures.py`（本机使用 bundled Python 3.12 + Pillow 12 + numpy 2.3）。