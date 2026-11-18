# 武器模型批次

## R1：11 把主武器（仅预览，未接入）
- M16A4 / M4A1 / AKM / MP5
- Mk14 / AWM / Uzi / Vector / UMP45 / M870 / M249
- 低模卡通、程序化 Three.js 几何；轮廓/木托/弹匣/瞄具区分
- 总览：`previews/weapons/00-all-weapons.png`
- 本地预览：`preview/weapons.html?weapon=m16`（Vite）
- 单把 UI：`previews/weapons/<id>-ui.png`
- M16A4 转台：`m16-turntable.gif`
- M16A4 换弹：`m16-reload.gif`（弹匣动作；手部未加）

## 待确认
1. 低模比例/硬边/配色是否对？
2. Uzi/Vector/UMP45 轮廓是否够区分？
3. 确认后加手部/前臂、拉栓/开镜/后坐，再接第一人称 viewmodel。

## 未做
- 枪械动画全套、第一/第三人称持枪点、载具模型。

## 第一人称 viewmodel 预览（2026-11-05）
- `preview/viewmodel.html`：单独渲染现有 M16A4 viewmodel，含手/前臂。
- 腰射后坐：`previews/weapons/viewmodel-fire.gif`
- 换弹：`previews/weapons/viewmodel-reload.gif`
- 已把枪托从怼镜头调到右下腰射位；ADS 仍待调。
- 0.10.4：第一人称 hip 枪位前推至 z=-1.02、ADS 至 z=-0.84，减轻枪托怼镜头；预览 GIF 同步重渲。

## 枪托/瞄具返工 R2（2026-11-05）
- 参考图同侧校正：枪口左、枪托右；枪托由等宽方盒改为“前端榫头 + 中段 + 后部加宽 + 托底板”，M16A4/M4/AKM 重做。
- 瞄准配件：红点底座/增高座/镜体/镜环/物镜/调节钮；倍镜镜座/镜环/主镜筒/物镜/目镜/调节钮。
- 审查图：`previews/weapons/00-stock-direction-review.png`、`00-stock-optic-review.png`。
- 仍只在预览模型；未接入游戏。
- 枪托方向审查：`previews/weapons/00-stock-direction-review.png`（枪口左/托右，前榫头后宽托）。
- 瞄具特写：`previews/weapons/00-optic-review.png`（M4 红点、AWM/Mk14 倍镜、Vector 红点）。
- 机械瞄具细化：M16A4 提把后照门/护耳/风偏鼓、AKM 照门叶片/护耳、MP5 转鼓照门。
- 审查：`previews/weapons/00-iron-sight-review.png`。

## 弹匣位置 R3（2026-11-05）
- 参照真枪侧视结构：有独立弹匣的枪，弹匣在扳机护圈前方、后握把前；Uzi 弹匣在握把内，M870 为管状弹仓，保持例外。
- 前移：M16A4 / M4A1 / AKM / MP5 / Mk14 / AWM / Vector / UMP45 / M249。
- 审查：`previews/weapons/00-mag-grip-review.png`。
- 握把统一后倾：底部朝枪托/画面右下；之前符号反了。
- 参考来源：BICC AK variants、National Interest Uzi/Vector、Firearmstalk M249。
- 尚未逐把复核长度/枪管/托比例；当前先确保弹匣-握把-扳机关系。

## Vector 重做（2026-11-05）
- 旧版被做成 UMP 直筒盒；按真枪侧视重做：高位方机匣、全轨 + 翻起机瞄、侧拉柄、大方形扳机护圈、短枪管、直弹匣在前、三角骨架折叠托。
- 对照：`previews/weapons/00-vector-rebuild.png`；UMP 仍保持直筒机匣 + 弯弹匣 + 伸缩托。

- Vector 弹匣/握把按真枪重做后，枪械预览与 UMP 对照见 `00-vector-rebuild.png`。
- Uzi 按真枪改为弹匣插入握把的一体组件，去掉“独立握把 + 独立弹匣”。
- 弹匣/握把 R3 审查图 `00-mag-grip-review.png`；Vector 重做图 `00-vector-rebuild.png`。
- Uzi 弹匣/握把一体；Vector 重做；弹匣前移；握把后倾。

## Vector R5 空心扳机框
- 中段改为四条边框的平行四边形，内部留手/扳机空间，扳机独立；不是实心块。
- 弹匣右下斜插，角度与斜边平行；前垂直握把 + 短枪管 + 高置三角折叠托。

## 0.11.19 第一人称 11 武器
- viewmodel 按 WeaponModelId 重建：统一缩放/枪口/弹匣引用，切枪同步 HUD。
- 实测 M16A4/M4A1/AKM/MP5/Mk14/AWM/Uzi/Vector/UMP45/M870/M249 全部换模；审查图 `previews/game/00-weapon-switch.png`。
- ADS/换弹沿用统一枪身动画；各枪独立弹匣动画仍待按模型命名补齐。
