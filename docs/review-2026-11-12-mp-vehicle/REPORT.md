# 联机与载具问题修复报告 · 0.20.5

- 版本：`0.20.5`
- BUILD_ID：`29e85c07e80b4316`（构建后以 `dist/version.json` 为准）
- MAP_REVISION：`voxel-halfgrid-v11`（未改世界）
- MATERIAL_REVISION：`6`（未改材质）
- 日期：2026-11-12

## 1. 切后台回来“房间已关闭”

### 根因
1. 信令 WebSocket 一断，`NetworkSession` 立即 `emit('closed')`，`main.tsx` 直接 `dropToLobby()`，即使 P2P 数据通道还活着。
2. 信令服务心跳 30 s 一次、一次没 pong 就 `terminate()`；断线即 `peer-left`，房主断线即 `closeRoom`。
3. 房间 15 min 无信令消息就 `idle-timeout`，而 P2P 对战期间信令本来就没有业务流量。
4. 后台标签被浏览器冻结后，旧 WebSocket 可能半开，恢复时不会自动重连。

### 修复
- 信令协议升到 `protocol:2`：`created/joined/resumed` 下发 `resumeToken`；新增 `resume {code,peerId,token}`。
- 断线后 peer 在宽限期（默认 180 s，`SIGNAL_RESUME_GRACE_MS`）内保留在房间并标记 `offline`；只广播 `peer-offline/peer-online`，宽限到期才 `peer-left`；房主超时才 `closeRoom('host-timeout')`。
- 心跳连续 3 次（≈90 s）没有 pong 才 terminate；pong 与任何房间消息都会 touch 房间。
- 客户端 1→2→4→8→15 s 指数退避重连；`visibilitychange` 回前台 / `online` 立即重试；隐藏超过 30 s 直接换新 WS + resume；25 s 房间 ping；6 s resume 看门狗。
- `closed` 只在 `room-closed` / `resume_failed` / 4001 / 4002 时发出；普通断线 emit `reconnecting`，`main.tsx` 不再回大厅。
- 真正关闭标签页时 `pagehide` 主动 `leave()`（bfcache 跳过），避免服务端宽限期把已退出的玩家在房主名单里挂 3 分钟。
- 房主恢复后会按“双 DC 都 open 才保留”的规则重建 P2P offer；客机收到新 offer 时先 drop 旧 link 再 answer，避免永久走中继。

### 验证
- `tests/signal-resume.test.ts`：11 用例（宽限内 resume、坏 token、超宽限、房主离线、旧 socket 接管、heartbeat 宽容、binds 迁移）。
- Playwright：对局中杀掉客机信令 WS，4 s 内不出现“房间已关闭”、`phase` 保持 `live`、`disposed=false`、`faults=0`；恢复后 `peer-offline→peer-online`，无 `peer-left`。
- 服务端需重启才生效；生产需重建 `dist-signal/server.cjs`。

### 1.1 模拟冻结时比赛时间也暂停

- 根因：比赛倒计时 `matchDeadline` 用的是 `performance.now()` 墙钟。后台标签被冻结后主循环停止，回来时墙钟已经过去几分钟，`updateCapture` 直接判定比赛结束。
- 修复：每帧在仿真前计算“这一帧不会被模拟的墙钟时间” `unsimulatedGapMs(elapsed, step, 30)`，把它补到 `matchDeadline` 上；只有真正被模拟的 ≤0.5 s 追赶预算才算入比赛时间。
- 准备阶段本来就用 `simulationNow` 计算，冻结时会自然暂停；死亡复活、无敌保护、载具/AI 也都基于仿真时钟，不受墙钟影响。
- 仅 host/单人需要；客机的时间来自 host 快照，客机切后台不会暂停整局（其他人仍在打），回来后恢复到 host 当前剩余时间。
- 验证：`tests/simulation.test.ts` 新增暂停时钟用例；浏览器把时钟回拨 60 s 后调用一帧，`winner` 仍为空、剩余时间约 300 s（修复前会直接扣掉约 59.5 s）。

## 2. 自定义单局时长（1–60 分钟）

