# AGENTS.md · CRAZYSHOOT

> 给接手本仓库的 Agent / 新同学：用最少时间知道 **改哪里、怎么验证、别碰什么**。
> 当前版本 **0.21.0**（`package.json`）。**代码是唯一真相**；`docs/` 与 README 常滞后，冲突时以源码和 `dist/version.json` 为准。

CRAZYSHOOT 是一个浏览器步兵/装甲占点 FPS：4v4–12v12，单人 AI 或房主权威联机；五张常规图（docks/broken_bridge/garden/airfield/pharaoh）+ 千户苗寨（miao_village）+ 训练场。

## 0. 铁律（先读这 8 条）

1. **本目录是本地 Git 仓库**（分支 `main`，初始提交为 0.20.6 现状快照，约 1.5 GB）。用 `git diff/log/status` 看改动；`node_modules/`、`tmp/`、`.DS_Store` 由 `.gitignore` 排除。`dist/`、`docs/`、`previews/` 是构建产物/验收证据（合计 >1 GB），已在库中，不要删除或"整理"。
2. **内容数据驱动**：武器/载具/地图/特殊武器从 `src/content/`、`src/maps/` 目录读取。新增内容不要改 UI 硬编码数组；ID 一经发布保持稳定。
3. **房主权威**：联机时只有 host 跑 AI、载具物理、伤害、占点、复活。客机只本地预测移动、发输入/射击意图。客机别加会与快照打架的本地权威逻辑。
4. **世界同源**：渲染、碰撞、支撑、导航、子弹 DDA 共用同一份体素数据；不要再造第二套碰撞清单。
5. **固定 60 Hz 模拟**（`SimulationClock`，单帧最多追 30 步）；渲染可 30/60/不限。热路径避免每帧分配、全场景射线或 DOM 重建。
6. **像素风硬约束**：方块贴图最近邻放大（`NearestFilter`），有实际 32/64/128 PNG；单局资源由本站 nginx 直出，**不接 CDN**。
7. **版本三件套**：`package.json` 版本 + `BUILD_ID`（src/public 内容哈希，自动）+ `MAP_REVISION` / `MATERIAL_REVISION`（手写，改世界/材质必须 bump，见 §5.5）。
8. **改完必须验证**：`npm run build` + 相关 vitest；改联机/渲染/AI 再跑对应 Playwright 审计（§7）。不要把"代码看起来对"当验收。

## 1. 快速开始

```bash
npm install
node server/signal/server.mjs                 # 信令/中继，127.0.0.1:18789
npm run dev -- --host 127.0.0.1 --port 5174   # 审计脚本默认 5174
# 打开 http://127.0.0.1:5174/game.html
```

- 入口：`game.html` → `src/game/main.tsx`；`index.html` 只是重定向。
- 单人：大厅选地图/人数 → 开始（无 `map` 参数 = 训练场 BLOCKOUT，64×64）。
- 联机：房主建房得 4 位码；客机加入。P2P 失败自动走 `/signal` 中继；Vite 已把 `/signal` 代理到 18789。
- 常用 URL 参数：`map=docks|broken_bridge|garden|airfield|pharaoh|miao_village`、`size=4..12`、`prep=秒`、`res=32|64|128`、`sky=morning|noon|dusk`、`bots=0|1`、`seed=1106`、`lite=1`（不渲染）、`turn=1`（本地 TURN）。
- 本机调试句柄：`window.__game`（`GameEngine` 实例）。

## 2. 技术栈与构建

| 项 | 事实 |
|---|---|
| 运行时 | 浏览器，WebGL2；Three.js `0.187` + Preact 11（不是 React） |
| 构建 | Vite 8 + TypeScript 5.9（`strict`），双入口 `index.html` / `game.html` |
| 测试 | Vitest（Node 单测）+ Playwright（无头浏览器审计） |
| 信令 | 独立 Node `ws` 服务 `server/signal/server.mjs`，不跑游戏逻辑 |
| 架构 | 房主权威 + WebRTC DataChannel（可靠事件通道 + 不可靠状态通道） |
| 关键脚本 | `dev` / `build`（tsc --noEmit + vite build）/ `test` / `test:audit` / `test:vehicles` / `test:performance` / `test:water` / `maps:render` / `build:signal` |

