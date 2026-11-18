/**
 * Bullet-impact acceptance: dust + bullet-hole decals on walls, the 10 s decal
 * lifetime, and replication to every guest in the room.
 *
 * Prerequisites: signal server + Vite dev server (README "本地运行").
 * Run: npx tsx tools/game/audit/bullet-impact-check.ts
 */
import fs from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { browserExecutable } from './browser';

const base = process.env.CRAZYSHOOT_BASE_URL ?? 'http://127.0.0.1:5174';
const outDir = 'docs/impacts-2026-11-08';
fs.mkdirSync(outDir, { recursive: true });
const errors: string[] = [];
const results: { id: string; pass: boolean; detail: unknown }[] = [];
const check = (id: string, pass: boolean, detail: unknown) => {
  results.push({ id, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id}`, JSON.stringify(detail));
};

const browser: Browser = await chromium.launch({ headless: true, executablePath: browserExecutable() });

async function open(index: number) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript('window.__name = (v) => v');
  page.on('pageerror', error => errors.push(`${index}: ${error.message}`));
  await page.goto(`${base}/game.html?map=garden&prep=999&bots=0&seed=1106`);
  return page;
}

/** Stand a few metres in front of the nearest vertical wall, facing it. */
async function standBeforeWall(page: Page, distance: number) {
  return page.evaluate((distance: number) => {
    const g = (window as any).__game;
    const eye = g.camera.position.clone();
    const dir = eye.clone();
    let best: any = null;
    for (let i = 0; i < 144; i++) {
      const angle = (i / 144) * Math.PI * 2;
      dir.set(Math.sin(angle), 0, -Math.cos(angle));
      const hit = g.arena.raySurface?.(eye, dir, 45);
      if (!hit || Math.abs(hit.normal.y) > 0.35) continue;
      if (!best || hit.distance < best.distance) {
        best = { distance: hit.distance, normal: hit.normal.clone(), point: eye.clone().addScaledVector(dir, hit.distance) };
      }
    }
    if (!best) return null;
    const stand = best.point.clone().addScaledVector(best.normal, distance);
    stand.y = eye.y;
    g.controller.teleport(stand, Math.atan2(best.normal.x, best.normal.z));
    return { distance: best.distance, normal: best.normal.toArray(), stand: stand.toArray() };
  }, distance);
}

/** Fire real projectiles at the wall the camera faces. */
async function fireAtWall(page: Page, rounds = 5, spread = 0.02) {
  return page.evaluate(({ rounds, spread }: { rounds: number; spread: number }) => {
    const g = (window as any).__game;
    const eye = g.camera.position.clone();
    const forward = eye.clone().set(0, 0, -1).applyQuaternion(g.camera.quaternion).normalize();
    const hit = g.arena.raySurface?.(eye, forward, 120);
    if (!hit) return { fired: 0, distance: Infinity, material: 0 };
    const ammo = g.weaponAmmo(g.weapon);
    const right = forward.clone().cross(g.camera.up).normalize();
    for (let i = 0; i < rounds; i++) {
      const dir = forward.clone().addScaledVector(right, (i - (rounds - 1) / 2) * spread).normalize();
      g.launch(g.localNetId, eye.clone().addScaledVector(dir, 0.35), dir, ammo);
    }
    return { fired: rounds, distance: hit.distance, material: hit.material };
  }, { rounds, spread });
}

async function impactState(page: Page) {
  return page.evaluate(() => {
    const g = (window as any).__game;
    const material = g.impacts.decals?.material;
    const map = material?.uniforms?.map?.value;
    return {
      liveDecals: g.impacts.liveDecals,
      liveDust: g.impacts.liveDust,
      decalMesh: !!g.impacts.decals?.parent,
      dustMesh: !!g.impacts.dustMesh?.parent,
      decalTexture: map?.image?.width ?? 0,
      blending: material?.blending,
      instances: g.impacts.decals?.count ?? 0,
      phase: g.phase,
    };
  });
}

try {
  // ---- solo: pipeline, dust, decal and the ten second lifetime -----------------
  const solo = await open(0);
  await solo.locator('.lobby-solo').click();
  await solo.waitForFunction(() => !!(window as any).__game, null, { timeout: 60000 });
  await solo.waitForFunction(() => !document.querySelector('.game-loading'), null, { timeout: 90000 });
  await solo.evaluate(() => { const g = (window as any).__game; g.forceStart(); g.phase = 'live'; });
  await solo.waitForTimeout(5500); // deployment banner must be gone before screenshots
  const wall = await standBeforeWall(solo, 4.5);
  check('I01-wall-found', !!wall, wall);
  await solo.waitForTimeout(600);
  const ready = await impactState(solo);
  check('I02-meshes-ready', ready.decalMesh && ready.dustMesh && ready.instances > 0 && ready.decalTexture === 256, ready);
  await solo.screenshot({ path: `${outDir}/solo-impact-before.png` });

  const shot = await fireAtWall(solo, 5);
  check('I03-projectiles-fired', shot.fired === 5 && shot.distance < 8, shot);
  await solo.waitForTimeout(90);
  const early = await impactState(solo);
  check('I04-decals-spawned', early.liveDecals >= 4, early);
  check('I05-dust-visible', early.liveDust > 0, early);
  await solo.screenshot({ path: `${outDir}/solo-impact-dust.png` });
  await solo.waitForTimeout(900);
  await solo.screenshot({ path: `${outDir}/solo-impact-holes.png` });

  const holdStart = Date.now();
  await solo.waitForFunction(() => (window as any).__game.impacts.liveDecals === 0, null, { timeout: 14000 });
  const holdSeconds = (Date.now() - holdStart) / 1000;
  const expired = await impactState(solo);
  check('I06-decals-gone-after-10s', expired.liveDecals === 0 && holdSeconds > 7.5, { holdSeconds: Number(holdSeconds.toFixed(2)), ...expired });
  await solo.close();

  // ---- LAN: every guest in the room sees the host's impacts --------------------
  const host = await open(1);
  await host.getByRole('button', { name: /创建房间/ }).click();
  await host.waitForFunction(() => /^\d{4}$/.test(document.querySelector('.lobby-code')?.textContent?.trim() ?? ''), null, { timeout: 30000 });
  const code = (await host.locator('.lobby-code').innerText()).trim();
  const guest = await open(2);
  await guest.getByRole('textbox', { name: '房间码' }).fill(code);
  await guest.getByRole('button', { name: '加入', exact: true }).click();
  await guest.locator('.lobby-code').getByText(code, { exact: true }).waitFor({ timeout: 30000 });
  await host.locator('.lobby-primary.start').click();
  await Promise.all([host, guest].map(page => page.waitForFunction(() => (window as any).__game?.activated, null, { timeout: 120000 })));
  await host.evaluate(() => (window as any).__game.forceStart());
  await Promise.all([host, guest].map(page => page.waitForFunction(() => (window as any).__game.phase === 'live', null, { timeout: 30000 })));
  check('I07-room-live', true, { code });

  const guestBefore = await impactState(guest);
  check('I08-guest-clean', guestBefore.liveDecals === 0 && guestBefore.liveDust === 0, guestBefore);
  const guestWall = await standBeforeWall(guest, 4.5);
  const hostWall = await standBeforeWall(host, 4.5);
  await host.waitForTimeout(600);
  const hostShot = await fireAtWall(host, 6);
  check('I09-host-fired', hostShot.fired === 6, { hostShot, hostWall, guestWall });
  const started = Date.now();
  await guest.waitForFunction(() => (window as any).__game.impacts.liveDecals > 0, null, { timeout: 5000 });
  const latency = Date.now() - started;
  const guestAfter = await impactState(guest);
  const hostAfter = await impactState(host);
  check('I10-guest-sees-host-impact', guestAfter.liveDecals >= 4, { guest: guestAfter, host: hostAfter, latencyMs: latency });
  check('I11-host-sees-own-impact', hostAfter.liveDecals >= 4, hostAfter);
  await guest.screenshot({ path: `${outDir}/lan-guest-impact.png` });
  await host.screenshot({ path: `${outDir}/lan-host-impact.png` });

  await Promise.all([host.close(), guest.close()]);
} finally {
  await browser.close();
}

fs.writeFileSync(`${outDir}/bullet-impact.json`, JSON.stringify({ date: new Date().toISOString(), errors, results }, null, 2));
if (results.some(result => !result.pass) || errors.length) {
  console.error('page errors:', errors);
  process.exitCode = 1;
} else {
  console.log('all impact checks passed');
}
