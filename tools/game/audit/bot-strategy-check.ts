/**
 * Bot strategy acceptance: role loadouts, respawn re-equipping, flank routes,
 * stance/dodge usage and smoke/frag logic.
 * Prerequisites: signal server + Vite dev server.
 * Run: npx tsx tools/game/audit/bot-strategy-check.ts
 */
import fs from 'node:fs';
import { chromium, type Browser } from 'playwright';
import { browserExecutable } from './browser';

const base = process.env.CRAZYSHOOT_BASE_URL ?? 'http://127.0.0.1:5174';
const outDir = 'docs/ai-strategy-2026-11-08';
fs.mkdirSync(outDir, { recursive: true });
const errors: string[] = [];
const results: { id: string; pass: boolean; detail: unknown }[] = [];
const check = (id: string, pass: boolean, detail: unknown) => {
  results.push({ id, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id}`, JSON.stringify(detail));
};

const browser: Browser = await chromium.launch({ headless: true, executablePath: browserExecutable() });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
await page.addInitScript('window.__name = (v) => v');
page.on('pageerror', error => errors.push(error.message));

try {
  await page.goto(`${base}/game.html?map=docks&bots=1&size=12&prep=2&lite=1&seed=1106`);
  await page.waitForTimeout(700);await page.locator('.lobby-solo').click();
  await page.waitForFunction(() => !!(window as any).__game, null, { timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('.game-loading'), null, { timeout: 90000 });
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.forceStart();
    g.paused = false;
    g.input.pointerLocked = true;
    g.__botShots = 0; g.__throws = { frag: 0, smoke: 0 };
    const launch = g.launch.bind(g);
    g.launch = (shooter: string, ...rest: any[]) => {
      const hostileBot = g.hosted.get(shooter);
      if (hostileBot?.bot) g.__botShots++;
      return launch(shooter, ...rest);
    };
    const throwItem = g.throwItem.bind(g);
    g.throwItem = (slot: number, shooter = g.localNetId) => {
      const h = g.hosted.get(shooter);
      const kind = h?.selection?.throwables?.[slot];
      const before = h?.throwables?.[slot] ?? 0;
      throwItem(slot, shooter);
      if (h?.bot && before > (h.throwables?.[slot] ?? 0)) {
        if (kind === 'frag') g.__throws.frag++;
        if (kind === 'smoke') g.__throws.smoke++;
      }
    };
  });
  await page.waitForFunction(() => (window as any).__game.phase === 'live', null, { timeout: 30000 });

  const roster = await page.evaluate(() => {
    const g = (window as any).__game;
    const bots = [...g.hosted.values()].filter((h: any) => h.bot);
    const byTeam: Record<string, any[]> = {};
    for (const h of bots) (byTeam[h.team] ??= []).push({ role: h.botRole, weapon: h.selection.weaponId, optic: h.selection.opticId, flank: h.botFlank ?? 0 });
    return { count: bots.length, byTeam };
  });
  const blueRoles = (roster.byTeam.blue ?? []).map((b: any) => b.role);
  const orangeRoles = (roster.byTeam.orange ?? []).map((b: any) => b.role);
  const blueWeapons = [...new Set((roster.byTeam.blue ?? []).map((b: any) => b.weapon))];
  const orangeWeapons = [...new Set((roster.byTeam.orange ?? []).map((b: any) => b.weapon))];
  check('A01-roster-12v12', roster.count >= 20, { count: roster.count, blue: blueRoles.length, orange: orangeRoles.length });
  check('A02-role-diversity', new Set(blueRoles).size >= 3 && new Set(orangeRoles).size >= 3, { blueRoles, orangeRoles });
  check('A03-long-range-present', blueRoles.includes('sniper') && blueRoles.includes('marksman') && orangeRoles.includes('sniper') && orangeRoles.includes('marksman'), { blueRoles, orangeRoles });
  check('A04-weapon-diversity', blueWeapons.length >= 4 && orangeWeapons.length >= 4, { blueWeapons, orangeWeapons });
  check('A05-flank-roles-assigned', (roster.byTeam.blue ?? []).some((b: any) => b.flank !== 0) || (roster.byTeam.orange ?? []).some((b: any) => b.flank !== 0), {
    blueFlank: (roster.byTeam.blue ?? []).filter((b: any) => b.flank !== 0).length,
    orangeFlank: (roster.byTeam.orange ?? []).filter((b: any) => b.flank !== 0).length,
  });

  // Let the match run; sample stance usage and flank spread every few seconds.
  const samples: any[] = [];
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(2000);
    samples.push(await page.evaluate(() => {
      const g = (window as any).__game;
      const bots = [...g.hosted.values()].filter((h: any) => h.bot && !h.dead);
      const objectiveOf = (h: any) => g.caps.find((c: any) => c.id === h.objective);
      let flankSpread = 0;
      for (const h of bots) {
        const cap = objectiveOf(h);
        if (!cap || !h.botFlank) continue;
        const px = h.controller.position.x, pz = h.controller.position.z;
        const dx = cap.x - px, dz = cap.z - pz, length = Math.hypot(dx, dz) || 1;
        // Lateral distance from the straight line toward the objective (approximate:
        // perpendicular offset of the bot from its team centroid-to-objective line).
        flankSpread = Math.max(flankSpread, Math.abs(dx * 0 - dz * 0));
      }
      const smokeActive = g.tactical?.smokes?.filter((s: any) => s.active).length ?? 0;
      // Lateral distance of each flanker from the straight spawn->objective line.
      let flankLateral = 0;
      for (const h of bots) {
        if (!h.botFlank) continue;
        const cap = objectiveOf(h);
        const spawn = g.arena.teamSpawns?.[h.team] ?? g.arena.spawn;
        if (!cap || !spawn) continue;
        const ax = spawn.x, az = spawn.z, bx = cap.x, bz = cap.z;
        const length = Math.hypot(bx - ax, bz - az) || 1;
        const px = h.controller.position.x, pz = h.controller.position.z;
        const lateral = Math.abs((bx - ax) * (pz - az) - (bz - az) * (px - ax)) / length;
        flankLateral = Math.max(flankLateral, lateral);
      }
      return {
        alive: bots.length,
        snipers: bots.filter((h: any) => h.botRole === 'sniper').length,
        marksmen: bots.filter((h: any) => h.botRole === 'marksman').length,
        crouched: bots.filter((h: any) => h.controller.crouched).length,
        prone: bots.filter((h: any) => h.controller.prone).length,
        smokeActive,
        botShots: g.__botShots,
        throws: { ...g.__throws },
        phase: g.phase,
        flankSpread,
        flankLateral,
      };
    }));
  }
  const peakCrouch = Math.max(...samples.map(s => s.crouched));
  const peakProne = Math.max(...samples.map(s => s.prone));
  const peakSmoke = Math.max(...samples.map(s => s.smokeActive));
  const throws = samples[samples.length - 1].throws;
  check('A06-bots-engage', samples[samples.length - 1].botShots > 20, { shots: samples[samples.length - 1].botShots });
  check('A07-bots-crouch', peakCrouch > 0, { peakCrouch });
  check('A08-bots-prone', peakProne > 0, { peakProne });
  check('A09-bots-throw', throws.frag + throws.smoke > 0, throws);
  check('A10-smoke-visible', peakSmoke > 0, { peakSmoke, throws });
  const peakFlank = Math.max(...samples.map(sample => sample.flankLateral));
  check('A15-flankers-leave-the-direct-line', peakFlank > 8, { peakFlank });

  // Direct mechanics: smoke and frag are thrown, friendly-fire guard holds.
  const mechanics = await page.evaluate(() => {
    const g = (window as any).__game;
    const bot = [...g.hosted.values()].find((h: any) => h.bot && !h.dead && h.team === 'blue');
    if (!bot) return { error: 'no bot' };
    const enemy = [...g.hosted.values()].find((h: any) => h.team !== bot.team && !h.dead);
    if (!enemy) return { error: 'no enemy' };
    // Put the enemy at a realistic throwing distance from the bot.
    const direction = enemy.controller.position.clone().sub(bot.controller.position).setY(0).normalize();
    enemy.controller.position.copy(bot.controller.position).addScaledVector(direction, 20);
    enemy.controller.position.y = g.arena.navigationHeight?.(enemy.controller.position.x, enemy.controller.position.z) ?? enemy.controller.position.y;
    const point = enemy.controller.position.clone();
    bot.lastKnown.copy(point);
    bot.targetId = enemy.id;
    bot.lastSeen = g.simulationNow;
    bot.throwables = [1, 1];
    bot.nextSmoke = 0; bot.nextFrag = 0;
    g.botSmoke(bot, g.simulationNow);
    const smokeGrenades = g.tactical.grenades.filter((p: any) => p.active && p.kind === 'smoke').length;
    bot.nextThrow = 0; bot.nextFrag = 0;
    g.botFrag(bot, g.simulationNow);
    const fragGrenades = g.tactical.grenades.filter((p: any) => p.active && p.kind === 'frag').length;
    // Friendly guard: put a teammate on the target point, the bot must refuse.
    const ally = [...g.hosted.values()].find((h: any) => h !== bot && h.team === bot.team && !h.dead);
    let guarded = 0;
    if (ally) {
      const saved = ally.controller.position.clone();
      ally.controller.position.copy(point);
      bot.throwables = [1, 1]; bot.nextFrag = 0;
      const before = bot.throwables[0];
      g.botFrag(bot, g.simulationNow);
      guarded = bot.throwables[0] === before ? 1 : 0;
      ally.controller.position.copy(saved);
    }
    return { smokeGrenades, fragGrenades, friendlyGuardHeld: guarded === 1, botRole: bot.botRole, weapon: bot.selection.weaponId };
  });
  check('A11-smoke-mechanic', mechanics.smokeGrenades > 0, mechanics);
  check('A12-frag-mechanic', mechanics.fragGrenades > 0, mechanics);
  check('A13-friendly-fire-guard', mechanics.friendlyGuardHeld === true, mechanics);
  const consistent = await page.evaluate(() => {
    const g = (window as any).__game;
    const bots = [...g.hosted.values()].filter((h: any) => h.bot);
    const bad = bots.filter((h: any) => {
      const w = h.selection?.weaponId ?? '';
      const expect = h.botRole === 'sniper' ? 'awm' : h.botRole === 'marksman' ? 'mk14' : h.botRole === 'lmg' ? 'm249' : h.botRole === 'shotgun' ? 'm870' : '';
      return expect ? w !== expect : false;
    }).map((h: any) => ({ id: h.id.slice(-6), role: h.botRole, weapon: h.selection?.weaponId }));
    return { total: bots.length, mismatched: bad };
  });
  check('A14-respawn-loadout-consistent', consistent.mismatched.length === 0, consistent);
} finally {
  await browser.close();
}

fs.writeFileSync(`${outDir}/bot-strategy.json`, JSON.stringify({ date: new Date().toISOString(), errors, results }, null, 2));
if (results.some(result => !result.pass) || errors.length) {
  console.error('page errors:', errors);
  process.exitCode = 1;
} else {
  console.log('all bot strategy checks passed');
}
