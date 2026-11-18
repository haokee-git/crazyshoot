# 0.20.4 · 手动部署（移除 5 秒自动复活）

- 版本：**0.20.4**
- BUILD_ID：**`64698747e6ff9b84`**
- MAP_REVISION：`voxel-halfgrid-v11`（本次不改地图/体素）
- MATERIAL_REVISION：`6`
- 未部署线上。

## 行为

- 死亡后仍保留 **至少 5 秒** 的部署锁定（`respawnAt = now + 5000`）。
- 倒计时结束**不会自动复活**：本地玩家、联机客机都必须点击 HUD 的“部署”按钮。
- 客机点击后发送 `respawnNow` 给房主；房主只在 `now >= h.respawnAt` 时执行复活并广播快照。
- 机器人（bot）保持自动部署，避免 AI 永久死亡。
- HUD：按钮从“直接复活”改为“部署”；倒计时期间 disabled；状态栏显示“阵亡 · N 秒后可部署 / 阵亡 · 点击‘部署’复活”。
- 装备页文案改为“关闭后返回部署界面”，关闭装备页本身不会复活。

## 代码

- `src/game/engine.ts`
  - `updateRespawns()`：删除本地/人类客机的自动 `respawnLocal()/respawnHosted()`，只对 `h.bot` 自动部署。
  - `hudState().message`：按剩余时间显示“N 秒后可部署”或“点击‘部署’复活”。
  - `respawnNow()` 原有最短 5 秒 guard 保留。
- `src/game/ui/hud.tsx`：按钮“部署”、倒计时提示、装备页返回部署文案。
- `src/ui/prematch/PrematchOverlay.tsx`：复活模式文案改为返回部署。
- `AGENTS.md` / `docs/PREMATCH.md` / `docs/MAP_REVIEW.md`：同步口径。

## 验收

| 项 | 结果 |
|---|---|
| `npm run build` | ✅ 0.20.4 / `64698747e6ff9b84` |
| `npx vitest run` | ✅ 31 文件 / 285 tests 全绿 |
| 单人手动部署 | ✅ `manual-respawn.json`：1.2s 时仍 dead、按钮 disabled；6s 后仍 dead、按钮 enabled；点击后 dead=false/health=100/保护 5s |
| 双端手动部署 | ✅ `manual-respawn-network.json`：客机 5s 内锁定；6s 后房主仍保持其 dead；客机点击后 host+guest 同时完成部署 |
| 浏览器错误 | 0 |

证据目录：`docs/map-pharaoh/acceptance-0.20.3/manual-respawn/`
- `01-countdown-locked.png` / `02-ready-manual-click.png` / `03-deployed.png`
- `04-guest-countdown-locked.png` / `05-guest-ready-manual-click.png` / `06-guest-deployed.png`
- `manual-respawn.json` / `manual-respawn-network.json`

工具：`tools/game/audit/manual-respawn-check.ts`、`tools/game/audit/manual-respawn-network.ts`。

## 注意

- 地图世界、平面图、38 张场景截图未因本次改动重拍；0.20.4 只改死亡→部署流程与 HUD 文案。
- 机器人在 5s 后自动部署；人类不会。
