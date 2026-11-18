# 法老坟墓 · AUD-01 真实 world 截图（0.20.3 / 800 m 七据点）

> 采集时间：2026-11-11T04:25:41.551Z · BUILD_ID：`44cb0012f3292061` · MAP_REVISION：`voxel-halfgrid-v11` · MATERIAL_REVISION：`6`
> 运行参数：`map=pharaoh size=8 bots=0 prep=999 res=64 quality=high` · viewport 1920×1080 · 真实体素 world（非预览模型/概念图）
> 相机在 `cancelAnimationFrame(engine.raf); engine.disposed=true;` 后手动设置，逐张记录坐标/朝向/FOV/far/雾；HUD 已隐藏。
> 场景：38 张 · 七据点分组 A–G（每据点 ≥3 机位，A/B 含室内）+ 总览 2 + 墓道 4 + 基地 2。

## 总览

| 文件 | 场景 | BUILD_ID | res/quality | 相机 (x,y,z) | 注视四元数 | FOV | far | 雾 | draw calls | tris | 车辆 |
|---|---|---|---|---|---|---:|---:|---|---:|---:|---:|
| [00-overview-oblique.png](00-overview-oblique.png) | 800 m 全图斜俯视（南向北） | `44cb0012f3292061` | 64/high | 400.0, 720.0, 1060.0 | -0.403, 0.000, 0.000, 0.915 | 55 | 3400 | off | 118 | 937551 | 32 |
| [01-overview-top.png](01-overview-top.png) | 800 m 全图正俯视（北向上） | `44cb0012f3292061` | 64/high | 400.5, 1150.0, 400.5 | -0.707, 0.000, 0.000, 0.707 | 45 | 4200 | off | 118 | 937551 | 32 |
| [10-pyramid-far.png](10-pyramid-far.png) | A 金字塔远景（264 m 外层 / 外顶 +58） | `44cb0012f3292061` | 64/high | 430.0, 130.0, 780.0 | -0.145, 0.453, 0.075, 0.876 | 55 | 3600 | off | 70 | 590318 | 32 |
| [11-pyramid-near.png](11-pyramid-near.png) | A 金字塔西面近景（外层西大阶梯） | `44cb0012f3292061` | 64/high | 40.0, 70.0, 520.0 | 0.063, 0.863, 0.112, -0.489 | 55 | 1800 | off | 66 | 504153 | 32 |
| [12-pyramid-summit.png](12-pyramid-summit.png) | A 金字塔顶俯视（+58 平台） | `44cb0012f3292061` | 64/high | 190.0, 92.0, 700.0 | -0.184, 0.000, 0.000, 0.983 | 56 | 3000 | off | 84 | 820674 | 32 |
| [13-pyramid-a-chamber.png](13-pyramid-a-chamber.png) | A 墓室（32×26，地面 +5） | `44cb0012f3292061` | 64/high | 190.0, 7.0, 590.0 | 0.000, 1.000, 0.016, 0.000 | 70 | 160 | off | 28 | 109943 | 32 |
| [14-pyramid-upper-gallery.png](14-pyramid-upper-gallery.png) | A 上层南北廊（+20） | `44cb0012f3292061` | 64/high | 159.0, 21.6, 636.0 | -0.011, 0.000, 0.000, 1.000 | 76 | 140 | off | 31 | 330067 | 32 |
| [20-sphinx-side.png](20-sphinx-side.png) | B 狮身人面像 3/4 南侧（臀拱 / 背凹 / 胸肩） | `44cb0012f3292061` | 64/high | 535.0, 28.0, 745.0 | -0.047, 0.323, 0.016, 0.945 | 56 | 1600 | off | 90 | 845971 | 32 |
| [20b-sphinx-profile.png](20b-sphinx-profile.png) | B 狮身人面像正侧面（比例审查） | `44cb0012f3292061` | 64/high | 430.0, 42.0, 740.0 | -0.120, -0.144, -0.018, 0.982 | 58 | 1600 | off | 81 | 794325 | 32 |
| [21-sphinx-front.png](21-sphinx-front.png) | B 狮身人面像正面（东侧） | `44cb0012f3292061` | 64/high | 640.0, 30.0, 640.0 | -0.029, 0.707, 0.029, 0.707 | 55 | 2200 | off | 70 | 627953 | 32 |
| [22-sphinx-paws.png](22-sphinx-paws.png) | B 狮身双前爪 / 前庭近景 | `44cb0012f3292061` | 64/high | 575.0, 16.0, 650.0 | -0.046, 0.632, 0.037, 0.773 | 60 | 600 | scene | 73 | 629698 | 32 |
| [23-sphinx-b-chamber.png](23-sphinx-b-chamber.png) | B 内殿（40×24，地面 +4） | `44cb0012f3292061` | 64/high | 474.0, 5.9, 640.0 | -0.010, 0.707, 0.010, 0.707 | 72 | 160 | off | 35 | 350969 | 32 |
| [40-bazaar-main-street.png](40-bazaar-main-street.png) | C 集市主街（北向南） | `44cb0012f3292061` | 64/high | 478.0, 8.2, 540.0 | -0.022, 0.012, 0.000, 1.000 | 70 | 700 | scene | 69 | 747510 | 32 |
| [41-bazaar-c-point.png](41-bazaar-c-point.png) | C 街心广场（斜俯视） | `44cb0012f3292061` | 64/high | 525.0, 30.0, 335.0 | -0.058, 0.927, 0.160, 0.335 | 58 | 900 | scene | 58 | 498168 | 32 |
| [42-bazaar-stalls-a.png](42-bazaar-stalls-a.png) | C 西侧陶匠院 / 摊位群 A | `44cb0012f3292061` | 64/high | 385.0, 12.0, 470.0 | -0.077, -0.703, -0.077, 0.703 | 62 | 400 | scene | 53 | 449297 | 32 |
| [43-bazaar-stalls-b.png](43-bazaar-stalls-b.png) | C 东侧货运院 / 摊位群 B | `44cb0012f3292061` | 64/high | 640.0, 16.0, 450.0 | -0.122, 0.443, 0.061, 0.886 | 60 | 400 | scene | 54 | 701533 | 32 |
| [44-bazaar-cross-street.png](44-bazaar-cross-street.png) | C 集市横街（东向西） | `44cb0012f3292061` | 64/high | 600.0, 8.2, 394.0 | -0.010, 0.707, 0.010, 0.707 | 66 | 800 | scene | 78 | 677223 | 32 |
| [50-oasis-lake.png](50-oasis-lake.png) | D 绿洲湖泊全景（东南向西） | `44cb0012f3292061` | 64/high | 300.0, 60.0, 380.0 | -0.115, 0.427, 0.055, 0.895 | 55 | 2200 | off | 46 | 368682 | 32 |
| [51-oasis-d-point.png](51-oasis-d-point.png) | D 东北岸据点 | `44cb0012f3292061` | 64/high | 220.0, 11.0, 340.0 | -0.070, 0.357, 0.027, 0.931 | 64 | 700 | scene | 42 | 299907 | 32 |
| [52-oasis-water-fp.png](52-oasis-water-fp.png) | D 湖面第一人称（向湖心） | `44cb0012f3292061` | 64/high | 180.0, 0.9, 280.0 | -0.024, 0.447, 0.012, 0.894 | 75 | 900 | scene | 33 | 282002 | 32 |
| [60-service-area.png](60-service-area.png) | E 驿站场区全景（南向北） | `44cb0012f3292061` | 64/high | 460.0, 35.0, 210.0 | -0.095, 0.391, 0.041, 0.914 | 58 | 1600 | off | 45 | 314386 | 32 |
| [61-service-canopy.png](61-service-canopy.png) | E 加油棚与加油岛（棚下沿岛） | `44cb0012f3292061` | 64/high | 340.0, 4.8, 105.0 | -0.021, 0.707, 0.021, 0.707 | 68 | 350 | scene | 43 | 342791 | 32 |
| [62-service-garage.png](62-service-garage.png) | E 维修库（北侧开口，向库内看） | `44cb0012f3292061` | 64/high | 330.0, 8.0, 150.0 | -0.058, 0.128, 0.007, 0.990 | 66 | 350 | scene | 28 | 195175 | 32 |
| [63-service-parking.png](63-service-parking.png) | E 东侧停车区（3 中立载具位） | `44cb0012f3292061` | 64/high | 430.0, 12.0, 152.0 | -0.100, 0.438, 0.049, 0.892 | 62 | 400 | scene | 44 | 314376 | 32 |
| [70-temple-f.png](70-temple-f.png) | F 卡纳克列柱神庙全景（柱阵 + 方尖碑） | `44cb0012f3292061` | 64/high | 770.0, 35.0, 255.0 | -0.056, 0.373, 0.022, 0.926 | 58 | 1400 | off | 54 | 491205 | 32 |
| [71-temple-f-court.png](71-temple-f-court.png) | F 主柱厅内景（中殿柱列） | `44cb0012f3292061` | 64/high | 700.0, 12.0, 158.0 | -0.021, 0.433, 0.010, 0.901 | 68 | 300 | scene | 37 | 437950 | 32 |
| [72-temple-f-obelisk.png](72-temple-f-obelisk.png) | F 前庭双列柱与方尖碑 | `44cb0012f3292061` | 64/high | 700.0, 14.0, 72.0 | -0.021, 0.827, 0.031, 0.560 | 62 | 350 | scene | 46 | 496932 | 32 |
| [73-temple-f-pylon.png](73-temple-f-pylon.png) | F 南门楼（20 m 门洞） | `44cb0012f3292061` | 64/high | 760.0, 20.0, 42.0 | -0.021, 0.804, 0.028, 0.593 | 58 | 600 | scene | 61 | 761817 | 32 |
| [80-quarry-g.png](80-quarry-g.png) | G 帝王谷采石场全景（三级台阶 + 装车台 + 石料堆） | `44cb0012f3292061` | 64/high | 300.0, 30.0, 500.0 | -0.081, 0.381, 0.033, 0.920 | 60 | 1200 | off | 57 | 471849 | 32 |
| [81-quarry-colossus.png](81-quarry-colossus.png) | G 半埋巨像头近景（从东看脸） | `44cb0012f3292061` | 64/high | 268.0, 14.0, 344.0 | -0.018, 0.707, 0.018, 0.707 | 62 | 500 | scene | 42 | 349422 | 32 |
| [82-quarry-terraces.png](82-quarry-terraces.png) | G 西侧三级开采台阶 | `44cb0012f3292061` | 64/high | 250.0, 18.0, 460.0 | -0.052, 0.492, 0.029, 0.869 | 62 | 700 | scene | 51 | 325518 | 32 |
| [83-quarry-dock.png](83-quarry-dock.png) | G 东北装车台与石料堆场 | `44cb0012f3292061` | 64/high | 330.0, 12.0, 470.0 | -0.055, 0.471, 0.029, 0.880 | 60 | 500 | scene | 57 | 471849 | 32 |
| [90-tunnel-interior.png](90-tunnel-interior.png) | A–B 墓道主通道（s≈48 m，向 B 下坡） | `44cb0012f3292061` | 64/high | 355.9, 5.2, 572.7 | -0.011, -0.450, -0.005, 0.893 | 76 | 120 | off | 30 | 363005 | 32 |
| [91-tunnel-exit-a.png](91-tunnel-exit-a.png) | 墓道中途出口 exit-1（井口爬升） | `44cb0012f3292061` | 64/high | 410.0, 20.0, 575.8 | -0.232, 0.346, 0.089, 0.905 | 62 | 400 | scene | 60 | 661396 | 32 |
| [92-tunnel-exit-b.png](92-tunnel-exit-b.png) | 墓道中途出口 exit-2（井口爬升） | `44cb0012f3292061` | 64/high | 443.6, 20.0, 596.9 | -0.298, 0.229, 0.074, 0.924 | 62 | 400 | scene | 45 | 732229 | 32 |
| [93-tunnel-mouth-b.png](93-tunnel-mouth-b.png) | 墓道 B 口（狮身西侧） | `44cb0012f3292061` | 64/high | 393.0, 7.0, 640.0 | -0.070, 0.704, 0.070, 0.704 | 62 | 300 | scene | 36 | 339809 | 32 |
| [95-base-blue.png](95-base-blue.png) | 蓝队西南基地与载具区 | `44cb0012f3292061` | 64/high | 155.0, 12.0, 150.0 | -0.051, 0.457, 0.026, 0.888 | 58 | 1200 | off | 29 | 170190 | 32 |
| [96-base-orange.png](96-base-orange.png) | 橙队东北沙丘营地与载具区 | `44cb0012f3292061` | 64/high | 675.0, 12.0, 660.0 | 0.013, 0.959, 0.044, -0.279 | 58 | 1200 | off | 29 | 52983 | 32 |

