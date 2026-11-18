# 角色持枪姿态待办（用户红框）

## 用户确认的目标
- 参考图：`previews/anim/character/user-expected-gun.png`（用户画了红框）
- 红框含义：在**正俯视**下，枪/托底还要**往身体内收**，让托底贴住右肩/颈线，而不是悬在外侧。
- 当前 last-known 数值：`x=-0.18, y=0.30, z=0.50`（`twoHanded()` 内），右肩前送 `z=0.14`。
- 调整方向：只动 **x**，从 `-0.18` 向 `0` 方向收（约 -0.06 ~ -0.02 起步），保持 y/z 不变；先看托底是否落在肩窝，不穿胸口。
- 不允许为了贴肩把整枪往回拉；如果内收后穿模，只调枪托/肩部，不动 z。
- 用户允许延后：先完成当前 LAN/编辑批次，再统一改，不要现在打乱节奏。

## 后续
- 改完后用正俯视 + 正面 + 右后三张确认，再批量重出 GIF。

## 枪托-肩部候选修正（未部署）
- 按后托底对齐右肩重新算：weaponMount z 0.50→0.66，fire/idle/reload 同步前移。
- 预览：`previews/anim/character/gun-z066-top.png` / `gun-z066-front.png`。
- 等用户确认再进构建。

## 0.11.20 第三人称动作
- 死亡：保留 rig 播放 death 1.8s 后隐藏。
- 审查图 `previews/anim/character/00-actions-review.png`；GIF：idle/aim/swim/death/walk/reload。
- 枪托挂点 z=0.66 保持；第三人称持枪/游泳入口在 updateRemotes。
