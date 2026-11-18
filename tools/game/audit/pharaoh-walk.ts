/**
 * 法老坟墓 · 浏览器实走审计（QA-01 · 0.20.3 / 800 m 七据点）
 *
 * 跑真正的 `game.html?map=pharaoh`（WebGL + 正式引擎 + 正式 PlayerController），
 * 用键盘真的走门/楼梯/墓道，结果写成 JSON + 截图作为 §7 验收证据。
 *
 * 用法：
 *   npm run dev -- --host 127.0.0.1 --port 5174     # 另开一个终端
 *   npx tsx tools/game/audit/pharaoh-walk.ts        # 默认输出 tmp/pharaoh-walk/
 *   PHARAOH_AUDIT_OUT=docs/map-pharaoh/acceptance-0.20.3/pharaoh-walk npx tsx tools/game/audit/pharaoh-walk.ts
 *
 * 判据分层：
 *  - 常跑：七据点 A–G 数据/HUD、800 m、32 车位与刷新状态、C 街心占点、绿洲下水/上岸、E 场区；
 *  - 结构门控：金字塔/狮身/墓道没接线时，相关实走标记 skipped 并打印原因，不判失败；
 *  - 占点高度：金字塔顶/上层/地下不涨 A，狮头不涨 B，墓室/内殿地面要涨。
 *  - 路线覆盖：A/B 室内、A–B 墓道、D 绿洲下水/上岸、E 驿站场区、F/G 通路。
 *
 * 走法说明：`__audit` 用 addInitScript 注入（Vite HMR 整页刷新后仍然存在）；
 * 每次 walk 都是真实按键（W + 卡住时短按 Space 翻 1 m 台阶），不是瞬移。
 */
import fs from 'node:fs';
import path from 'node:path';
import {browserExecutable} from './browser';
import {PYRAMID_APEX, PYRAMID_CENTER, PYRAMID_OUTER_BASE, PYRAMID_ROOMS, PYRAMID_STAIRS, PYRAMID_TOP} from '../../../src/game/world/pharaoh-pyramid';
import {SPHINX} from '../../../src/game/world/pharaoh-sphinx';
import {TUNNEL_LENGTH, TUNNEL_MOUTHS, tunnelAt, tunnelExitGeom} from '../../../src/game/world/pharaoh-tunnel';
import {OASIS_WATER_EXITS} from '../../../src/maps/pharaoh/oasis';
import {PHARAOH_LAYOUT} from '../../../src/maps/pharaoh/layout';
import {pharaoh} from '../../../src/maps/pharaoh';
import {buildVoxelMapData} from '../../../src/game/world/voxel-map-data';
import {VoxelWorldQueries} from '../../../src/game/world/voxel-world-queries';

// 井口几何依赖真实地形：先在 Node 侧建一次同源世界（12 s），供 tunnelExitGeom 用。
const auditWorld = new VoxelWorldQueries(buildVoxelMapData(pharaoh));
const EXIT_GEOM = tunnelExitGeom((x, z) => auditWorld.height(x, z));
const SITE = PHARAOH_LAYOUT;
const PYR = {x: PYRAMID_CENTER[0], z: PYRAMID_CENTER[1]};
const ROOM = (id: string) => PYRAMID_ROOMS.find((room) => room.id === id)!;
const CHAMBER = ROOM('burial-chamber');
const APPROACH = ROOM('s-approach');
const UPPER_SPINE = ROOM('upper-spine');

process.env.PLAYWRIGHT_BROWSERS_PATH ??= '/private/tmp/crazyshoot-browsers';
const {chromium} = await import('playwright');

const BASE = process.env.CRAZYSHOOT_URL ?? 'http://127.0.0.1:5174';
const OUT = process.env.PHARAOH_AUDIT_OUT ?? 'tmp/pharaoh-walk';
fs.mkdirSync(OUT, {recursive: true});

