# CRAZYSHOOT 内容扩展约定

目标：新增武器、载具、地图、配件、投掷物、特殊武器、玩法时，**优先只加数据/资源，不改引擎与 UI 硬编码**。

## 1. 内容 ID 与目录

所有内容使用稳定字符串 ID（不再用封闭联合类型限制新内容）：

```
src/content/
  weapons/          # 主武器定义 + 模型部件图 + 预览
  special-weapons/  # 特殊武器目录（已建）
  vehicles/         # 载具目录（已建）
  attachments/      # 瞄具/枪口/弹匣/握把/枪托
  throwables/       # 手雷/燃烧弹/烟雾弹
  gamemodes/        # 据点争夺/未来模式
  maps/             # 地图定义（当前放 src/maps，仍按内容处理）
```

每个内容定义都必须有：
- `id`: 永久稳定，不随显示名改变
- `schemaVersion`: 内容结构版本
- `assetBundle`: 资源包 ID（可空 = 主包）
- `tags`: 检索/筛选
- `extensions`: 预留扩展字段

## 2. 新增地图

1. 新建 `src/maps/<id>.ts`，导出 `MapDef`（参考 `docks.ts`）。
2. 在 `src/maps/index.ts` 注册（一行 import + 一行数组项）。
3. 在资源 manifest 增加地图 bundle（贴图/加载图/音频/预览）。
4. 不需要改引擎、UI、渲染器；地图尺寸用 `size`，渲染器按 `MAP_SIZE / size` 自适应。
5. 目标/载具位/特殊点都是数组；未来 4 据点或非对称目标可直接加，不锁死 A/B/C 数量。
6. 载具位只引用 `vehicleId`，新载具不需要改地图类型。

## 3. 新增武器

`WeaponDef` 采用数据驱动（M4 阶段落地）：
- 分类、口径、伤害曲线、RPM、射击模式、弹匣/备弹、换弹时间、扩散/后坐、开镜时间
- `modelId` / `firstPersonRig` / `audioId` / `animationSet`
- `attachmentSlots`: 通用槽位数组（optic/muzzle/mag/grip/stock）
- `assetBundle` / `tags` / `extensions`

UI 的武器列表从 catalog 生成；不要在页面里写死 11 把枪。新增武器 = 目录一条 + 模型部件图 + 音效 + 预览。

## 4. 新增载具

- `VehicleDef` 已有：id/name/short/class/seats/hp/speed/weapons/hvtScore/assetBundle/tags。
- 新载具优先复用已有 `VehicleClass` 物理档案；确实需要新物理档案时，才在核心加一个 class。
- 地图 `VehiclePad` 只引用 `vehicleId`；渲染器/出生逻辑从目录取 class 和 short label。
- 未知载具使用 `vehicleFallback`，不会崩；方便灰度/缺资源时保底。

## 5. 新增配件

- 通用 `AttachmentDef`：`slot`, `compatibleTags`, `statModifiers`, `modelId`, `icon`, `assetBundle`。
- 瞄具只是 `slot: 'optic'` 的一种；未来枪口/弹匣/握把/枪托直接加数据。
- 武器 UI 的配件槽由 `attachmentSlots` 生成，不写死“只有瞄具”。

## 6. 新增特殊武器/投掷物

- 特殊武器：`SpecialWeaponDef` + 地图 `SpecialCrate.weaponId`；未知 id 用 fallback。
- 投掷物：`ThrowableDef`；战备 UI 从目录生成，默认选 2 种。
- 新类型（例如 C4、烟雾弹变体）不需要改地图/装备页面结构。

## 7. 新增玩法

- `GameModeDef`：计分事件、胜利条件、重生规则、目标类型、回合流程。
- 地图用 `gamemodes` 标记支持的模式；不支持的组合在大厅禁用。
- 当前 v1 是 `capture`（3 据点 + 团队分）；未来可加推进/爆破/护送，不改地图数据结构。

## 8. 资源包与自动同步

- `asset-manifest.json` 按 `bundle` 分组；每项有路径/哈希/大小/依赖。
- 新内容只声明自己的 bundle，大厅/加载器按需下载；不必重打整个资源包。
- 版本不匹配时禁止进房，提示同步；未知/缺失资源用 fallback 或阻止该内容。
- 预览图/GIF 也纳入内容目录，方便回归。

## 9. UI 与数据解耦

- 主菜单地图列表、装备页武器网格、载具图鉴、键位分类都从 catalog 生成。
- 新增内容只需提供 UI 需要的字段（名称/短名/图标/描述/属性），不新增页面代码。
- 颜色/队伍/品质等用 token，不写死。

## 10. 兼容与回退

- 每个定义带 `schemaVersion`；加载时校验，未知字段保留在 `extensions`。
- 未知内容 ID：地图/武器/载具/特殊武器都有 fallback 或明确错误，不让整个房间崩。
- 房间握手交换内容清单/版本；缺失内容时给出“缺少 XXX”的可读提示。

## 11. 当前已落地

- 地图：字符串 id、任意 `size`、可扩展 `capturePoints`/`vehiclePads`/`specialCrates`、`extensions`。
- 载具：`VehicleDef` 目录 + `vehicleId` 引用 + fallback。
- 特殊武器：目录 + `weaponId` 引用 + fallback。
- 地图渲染器动态读取目录（载具短名、特殊武器短名），新增内容不改渲染器。
- 固定 300×300 只是当前内容配置，不是引擎限制。
