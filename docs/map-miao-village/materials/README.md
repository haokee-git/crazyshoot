# miao-v1 材质包

原创程序化生成，无照片、无外部下载；32/64/128 三档都是原生分辨率（不是放大）。
每张 32 底色板 ≤8 色，全部在环面域上生成，左右/上下 wrap 无缝。

| id | name | family | palette | mean RGB |
|---:|---|---|---|---|
| 122 | fir_dark_oiled | wood | 8 | (120, 85, 58) |
| 123 | fir_honey_worn | wood | 8 | (156, 113, 74) |
| 124 | fir_grey_weathered | wood | 8 | (136, 109, 83) |
| 125 | wood_plank_floor | wood | 8 | (154, 118, 82) |
| 126 | wood_lattice | wood | 8 | (127, 90, 65) |
| 127 | tile_blue_grey | tile | 8 | (92, 108, 120) |
| 128 | tile_grey_weathered | tile | 8 | (108, 114, 118) |
| 129 | tile_moss_edges | tile | 8 | (100, 114, 111) |
| 130 | stone_rubble_wall | stone | 8 | (131, 131, 111) |
| 131 | stone_cut_grey | stone | 8 | (153, 153, 140) |
| 132 | paving_bluestone | stone | 8 | (170, 170, 160) |
| 133 | paving_cobble | stone | 8 | (152, 148, 130) |
| 134 | paving_wet | stone | 8 | (142, 155, 151) |
| 135 | water_jade_river | water | 8 | (76, 142, 136) |
| 136 | earth_compacted | earth | 8 | (161, 134, 97) |
| 137 | mud_paddy | earth | 8 | (140, 113, 80) |
| 138 | grass_mountain | vegetation | 8 | (106, 139, 71) |
| 139 | rice_young | vegetation | 8 | (95, 147, 65) |
| 140 | rice_gold | vegetation | 8 | (170, 163, 81) |
| 141 | vegetable_dark | vegetation | 8 | (85, 121, 60) |
| 142 | bamboo_leaf | vegetation | 8 | (91, 132, 68) |
| 143 | bamboo_culm | vegetation | 8 | (152, 159, 86) |
| 144 | foliage_maple | vegetation | 8 | (174, 104, 59) |
| 145 | foliage_camphor | vegetation | 8 | (84, 124, 64) |
| 146 | reed_river | vegetation | 8 | (125, 141, 75) |
| 147 | straw_thatch | straw | 8 | (162, 136, 83) |
| 148 | brick_grey_old | masonry | 8 | (158, 148, 135) |
| 149 | plaster_lime_worn | masonry | 8 | (198, 193, 172) |
| 150 | bamboo_wicker | craft | 8 | (169, 138, 87) |
| 151 | ceramic_brown | craft | 8 | (158, 98, 70) |
| 152 | cloth_indigo | cloth | 8 | (69, 99, 135) |
| 153 | cloth_madder | cloth | 8 | (151, 86, 79) |

验收：`npx vitest run tests/miao-assets.test.ts`；接缝指标见 `manifest.json` 的 `seam`。
运行：`python3 tools/maps/miao-village-textures.py`（本机使用 bundled Python 3.12 + Pillow 12 + numpy 2.3）。