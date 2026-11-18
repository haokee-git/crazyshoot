# 弹着灰尘、弹孔贴花与联机同步

2026-11-08，Asia/Shanghai。版本 **0.16.5**。本轮给子弹打中静态几何体补上落点反馈：按材质配色的灰尘、带裂纹与焦痕的弹孔贴花、四类撞击音效；房主权威结果实时广播给同房间所有客机，弹孔存在 10 秒后淡出消失。

## 表现

| 项目 | 实现 |
| --- | --- |
| 灰尘 | 每次命中沿命中面法线喷 3 团（金属 4 团）实例化公告板，0.4–0.68 秒内膨胀淡出；颜色按方块材质的平均亮度取中性暖灰，石头/泥土/砖块不会变成绿或粉 |
| 弹孔 | 0.26–0.36m 的乘法混合贴花，压暗墙面而保留墙本身的颜色与颗粒；圆心是黑色弹坑，外圈焦痕与照片裂纹来自 image-gen 素材 |
| 存在时间 | 命中后整 10 秒，最后 1.2 秒淡出；池满时覆盖最旧的一枚 |
| 音效 | 混凝土/泥土/木材/金属四种；按与相机的距离平方衰减，38ms 限流避免连发叠成噪音 |
| 联机 | 房主在命中当帧写入 `impactFx`（7 个数一组：位置、法线、材质，负数表示不贴弹孔），每个客机收到后本地生成同一批灰尘与弹孔，音效也在本地按距离播放 |
| 车体 | 只冒火花灰尘、不贴弹孔（车会移动，贴花会粘在空气里） |

## 截图

贴花素材本身（灰色混凝土为模拟墙面，乘法叠上去的效果）：

![弹孔贴花](decal-preview.png)

4.5 米正面墙。命中 90ms 后（灰尘 + 早期弹孔）：

![命中 90ms](solo-impact-dust.png)

灰尘散尽后的弹孔贴花：

![弹孔](solo-impact-holes.png)

客机视角（房主在同一房间朝墙开火，客机本地无射击）：

![客机看到的弹着点](lan-guest-impact.png)


## 像素墙实测（0.16.6）

方块材质改为严格最近邻后，在花园石墙前 3.6m 三连发实拍。灰尘亮度按「粉碎后的粉尘比墙面更亮」重新配平，浅色石墙上也能看出扬尘；弹孔仍是照片式贴花。

![三连发扬尘](holes-pixel-burst3.png)

![静置后的弹孔](holes-pixel-holes3.png)

1.5m 近景（真实弹坑、裂纹与焦痕）：

![近景弹孔](holes-pixel-close.png)

像素放大（左为墙面纹素，右为弹孔细节）：

![弹孔像素放大](holes-pixel-zoom.png)

## 实现位置

- `src/game/combat/impacts.ts`：新的 `ImpactSystem`（弹孔/灰尘两个实例化池，各一次绘制）+ 弹孔贴花纹理加载（程序化占位图，生成 PNG 解码后覆盖）。
- `src/game/world/solid-index.ts`、`src/game/world/voxel-world-queries.ts`、`src/game/world/arena.ts`、`src/game/world/map-arena.ts`：`raySurface` 在原有 DDA 上补回命中面的法线与方块材质 ID。
- `src/game/engine.ts`：`traceCombat` 记录法线/材质；主机命中生成特效并批量广播 `impactFx`；客机在 `receiveNet` 复现；`updateFx` 驱动两个池。
- `src/game/audio.ts`：`impact(surface, gain)`。
- `tools/art/process-bullet-hole.py`：把 `art/textures-src/bullet_hole.png` 归一化成乘法贴花（混凝土亮度≈1.0，弹坑≈0）并加圆形软边。
- `public/textures/fx/bullet_hole.png`：256×256 运行时贴花，源图与处理脚本都入库。

## 验收

`npx tsx tools/game/audit/bullet-impact-check.ts`，本地 Chromium 1280×720，单人 + 房主/客机双端：

| 检查 | 结果 |
| --- | --- |
| 弹道真实命中墙面并生成贴花 | 5 发命中 4.5m 墙，`liveDecals=5` |
| 灰尘在命中瞬间可见 | `liveDust=15`（5 发 × 3 团） |
| 生成贴图已加载 | 256×256，乘法混合（CustomBlending：DstColor × Zero） |
| 10 秒后自动消失 | 计时 8.75s（含先前等待）后 `liveDecals=0` |
| 客机同步 | 房主开火 6 发，客机 16 ms 内出现 6 个弹孔、18 团灰尘，无页面错误 |

原始数据：[bullet-impact.json](bullet-impact.json)。

## 性能

- 弹孔与灰尘各 1 次 draw call，池固定 96 / 96，连发只复用不增长。
- 每帧只更新存活实例的矩阵与透明度；弹孔不到淡出阶段不写实例属性。
- 单发尘埃 3 个四边形、弹孔 1 个四边形，远低于现有粒子预算（低配 24、默认 32、高配 64 个精灵）。

## 已知边界

- 未在 J1900 真机验收；本轮只有 macOS Chromium 数据。
- 车体命中不产生弹孔（只冒火花），避免贴花跟随移动物体。
- 天空、水体、角色命中不产生弹孔；角色命中仍是原来的血液特效。
- 弹孔数量档位没有做设置项；池上限固定 96，极端刷墙时按最旧覆盖。