type Point = [number, number, number];
interface Check {
  name: string;
  ok: boolean;
  skipped?: boolean;
  detail?: unknown;
}
const checks: Check[] = [];
const record = (name: string, ok: boolean, detail?: unknown) => {
  checks.push({name, ok, detail});
  console.log(`${ok ? '✓' : '✗'} ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail).slice(0, 240)}`}`);
  return ok;
};
const skip = (name: string, reason: unknown) => {
  checks.push({name, ok: true, skipped: true, detail: reason});
  console.log(`↷ ${name} skipped — ${JSON.stringify(reason).slice(0, 240)}`);
};

const browser = await chromium.launch({headless: true, executablePath: browserExecutable()});
const context = await browser.newContext({viewport: {width: 1600, height: 900}});
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (error) => errors.push((error as Error).message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

// HMR 整页刷新会清掉页面里的临时对象；用 initScript 注入，刷新后依然可用。
await page.addInitScript(() => {
  (window as any).__audit = {
    place(x: number, z: number, y?: number, yaw = 0, pitch = 0) {
      const game = (window as any).__game;
      const Vec = game.controller.position.constructor;
      const support = game.arena.supportAt?.(x, z, 80) ?? game.arena.heightAt?.(x, z) ?? 0;
      const feet = y === undefined ? support + 0.02 : y;
      game.controller.teleport(new Vec(x, feet, z), yaw);
      game.controller.pitch = pitch;
      game.controller.velocity.set(0, 0, 0);
      game.paused = false;
      game.input.pointerLocked = true;
      return {x, y: feet, z};
    },
    pos() {
      const game = (window as any).__game;
      const p = game.controller.position;
      return {x: p.x, y: p.y, z: p.z, inWater: !!game.controller.inWater, grounded: !!game.controller.grounded};
    },
    ground(x: number, z: number, max = 80) {
      const game = (window as any).__game;
      return game.arena.supportAt?.(x, z, max) ?? game.arena.heightAt?.(x, z) ?? 0;
    },
    capture(id: string) {
      const cap = ((window as any).__game.caps ?? []).find((c: any) => c.id === id);
      return cap ? {id: cap.id, progress: cap.progress, owner: cap.owner, floorY: cap.floorY, r: cap.r, x: cap.x, z: cap.z, tolerance: cap.verticalTolerance} : null;
    },
    primary(x: number, z: number) {
      const game = (window as any).__game;
      return game.arena.vehicleGroundAt?.(x, z) ?? game.arena.heightAt?.(x, z) ?? 0;
    },
    pads() {
      const game = (window as any).__game;
      return (game.vehiclePadStates?.() ?? []).map((p: any) => ({id: p.id, team: p.team, state: p.state, seconds: p.seconds}));
    },
  };
});

await page.goto(`${BASE}/game.html?map=pharaoh&bots=0&prep=999&res=32&audit=1`);
await page.locator('.lobby-solo').waitFor({state: 'visible', timeout: 60_000});
await page.waitForTimeout(700);await page.locator('.lobby-solo').click();
const activated = await page
  .waitForFunction(() => !!(window as any).__game?.activated, null, {timeout: 300_000})
  .then(() => true)
  .catch(() => false);
if (!activated) {
  const stage = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').slice(0, 240));
  console.error('game never activated:', stage, errors.slice(0, 6));
  await page.screenshot({path: path.join(OUT, 'activation-failed.png')});
  await browser.close();
  throw new Error(`pharaoh did not activate (stage: ${stage})`);
}
await page.evaluate(() => {
  const game = (window as any).__game;
  game.forceStart();
  game.paused = false;
  game.input.pointerLocked = true;
});
await page.waitForTimeout(1000);

/* ------------------------------------------------------------------ */
/* 页面内工具                                                          */
/* ------------------------------------------------------------------ */

const place = async (x: number, z: number, options: {y?: number; yaw?: number; pitch?: number} = {}) => {
  await ensureGame();
  return page.evaluate(
    (options: {x: number; z: number; y?: number; yaw?: number; pitch?: number}) =>
      (window as any).__audit.place(options.x, options.z, options.y, options.yaw ?? 0, options.pitch ?? 0),
    {x, z, ...options},
  );
};
const gameAlive = () => page.evaluate(() => !!(window as any).__game?.controller);
/** HMR/重载后 `__game` 会短暂消失：等激活后重新 forceStart；真的崩了就整页重开。 */
const bootGame = async () => {
  await page.waitForFunction(() => !!(window as any).__game?.activated, null, {timeout: 180_000});
  await page.evaluate(() => {
    const game = (window as any).__game;
    game.forceStart();
    game.paused = false;
    game.input.pointerLocked = true;
  });
  await page.waitForTimeout(800);
};
const ensureGame = async () => {
  if (await gameAlive()) return;
  try {
    await page.waitForFunction(() => !!(window as any).__game?.activated, null, {timeout: 30_000});
  } catch {
    console.warn('  (page lost __game — reloading once)');
    await page.reload({waitUntil: 'domcontentloaded'});
    await page.locator('.lobby-solo').waitFor({state: 'visible', timeout: 60_000});
    await page.locator('.lobby-solo').click();
    await bootGame();
    return;
  }
  await bootGame();
};
const position = async (): Promise<{x: number; y: number; z: number; inWater: boolean; grounded: boolean}> => {
  await ensureGame();
  return page.evaluate(() => (window as any).__audit.pos());
};
const support = (x: number, z: number, max = 80): Promise<number> =>
  page.evaluate((args: number[]) => (window as any).__audit.ground(args[0], args[1], args[2]), [x, z, max] as number[]);
const primary = (x: number, z: number): Promise<number> =>
  page.evaluate((args: number[]) => (window as any).__audit.primary(args[0], args[1]), [x, z] as number[]);
const capture = async (id: string): Promise<{progress: number; floorY: number | null}> => {
  await ensureGame();
  return page.evaluate((id: string) => (window as any).__audit.capture(id), id);
};
const shot = async (name: string) => {
  await page.waitForTimeout(200);
  await page.screenshot({path: path.join(OUT, `${name}.png`)});
};

interface Leg {
  x: number;
  z: number;
  ms?: number;
}
interface WalkOutcome {
  reached: boolean;
  end: {x: number; y: number; z: number; inWater: boolean; grounded: boolean};
  stuckAt?: {x: number; y: number; z: number; leg: number};
  samples: number;
}
/**
 * 真实按键走折线：每段把 yaw 对准目标、W 一直按住；0.5 s 内位移 < 5 cm 就短按
 * Space 翻台阶（和玩家操作一致，不是瞬移）。
 */
const walkRoute = async (legs: Leg[], options: {sprint?: boolean; tolerance?: number} = {}): Promise<WalkOutcome> => {
  const tolerance = options.tolerance ?? 2.2;
  await ensureGame();
  await page.keyboard.down('KeyW');
  if (options.sprint) await page.keyboard.down('ShiftLeft');
  let stuckAt: WalkOutcome['stuckAt'];
  let samples = 0;
  for (let index = 0; index < legs.length; index++) {
    const leg = legs[index];
    const deadline = Date.now() + (leg.ms ?? 12_000);
    let last = await position();
    let lastMove = Date.now();
    while (Date.now() < deadline) {
      const now = await position();
      if (Math.hypot(now.x - leg.x, now.z - leg.z) <= tolerance) break;
      const yaw = Math.atan2(-(leg.x - now.x), -(leg.z - now.z));
      await ensureGame();
      await page.evaluate((yaw: number) => {
        const game = (window as any).__game;
        game.controller.yaw = yaw;
        game.paused = false;
        game.input.pointerLocked = true;
      }, yaw);
      await page.waitForTimeout(90);
      samples++;
      const moved = Math.hypot(now.x - last.x, now.z - last.z);
      if (moved < 0.05) {
        if (Date.now() - lastMove > 500) {
          await page.keyboard.down('Space');
          await page.waitForTimeout(110);
          await page.keyboard.up('Space');
          lastMove = Date.now();
        }
      } else lastMove = Date.now();
      last = now;
    }
    const here = await position();
    if (Math.hypot(here.x - leg.x, here.z - leg.z) > tolerance && !stuckAt) stuckAt = {x: here.x, y: here.y, z: here.z, leg: index};
  }
  await page.keyboard.up('KeyW');
  if (options.sprint) await page.keyboard.up('ShiftLeft');
  const final = await position();
  const goal = legs[legs.length - 1];
  return {reached: Math.hypot(final.x - goal.x, final.z - goal.z) <= tolerance + 1.2, end: final, stuckAt, samples};
};

const probeCapture = async (id: string, x: number, z: number, y?: number, ms = 3200) => {
  await place(x, z, {y});
  const before = (await capture(id)).progress;
  await page.waitForTimeout(ms);
  const after = (await capture(id)).progress;
  return {before, after, gained: Number((after - before).toFixed(4))};
};

/* ------------------------------------------------------------------ */
/* 1. 静态数据与 HUD                                                   */
/* ------------------------------------------------------------------ */

const world = await page.evaluate(() => {
  const game = (window as any).__game;
  return {
    size: game.arena.worldSize,
    captures: (game.caps ?? []).map((c: any) => ({id: c.id, x: c.x, z: c.z, r: c.r, floorY: c.floorY ?? null, tolerance: c.verticalTolerance ?? null})),
    vehicles: (game.arena.vehicles ?? []).length,
    pads: (game.arena.vehiclePads ?? []).length,
    padStates: (game.vehiclePadStates?.() ?? []).length,
    scoreRate: game.arena.scoreRate,
    navLayers: game.arena.navigationLayers,
    teamSpawns: game.arena.teamSpawns,
    mapName: document.querySelector('.hud-map')?.textContent ?? null,
  };
});
const capById = (id: string) => world.captures.find((c: any) => c.id === id);
record('seven capture points A–G reach the HUD', world.captures.length === 7 && world.captures.map((c: any) => c.id).join('') === 'ABCDEFG', world.captures.map((c: any) => [c.id, c.x, c.z, c.r, c.floorY]));
record('A/B carry floorY 5/4 and tolerance 3', capById('A')?.floorY === 5 && capById('B')?.floorY === 4 && capById('A')?.tolerance === 3 && capById('B')?.tolerance === 3, world.captures.filter((c: any) => c.floorY !== null));
record('C–G keep the ground rule (no floorY)', ['C', 'D', 'E', 'F', 'G'].every((id) => capById(id)?.floorY === null), world.captures.filter((c: any) => ['C', 'D', 'E', 'F', 'G'].includes(c.id)));
record('32 vehicles + 32 pads + 32 pad states', world.vehicles === 32 && world.pads === 32 && world.padStates === 32, {vehicles: world.vehicles, pads: world.pads, states: world.padStates});
record('map identity: 800 m, scoreRate 0.5, 4 nav layers', world.size === 800 && Math.abs((world.scoreRate ?? 0) - 0.5) < 1e-6 && world.navLayers === 4, {size: world.size, scoreRate: world.scoreRate, navLayers: world.navLayers});

const padAxes = await page.evaluate(() => {
  const game = (window as any).__game;
  const counts: Record<string, number> = {};
  for (const pad of game.arena.vehiclePads ?? []) counts[pad.team] = (counts[pad.team] ?? 0) + 1;
  return counts;
});
record('pad teams are 8 / 8 / 16', padAxes.blue === 8 && padAxes.orange === 8 && padAxes.neutral === 16, padAxes);

/* ------------------------------------------------------------------ */
/* 2. 结构是否接线                                                     */
/* ------------------------------------------------------------------ */

const supportSummit = await support(PYR.x, PYR.z, 80);
const supportSphinxHead = await support(SPHINX.cx, SPHINX.cz, 80);
const structures = supportSummit > 30 && supportSphinxHead >= 3.5;
record('monument structures are present in the live world', structures, {summitSupport: supportSummit, sphinxHallSupport: supportSphinxHead});

/* ------------------------------------------------------------------ */
/* 3. 集市 C（7 街区 / 主街 + 横街）                                    */
/* ------------------------------------------------------------------ */

await place(478, 520, {pitch: -0.05});
await shot('c-bazaar-street');
const cWalk = await walkRoute([
  {x: 478, z: 485, ms: 7_000},
  {x: 476, z: 450, ms: 7_000},
  {x: 475, z: 420, ms: 7_000},
  {x: 475, z: 395, ms: 5_000},
], {sprint: true});
record('C: walk the bazaar main street into the plaza', Math.hypot(cWalk.end.x - SITE.C.x, cWalk.end.z - SITE.C.z) < 4, cWalk.end);
const cBefore = (await capture('C')).progress;
await page.waitForTimeout(2600);
const cAfter = (await capture('C')).progress;
record('C: standing in the plaza captures it (ground rule)', cAfter > cBefore + 0.01, {before: cBefore, after: cAfter});
await shot('c-plaza');

/* ------------------------------------------------------------------ */
/* 4. 绿洲 D：真正下水再上岸（8 个出水点）                              */
/* ------------------------------------------------------------------ */

await place(150, 240, {y: -2.6});
await page.waitForTimeout(300);
await shot('d-oasis-water');
const swim = await walkRoute([
  {x: 168, z: 236, ms: 8_000},
  {x: 185.7, z: 238.1, ms: 8_000},
  {x: 200, z: 262, ms: 8_000},
], {sprint: true});
record('D: swim out of the oasis onto the east beach', !swim.end.inWater && swim.end.y >= -0.4, {end: swim.end, authoredExits: OASIS_WATER_EXITS.length});
await place(190, 270, {pitch: -0.08});
await shot('d-oasis-bank');
const dWalk = await walkRoute([{x: 180, z: 280, ms: 6_000}, {x: SITE.D.x, z: SITE.D.z, ms: 6_000}], {sprint: true});
record('D: walk up to the oasis capture point', Math.hypot(dWalk.end.x - SITE.D.x, dWalk.end.z - SITE.D.z) < 4, dWalk.end);

/* ------------------------------------------------------------------ */
/* 5. 驿站 E / 神庙 F / 采石场 G 地面通路                               */
/* ------------------------------------------------------------------ */

await place(350, 180, {pitch: -0.05});
await shot('e-service');
const eWalk = await walkRoute([
  {x: 350, z: 160, ms: 7_000},
  {x: 350, z: 140, ms: 6_000},
  {x: 350, z: 120, ms: 6_000},
  {x: SITE.E.x, z: SITE.E.z, ms: 6_000},
], {sprint: true});
record('E: walk from the road through the service ring to E', Math.hypot(eWalk.end.x - SITE.E.x, eWalk.end.z - SITE.E.z) < 4, eWalk.end);
await shot('e-forecourt');

await place(SITE.F.x, SITE.F.z + 100, {pitch: -0.05});
await shot('f-temple-approach');
const fWalk = await walkRoute([
  {x: SITE.F.x, z: SITE.F.z + 85, ms: 7_000},
  {x: SITE.F.x, z: SITE.F.z + 45, ms: 8_000},
  {x: SITE.F.x, z: SITE.F.z + 20, ms: 7_000},
  {x: SITE.F.x, z: SITE.F.z, ms: 6_000},
], {sprint: true});
record('F: walk the temple axis north gate → hypostyle → F', Math.hypot(fWalk.end.x - SITE.F.x, fWalk.end.z - SITE.F.z) < 5, {end: fWalk.end, stuckAt: fWalk.stuckAt});

await place(SITE.G.x, SITE.G.z + 100, {pitch: -0.05});
await shot('g-quarry-approach');
const gWalk = await walkRoute([
  {x: SITE.G.x, z: SITE.G.z + 80, ms: 7_000},
  {x: SITE.G.x + 10, z: SITE.G.z + 45, ms: 7_000},
  {x: SITE.G.x, z: SITE.G.z, ms: 7_000},
], {sprint: true});
record('G: walk the quarry forecourt → working floor → G', Math.hypot(gWalk.end.x - SITE.G.x, gWalk.end.z - SITE.G.z) < 5, {end: gWalk.end, stuckAt: gWalk.stuckAt});
await shot('g-quarry');

/* ------------------------------------------------------------------ */
/* 6. 金字塔 A（七据点时代：264 m 外层 + 内核门/墓室）                  */
/* ------------------------------------------------------------------ */

if (structures) {
  const chamber = CHAMBER;
  const doors: {name: string; start: Point; legs: Leg[]}[] = [
    {name: 'south 6×4 main gate', start: [PYR.x, 4.2, 468], legs: [
      {x: PYR.x, z: 495, ms: 12_000}, {x: PYR.x, z: 525, ms: 12_000},
      {x: PYR.x, z: 555, ms: 12_000}, {x: PYR.x, z: 585, ms: 12_000},
      {x: PYR.x, z: chamber.z0 + 4, ms: 12_000},
    ]},
    {name: 'west 4×3.5 entrance', start: [50, 4.2, 607], legs: [
      {x: 80, z: 607, ms: 10_000}, {x: 110, z: 607, ms: 10_000},
      {x: 135, z: 607, ms: 8_000}, {x: 160, z: 607, ms: 10_000},
      {x: 180, z: 607, ms: 8_000}, {x: chamber.x0 + 6, z: 607, ms: 8_000},
    ]},
    {name: 'east 3.5×6 entrance', start: [330, 4.2, 600], legs: [
      {x: 310, z: 600, ms: 10_000}, {x: 285, z: 600, ms: 10_000},
      {x: 260, z: 600, ms: 10_000}, {x: 235, z: 601, ms: 10_000},
      {x: 210, z: 602, ms: 8_000}, {x: chamber.x1 - 6, z: 606, ms: 8_000},
    ]},
  ];
  for (const door of doors) {
    await place(door.start[0], door.start[2], {y: door.start[1], pitch: -0.02});
    const result = await walkRoute(door.legs, {sprint: true});
    const inside = result.end.x >= chamber.x0 && result.end.x <= chamber.x1 && result.end.z >= chamber.z0 && result.end.z <= chamber.z1;
    record(`A: ${door.name} walk-through into the burial chamber`, inside && Math.abs(result.end.y - chamber.floor) < 1.8, {end: result.end, inside, stuckAt: result.stuckAt});
  }
  await place(PYR.x, APPROACH.z0 + 3, {y: CHAMBER.floor + 0.05});
  await shot('a-antechamber');
  await place(PYR.x, CHAMBER.z0 + 13, {y: CHAMBER.floor + 0.05});
  await shot('a-burial-chamber');

  // 外层西面大阶梯：x≈45..185 @ z=614，108 级 ×0.5 m，直上顶层 +58。
  await place(PYRAMID_OUTER_BASE.x0 - 13, 614, {y: 4.2});
  const stair = await walkRoute([
    {x: 80, z: 614, ms: 16_000},
    {x: 110, z: 614, ms: 16_000},
    {x: 140, z: 614, ms: 16_000},
    {x: 170, z: 614, ms: 16_000},
    {x: 185, z: 614, ms: 14_000},
    {x: (PYRAMID_TOP.x0 + PYRAMID_TOP.x1) / 2, z: (PYRAMID_TOP.z0 + PYRAMID_TOP.z1) / 2, ms: 10_000},
  ], {sprint: true});
  record('A: outer west grand stair (108×0.5 m) walks from +4 to the summit', stair.reached && stair.end.y >= PYRAMID_APEX - 3, {end: stair.end, reached: stair.reached, stuckAt: stair.stuckAt});
  await place(PYRAMID_TOP.x0 + 6, PYRAMID_TOP.z0 + 6, {y: PYRAMID_APEX + 1, pitch: -0.18});
  await shot('a-summit');

  // 北面同样走外阶梯壳：从北缘爬到 +20 以上（内层施工栈道已被 264 m 外壳包住，不能当验收路线）。
  await place(PYR.x, PYRAMID_OUTER_BASE.z1 + 12, {y: 4.2});
  const northClimb = await walkRoute([
    {x: PYR.x, z: 720, ms: 14_000},
    {x: PYR.x, z: 700, ms: 14_000},
    {x: PYR.x, z: 680, ms: 14_000},
    {x: PYR.x, z: 670, ms: 10_000},
  ], {sprint: true});
  record('A: outer north stepped shell climbs above +20 toward the north gate level', northClimb.reached && northClimb.end.y >= 18, {end: northClimb.end, reached: northClimb.reached, stuckAt: northClimb.stuckAt});

  // 占点高度：只有 +5 墓室地面涨 A。
  const aFloor = await probeCapture('A', PYR.x, PYR.z, CHAMBER.floor + 0.05);
  record('A: standing on the burial floor captures A', aFloor.gained > 0.05, aFloor);
  const aSummit = await probeCapture('A', PYRAMID_TOP.x0 + 6, PYRAMID_TOP.z0 + 6, PYRAMID_APEX + 1);
  record('A: the summit does NOT capture A', aSummit.gained <= 0.0001, aSummit);
  const aUpper = await probeCapture('A', (UPPER_SPINE.x0 + UPPER_SPINE.x1) / 2, (UPPER_SPINE.z0 + UPPER_SPINE.z1) / 2, 20.05);
  record('A: the upper gallery (+20) does NOT capture A', aUpper.gained <= 0.0001, aUpper);
  const aTunnel = await probeCapture('A', TUNNEL_MOUTHS.a.x0 - 3, (TUNNEL_MOUTHS.a.z0 + TUNNEL_MOUTHS.a.z1) / 2, 5.05);
  record('A: the tunnel mouth does NOT capture A', aTunnel.gained <= 0.0001, aTunnel);

  /* ---------------- 狮身 B（新内殿 40×24 @460,640） ---------------- */
  const hall = SPHINX.hall;
  const entrances: {name: string; start: Point; legs: Leg[]}[] = [
    {name: 'west rear (tunnel side)', start: [SPHINX.entrances[0].x - 10, 4, 640], legs: [
      {x: 388, z: 640, ms: 5_000}, {x: 400, z: 640, ms: 5_000},
      {x: 415, z: 640, ms: 6_000}, {x: 432, z: 640, ms: 6_000},
      {x: 450, z: 640, ms: 6_000},
    ]},
    {name: 'north ramp', start: [SPHINX.entrances[1].x, 4, SPHINX.entrances[1].z - 10], legs: [
      {x: 459, z: 616, ms: 5_000}, {x: 459, z: 623, ms: 5_000},
      {x: 459, z: 630, ms: 5_000}, {x: 459, z: 640, ms: 5_000},
    ]},
    {name: 'south collapse', start: [SPHINX.entrances[2].x, 4, SPHINX.entrances[2].z + 10], legs: [
      {x: 457, z: 662, ms: 5_000}, {x: 457, z: 654, ms: 5_000},
      {x: 457, z: 648, ms: 5_000}, {x: 457, z: 640, ms: 5_000},
    ]},
    {name: 'east between the paws (past the 2 m door)', start: [SPHINX.entrances[3].x + 9, 4, SPHINX.entrances[3].z + 2], legs: [
      {x: 516, z: 642, ms: 5_000}, {x: 508, z: 642, ms: 5_000},
      {x: 500, z: 642, ms: 5_000}, {x: 492, z: 642, ms: 5_000},
      {x: 482, z: 640, ms: 5_000}, {x: 465, z: 640, ms: 5_000},
    ]},
  ];
  for (const entrance of entrances) {
    await place(entrance.start[0], entrance.start[2], {y: entrance.start[1], pitch: -0.02});
    const result = await walkRoute(entrance.legs, {sprint: true});
    const insideHall = result.end.x >= hall.x0 && result.end.x <= hall.x1 && result.end.z >= hall.z0 && result.end.z <= hall.z1;
    const pastEastDoor = !entrance.name.startsWith('east') || result.end.x <= SPHINX.entrances[3].x - 1.5;
    record(`B: ${entrance.name} walk-through into the inner temple`, (insideHall || pastEastDoor) && Math.abs(result.end.y - hall.floor) < 1.8, {end: result.end, insideHall, pastEastDoor, stuckAt: result.stuckAt});
  }
  await place(SPHINX.cx, SPHINX.cz, {y: hall.floor + 0.05});
  await shot('b-inner-temple');
  const bFloor = await probeCapture('B', SPHINX.cx, SPHINX.cz, hall.floor + 0.05);
  record('B: standing on the temple floor captures B', bFloor.gained > 0.05, bFloor);
  const bHead = await probeCapture('B', (SPHINX.headRoom.x0 + SPHINX.headRoom.x1) / 2, (SPHINX.headRoom.z0 + SPHINX.headRoom.z1) / 2, SPHINX.headTop + 1);
  record('B: the sphinx head does NOT capture B', bHead.gained <= 0.0001, bHead);

  /* ---------------- A–B 墓道 ---------------- */
  const tunnelStart = tunnelAt(12);
  const tunnelDeck = await primary(tunnelStart.x, tunnelStart.z);
  await place(tunnelStart.x, tunnelStart.z, {y: tunnelDeck + 0.05});
  const tunnelLegs: Leg[] = [];
  for (let s = 8; s <= TUNNEL_LENGTH - 8; s += 12) {
    const point = tunnelAt(s);
    tunnelLegs.push({x: point.x, z: point.z, ms: 12_000});
  }
  tunnelLegs.push({x: 395, z: 640, ms: 8_000}, {x: 410, z: 640, ms: 6_000}, {x: 430, z: 640, ms: 6_000}, {x: 450, z: 640, ms: 6_000});
  const tunnel = await walkRoute(tunnelLegs, {sprint: true});
  record('A–B tunnel: real walk from the pyramid east door to the sphinx west side', tunnel.end.x > 440 && Math.abs(tunnel.end.y - hall.floor) < 2.2, {end: tunnel.end, reached: tunnel.reached, stuckAt: tunnel.stuckAt});
  const mid = tunnelAt(120);
  const midDeck = await primary(mid.x, mid.z);
  await place(mid.x, mid.z, {y: midDeck + 0.05});
  await shot('tunnel-mid');

  // 井口几何由 builder 现算（800 图新地形），不写死旧坐标。
  for (const [index, exit] of EXIT_GEOM.entries()) {
    const start = {x: exit.entry[0], z: exit.entry[1]};
    const deck = await primary(start.x, start.z);
    await place(start.x, start.z, {y: deck + 0.05});
    const climb: Leg[] = [];
    for (let t = 0; t <= 1.0001; t += 0.2) {
      climb.push({x: exit.entry[0] + (exit.mouth[0] - exit.entry[0]) * t, z: exit.entry[1] + (exit.mouth[1] - exit.entry[1]) * t, ms: 6_000});
    }
    const walk = await walkRoute([{x: start.x, z: start.z, ms: 4_000}, ...climb], {sprint: true});
    record(`A–B tunnel: mid exit ${exit.name} climbs to +${exit.top}`, walk.end.y >= exit.top - 1.6, {mouth: exit.mouth, top: exit.top, end: walk.end, stuckAt: walk.stuckAt});
  }
} else {
  skip('A chamber door walk', 'pyramid not wired');
  skip('A summit stair / north ramp walk', 'pyramid not wired');
  skip('A capture height (summit / upper / tunnel)', 'pyramid not wired');
  skip('B four entrances + capture height', 'sphinx not wired');
  skip('A–B tunnel walk + mid exit', 'tunnel not wired');
}

/* ------------------------------------------------------------------ */
/* 7. 双方出生区视角                                                   */
/* ------------------------------------------------------------------ */

await place(SITE.blue.x, SITE.blue.z, {pitch: -0.05, yaw: -Math.PI * 0.75});
await shot('spawn-blue');
await place(SITE.orange.x, SITE.orange.z, {pitch: -0.05, yaw: Math.PI * 0.25});
await shot('spawn-orange');

/* ------------------------------------------------------------------ */
/* 8. 全图小地图（M）                                                  */
/* ------------------------------------------------------------------ */

await place(SITE.C.x, SITE.C.z, {pitch: -0.6, yaw: Math.PI * 0.7});
await page.waitForTimeout(300);
await page.keyboard.press('KeyM');
await page.waitForTimeout(700);
await shot('overview-map');
await page.keyboard.press('KeyM');

/* ------------------------------------------------------------------ */
/* 9. 载具刷新状态（host）                                             */
/* ------------------------------------------------------------------ */

const padStates: {id: string; team: string; state: string; seconds?: number}[] = await page.evaluate(() => (window as any).__audit.pads());
const padSummary = padStates.reduce<Record<string, number>>((acc: Record<string, number>, pad: {state: string}) => {
  acc[pad.state] = (acc[pad.state] ?? 0) + 1;
  return acc;
}, {});
record('pad states are exposed for the HUD/minimap', padStates.length === 32 && Object.keys(padSummary).length > 0, padSummary);
record('no browser errors during the audit', errors.length === 0, errors.slice(0, 6));

await context.close();
await browser.close();

const failed = checks.filter((check) => !check.ok);
const report = {
  generatedAt: new Date().toISOString(),
  url: `${BASE}/game.html?map=pharaoh`,
  mapName: world.mapName,
  world,
  padAxes,
  padSummary,
  structures,
  support: {summit: supportSummit, sphinxHead: supportSphinxHead},
  checks,
  summary: {
    total: checks.length,
    passed: checks.filter((check) => check.ok && !check.skipped).length,
    skipped: checks.filter((check) => check.skipped).length,
    failed: failed.length,
  },
  errors: errors.slice(0, 20),
};
fs.writeFileSync(path.join(OUT, 'pharaoh-walk.json'), JSON.stringify(report, null, 2));
console.log(`\n${report.summary.passed}/${report.summary.total} passed, ${report.summary.skipped} skipped, ${failed.length} failed`);
console.log(`evidence → ${path.join(OUT, 'pharaoh-walk.json')}`);
if (failed.length) process.exitCode = 1;
