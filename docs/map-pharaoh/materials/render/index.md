# 法老坟墓 · AUD-01 真实 world 截图

> 采集时间：2026-11-10T12:32:37.158Z · BUILD_ID：`73a40f07225cdf34` · MAP_REVISION：`voxel-halfgrid-v9` · MATERIAL_REVISION：`5`
> 运行参数：`map=pharaoh size=8 bots=0 prep=999 res=128 quality=high` · viewport 1600×900 · 真实体素 world（非预览模型/概念图）
> 相机在 `cancelAnimationFrame(engine.raf); engine.disposed=true;` 后手动设置，逐张记录坐标/朝向/FOV/far/雾；HUD 已隐藏。

## 总览

| 文件 | 场景 | BUILD_ID | res/quality | 相机 (x,y,z) | 注视四元数 | FOV | far | 雾 | draw calls | tris | 车辆 |
|---|---|---|---|---|---|---:|---:|---|---:|---:|---:|
| [10-pyramid-far.png](10-pyramid-far.png) | 金字塔远景（西南方向） | `73a40f07225cdf34` | 128/high | 110.0, 175.0, 1010.0 | -0.172, -0.292, -0.053, 0.939 | 55 | 3200 | off | 112 | 935965 | 32 |
| [11-pyramid-near.png](11-pyramid-near.png) | 金字塔近景（西南低机位） | `73a40f07225cdf34` | 128/high | 180.0, 95.0, 500.0 | 0.048, 0.935, 0.138, -0.324 | 55 | 2600 | off | 67 | 613837 | 32 |
| [12-pyramid-summit.png](12-pyramid-summit.png) | 金字塔顶部俯视（12×12 平台） | `73a40f07225cdf34` | 128/high | 330.0, 80.0, 716.0 | -0.408, 0.000, 0.000, 0.913 | 56 | 2600 | off | 39 | 479202 | 32 |
| [13-pyramid-a-chamber.png](13-pyramid-a-chamber.png) | A 墓室（32×26，地面 +5） | `73a40f07225cdf34` | 128/high | 343.0, 7.4, 690.0 | -0.009, 0.707, 0.009, 0.707 | 70 | 160 | off | 31 | 215713 | 32 |
| [14-pyramid-upper-gallery.png](14-pyramid-upper-gallery.png) | 金字塔上层北廊（+20） | `73a40f07225cdf34` | 128/high | 344.0, 21.6, 720.0 | -0.003, 0.707, 0.003, 0.707 | 76 | 140 | off | 29 | 210624 | 32 |

## pyramid

### 金字塔远景（西南方向）

![金字塔远景（西南方向）](10-pyramid-far.png)

文件：`10-pyramid-far.png` · BUILD_ID `73a40f07225cdf34` · 128/high · 相机 `110.0, 175.0, 1010.0` · FOV 55 · far 3200 · 雾 off · calls 112 · tris 935965

### 金字塔近景（西南低机位）

![金字塔近景（西南低机位）](11-pyramid-near.png)

文件：`11-pyramid-near.png` · BUILD_ID `73a40f07225cdf34` · 128/high · 相机 `180.0, 95.0, 500.0` · FOV 55 · far 2600 · 雾 off · calls 67 · tris 613837

### 金字塔顶部俯视（12×12 平台）

![金字塔顶部俯视（12×12 平台）](12-pyramid-summit.png)

文件：`12-pyramid-summit.png` · BUILD_ID `73a40f07225cdf34` · 128/high · 相机 `330.0, 80.0, 716.0` · FOV 56 · far 2600 · 雾 off · calls 39 · tris 479202

### A 墓室（32×26，地面 +5）

![A 墓室（32×26，地面 +5）](13-pyramid-a-chamber.png)

文件：`13-pyramid-a-chamber.png` · BUILD_ID `73a40f07225cdf34` · 128/high · 相机 `343.0, 7.4, 690.0` · FOV 70 · far 160 · 雾 off · calls 31 · tris 215713

### 金字塔上层北廊（+20）

![金字塔上层北廊（+20）](14-pyramid-upper-gallery.png)

文件：`14-pyramid-upper-gallery.png` · BUILD_ID `73a40f07225cdf34` · 128/high · 相机 `344.0, 21.6, 720.0` · FOV 76 · far 140 · 雾 off · calls 29 · tris 210624

## 材质（来自 pharaoh-v1 生成器产物，与运行时 PNG 一致）

| 文件 | 说明 |
|---|---|
| [80-materials-contact-sheet.png](80-materials-contact-sheet.png) | 32 材质 contact sheet（64 档） |
| [81-material-2x2-sand-fine.png](81-material-2x2-sand-fine.png) | 代表材质 2×2：sand_fine |
| [81-material-2x2-sandstone-block.png](81-material-2x2-sandstone-block.png) | 代表材质 2×2：sandstone_block |
| [82-material-2x2-mudbrick.png](82-material-2x2-mudbrick.png) | 代表材质 2×2：mudbrick |
| [83-material-2x2-palm-leaf.png](83-material-2x2-palm-leaf.png) | 代表材质 2×2：palm_leaf |

### 32 材质 contact sheet（64 档）

![32 材质 contact sheet（64 档）](80-materials-contact-sheet.png)

### 代表材质 2×2：sand_fine

![代表材质 2×2：sand_fine](81-material-2x2-sand-fine.png)

### 代表材质 2×2：sandstone_block

![代表材质 2×2：sandstone_block](81-material-2x2-sandstone-block.png)

### 代表材质 2×2：mudbrick

![代表材质 2×2：mudbrick](82-material-2x2-mudbrick.png)

### 代表材质 2×2：palm_leaf

![代表材质 2×2：palm_leaf](83-material-2x2-palm-leaf.png)