- 默认值：船坞/断桥/花园/机场 10 分钟，法老坟墓 20 分钟；切地图时若没自定义，会自动切到新地图默认。
- 房主可在房间设置里像改人数一样用 ± 调整单局时长，单位分钟，范围 1–60（含）；客机实时看到同一个值。
- 自定义过一次后切地图会保留该值，不会被地图默认覆盖；想回默认可切到与当前地图默认相同的分钟数，或重新建房。
- 开赛消息、`MatchMeta`、客机 `start` 校验、URL `time=`（单人/调试）都走同一套 `clampMatchSeconds`，始终吸附到整分钟并夹在 60–3600 秒。
- 改动：[match-time.ts](src/game/core/match-time.ts)、[main.tsx](src/game/main.tsx)、[lobby.tsx](src/game/ui/lobby.tsx)；引擎构造函数不再用 arena 默认覆盖房间传入时长。
- 验证：`tests/match-time.test.ts` 5 用例；双浏览器 E2E：船坞默认 10 → 法老 20 → 回船坞 10 → 点上调至 12 → 切法老/回船坞仍 12 → 开赛后 host/guest 的 `matchDurationSeconds` 都是 720s。

## 3. Ctrl/Cmd+W 误关标签页

- 结论：**默认键位完全保持原样**（静步/下潜仍是 Ctrl，蹲仍是 C），不抢 Ctrl/Cmd+W 的键盘事件。
- 只增加：游戏页注册 `beforeunload`，关闭/刷新标签页时弹出浏览器的“离开此网站？”确认。
- 浏览器限制：Chrome/Chromium 把 Ctrl/Cmd+W 当浏览器保留快捷键，页面事件无法可靠阻止真实关闭；退出确认是唯一可靠兜底。`audit=1` 时跳过确认，避免打断 Playwright。

## 4. 僚机个人播报错误 / 命中标记缺失

### 根因
- 主机把所有 `events`（含主机自己的“击杀 X / X 击杀了你”）塞进 `snap`，客机整体覆盖本地 `events`，于是客机底部看到的是**房主的个人播报**。
- 客机自己的击杀/死亡从未在主机侧生成个人事件；命中标记依赖 `hitAck`，而客机子弹常被主机拒收（见 §6）。

### 修复
- `events` 改为结构化 `{actorId,targetId,attackerName,targetName,targetLabel,...}`；`src/game/ui/event-feed.ts` 的 `localFeedLines()` 按本机 peerId 投影：
  - actor=我 → “击杀 X” / “摧毁 X”
  - target=我 → “X 击杀了你” / “你已自杀”
  - 其余玩家的击杀不进我的底部播报；右上角全局 `killFeed` 不变。
- 助攻、占点保持原语义。
- 客机命中时先用本地准星射线显示 90 ms 预测命中标记（不打伤害、不播放确认音）；主机 `hitAck` 到达后刷新为权威标记并播放音效。对友军不显示预测标记。

### 验证
- `tests/event-feed.test.ts`：7 用例（主机击杀/死亡不泄漏、客机自己击杀/死亡、助攻/占点/载具、时间窗、条数上限）。
- 双浏览器实测：客机 8 发全部被主机接受（`lastShotSeq=8`），主机血量 100→41→0；客机底部播报为“击杀 PILOT-711”，主机底部为“PILOT-359 击杀了你”；主机击杀客机的事件**没有**出现在客机底部。

### 4.1 击杀事件洪峰不再挤掉自己的播报

- 根因：主机 `events` 只保留 12 条，`snap` 只发前 8 条；12v12 里一波 bot 互杀可以在同一段快照间隔内产生十几条事件，把刚发生的“我击杀 X”挤出列表。助攻是单独直发消息，所以会出现“有少量助攻、没有自己的击杀”。
- 修复：击杀/死亡/毁车事件改为**按玩家定向可靠投递** `personalEvent`，每个客户端维护独立的 16 条个人事件缓冲；`localEvents` 只合并个人缓冲 + 全局占点事件，不再依赖容易被挤掉的全局快照列表。全局快照仍保留，右上角全局击杀栏不变。
- 验证：双浏览器 + AI 补位，客机击杀 bot 后立刻注入 20 条 bot 互杀事件；客机底部仍显示两条“击杀 BOT-…”，不再被洪峰冲掉。主机本地同类事件也走同一缓冲。

## 5. 客机卡顿、回拉/前跳、帧率偏低

### 根因
1. 每个 snapshot 都“复制主机位置 + 重放最多 12 条未确认输入”；主机一卡顿或丢输入，客机就回拉，再重放 12 帧又前跳。
2. 主机输入队列只有 3 条，溢出时**静默丢弃**且不回 ack，客机一直重放主机根本没执行的输入。
3. 客机每帧把整个 200 ms 输入缓冲重发一遍，主机每秒过滤几百条重复命令。
4. 主机 180 ms 收不到输入就清空按键，relay/低帧机稍一抖动就“走走停停”。

### 修复
- 客机保留 `predictedAtSeq` 位置历史；snapshot 到达时用 `ackInput` 对应预测位置与主机位置的**差值**修正当前预测（不再重放整段），差值同时进入 `predictionOffset` 仅作用于相机并指数衰减：
  - 小误差 → 平滑吸收，零可见回拉；
  - 大误差 / 传送 / 复活 → 硬快照并清零偏移。
