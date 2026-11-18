# 复活界面：部署点列表动态刷新 + 地图点选

对应修复：死亡界面的部署点列表按**当前可用的己方满进度据点**动态生成（`availableRespawns(team)`：据点属于我方、`|progress|>0.99`、附近无敌人才列出），并且列表与地图标记同时刷新；点地图标记等于点按钮。

实机 1280×720（broken_bridge / bots=0 / 蓝队玩家 / 死亡状态）：

| 图 | 操作 | 结果 |
| --- | --- | --- |
| ![A/B 都归蓝队](1-death-A-B-both-blue.png) | A、B 都设为蓝队满进度后阵亡 | 右侧「部署点」列表 = **大本营 / A 点 / B 点**；地图上 A、B 都是绿色己方圆点 |
| ![A 失守后列表消失](2-death-A-lost-list-refresh.png) | 不复活，把 A 改成敌方（orange, progress=−1） | 列表自动变成 **大本营 / B 点**，A 从按钮和"可选"里消失；地图上 A 变红（仍是据点，但不再可部署） |
| ![点地图选 B](3-death-B-marker-selected.png) | 鼠标点击地图上的 B 标记 | `respawnChoice = "B"`：右侧 B 按钮高亮描边、地图上 B 圆点放大高亮 |

看点：第 2 张和第 1 张是**同一个死亡流程里**截的（没有重开、没有复活），A 失守后列表在 100ms 的 HUD 刷新内就少了一项——这就是"动态刷新"。

补充：列表项文字是「⌂ 大本营 / A A 点 / B B 点」（`<b>` 显示 id、`<span>` 显示 `A 点` 这类 label），所以按钮里 id 会重复出现一次，不是渲染错误。

脚本：`/tmp/rev/respawn.mjs`（写死了点击坐标的算法：`x = left + (pad + (wx-minX)*sx)/W*rect.width`，与 HUD 的 `RespawnMap.pick()` 同一套换算）。
