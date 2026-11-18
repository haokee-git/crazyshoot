import assert from 'node:assert/strict';
import { chromium, type Page } from 'playwright';
import { browserExecutable } from './browser';

const base = process.env.CRAZYSHOOT_BASE_URL ?? 'http://127.0.0.1:5174';
const browsers = await Promise.all([0, 1].map(() => chromium.launch({ headless: true, executablePath: browserExecutable() })));
const errors: string[] = [];
const [host, guest] = await Promise.all(browsers.map(b => b.newPage({ viewport: { width: 720, height: 480 } })));

async function lock(page: Page) {
  if (await page.evaluate(() => (window as any).__game.input.pointerLocked)) return;
  const resume = page.getByRole('button', { name: '继续游戏' });
  if (await resume.isVisible()) await resume.click();
  else await page.locator('.game-canvas').click({ position: { x: 10, y: 10 } });
  await page.waitForFunction(() => (window as any).__game.input.pointerLocked);
}

try {
  for (const page of [host, guest]) {
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript('window.__name=v=>v');
    await page.goto(`${base}/game.html?map=airfield&size=4&bots=0&quality=low&res=32&prep=60`);
  }
  await host.getByRole('button', { name: /创建房间/ }).click();
  await host.waitForFunction(() => /^\d{4}$/.test(document.querySelector('.lobby-code')?.textContent?.trim() ?? ''));
  await guest.getByRole('textbox', { name: '房间码' }).fill((await host.locator('.lobby-code').innerText()).trim());
  await guest.getByRole('button', { name: '加入', exact: true }).click();
  await host.locator('.lobby-primary.start').click();
  await Promise.all([host, guest].map(p => p.waitForFunction(() => (window as any).__game?.activated, null, { timeout: 120000 })));
  const id = await guest.evaluate(() => (window as any).__game.localNetId as string);
  const lane = await host.evaluate(id => {
    const g = (window as any).__game;
    const h = g.hosted.get(id);
    g.setLoadout({ ...g.selection, weaponId: 'awm' });
    g.forceStart();
    const apply = g.applyCombatHit.bind(g);
    g.sniperHits = [];
    g.applyCombatHit = (hit: any, shooter: string, def: any, ...args: any[]) => {
      if (hit?.kind === 'player') g.sniperHits.push({ zone: hit.zone, shooter, id: hit.id, ammo: def.id });
      apply(hit, shooter, def, ...args);
    };
    const a = g.controller.position.clone(), b = a.clone();
    for (let x = 149.5; x <= 155.5; x++) for (let z = 143.5; z <= 149.5; z++) {
      const y = g.arena.navigationHeight(x, z);
      if (g.arena.navigationHeight(x, z + 10) !== y) continue;
      a.set(x, y, z); b.set(x, y, z + 10);
      if (g.arena.playerBlocked(x, z, .4, y, 1.8) || g.arena.playerBlocked(x, z + 10, .4, y, 1.8)) continue;
      const low = a.clone().set(0, .35, 0), high = a.clone().set(0, 1.4, 0);
      if (g.arena.lineBlocked(a.clone().add(low), b.clone().add(low)) ||
          g.arena.lineBlocked(a.clone().add(high), b.clone().add(high))) continue;
      high.x = -.28;
      if (g.arena.lineBlocked(a.clone().add(high), b.clone().add(high))) continue;
      high.x = .28;
      if (g.arena.lineBlocked(a.clone().add(high), b.clone().add(high))) continue;
      g.controller.teleport(a, Math.PI); h.controller.teleport(b, 0); h.yaw = 0;
      return { x, y, z };
    }
    throw new Error('No clear sniper lane');
  }, id);
  await guest.waitForFunction(lane => (window as any).__game.controller.position.distanceTo(
    (window as any).__game.controller.position.clone().set(lane.x, lane.y, lane.z + 10),
  ) < .1, lane);
  await lock(host);
  await host.waitForFunction(() => !(window as any).__game.viewmodel.blocked, null, { timeout: 4000 });
  await host.mouse.down();
  await host.mouse.up();
  await guest.waitForFunction(() => (window as any).__game.dead, null, { timeout: 4000 }).catch(async error => {
    console.error(await host.evaluate(id => {
      const g = (window as any).__game, h = g.hosted.get(id);
      return { hits: g.sniperHits, ammo: g.ammo, weapon: g.weapon.id, blocked: g.viewmodel.blocked, host: g.controller.position.toArray(),
        guest: h.controller.position.toArray(), hp: h.health, yaw: g.controller.yaw, pitch: g.controller.pitch, lastShot: g.lastLocalShotAt,
        projectiles: g.projectiles.items.map((p: any) => ({ origin: p.origin.toArray(), velocity: p.velocity.toArray(), distance: p.distance })) };
    }, id));
    throw error;
  });
  const awm = await host.evaluate(() => (window as any).__game.sniperHits.at(-1));
  assert.equal(awm.zone, 'torso');
  assert.equal(awm.id, id);

  await guest.waitForFunction(() => !(window as any).__game.dead, null, { timeout: 15000 });
  const crate = await host.evaluate(id => {
    const g = (window as any).__game, h = g.hosted.get(id), crate = g.amrCrates[0];
    g.pickupAmr(crate.id, id);
    if (!crate.model.visible || h.selection.weaponId === 'amr') throw new Error('Out-of-range pickup accepted');
    const p = crate.model.position;
    h.ammo = 19; h.reserve = 89;
    h.controller.teleport(p.clone().setY(p.y - .18), 0);
    return crate.id as string;
  }, id);
  await guest.getByText('E 拾取反器材狙击枪').waitFor();
  await lock(guest);
  await guest.keyboard.press('KeyE');
  await guest.waitForFunction(() => (window as any).__game.weapon.id === 'amr' && (window as any).__game.ammo === 5);
  assert.equal(await host.evaluate(crate => (window as any).__game.amrCrates.find((c: any) => c.id === crate).model.visible, crate), false);
  assert.equal(await guest.evaluate(crate => (window as any).__game.amrCrates.find((c: any) => c.id === crate).model.visible, crate), false);

  await host.evaluate(({ id, lane }) => {
    const g = (window as any).__game, h = g.hosted.get(id);
    h.controller.teleport(h.controller.position.clone().set(lane.x, lane.y, lane.z + 10), 0);
  }, { id, lane });
  await guest.waitForFunction(lane => Math.abs((window as any).__game.controller.position.z - lane.z - 10) < .05, lane);
  await guest.evaluate(() => {
    const g = (window as any).__game;
    g.controller.yaw = 0;
    g.controller.pitch = -.085;
  });
  await host.waitForFunction(id => {
    const g = (window as any).__game, h = g.hosted.get(id);
    return Math.abs(h.pitch + .085) < .01 && g.simulationNow >= h.nextFire;
  }, id);
  await guest.mouse.down();
  await guest.mouse.up();
  await host.waitForFunction(() => (window as any).__game.dead);
  const amr = await host.evaluate(() => (window as any).__game.sniperHits.at(-1));
  assert.equal(amr.zone, 'limb');
  assert.equal(amr.ammo, 'amr');
  assert.equal(amr.shooter, id);

  await guest.evaluate(() => { (window as any).__game.controller.pitch = .65; });
  for (let remaining = 3; remaining >= 0; remaining--) {
    await host.waitForFunction(id => {
      const g = (window as any).__game, h = g.hosted.get(id);
      return g.simulationNow >= h.nextFire && Math.abs(h.pitch - .65) < .01;
    }, id);
    await guest.mouse.down();
    await guest.mouse.up();
    await guest.waitForFunction(rounds => {
      const g = (window as any).__game;
      return rounds ? g.weapon.id === 'amr' && g.ammo === rounds : g.weapon.id === 'm16' && g.ammo === 19 && g.reserve === 89;
    }, remaining);
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ awm, amr, primaryRestored: true, crateClaimed: true, errors }));
} finally {
  await Promise.all(browsers.map(b => b.close()));
}
