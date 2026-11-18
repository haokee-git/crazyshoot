# 贴图 / 天空 / 方块地图

- 纹理源图：`art/textures-src/`（image-gen 生成，已记录名称）
- 两套运行时贴图：`public/textures/32/`、`public/textures/64/`
- 同一源图、同一 40 色共享色板；最近邻采样，块面 1m = 1 个 32/64px tile
- 设置：大厅「贴图精度 32×32 / 64×64」，写入 localStorage `crazyshoot.textureRes`，下一局生效
- 天空：`public/skies/morning.jpg`、`noon.jpg`、`dusk.jpg`；每局随机；调试可用 `?sky=noon`
- 调试：`?res=64` 强制 64，`?sky=morning|noon|dusk` 强制天空
- 场地：`src/game/world/voxel-arena.ts`，1×1×1 方块 + heightmap 碰撞 + 1m 自动上台阶