## 总览（800 m 全图）（2 张）

### 800 m 全图斜俯视（南向北）

![800 m 全图斜俯视（南向北）](00-overview-oblique.png)

文件：`00-overview-oblique.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `400.0, 720.0, 1060.0` · FOV 55 · far 3400 · 雾 off · calls 118 · tris 937551

### 800 m 全图正俯视（北向上）

![800 m 全图正俯视（北向上）](01-overview-top.png)

文件：`01-overview-top.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `400.5, 1150.0, 400.5` · FOV 45 · far 4200 · 雾 off · calls 118 · tris 937551

## A · 阶梯金字塔（5 张）

### A 金字塔远景（264 m 外层 / 外顶 +58）

![A 金字塔远景（264 m 外层 / 外顶 +58）](10-pyramid-far.png)

文件：`10-pyramid-far.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `430.0, 130.0, 780.0` · FOV 55 · far 3600 · 雾 off · calls 70 · tris 590318

### A 金字塔西面近景（外层西大阶梯）

![A 金字塔西面近景（外层西大阶梯）](11-pyramid-near.png)

文件：`11-pyramid-near.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `40.0, 70.0, 520.0` · FOV 55 · far 1800 · 雾 off · calls 66 · tris 504153

### A 金字塔顶俯视（+58 平台）

