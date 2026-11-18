/** Lean replication: the host must see a guest's character tilt when the guest holds Q/E. */
import fs from 'node:fs';
import { chromium, type Browser } from 'playwright';
import { browserExecutable } from './browser';

const base = process.env.CRAZYSHOOT_BASE_URL ?? 'http://127.0.0.1:5174';
const outDir = 'docs/pixel-lean-2026-11-08';
fs.mkdirSync(outDir, { recursive: true });
const results: { id: string; pass: boolean; detail: unknown }[] = [];
const errors: string[] = [];
const check = (id: string, pass: boolean, detail: unknown) => {
  results.push({ id, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id}`, JSON.stringify(detail));
};

const browser: Browser = await chromium.launch({ headless: true, executablePath: browserExecutable() });
async function open() {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.addInitScript('window.__name = (v) => v');
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}/game.html?map=garden&prep=999&bots=0&size=6&lite=1&seed=1106`);
  return page;
}

try {
  const host = await open();
  await host.getByRole('button', { name: /创建房间/ }).click();
  await host.waitForFunction(() => /^\d{4}$/.test(document.querySelector('.lobby-code')?.textContent?.trim() ?? ''), null, { timeout: 30000 });
  const code = (await host.locator('.lobby-code').innerText()).trim();
  const guest = await open();
  await guest.getByRole('textbox', { name: '房间码' }).fill(code);
  await guest.getByRole('button', { name: '加入', exact: true }).click();
  await guest.locator('.lobby-code').getByText(code, { exact: true }).waitFor({ timeout: 30000 });
  await host.locator('.lobby-primary.start').click();
  await Promise.all([host, guest].map(page => page.waitForFunction(() => (window as any).__game?.activated, null, { timeout: 120000 })));
  await host.evaluate(() => (window as any).__game.forceStart());
  await Promise.all([host, guest].map(page => page.waitForFunction(() => (window as any).__game.phase === 'live', null, { timeout: 30000 })));
  for (const page of [host, guest]) {
    await page.evaluate(() => { const g = (window as any).__game; g.input.pointerLocked = true; g.paused = false; });
  }
  const guestId = await guest.evaluate(() => (window as any).__game.localNetId as string);

  // Put the guest three metres in front of the host, facing the camera.
  await host.evaluate((id: string) => {
    const g = (window as any).__game;
    const eye = g.camera.position.clone();
    const forward = eye.clone().set(0, 0, -1).applyQuaternion(g.camera.quaternion).normalize();
    const spot = eye.clone().addScaledVector(forward, 3.2);
    spot.y = g.arena.navigationHeight?.(spot.x, spot.z) ?? spot.y;
    const h = g.hosted.get(id);
    if (h) h.controller.teleport(spot, g.controller.yaw + Math.PI);
  }, guestId);
  await guest.evaluate(() => { const g = (window as any).__game; g.controller.yaw = 0; });
  await new Promise(resolve => setTimeout(resolve, 900));

  await guest.keyboard.down('KeyQ');
  await new Promise(resolve => setTimeout(resolve, 900));
  const leaned = await host.evaluate((id: string) => {
    const g = (window as any).__game;
    const r = g.remotes.get(id);
    const h = g.hosted.get(id);
    return {
      remoteLean: r?.lean, hostLean: h?.controller.lean,
      torsoRoll: r?.rig.bones.torso.rotation.z,
      pose: r ? { x: r.target.x, y: r.target.y, z: r.target.z } : null,
      visible: r?.rig.root.visible,
    };
  }, guestId);
  check('N01-host-sees-lean-state', Math.abs((leaned.remoteLean ?? 0) + 1) < 0.12, leaned);
  check('N02-character-torso-tilts', Math.abs(leaned.torsoRoll ?? 0) > 0.25, leaned);
  await host.bringToFront();
  await host.evaluate(() => { const g = (window as any).__game; g.paused = false; g.input.pointerLocked = true; });
  await new Promise(resolve => setTimeout(resolve, 500));
  await host.screenshot({ path: `${outDir}/lean-net-host.png` });
  await guest.bringToFront();
  await guest.evaluate(() => { const g = (window as any).__game; g.paused = false; g.input.pointerLocked = true; });
  await new Promise(resolve => setTimeout(resolve, 400));
  await guest.screenshot({ path: `${outDir}/lean-net-guest.png` });

  await guest.keyboard.up('KeyQ');
  await new Promise(resolve => setTimeout(resolve, 900));
  const upright = await host.evaluate((id: string) => {
    const g = (window as any).__game;
    const r = g.remotes.get(id);
    return { remoteLean: r?.lean, torsoRoll: r?.rig.bones.torso.rotation.z };
  }, guestId);
  check('N03-lean-released-on-release', Math.abs(upright.remoteLean ?? 0) < 0.08, upright);

  await Promise.all([host.close(), guest.close()]);
} finally {
  await browser.close();
}

fs.writeFileSync(`${outDir}/lean-net.json`, JSON.stringify({ date: new Date().toISOString(), errors, results }, null, 2));
if (results.some(result => !result.pass) || errors.length) {
  console.error('page errors:', errors);
  process.exitCode = 1;
} else {
  console.log('all lean replication checks passed');
}