构建身份写在 `vite.config.ts`：对 `src/` + `public/` + 版本做 SHA-256 取前 16 位，同时生成 `/version.json`。联机开局比对 `buildId + mapRevision`，不一致拒绝进房。

## 3. 目录地图

| 路径 | 作用 | 备注 |
|---|---|---|
| `src/game/engine.ts` | **运行时中枢（约 4000 行）**：场景装配、主循环、射击/伤害、AI 编排、载具、网络收发、HUD 状态 | 改前先定位；不要把新内容塞进来 |
| `src/game/world/` | 体素数据/网格/碰撞/导航、建筑室内、梯子、水体、光照阴影、合批 | `src/game/world/voxel-map-data.ts` 是生成核心 |
| `src/game/player/` | 玩家控制器、运动、姿态、游泳、客户端输入 | 蹲/趴/歪头/上台阶在此 |
| `src/game/combat/` | 弹体池、命中区、散布、弹着特效、投掷物/烟雾、火焰 | |
| `src/game/weapons/` | 第一人称 viewmodel、瞄具、后坐、手臂、英雄模型 | ADS 居中/歪头在这里 |
| `src/game/vehicles/` | 载具运动/接触/伤害/损伤特效 | `src/game/vehicles/controller.ts` 是实战数值表 |
| `src/game/ai/` | 纯函数/策略：瞄准、Bot 配装、局部导航、载具寻路/驾驶 | 权威状态仍在 engine.ts |
| `src/game/characters/` | 低模角色骨架与动画混合 | |
| `src/game/core/` | 加载、设置、按键、输入、模拟时钟、资源释放、资源清单 | |
| `src/game/ui/`、`src/ui/` | 局内 HUD/大厅/设置、整备页 | 只读 `HudState`，不反向驱动 |
| `src/network/` | `NetworkSession`（WebRTC/中继）、信令客户端 | |
| `src/content/` | 武器/载具/特殊武器/材质目录 + 模型 | 数据与表现分离 |
| `src/maps/` | 六张 `MapDef` + 地图注册表 + 战场设计（高度/坑/掩体/车道） | `src/maps/battlefield-design.ts` 管宏观地形；`src/maps/miao-village/` 是河谷图的 layout/river/height/network/coverage 单一数据源 |
| `server/signal/` | 4 位房间码、SDP/ICE、断线中继、限速 | 24 人上限、房间 TTL 15 min |
| `public/` | 贴图、天空盒、UI 图、`version.json` | 37 MB；运行时分发资源；`version.json` 是占位，真实身份由 Vite 生成 |
| `dist/`、`dist-signal/` | 生产构建输出 / 信令打包输出 | 与线上发布对应，勿手改 |
| `art/`、`dsh-image-gen/` | 贴图源图、生成中间产物 | 不下发、不参与构建 |
| `tests/` | 56 个 Vitest 行为契约 | 数值改了要同步 |
| `tools/` | `tools/game/audit` Playwright 回归、`maps` 平面图、`anim`/`weapons`/`vehicles` 预览渲染 | |
| `docs/` | 设计/性能/审计/发布证据 | 1 GB，只增不删 |
| `previews/` | 历史渲染产物/GIF | 219 MB，证据 |
| `deploy/` | nginx 引导、systemd、原子发布脚本 | 生产 `/var/www/crazyshoot` |

## 4. 运行时主线