![A 金字塔顶俯视（+58 平台）](12-pyramid-summit.png)

文件：`12-pyramid-summit.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `190.0, 92.0, 700.0` · FOV 56 · far 3000 · 雾 off · calls 84 · tris 820674

### A 墓室（32×26，地面 +5）

![A 墓室（32×26，地面 +5）](13-pyramid-a-chamber.png)

文件：`13-pyramid-a-chamber.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `190.0, 7.0, 590.0` · FOV 70 · far 160 · 雾 off · calls 28 · tris 109943

### A 上层南北廊（+20）

![A 上层南北廊（+20）](14-pyramid-upper-gallery.png)

文件：`14-pyramid-upper-gallery.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `159.0, 21.6, 636.0` · FOV 76 · far 140 · 雾 off · calls 31 · tris 330067

## B · 狮身人面像（5 张）

### B 狮身人面像 3/4 南侧（臀拱 / 背凹 / 胸肩）

![B 狮身人面像 3/4 南侧（臀拱 / 背凹 / 胸肩）](20-sphinx-side.png)

文件：`20-sphinx-side.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `535.0, 28.0, 745.0` · FOV 56 · far 1600 · 雾 off · calls 90 · tris 845971

### B 狮身人面像正侧面（比例审查）

![B 狮身人面像正侧面（比例审查）](20b-sphinx-profile.png)

