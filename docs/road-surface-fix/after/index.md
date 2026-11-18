# 跨地图道路表层合成 · 真实 world 截图

> 采集时间：2026-11-11T04:11:02.846Z · 源文件 BUILD_ID：`44cb0012f3292061` · dist/version.json：`44cb0012f3292061` · dev server BUILD_ID：`44cb0012f3292061`
> 版本 0.20.3 · MAP_REVISION `voxel-halfgrid-v11` · MATERIAL_REVISION `6` · viewport 1600×900 · res=64 quality=high
> 真实体素 world（`game.html`），非平面图/预览模型；冻结 `engine.raf` 后手动机位、关雾渲染，HUD 已隐藏。
> `源文件 BUILD_ID` 与 vite 的同一算法（src+public 内容哈希）；dev server 的 `/version.json` 在启动时冻结，仅作参考。

| 图 | 场景 | 文件 | 相机 (x,y,z) | FOV | far | calls | tris |
|---|---|---|---|---:|---:|---:|---:|
| docks | 船坞 · 东码头（主路 / PIER A 横穿混凝土码头） | [docks-east-pier.png](docks-east-pier.png) | 264.0, 22.0, 121.0 | 60 | 700 | 64 | 212241 |
| broken_bridge | 断桥 · 加油站前庭（镇前道路斜切混凝土场坪） | [broken-bridge-gas-station.png](broken-bridge-gas-station.png) | 204.0, 20.0, 190.0 | 62 | 700 | 48 | 104662 |
| broken_bridge | 断桥 · 桥面与河谷（后置桥体箱，不被道路填色） | [broken-bridge-deck.png](broken-bridge-deck.png) | 154.0, 18.0, 198.0 | 65 | 800 | 52 | 145759 |
| garden | 花园 · 东服务院（外环 path 纵穿混凝土院坪） | [garden-service-yard.png](garden-service-yard.png) | 248.0, 32.0, 134.0 | 60 | 700 | 27 | 61260 |
| garden | 花园 · 东门房前庭（外环 secondary 压到混凝土门庭） | [garden-east-gate.png](garden-east-gate.png) | 274.0, 30.0, 184.0 | 62 | 700 | 54 | 164686 |
| airfield | 机场 · 南机坪 / 机库道 / 09-27 跑道与滑行道 | [airfield-runway-taxiway.png](airfield-runway-taxiway.png) | 188.0, 32.0, 104.0 | 62 | 900 | 51 | 185011 |

## docks · 船坞 · 东码头（主路 / PIER A 横穿混凝土码头）

![船坞 · 东码头（主路 / PIER A 横穿混凝土码头）](docks-east-pier.png)

文件 `docks-east-pier.png` · 相机 `264.0, 22.0, 121.0` · 四元数 `-0.156, 0.690, 0.156, 0.690` · FOV 60 · far 700 · calls 64 · tris 212241 · 1294 KB

> 码头作业区 asphalt 与东码头 concrete 两层作者地表；东侧主路 x≈205、PIER A z≈120 都在此交叉。

## broken_bridge · 断桥 · 加油站前庭（镇前道路斜切混凝土场坪）

![断桥 · 加油站前庭（镇前道路斜切混凝土场坪）](broken-bridge-gas-station.png)

文件 `broken-bridge-gas-station.png` · 相机 `204.0, 20.0, 190.0` · 四元数 `-0.098, 0.868, 0.189, 0.450` · FOV 62 · far 700 · calls 48 · tris 104662 · 1860 KB

> 加油站 concrete patch [144..186, 204..228]；镇前 secondary 从北缘 z≈202 斜穿。

## broken_bridge · 断桥 · 桥面与河谷（后置桥体箱，不被道路填色）

![断桥 · 桥面与河谷（后置桥体箱，不被道路填色）](broken-bridge-deck.png)

文件 `broken-bridge-deck.png` · 相机 `154.0, 18.0, 198.0` · 四元数 `-0.141, 0.227, 0.033, 0.963` · FOV 65 · far 800 · calls 52 · tris 145759 · 1806 KB

> 完整桥面 concrete [110..150, 130..170]；主路 x≈132 穿过，但桥面是后置 box，水下格子不得被铺路。

## garden · 花园 · 东服务院（外环 path 纵穿混凝土院坪）

![花园 · 东服务院（外环 path 纵穿混凝土院坪）](garden-service-yard.png)

文件 `garden-service-yard.png` · 相机 `248.0, 32.0, 134.0` · 四元数 `-0.228, -0.251, -0.061, 0.939` · FOV 60 · far 700 · calls 27 · tris 61260 · 1640 KB

> 东侧服务院 concrete [262..298, 52..112]；外环 path x=276.5 纵穿整块混凝土院坪。

## garden · 花园 · 东门房前庭（外环 secondary 压到混凝土门庭）

![花园 · 东门房前庭（外环 secondary 压到混凝土门庭）](garden-east-gate.png)

文件 `garden-east-gate.png` · 相机 `274.0, 30.0, 184.0` · 四元数 `-0.286, 0.289, 0.091, 0.909` · FOV 62 · far 700 · calls 54 · tris 164686 · 2132 KB

> 东门房前庭 concrete [236..260, 134..166]；东门 secondary x=260..276.5 的核心伸进前庭西缘。

## airfield · 机场 · 南机坪 / 机库道 / 09-27 跑道与滑行道

![机场 · 南机坪 / 机库道 / 09-27 跑道与滑行道](airfield-runway-taxiway.png)

文件 `airfield-runway-taxiway.png` · 相机 `188.0, 32.0, 104.0` · 四元数 `-0.100, 0.889, 0.233, 0.382` · FOV 62 · far 900 · calls 51 · tris 185011 · 1483 KB

> 南侧机坪 asphalt [84..214, 14..112] 被机库道 x=150 穿过；北侧滑行道 z=184 与跑道 z=150 在远处交会。