```
game.html → src/game/main.tsx
  └ nextPaint → checkWebGL2 → preloadWorld(贴图/天空/UI)
       → (真实地图) prepareTerrain: Web Worker 生成体素/网格/导航 → Transferable
       → new GameEngine(host, callbacks, {net, bots, matchId, terrain})
            initialize(): arena.ready → 导航/Bot 填充 → 着色器预热 → 首帧 → loop()
            ready 屏障：本机就绪 + 各客机 ready ACK → beginPrep(20s)
       → engine.activate() → 整备 → startLive() → 比赛
  GameEngine.tick: 固定 60Hz simulate → snap 下发 → 10Hz HUD(onHud) → 10Hz 名字 → render
  Preact: HudState → HUD/整备页/设置；所有反向操作都走 engineRef 方法
```

- **加载**：0–60% 资源、62–70% 地形、75/85/99/100% 引擎。资源失败不达 100%，错误页可重试。
- **比赛**：0 分起，占点+击杀得分，先到 1000 或单局时限（常规图 10 min、法老 20 min，房主可自定义 1–60 min）比分高者胜；阵亡至少 5 s 后**手动点击“部署”**才复活（不再自动重生），重生后 5 s 无敌保护；基地/控制点静止补给。
- **暂停**：单机冻结模拟；联机菜单只断本机输入，不让全房间暂停（`hostSuspended` 由房主快照下发）。
- **网络**：客机 60 Hz 发 `inputs`，可靠 `shoot` 由房主复算；房主按人数 60/30/20 Hz 发全量 `snap`；`shotFx`/`impactFx`/`flameFx` 做表现广播。
- **HUD 契约**：引擎每 100 ms 调一次 `callbacks.onHud(hudState())`；`HudState` 是唯一出口（`engine.ts:106` 起）。`hudDirty` 是历史遗留死标记，别指望它。

## 5. 数据契约（改内容必看）

### 5.1 地图 → 世界

- `MapDef`（`src/maps/types.ts`）：`size`、terrain/roads/buildings/covers/props、`capturePoints`、`spawns`、`vehiclePads`、`specialCrates`、`routes`、`extensions`。四张经典图 `size=300`，法老 800、千户苗寨 500；地图注册表 `src/maps/index.ts`。
- 宏观地形在 `src/maps/battlefield-design.ts`：`BATTLEFIELDS` 定义每图高度/坑/车道/狙击点；`enhanceBattlefield` 再注入战术掩体。**只改 MapDef 不给 BATTLEFIELDS 加条目，地形会变平**。
- 生成：`src/game/world/voxel-map-data.ts: buildVoxelMapData()` → 1 m 体素（`width=size+64`，`x/z∈[-32,size+32]`；默认 `y∈[-8,23]`，法老/苗寨由 `extensions.vertical` 扩展）；`detail` 层用 0.5 m 栅格（halfgrid）补充家具/台阶/掩体。水体支持 `map.waterVolumes` 多标高（河流/梯田/渡船坞）。
- 渲染/碰撞/导航同源：`src/game/world/terrain-worker.ts` 在 Worker 内返回网格、`heights/primary/water`、导航边；主线程 `src/game/world/map-arena.ts` 装配 `Arena`。训练场走 `buildVoxelArena`（64×64，无载具/水体）。
- 建筑：`roof !== 'open'` 默认可进入；门 4×3 m、窗 2×2 m、净高 ≥8 m 自动二层、楼梯 2 m 宽 4 级。生成顺序是"几何 → 门窗清空 → 家具/室内掩体 → 再清一次门洞"；家具必须对齐 0.5 m 栅格，`interiorDecor` 装饰不参与碰撞。
- 梯子/水体：坑洞梯子由 `BATTLEFIELDS.pits` 生成，攀爬触发/顶出口校验在 `src/game/player/controller.ts`；苗寨河岸梯/桥侧梯写在 `src/maps/miao-village/river.ts`；水面/梯田/渡船坞用 `waterVolumes` 逐块 surfaceY，出水路线预计算（`src/game/world/water-navigation.ts`）；越界/坠落 6 s 回最近安全点，不是空气墙。

### 5.2 武器