文件：`20b-sphinx-profile.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `430.0, 42.0, 740.0` · FOV 58 · far 1600 · 雾 off · calls 81 · tris 794325

### B 狮身人面像正面（东侧）

![B 狮身人面像正面（东侧）](21-sphinx-front.png)

文件：`21-sphinx-front.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `640.0, 30.0, 640.0` · FOV 55 · far 2200 · 雾 off · calls 70 · tris 627953

### B 狮身双前爪 / 前庭近景

![B 狮身双前爪 / 前庭近景](22-sphinx-paws.png)

文件：`22-sphinx-paws.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `575.0, 16.0, 650.0` · FOV 60 · far 600 · 雾 scene · calls 73 · tris 629698

### B 内殿（40×24，地面 +4）

![B 内殿（40×24，地面 +4）](23-sphinx-b-chamber.png)

文件：`23-sphinx-b-chamber.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `474.0, 5.9, 640.0` · FOV 72 · far 160 · 雾 off · calls 35 · tris 350969

## C · 沙漠集市（5 张）

### C 集市主街（北向南）

![C 集市主街（北向南）](40-bazaar-main-street.png)

文件：`40-bazaar-main-street.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `478.0, 8.2, 540.0` · FOV 70 · far 700 · 雾 scene · calls 69 · tris 747510

### C 街心广场（斜俯视）

![C 街心广场（斜俯视）](41-bazaar-c-point.png)

文件：`41-bazaar-c-point.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `525.0, 30.0, 335.0` · FOV 58 · far 900 · 雾 scene · calls 58 · tris 498168

### C 西侧陶匠院 / 摊位群 A

