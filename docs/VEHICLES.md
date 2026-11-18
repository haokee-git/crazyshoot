# 载具模型批次

## V1 第一批（仅预览，未接入）
- 战斗摩托 MOTO
- 武装吉普 JEEP
- 装甲运兵车 APC
- 步战车 IFV
- 轻型坦克 LT
- 主战坦克 MBT

- 低模卡通，程序化 Three.js 几何；六台轮廓/轮式/履带/炮塔区分
- 总览：`previews/vehicles/00-first-batch.png`
- 单台 UI：`previews/vehicles/<id>-ui.png`
- 吉普转台：`previews/vehicles/jeep-turntable.gif`

## 待确认
1. 比例/轮廓是否够区分 APC/IFV/LT/MBT？
2. 是否需要更明显的阵营涂装、编号、装甲细节？
3. 确认后补轮子转向/履带/炮塔转动/载员位，再接载具物理。

## 未做
- 载具驾驶/射击/上下车/损毁，只做了模型预览。

## 动作预览 V1
- 吉普行驶：`previews/vehicles/jeep-drive.gif`，轮子加十字辐条、车身轻微起伏。
- 四帧对比：`previews/vehicles/jeep-drive-strip.png`。
- 只是预览，未接载具物理/驾驶。
- IFV 炮塔转动：`previews/vehicles/ifv-turret.gif`；四帧对比 `ifv-turret-strip.png`。炮塔 group 已独立，后续接炮塔控制。
- MBT 炮塔独立 group + 转动 GIF `previews/vehicles/mbt-turret.gif`；IFV 行驶 `ifv-drive.gif`。
- 六台车中四台已有轮/炮塔动作（吉普、IFV 行驶/炮塔、MBT 炮塔）。

## 0.11.15 可驾驶载具
- 地图 vehiclePads 生成 8 台实体（摩托/吉普/APC/IFV/轻坦/MBT），F 上车/下车，W/S 油门、A/D 转向。
- 第三人称跟随相机；HUD 提示；小地图车辆菱形图标读取实时坐标。
- 实测船坞：吉普 z 55→68，F 下车恢复玩家。
- 待补：网络同步、车轮/履带/炮塔动画、碰撞/载员。

## 0.11.16 动画/同步
- 车轮按车速滚动；IFV/MBT 炮塔 Q/E 旋转。
- 快照新增 vehicles（x/z/yaw/turretYaw）；客机应用位置与炮塔。
- 实测：主机吉普 z55→69，客机看到 z69.3。

## 0.11.17 履带/碰撞
- 轻坦/MBT 履带材质加滚动条纹，按车速偏移。
- 载具移动前用 blockedAt 检测，撞建筑/边界停下并小幅反弹。
- 实测轻坦 z55→60.8。

## 0.11.18 炮塔开火
- 驾驶 IFV/轻坦/MBT 时左键开火：炮口闪光、弹道、命中走 damagePlayers；轻坦/MBT 冷却 1.1s，IFV 0.42s。