- `src/content/weapons/catalog.ts`：11 把主武器 + AMR/RPG/喷火器；`WeaponId`、`getWeapon`、`OPTICS`、`THROWABLES`、`DEFAULT_LOADOUT`。UI 从目录生成。
- 射击链：`LoadoutSelection → WeaponViewmodel`（表现）+ `weaponAmmo()`（弹种模板）→ `ProjectilePool` 逐帧弹道 → `applyCombatHit`。伤害基础值用目录 `damage`，初速/重力/护甲类别用 `AMMO` 模板。
- 命中区：头 ×2.2、躯干 100%、四肢 ×0.7（SMG/机枪为 1.0）；AWM 躯干/头致命、AMR 任意部位致命；距离衰减 + 姿态/速度散布 + 逐枪后坐。
- 特殊武器：拾取后主武器存入 `stowedPrimary`，打空或阵亡自动换回。**crate id ≠ weapon id**：RPG 的 crate 是 `rocket`，weapon/弹丸是 `rpg`；AMR 和喷火器同名。映射在 `engine.ts` 的 `isSpecialWeaponId/specialWeaponFor/crateLabel` 三处。
- 喷火器只伤人、不伤车；正面头球被锥体覆盖才触发 1.5 s 重度视野压制，背部只掉血；封闭载具免疫，敞篷乘员可被烧。

### 5.3 载具

- 六类：摩托/吉普（软目标）、APC/IFV（轻甲）、轻坦（中甲）、主战（重甲）。地图 `vehiclePads` 只引用 `vehicleId`。
- **实战数值在 `src/game/vehicles/controller.ts`**（尺寸/极速/血量/履带/封闭），不是 `src/content/vehicles/catalog.ts` 的 `hp/speed`（后者主要给预览，二者目前不一致，别拿目录当验收）。
- 运动：9 点支撑贴地、坡度/台阶/涉水检测、OBB 车-车/车-建筑碰撞、卡住螺旋脱困 + 2.2 s 绞盘兜底；高速撞墙掉血、撞人按车速结算。
- 炮塔：`isCannon` 只认 120 mm 与 30 mm；鼠标给期望方向，真实炮口按转速滞后；B 在炮位切 AP/HE。散布：30 mm 首发 ±0.05° 每发 +0.012°（上限 0.25°），120 mm 固定 0.03°，机枪 ±0.15°→0.6°。
- 生存：低血 <35% 灰烟、<15% 黑烟+火星；车毁 7.5 m 爆炸、乘员弹出、残骸全黑留场，下一局重置；中途下车按车速摔伤（5 m/s 起）。

### 5.4 玩家/表现

- 键位：WASD、Shift 疾跑、Space 跳、C 蹲、Z 趴、Ctrl 静步、Q/E 歪头、R 换弹、B 切模式/弹种、E 交互上下车、G/H 投掷、Tab 整备或复活换装、M 地图、N 静音。
- 姿态：站 1.8 / 蹲 1.25 / 趴 0.74 m；趴下不锁移动与射击；空格先起身再跳。歪头 = 上半身绕腰圆弧平移（镜头不滚转，侧移 0.205 m/下沉 0.036 m）。
- 第一人称：viewmodel 独立 scene/camera；ADS 由瞄具决定 FOV 与眼位，准星严格居中；红点/全息/2-8x 各自模型，`[`/`]` 调可变倍率；枪口受阻时拉枪并禁火。

### 5.5 版本与资源 revision

- `src/version.ts`：`MAP_REVISION='voxel-halfgrid-v14'`、`MATERIAL_REVISION=8`，并与 `vite.config.ts` 里的 identity 手写同步。
- 任何改变体素/可站立面/材质层集合的地图改动 → bump `MAP_REVISION`；改贴图集内容 → bump `MATERIAL_REVISION`。否则新旧客户端可能进同一房间看到不同世界（真正联机闸门是 `buildId`，它是内容哈希）。
- 体素材质：`MATERIAL_SLOTS=160`；classic 0–67、interiors 68–71、pharaoh 72–121、miao 122–153。新 id 必须同时有 `BLOCK_TEXTURES` 名称、对应资源包 manifest、32/64/128 PNG；`assetBundle` 走 `src/game/core/asset-bundles.ts` 注册表，禁止在 loading 里加地图 if/else。室内贴图走 `src/content/materials/interiors.ts` + `public/textures/interiors/64`。

