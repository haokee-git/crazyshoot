import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { browserExecutable } from './browser';

const base = process.env.CRAZYSHOOT_BASE_URL ?? 'http://127.0.0.1:5174';
const browser = await chromium.launch({ headless: true, executablePath: browserExecutable() });
const errors: string[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript('window.__name=v=>v');
  await page.goto(`${base}/game.html?map=docks&bots=0&lite=1&prep=999&size=12`);
  await page.waitForTimeout(700);await page.locator('.lobby-solo').click();
  await page.waitForFunction(() => (window as any).__game?.activated, null, { timeout: 60000 });
  const result = await page.evaluate(() => {
    const game = (window as any).__game;
    game.forceStart();
    cancelAnimationFrame(game.raf);
    game.vehicles = [];
    const player = game.controller;
    const enemy = game.myTeam === 'blue' ? 'orange' : 'blue';
    game.addPlayer('aim-test', 'AIM', enemy, true);
    const bot = game.hosted.get('aim-test');
    const spot = (x: number, z: number) => player.position.clone().set(x, game.arena.navigationHeight(x, z), z);
    const run = (moving: boolean) => {
      let hits = 0, shots = 0, first = Infinity, airborne = 0;
      for (const seed of [1106, 2001, 3067, 4093]) {
        for (const projectile of game.projectiles.items) { projectile.active = false; projectile.visibleFor = 0; }
        game.rngState = seed;
        const started = game.simulationNow;
        player.teleport(spot(16, 150), Math.PI);
        bot.controller.teleport(spot(16, 124), Math.PI);
        bot.yaw = Math.PI; bot.pitch = 0;
        bot.targetId = null; bot.nextThink = 0; bot.nextBotFire = 0; bot.nextAimSample = 0;
        bot.ammo = 30; bot.reloadEnd = 0; bot.lastShotAt = -Infinity;
        for (let tick = 0; tick < 540; tick++) {
          game.simulationNow += 1000 / 60;
          const lane = tick % 144 < 72 ? 'KeyA' : 'KeyD';
          player.update(1 / 60, {
            down: (key: string) => moving && (key === lane || key === 'ShiftLeft' || key === 'Space' && tick % 87 < 8),
            consumeLook: () => ({ x: 0, y: 0 }),
          }, game.arena, true);
          if (!player.grounded) airborne++;
          const previousShot = bot.lastShotAt;
          game.updateBotAI(bot, game.simulationNow);
          if (bot.lastShotAt !== previousShot) {
            shots++;
            first = Math.min(first, bot.lastShotAt - started);
          }
          game.health = 100;
          game.updateProjectiles(1 / 60, game.simulationNow);
          if (game.health < 100) hits++;
        }
      }
      return { hits, shots, first, airborne };
    };
    const standing = run(false);
    const sprintJump = run(true);

    game.removePlayer(bot.id);
    const objectives: Record<string, number> = {};
    for (let i = 0; i < 12; i++) {
      const id = 'routing-test-' + i;
      game.addPlayer(id, 'ROUTE', enemy, true);
      const agent = game.hosted.get(id);
      agent.controller.teleport(spot(14 + i % 4, 236 + Math.floor(i / 4) * 2), 0);
      const goal = game.botObjective(agent, 100 + i, game.simulationNow);
      if (goal) objectives[goal.id] = (objectives[goal.id] ?? 0) + 1;
    }
    return { standing, sprintJump, objectives };
  });
  console.log(JSON.stringify({ ...result, errors }, null, 2));
  assert.deepEqual(errors, []);
  assert.ok(result.standing.first >= 500 && result.standing.hits >= 20, 'standing targets should remain vulnerable after a reaction delay');
  assert.ok(result.sprintJump.airborne > 0 && result.sprintJump.hits < result.standing.hits * .55,
    'sprinting and jumping should break tracking and reduce hits');
  assert.equal(Object.keys(result.objectives).length, 3, 'the team should spread across reachable objectives');
  assert.ok(Math.max(...Object.values(result.objectives)) <= 7);
} finally {
  await browser.close();
}
