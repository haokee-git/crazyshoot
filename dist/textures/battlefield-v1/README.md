# 写实军事像素材质包 v1

由内置 `image_gen` 生成，按用户要求逐块栅格化为实际32×32与64×64 PNG。原图不修改，运行时只加载对应分辨率的单块材质。

- 56类材质，112个实际PNG；含地表16、建筑16、工业/植被16、水面4、透明梯子4。
- `source/`：5张生成原图：[地表](source/ground-atlas-v1.png)、[建筑](source/architecture-atlas-v1.png)、[工业/植被](source/industrial-atlas-v1.png)、[水面](source/water-atlas-v1.png)、[梯子](source/ladder-atlas-v1.png)。
- `32/`、`64/`：两套生产材质；运行时最近邻放大。
- `manifest.json`：名称、原图单元、尺寸和文件路径。
- 完整生成提示词：[四组提示词](prompts.json)、[水面补充](water-prompt.txt)；使用内置image_gen，未使用CLI/API回退。
- `../../../tools/art/rasterize-battlefield.py`：可复现拆分与像素面积栅格化；不覆盖原图。

| 材质 | 类型 | 32×32 | 64×64 |
|---|---|---|---|
| asphalt_fine | ground | [PNG](32/asphalt_fine.png) | [PNG](64/asphalt_fine.png) |
| asphalt_aggregate | ground | [PNG](32/asphalt_aggregate.png) | [PNG](64/asphalt_aggregate.png) |
| asphalt_cracked | ground | [PNG](32/asphalt_cracked.png) | [PNG](64/asphalt_cracked.png) |
| asphalt_oil | ground | [PNG](32/asphalt_oil.png) | [PNG](64/asphalt_oil.png) |
| earth_dry | ground | [PNG](32/earth_dry.png) | [PNG](64/earth_dry.png) |
| mud_rutted | ground | [PNG](32/mud_rutted.png) | [PNG](64/mud_rutted.png) |
| gravel_pale | ground | [PNG](32/gravel_pale.png) | [PNG](64/gravel_pale.png) |
| aggregate_dark | ground | [PNG](32/aggregate_dark.png) | [PNG](64/aggregate_dark.png) |
| grass_olive | ground | [PNG](32/grass_olive.png) | [PNG](64/grass_olive.png) |
| grass_dry | ground | [PNG](32/grass_dry.png) | [PNG](64/grass_dry.png) |
| forest_floor | ground | [PNG](32/forest_floor.png) | [PNG](64/forest_floor.png) |
| moss_soil | ground | [PNG](32/moss_soil.png) | [PNG](64/moss_soil.png) |
| sand_packed | ground | [PNG](32/sand_packed.png) | [PNG](64/sand_packed.png) |
| limestone | ground | [PNG](32/limestone.png) | [PNG](64/limestone.png) |
| bedrock | ground | [PNG](32/bedrock.png) | [PNG](64/bedrock.png) |
| concrete_rubble | ground | [PNG](32/concrete_rubble.png) | [PNG](64/concrete_rubble.png) |
| concrete_poured | architecture | [PNG](32/concrete_poured.png) | [PNG](64/concrete_poured.png) |
| concrete_cracked | architecture | [PNG](32/concrete_cracked.png) | [PNG](64/concrete_cracked.png) |
| brick_red | architecture | [PNG](32/brick_red.png) | [PNG](64/brick_red.png) |
| brick_grey | architecture | [PNG](32/brick_grey.png) | [PNG](64/brick_grey.png) |
| plaster_grey | architecture | [PNG](32/plaster_grey.png) | [PNG](64/plaster_grey.png) |
| plaster_stained | architecture | [PNG](32/plaster_stained.png) | [PNG](64/plaster_stained.png) |
| retaining_stone | architecture | [PNG](32/retaining_stone.png) | [PNG](64/retaining_stone.png) |
| concrete_panel | architecture | [PNG](32/concrete_panel.png) | [PNG](64/concrete_panel.png) |
| metal_galvanized | architecture | [PNG](32/metal_galvanized.png) | [PNG](64/metal_galvanized.png) |
| metal_blue | architecture | [PNG](32/metal_blue.png) | [PNG](64/metal_blue.png) |
| roof_red | architecture | [PNG](32/roof_red.png) | [PNG](64/roof_red.png) |
| roof_patched | architecture | [PNG](32/roof_patched.png) | [PNG](64/roof_patched.png) |
| roof_tar | architecture | [PNG](32/roof_tar.png) | [PNG](64/roof_tar.png) |
| roof_slate | architecture | [PNG](32/roof_slate.png) | [PNG](64/roof_slate.png) |
| window_industrial | architecture | [PNG](32/window_industrial.png) | [PNG](64/window_industrial.png) |
| timber_weathered | architecture | [PNG](32/timber_weathered.png) | [PNG](64/timber_weathered.png) |
| container_olive | industrial | [PNG](32/container_olive.png) | [PNG](64/container_olive.png) |
| container_blue | industrial | [PNG](32/container_blue.png) | [PNG](64/container_blue.png) |
| container_rust | industrial | [PNG](32/container_rust.png) | [PNG](64/container_rust.png) |
| container_grey | industrial | [PNG](32/container_grey.png) | [PNG](64/container_grey.png) |
| sandbag_tan | industrial | [PNG](32/sandbag_tan.png) | [PNG](64/sandbag_tan.png) |
| sandbag_olive | industrial | [PNG](32/sandbag_olive.png) | [PNG](64/sandbag_olive.png) |
| crate_military | industrial | [PNG](32/crate_military.png) | [PNG](64/crate_military.png) |
| dock_timber | industrial | [PNG](32/dock_timber.png) | [PNG](64/dock_timber.png) |
| floor_plate | industrial | [PNG](32/floor_plate.png) | [PNG](64/floor_plate.png) |
| steel_grate | industrial | [PNG](32/steel_grate.png) | [PNG](64/steel_grate.png) |
| hazard_stripe | industrial | [PNG](32/hazard_stripe.png) | [PNG](64/hazard_stripe.png) |
| steel_corroded | industrial | [PNG](32/steel_corroded.png) | [PNG](64/steel_corroded.png) |
| bark_dark | industrial | [PNG](32/bark_dark.png) | [PNG](64/bark_dark.png) |
| bark_pale | industrial | [PNG](32/bark_pale.png) | [PNG](64/bark_pale.png) |
| foliage_olive | industrial | [PNG](32/foliage_olive.png) | [PNG](64/foliage_olive.png) |
| foliage_dry | industrial | [PNG](32/foliage_dry.png) | [PNG](64/foliage_dry.png) |
| water_fresh | water | [PNG](32/water_fresh.png) | [PNG](64/water_fresh.png) |
| water_harbour | water | [PNG](32/water_harbour.png) | [PNG](64/water_harbour.png) |
| water_river | water | [PNG](32/water_river.png) | [PNG](64/water_river.png) |
| water_drain | water | [PNG](32/water_drain.png) | [PNG](64/water_drain.png) |
| ladder_galvanized | ladder | [PNG](32/ladder_galvanized.png) | [PNG](64/ladder_galvanized.png) |
| ladder_olive | ladder | [PNG](32/ladder_olive.png) | [PNG](64/ladder_olive.png) |
| ladder_rusted | ladder | [PNG](32/ladder_rusted.png) | [PNG](64/ladder_rusted.png) |
| ladder_dark | ladder | [PNG](32/ladder_dark.png) | [PNG](64/ladder_dark.png) |