## 6. 常见任务手册

| 想做什么 | 主改 | 连带 / 验证 |
|---|---|---|
| 加一张地图 | 新建 `src/maps/<id>.ts` 的 `MapDef`；`src/maps/index.ts` 注册 | `src/maps/battlefield-design.ts` 加同名 `BATTLEFIELDS`（高度/坑/车道）；跑 `tests/building-interiors.test.ts`、`tests/voxel-world.test.ts`、`npm run test:water` |
| 改苗寨地形/据点/渡船 | `src/maps/miao-village/*` + `src/game/world/miao-village-structures.ts` | 跑 `tests/miao-*.test.ts`、`npm run test:water`、`miao-village-coverage.ts`；不要改旧图 |
| 改地形/据点/载具位 | `BATTLEFIELDS` + `MapDef` | 坑必须保留坡道+梯子双出口；复查 `insidePitWork`、门洞清空、导航可达 |
| 加武器 | `src/content/weapons/catalog.ts`（id/数值/模式）→ `src/content/weapons/models.ts` 加模型 case → `src/content/weapons/presentation.ts` 加 muzzle/scale/rail → `src/game/weapons/recoil.ts` PROFILES | 可选 `src/game/ai/bot-loadout.ts` POOLS；同步 UI 自动生效；跑 `tests/recoil.test.ts`、`tests/optics.test.ts` |
| 调伤害/护甲 | 武器 `damage` + `src/game/combat/projectiles.ts` 的 `AMMO` + `src/game/vehicles/damage.ts` | 测试钉死 TTK/倍率；改完跑 `tests/hit-zones.test.ts`、`tests/vehicle-armor.test.ts`、`tests/vehicle-spread.test.ts` |
| 加载具/改车 | `src/content/vehicles/catalog.ts` + `src/content/vehicles/models.ts`；实战数值 `src/game/vehicles/controller.ts`（size/maxSpeed/health/tracked/enclosed） | 座位/炮口在 engine `vehicleSpawn/seatPosition`；损伤特效 `src/game/vehicles/damage-fx.ts`；`vehicleSize` 与模型碰撞盒同步 |
| 改 HUD/整备页 | `engine.ts: hudState()` + `HudState` → `src/game/ui/hud.tsx` / `src/ui/prematch/*` | 反向只调 `engineRef` 方法；不要给组件加定时器 |
| 加网络消息 | `engine.ts: receiveNet()` 同时写 host/guest 分支 + `sendSnapshot()`/触发点 | 必须校验 `matchId`、发送者、数值范围；加字段先估 `snap` 带宽；改完跑 `npm run test:audit` |
| 改键位 | `src/game/core/keybinds.ts` + `src/game/core/input.ts` 别名表 + `src/game/ui/settings.tsx` | 客机按键白名单在 `engine.ts`；旧档迁移逻辑别破坏 |
| 发布 | `npm run build` → 逐文件生成 `release-manifest.json` → tar → `deploy/atomic-release.py stage/activate` | 写 `docs/deploy-<日期>-<版本>/REPORT.md`；保留最近 3 版，回滚=切软链 |

## 7. 测试与验收

```bash
npm run build                 # tsc --noEmit + vite build（必须过）
npm test                      # 56 个 Vitest 文件
npm run test:water            # 六图水面开口/出水路线模拟（含苗寨 0.5m 水体）
npm run test:vehicles         # 载具验收（需 dev server + Playwright；录像另需 ffmpeg）
npm run test:audit            # core/maps/network/lifecycle 四段浏览器回归（需 dev + signal）
npm run test:performance      # 四图 8v8/12v12 性能采样
npm run test:round2           # 整备/网络/性能补充回归
```