- 主机输入队列 3→8（≈133 ms 抖动缓冲）；溢出丢弃时**把丢弃区间 ack 给客机**，客机停止重放。
- 客机只发“主机没见过的命令 + 2 条丢包冗余”，不再整段重发。
- 客机输入保持超时 180→500 ms，抵抗 relay/低帧抖动。
- 客机本地碰撞、贴地、台阶、梯子、水体、载具运动全部保留；主机仍权威。

### 验证
- 双浏览器独立进程、`lite=1`、开放区域持续 W 4 s：240 帧全部位移，最大单帧 0.0883 m（= 5.3 m/s ÷ 60），方向反转 0 次。
- 网络回归 `N01-host-death` / `I03-network-rebind` 通过；输入序号间隙恢复用例通过。

## 6. 客机射击“吞子弹”

### 根因（按影响排序）
1. 主机用 `h.yaw/h.pitch`（可能落后 >0.35 rad）校验客机射击，丢包/抖动时直接 `return`。
2. 主机用**仿真时钟** `nextFire` 做射速门；主机掉帧后仿真时钟落后，客机按墙钟射出的子弹被当成“射速过快”拒收；且 `lastShotSeq` 在拒收前就被推进，子弹永久丢失。
3. 客机换弹在本地先结束，主机晚一个 RTT；刚换完弹的第一发被 `h.reloadEnd` 拒绝。
4. 移动中客机用主机旧位置作为弹道起点，近距离横移时准星在目标身上也会打空。

### 修复
- 主机直接使用 `shoot` 消息里的 `yaw/pitch` 开火，不再用滞后的 `h.yaw` 拒绝。
- 射速门改用客机自带的 `clientAt` 时间戳 + 55% 容差（`src/game/combat/shot-admission.ts`），主机 tick 分组/仿真时钟落后都不会吞弹；真正超速的客户端仍会被拒，且拒收不消耗序号。
- 换弹结束前 180 ms 内到达的射击直接补齐换弹后接受。
- `shoot` 携带客机实际瞄准的眼位（预测+视觉修正后的相机位置）；主机在 2.2 m 水平/2 m 垂直包络内且视线可达时采用它作为弹道起点，仍由主机复算命中与伤害。
- `hitAck` 仍是权威命中标记；客机侧增加 90 ms 预测标记。

### 验证
- `tests/shot-admission.test.ts`：6 用例（正常射速、同一 tick 多颗、超速拒绝、序号不被拒收消耗、旧客户端兼容、重复序号）。
- 双浏览器实测：8 发全部接受、命中并击倒主机；`hitAck` 命中音效/标记出现。

## 7. 载具擦墙急停 / 斜面卡死

### 根因
1. `advanceVehiclePose` 完整位移被拒后只尝试旧朝向直行/半程，失败直接 `speed=0`，等效摩擦系数 +∞。
2. 1 m 体素阶梯可能让 9 点支撑采样排成“完美平面”的假陡坡（例：真实 28° 读成 38.9°，residual=0），量化容差失效；0.001 m 前移又翻转角点采样，形成“微移被拒→速度归零”的死锁。

### 修复（`src/game/vehicles/motion.ts`）
- 新增接触分类：`ignoreSlope` 只用于判断“是墙还是坡”，最终候选一律走完整坡度/台阶/水面/足迹校验。
- 掠墙：左右 boolean 探针判接触侧，6°–58° heading 扇区取最小可行偏角 `θ`，`normalRatio=sinθ`；保留切向位移，速度按 `normalRatio×(摩擦+动力)` 衰减，每帧最多 28°/s 沿墙转向。正面 >61.6° 仍按旧逻辑停车。
- 量化坡：驱动路径在 9 点 fit 超限时用 4×4 密集支撑面二次判定（同样通过 residual/riser 门槛）；路线/出生探针保持严格 9 点。
- 坡度门导致的卡死：按 ≤0.2 m/帧（≤1.5×travel）爬行/绕行，落点通过 8×8 严格坡度与完整碰撞，速度 ×0.75。
- 滑行/爬行返回 `blocked=false`，引擎不会把擦墙误判成撞车扣血；正面真停仍 `blocked=true`、`speed=0`。