![C 西侧陶匠院 / 摊位群 A](42-bazaar-stalls-a.png)

文件：`42-bazaar-stalls-a.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `385.0, 12.0, 470.0` · FOV 62 · far 400 · 雾 scene · calls 53 · tris 449297

### C 东侧货运院 / 摊位群 B

![C 东侧货运院 / 摊位群 B](43-bazaar-stalls-b.png)

文件：`43-bazaar-stalls-b.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `640.0, 16.0, 450.0` · FOV 60 · far 400 · 雾 scene · calls 54 · tris 701533

### C 集市横街（东向西）

![C 集市横街（东向西）](44-bazaar-cross-street.png)

文件：`44-bazaar-cross-street.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `600.0, 8.2, 394.0` · FOV 66 · far 800 · 雾 scene · calls 78 · tris 677223

## D · 绿洲（3 张）

### D 绿洲湖泊全景（东南向西）

![D 绿洲湖泊全景（东南向西）](50-oasis-lake.png)

文件：`50-oasis-lake.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `300.0, 60.0, 380.0` · FOV 55 · far 2200 · 雾 off · calls 46 · tris 368682

### D 东北岸据点

![D 东北岸据点](51-oasis-d-point.png)

文件：`51-oasis-d-point.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `220.0, 11.0, 340.0` · FOV 64 · far 700 · 雾 scene · calls 42 · tris 299907

### D 湖面第一人称（向湖心）

![D 湖面第一人称（向湖心）](52-oasis-water-fp.png)

> 眼位约水面 +1.7 m
文件：`52-oasis-water-fp.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `180.0, 0.9, 280.0` · FOV 75 · far 900 · 雾 scene · calls 33 · tris 282002

## E · 公路驿站（4 张）

### E 驿站场区全景（南向北）

![E 驿站场区全景（南向北）](60-service-area.png)

文件：`60-service-area.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `460.0, 35.0, 210.0` · FOV 58 · far 1600 · 雾 off · calls 45 · tris 314386

### E 加油棚与加油岛（棚下沿岛）

![E 加油棚与加油岛（棚下沿岛）](61-service-canopy.png)

文件：`61-service-canopy.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `340.0, 4.8, 105.0` · FOV 68 · far 350 · 雾 scene · calls 43 · tris 342791

### E 维修库（北侧开口，向库内看）

![E 维修库（北侧开口，向库内看）](62-service-garage.png)

文件：`62-service-garage.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `330.0, 8.0, 150.0` · FOV 66 · far 350 · 雾 scene · calls 28 · tris 195175

### E 东侧停车区（3 中立载具位）

![E 东侧停车区（3 中立载具位）](63-service-parking.png)

文件：`63-service-parking.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `430.0, 12.0, 152.0` · FOV 62 · far 400 · 雾 scene · calls 44 · tris 314376

## F · 卡纳克列柱神庙（4 张）

### F 卡纳克列柱神庙全景（柱阵 + 方尖碑）

![F 卡纳克列柱神庙全景（柱阵 + 方尖碑）](70-temple-f.png)

文件：`70-temple-f.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `770.0, 35.0, 255.0` · FOV 58 · far 1400 · 雾 off · calls 54 · tris 491205

### F 主柱厅内景（中殿柱列）

![F 主柱厅内景（中殿柱列）](71-temple-f-court.png)

文件：`71-temple-f-court.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `700.0, 12.0, 158.0` · FOV 68 · far 300 · 雾 scene · calls 37 · tris 437950

### F 前庭双列柱与方尖碑

![F 前庭双列柱与方尖碑](72-temple-f-obelisk.png)

文件：`72-temple-f-obelisk.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `700.0, 14.0, 72.0` · FOV 62 · far 350 · 雾 scene · calls 46 · tris 496932

### F 南门楼（20 m 门洞）

![F 南门楼（20 m 门洞）](73-temple-f-pylon.png)

文件：`73-temple-f-pylon.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `760.0, 20.0, 42.0` · FOV 58 · far 600 · 雾 scene · calls 61 · tris 761817

## G · 帝王谷采石场（4 张）

### G 帝王谷采石场全景（三级台阶 + 装车台 + 石料堆）

![G 帝王谷采石场全景（三级台阶 + 装车台 + 石料堆）](80-quarry-g.png)