- 浏览器审计要求 Vite 在 **5174**；Chromium 可用 `CRAZYSHOOT_CHROMIUM` 指定，默认找 Playwright/Chrome。
- 单测是行为契约：`hit-zones`（部位倍率）、`flame-blind`（致盲几何）、`optics/recoil`、`vehicle-armor/motion/pilot/route/spread`、`building-interiors`（四图逐门逐梯实走）、`voxel-world`（半格碰撞/桥面分层/越界恢复）、`settings`（迁移）、`swimming/ladders/stance`。
- 性能预算（M5 实测，非目标机保证）：典型 ≤150 draw calls、激战 ≤250；模拟 p95 <1 ms；J1900 真机未验收。
- 审计证据按 `docs/audit-<日期>/`、`docs/deploy-<日期>-<版本>/` 归档；`delivery`/REPORT 里的"待验收"不要当已通过。

### 7.1 光影系统（lighting rev3）

- 统一入口：`src/game/rendering/lighting-presets.ts` 定义五档 `off/low/medium/high/ultra`（UI 显示 无/低/中/高/极致），单选 `lightingQuality` 驱动太阳阴影/接触阴影/体素 AO/辉光/雾比例；设置 rev3 迁移旧 `sunShadows` 等字段，丢弃 `renderScale`/`outputScale`。
- 渲染尺寸 = `floor(innerWidth/innerHeight × devicePixelRatio)`（原生 DPR，无分辨率/超采样控件）；AA、贴图、帧率上限仍独立。
- `ultra` 走独立 HDR 管线：`rendering/cinematic-shadows.ts`（CSM 3 级联 + PCSS）、`cinematic-pipeline.ts`（HalfFloat 世界 RT + GTAO 深度感知上采样 + HDR bloom + 重投影运动模糊 + 遮挡感知太阳眩光）、`cinematic-lighting.ts`（PMREM 环境 + 天空可见度探针 + 曝光自适应）；`EXT_color_buffer_float` 不支持时实际回退 high 并在设置里提示。
- 审计：`tsx tools/game/audit/lighting-regression.ts --phase=visual|all <outDir>`（需 dev server 5174，evidence PNG/JSON 写到 outDir）。
- `ultra` 战场表现增量模块：`rendering/pixel-surfaces.ts`（贴图派生法线/粗糙度/凹陷，不改源贴图）、`world/voxel-skylight.ts`（离线天光可见度烘焙，terrain-worker 转移 `skyLight` 缓冲）、`rendering/cinematic-water.ts`（平面反射 + 折射 + 菲涅尔 + CSM 日照遮蔽，单一主水面）、`rendering/battlefield-grade.ts`（最终调色，world+hands 一起过，无胶片颗粒/暗角）；仅 ultra 生效，`MATERIAL_REVISION` 随体素材质数据变更 bump。
- 冻结姿势前后对比审计：`tsx tools/game/audit/battlefield-look.ts --mode=before|after <outDir>`（先跑 before 写 `recipes.json`，after 复用同一姿势）。
- 水面生命周期审计：`tsx tools/game/audit/water-cycles.ts <outDir>`（docks 上 8 轮 ultra↔off/high + 贴图 32/128/64 换档，断言源网格可见性恢复、blockMap 跟随、FB 完整）。
- `maps-regression.ts <outDir>`、`lifecycle-regression.ts <out.json>` 接受可选输出路径参数，默认写 `tmp/` 下时间戳目录，不再覆盖 `docs/audit-*`。

## 8. 高频坑（照着躲）