### 验证
- 新 `tests/vehicle-contact-slide.test.ts` 10 用例：
  - 10/12/15° 掠墙 1 s：零速帧 0，沿墙 8.9–9.3 m，末速 8.97–9.45（>60%），yaw 收敛 ~3°。
  - 12°→30°→45°→90° 速度保留严格递减（9.30/6.85/2.79/0），90° 19 帧停住、z≤2.92 不穿墙。
  - 30° 阶梯 45° 斜行 300 帧：位移 20.7 m，0 blocked（旧代码 173/300 blocked、0.4 m 后停死）。
  - 低速 0.1 m/s 起步 1 s 总位移 1.03 m，单帧最大 0.032 m，无瞬移。
  - 2 m 台阶（直行/斜行）、深水、阶梯 40°/45° 不可穿越。
- 既有 `vehicle-motion/vehicle-slope/vehicle-pilot/vehicle-route/vehicle-spawn-manager` 全过。
- `npm run test:vehicles` 通过（W+A/W+D/S+A/S+D 转向、制动转向、真实炮口）。

## 8. 机瞄/瞄具遮挡与 AI 刷新

### 8.1 Vector 等机瞄进入镜内视野过深

- 根因：Vector 模型自带的后照门两根立柱高约 6–7 cm，而红点/全息/4x 的瞄准眼位只比导轨高 5–7 cm；开镜后两根立柱正好穿过镜片中心。M16/AKM/UMP 等对照截图没有这个问题。
- 修复：把 Vector 后照门降到 3.4 cm、前准星降到 4 cm，并把相关网格标记 `ironSight`；新测试 `tests/weapon-sight-clearance.test.ts` 断言所有瞄具（机械/红点/全息/2x–8x）的视线都高于机瞄顶部至少 2 cm。开镜后机瞄只在下缘露出一点，不再挡中心。
- 全武器 12 把 + 红点/4x 的 ADS 截图逐把检查；其余枪械无需改几何。

### 8.2 AI 刷新在围栏外 / 不进场

- 根因：`teamSpawn` 按队伍槽位向基地后方累加行偏移，100v100 时会算到地图边界外；`safeSpot` 只检查碰撞/水面，不检查 `arena.bounds`，于是 bot 被“安全”地放在围栏外，导航无法进场。
- 修复：`safeSpotRadius` 先把候选夹到 `arena.bounds` 内（留 2 m 边距），把越界也计入 blocked，螺旋搜索只往场内找；`deploymentSpot` 的部署候选同样跳过越界点。Bot 黄金角散开、复活点、初始出生都走这条路径。
- 验证：四图 + 法老 8v8 探针 `botsOutside=0`，7 s 后无“未上车且位移<1 m”的 bot；100v100（199 bot）探针 `outside=0`。地图审计新增 `botsOutside` 断言。

## 9. 总体验证

| 项目 | 结果 |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npm test` | 37 files / **327 tests** PASS |
| `npm run build` | PASS（0.20.5，`29e85c07e80b4316`） |
| `npm run build:signal` | PASS |
| `npm run test:audit`（core/maps/network/lifecycle） | PASS |
| `npm run test:vehicles` | PASS |
| 双浏览器 8 发命中 / 播报隔离 | PASS |
| 双浏览器自定义时长 10/20/12 分钟同步 + 开赛 720s | PASS |
| 双浏览器击杀后 20 条 bot 互杀洪峰仍显示个人击杀 | PASS |
| Vector 机瞄在所有瞄具下低于视线 ≥2 cm | PASS |
| 四图+法老 8v8 / 100v100 bot 出生均在边界内 | PASS |
| 4 s 客机移动平滑（240 帧，maxStep 0.0883 m，反转 0） | PASS |
| 信令断线 resume（对局中杀 WS，不回大厅） | PASS |

## 10. 已知限制 / 部署注意

1. **必须重启信令服务**：`server/signal/server.mjs`（或生产 `dist-signal/server.cjs`）协议升到 2；旧服务端不会发 `resumeToken`，客户端仍可玩但没有断线恢复。
2. 两端需要刷新到同一 `BUILD_ID`（联机闸门）；`MAP_REVISION/MATERIAL_REVISION` 未变。
3. Ctrl/Cmd+W 无法被网页 100% 拦截（浏览器保留快捷键）；按需求只保留 beforeunload 退出确认，默认键位未改。
4. 房主标签页被浏览器完全冻结时，主机的 60 Hz 权威模拟会停；比赛/准备倒计时现在会同步暂停，回来后还有完整剩余时间。但冻结期间其他人也收不到权威快照，不能替代“房主保持前台”。
5. 断线宽限默认 180 s；`SIGNAL_RESUME_GRACE_MS` 可调大/调小。宽限内房主会保留掉线玩家（离线标记），到期才移除。
6. 载具量化坡 4×4 密集采样、擦墙探针只在 blocked 帧发生，正常直行零额外开销；J1900 真机未采样。