文件：`80-quarry-g.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `300.0, 30.0, 500.0` · FOV 60 · far 1200 · 雾 off · calls 57 · tris 471849

### G 半埋巨像头近景（从东看脸）

![G 半埋巨像头近景（从东看脸）](81-quarry-colossus.png)

文件：`81-quarry-colossus.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `268.0, 14.0, 344.0` · FOV 62 · far 500 · 雾 scene · calls 42 · tris 349422

### G 西侧三级开采台阶

![G 西侧三级开采台阶](82-quarry-terraces.png)

文件：`82-quarry-terraces.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `250.0, 18.0, 460.0` · FOV 62 · far 700 · 雾 scene · calls 51 · tris 325518

### G 东北装车台与石料堆场

![G 东北装车台与石料堆场](83-quarry-dock.png)

文件：`83-quarry-dock.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `330.0, 12.0, 470.0` · FOV 60 · far 500 · 雾 scene · calls 57 · tris 471849

## A–B 地下墓道（4 张）

### A–B 墓道主通道（s≈48 m，向 B 下坡）

![A–B 墓道主通道（s≈48 m，向 B 下坡）](90-tunnel-interior.png)

文件：`90-tunnel-interior.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `355.9, 5.2, 572.7` · FOV 76 · far 120 · 雾 off · calls 30 · tris 363005

### 墓道中途出口 exit-1（井口爬升）

![墓道中途出口 exit-1（井口爬升）](91-tunnel-exit-a.png)

> 井底 +2.5 → 井口 +4，3 级
文件：`91-tunnel-exit-a.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `410.0, 20.0, 575.8` · FOV 62 · far 400 · 雾 scene · calls 60 · tris 661396

### 墓道中途出口 exit-2（井口爬升）

![墓道中途出口 exit-2（井口爬升）](92-tunnel-exit-b.png)

> 井底 +1 → 井口 +4，6 级
文件：`92-tunnel-exit-b.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `443.6, 20.0, 596.9` · FOV 62 · far 400 · 雾 scene · calls 45 · tris 732229

### 墓道 B 口（狮身西侧）

![墓道 B 口（狮身西侧）](93-tunnel-mouth-b.png)

文件：`93-tunnel-mouth-b.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `393.0, 7.0, 640.0` · FOV 62 · far 300 · 雾 scene · calls 36 · tris 339809

## 双方基地（2 张）

### 蓝队西南基地与载具区

![蓝队西南基地与载具区](95-base-blue.png)

文件：`95-base-blue.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `155.0, 12.0, 150.0` · FOV 58 · far 1200 · 雾 off · calls 29 · tris 170190

### 橙队东北沙丘营地与载具区

![橙队东北沙丘营地与载具区](96-base-orange.png)

文件：`96-base-orange.png` · BUILD_ID `44cb0012f3292061` · 64/high · 相机 `675.0, 12.0, 660.0` · FOV 58 · far 1200 · 雾 off · calls 29 · tris 52983

## 材质（来自 pharaoh-v1 生成器产物，与运行时 PNG 一致）

| 文件 | 说明 |
|---|---|
| [80-materials-contact-sheet.png](80-materials-contact-sheet.png) | 54 材质 contact sheet（64 档） |
| [81-material-2x2-sand-fine.png](81-material-2x2-sand-fine.png) | 代表材质 2×2：sand_fine |
| [81-material-2x2-sandstone-block.png](81-material-2x2-sandstone-block.png) | 代表材质 2×2：sandstone_block |
| [82-material-2x2-mudbrick.png](82-material-2x2-mudbrick.png) | 代表材质 2×2：mudbrick |
| [83-material-2x2-palm-leaf.png](83-material-2x2-palm-leaf.png) | 代表材质 2×2：palm_leaf |

### 54 材质 contact sheet（64 档）

![54 材质 contact sheet（64 档）](80-materials-contact-sheet.png)

### 代表材质 2×2：sand_fine

![代表材质 2×2：sand_fine](81-material-2x2-sand-fine.png)

### 代表材质 2×2：sandstone_block

![代表材质 2×2：sandstone_block](81-material-2x2-sandstone-block.png)

### 代表材质 2×2：mudbrick

![代表材质 2×2：mudbrick](82-material-2x2-mudbrick.png)

### 代表材质 2×2：palm_leaf

![代表材质 2×2：palm_leaf](83-material-2x2-palm-leaf.png)