1. **文档漂移**：`README.md` 还写 0.18.1；`docs/NETWORK.md` 是 0.12 时代；`docs/PERFORMANCE.md` 的名字频率是旧值。协议看 `receiveNet()`，频率看 `engine.ts`。
2. **catalog 载具 `hp/speed/seats` 不等于实战**：实战读 `src/game/vehicles/controller.ts`。加车前先改那张表。
3. **特殊武器三处手工映射**：`rocket`/`rpg` 混用；新增特武要同步 `isSpecialWeaponId`、`specialWeaponFor`、`crateLabel`、地图 crate、模型/表现/后坐配置。
4. **燃烧弹可选但未实装**：`THROWABLES` 里有 `incendiary`，`throwItem()` 只接受 frag/smoke，选它等于空槽。
5. **枪口坐标有三份**：`presentation.muzzle`、viewmodel 的负 z 转换、`neutralMuzzleOffset`；只改一处会出现枪口/弹道错位。
6. **`hudDirty` 不参与节流**：HUD 固定 100 ms 推送，`hudDirty` 只是遗留标记。
7. **`start` 重发有两份**：`main.tsx` 的 `startNet` 与 `retryGame` 各一套 500 ms 循环；改开局协议必须两处同步，且保持 `matchId` 幂等。
8. **`dispose()` 必须收全**：新增监听、纹理、InstancedMesh、Worker 都要进释放链；`arena.scene.clear()` 只清引用不释放。
9. **客机输入白名单**：新按键要同步 `src/game/core/input.ts` 别名、`engine.ts` 客机白名单、设置页保留键，否则本地能按、联机不动。
10. **地图边界静默丢块**：体素 `put()` 超过 y 上限会直接忽略；建筑高度被 clamp，坡屋顶再受限。做高地先算清 24 格上限。
11. **体素网格回归**：改 `detail` 步长/合面会打挂 `voxel-world` 的三角形面积断言；改门窗/家具会打挂 `building-interiors` 的支撑/避让断言。
12. **Bot 不会捡特殊武器/空投**：`pickupLoot` 明确拒绝 bot；AI 只用 POOLS 里的常规枪。

## 9. 文档索引（先看这些，别全读）

| 文档 | 状态 | 用途 |
|---|---|---|
| `docs/MAP_DESIGN.md` | ✅ 当前 | 四图意图、坑/出口、可进入建筑与室内契约 |
| `docs/EXTENSIBILITY.md` | ✅ 大部分已落地 | 新地图/武器/载具/配件/玩法/资源包约定 |
| `docs/PREMATCH.md` | ✅ 当前 | 20 s 整备流程与装备页 |
| `docs/ART_PIPELINE.md`、`docs/ASSETS.md` | ✅ 当前 | 贴图/天空/许可 |
| `docs/PERFORMANCE.md` | ⚠️ 数据 0.14，方法有效 | 性能边界与预算、历史采样 |
| `docs/NETWORK.md` | ⚠️ 0.12 历史 | 只作背景，协议以代码为准 |
| `docs/WEAPONS.md`、`docs/VEHICLES.md` | ⚠️ 模型批次历史 | 造型迭代记录 |
| `docs/ANIMATION_TODO.md` | 📌 待办 | 持枪/肩部未完成项 |
| `docs/audit-*`、`docs/deploy-*`、`docs/review-*` | 📌 证据归档 | 修复项、已知缺口、发布/回滚记录 |
| `deploy/README.md` | ⚠️ 部分过时 | 信令已实现；以 `server/signal/` + `deploy/*` 为准 |

## 10. 发布速记

1. `npm run build` → `dist/`（含 `version.json`）+ `tsc` 通过。
2. 生成逐文件 `release-manifest.json`（SHA-256 + identity），用 Python `tarfile` 只打文件（macOS `tar` 会带 `._` 元数据被拒）。
3. 上传 `/tmp`，`python3 deploy/atomic-release.py stage <archive> <release> <sha> <previous>` 校验后解包；再 `activate` 原子切 `current` 软链。
4. 线上验 `/version.json`、`/game.html`、主 JS、`/signal` 101、浏览器冒烟。
5. 写 `docs/deploy-<日期>-<版本>/REPORT.md`（版本/BUILD_ID、步骤、验证表、回滚），保留最近 3 个 releases。

---

**一句话交接**：改内容去 `src/content` / `src/maps`，改世界去 `src/game/world`，改玩法/网络去 `src/game/engine.ts`（谨慎），验证先 `npm run build && npm test`，再按 §7 跑对应审计；任何"看起来能跑"的改动都不算完成。
