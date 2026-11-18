/**
 * Pixel texels, lean and prone-stance acceptance.
 * Prerequisites: signal server + Vite dev server.
 * Run: npx tsx tools/game/audit/lean-stance-check.ts
 */
import fs from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import { browserExecutable } from './browser';

const base = process.env.CRAZYSHOOT_BASE_URL ?? 'http://127.0.0.1:5174';
const outDir = 'docs/pixel-lean-2026-11-08';
fs.mkdirSync(outDir, { recursive: true });
const errors: string[] = [];
const results: { id: string; pass: boolean; detail: unknown }[] = [];
const check = (id: string, pass: boolean, detail: unknown) => {
  results.push({ id, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${id}`, JSON.stringify(detail));
};

const browser: Browser = await chromium.launch({ headless: true, executablePath: browserExecutable() });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.addInitScript('window.__name = (v) => v');
page.on('pageerror', error => errors.push(error.message));

const state = () => page.evaluate(() => {
  const g = (window as any).__game;
  const vm = g.viewmodel;
  const euler = new (g.camera.rotation.constructor)().setFromQuaternion(vm.group.quaternion, 'YXZ');
  return {
    lean: g.controller.lean,
    viewmodelLean: vm.leanAmount,
    cameraRoll: g.camera.rotation.z,
    viewmodelRoll: euler.z * 180 / Math.PI,
    prone: g.controller.prone,
    crouched: g.controller.crouched,
    ads: g.ads,
    adsIntent: g.adsIntent,
    adsAmount: vm.adsAmount,
    arbiter: g.proneArbiter,
    ammo: g.ammo,
    position: g.controller.position.toArray(),
    grounded: g.controller.grounded,
  };
});

try {
  await page.goto(`${base}/game.html?map=garden&prep=999&bots=0&seed=1106`);
  await page.waitForTimeout(700);await page.locator('.lobby-solo').click();
  await page.waitForFunction(() => !!(window as any).__game, null, { timeout: 60000 });
  await page.waitForFunction(() => !document.querySelector('.game-loading'), null, { timeout: 90000 });
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.forceStart();
    g.phase = 'live';
    g.paused = false;
    g.input.pointerLocked = true;
    // Record the authoritative impact point, before the decal's wall offset.
    const original = g.registerImpact.bind(g);
    g.registerImpact = (hit: any, ...rest: any[]) => {
      if (hit?.point) g.__lastImpact = hit.point.clone();
      return original(hit, ...rest);
    };
  });
  await page.waitForTimeout(5500);

  // ---- pixel texels -----------------------------------------------------------
  const filters = await page.evaluate(() => {
    const g = (window as any).__game;
    const seen = new Set<number>();
    g.arena.scene.traverse((o: any) => {
      const texture = o.material?.userData?.arrayTexture;
      if (texture) seen.add(texture.magFilter);
    });
    return [...seen];
  });
  // three: NearestFilter = 1003, LinearFilter = 1006
  check('P01-world-materials-nearest', filters.length > 0 && filters.every(filter => filter === 1003), { filters });

  // Stand 4.5m in front of the nearest wall, facing it.
  const wall = await page.evaluate(() => {
    const g = (window as any).__game;
    const eye = g.camera.position.clone();
    const dir = eye.clone();
    let best: any = null;
    for (let i = 0; i < 144; i++) {
      const angle = (i / 144) * Math.PI * 2;
      dir.set(Math.sin(angle), 0, -Math.cos(angle));
      const hit = g.arena.raySurface?.(eye, dir, 45);
      if (!hit || Math.abs(hit.normal.y) > 0.35) continue;
      if (!best || hit.distance < best.distance) best = { distance: hit.distance, normal: hit.normal.clone(), point: eye.clone().addScaledVector(dir, hit.distance) };
    }
    if (!best) return null;
    const stand = best.point.clone().addScaledVector(best.normal, 4.5);
    stand.y = eye.y;
    g.controller.teleport(stand, Math.atan2(best.normal.x, best.normal.z));
    return { point: best.point.toArray(), normal: best.normal.toArray() };
  });
  check('P02-wall-found', !!wall, wall);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${outDir}/pixel-wall.png` });

  // Fire through the crosshair and compare where the bullet actually landed.
  const shotAt = async (label: string) => {
    // Fire synchronously so the captured crosshair ray is the exact one the shot uses.
    const aimPoint = await page.evaluate(() => {
      const g = (window as any).__game;
      const eye = g.camera.position.clone();
      const forward = eye.clone().set(0, 0, -1).applyQuaternion(g.camera.quaternion).normalize();
      const hit = g.arena.raySurface?.(eye, forward, 200);
      g.__aimBefore = hit ? eye.clone().addScaledVector(forward, hit.distance) : eye.clone().addScaledVector(forward, 100);
      g.nextFireAt = 0;
      g.ammo = Math.max(g.ammo, 5);
      g.fire();
      return g.__aimBefore.toArray();
    });
    await page.waitForTimeout(220);
    return page.evaluate((aimPoint: number[]) => {
      const g = (window as any).__game;
      const aim = new (g.camera.position.constructor)(aimPoint[0], aimPoint[1], aimPoint[2]);
      const impact = g.__lastImpact ? g.__lastImpact.clone() : null;
      const ndc = impact ? impact.clone().project(g.camera) : [1, 1];
      return {
        live: g.impacts.liveDecals, impact: impact ? impact.toArray() : null,
        offset: impact ? impact.distanceTo(aim) : Infinity,
        bulletNdc: [ndc[0], ndc[1]],
      };
    }, aimPoint);
  };

  await page.waitForTimeout(300);
  const hip = await shotAt('hip');
  check('L01-hip-shot-on-crosshair', hip.offset < 0.02, hip);

  // Hip lean left: gun and hands tilt ~30°, the camera never rolls.
  await page.keyboard.down('KeyQ');
  await page.waitForTimeout(500);
  const leaning = await state();
  check('L02-hip-lean-20deg', Math.abs(leaning.lean + 1) < 0.05 && Math.abs(Math.abs(leaning.viewmodelRoll) - 20) < 2, leaning);
  check('L03-camera-stays-level', Math.abs(leaning.cameraRoll) < 0.002, { cameraRoll: leaning.cameraRoll });
  await page.screenshot({ path: `${outDir}/lean-hip-left.png` });
  const leanShot = await shotAt('lean hip');
  check('L04-lean-shot-on-crosshair', leanShot.offset < 0.02, leanShot);

  // ADS while leaning: sight stays centred, still 30°.
  await page.evaluate(() => { const g = (window as any).__game; g.input.mouse.right = true; g.input.rightPressed = true; });
  await page.waitForTimeout(500);
  const adsLean = await state();
  const opticCenter = await page.evaluate(() => {
    const g = (window as any).__game;
    const vm = g.viewmodel;
    const local = vm.optic.eye.clone().add(vm.optic.group.position);
    vm.group.updateMatrixWorld(true);
    const world = vm.group.localToWorld(local);
    const axis = vm.localAim(new (g.camera.position.constructor)());
    const forward = new (g.camera.position.constructor)(0, 0, -1);
    const ndc = world.clone().project(vm.camera);
    return { ndc: [ndc.x, ndc.y], world: world.toArray(), axisAngle: axis.angleTo(forward) * 180 / Math.PI, adsAmount: vm.adsAmount };
  });
  check('L05-ads-lean-20deg', Math.abs(adsLean.lean + 1) < 0.05 && Math.abs(Math.abs(adsLean.viewmodelRoll) - 20) < 2 && adsLean.adsAmount > 0.9, adsLean);
  check('L06-ads-sight-centred', Math.abs(opticCenter.ndc[0]) < 0.01 && Math.abs(opticCenter.ndc[1]) < 0.01 && opticCenter.axisAngle < 0.05, opticCenter);
  await page.screenshot({ path: `${outDir}/lean-ads-left.png` });
  const adsShot = await shotAt('ads lean');
  check('L07-ads-shot-on-crosshair', adsShot.offset < 0.02, adsShot);

  // Release everything.
  await page.keyboard.up('KeyQ');
  await page.evaluate(() => { const g = (window as any).__game; g.input.mouse.right = false; g.input.rightPressed = true; });
  await page.waitForTimeout(700);
  const upright = await state();
  check('L08-lean-released', Math.abs(upright.lean) < 0.02, upright);

  // ---- prone: movement vs aim/fire, first come first served --------------------
  await page.keyboard.press('KeyZ');
  await page.waitForTimeout(300);
  const prone = await state();
  check('S01-goes-prone', prone.prone === true, prone);

  // Movement first, then ADS: the ADS must not engage while walking.
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(350);
  const crawling = await state();
  await page.evaluate(() => { const g = (window as any).__game; g.input.mouse.right = true; g.input.rightPressed = true; });
  await page.waitForTimeout(350);
  const blockedAds = await state();
  check('S02-moving-blocks-ads', blockedAds.ads === false && Math.abs(crawling.position[0] - blockedAds.position[0]) + Math.abs(crawling.position[2] - blockedAds.position[2]) > 0.05, { crawling, blockedAds });

  // Stop: the held ADS takes over, and movement is now refused.
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(350);
  const stopAds = await state();
  check('S03-stop-lets-ads-in', stopAds.ads === true, stopAds);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(400);
  const pushed = await state();
  check('S04-ads-blocks-moving', Math.abs(pushed.position[0] - stopAds.position[0]) + Math.abs(pushed.position[2] - stopAds.position[2]) < 0.02, { stopAds, pushed });
  await page.keyboard.up('KeyW');

  // Fire while moving (movement owns the prone state): the trigger does nothing.
  await page.evaluate(() => { const g = (window as any).__game; g.input.mouse.right = false; g.input.rightPressed = true; });
  await page.waitForTimeout(250);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(250);
  const movingBeforeFire = await state();
  await page.evaluate(() => { const g = (window as any).__game; g.input.mouse.left = true; g.input.leftPressed = true; });
  await page.waitForTimeout(350);
  const movingAfterFire = await state();
  await page.evaluate(() => { const g = (window as any).__game; g.input.mouse.left = false; });
  check('S05-moving-blocks-fire', movingAfterFire.ammo === movingBeforeFire.ammo, { movingBeforeFire, movingAfterFire });

  // Stop, then fire: allowed.
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(350);
  const stopped = await state();
  await page.evaluate(() => { const g = (window as any).__game; g.input.mouse.left = true; g.input.leftPressed = true; });
  await page.waitForTimeout(300);
  const fired = await state();
  await page.evaluate(() => { const g = (window as any).__game; g.input.mouse.left = false; });
  check('S06-stationary-fire-allowed', fired.ammo < stopped.ammo, { stopped, fired });

  // Space stands up from prone without jumping.
  const beforeStand = await state();
  await page.keyboard.press('Space');
  await page.waitForTimeout(400);
  const stood = await state();
  check('S07-prone-space-stands-no-jump', stood.prone === false && Math.abs(stood.position[1] - beforeStand.position[1]) < 0.05, { beforeStand, stood });

  // Crouch + space also stands instead of jumping.
  await page.keyboard.press('KeyC');
  await page.waitForTimeout(250);
  const crouched = await state();
  check('S08-crouches', crouched.crouched === true, crouched);
  await page.keyboard.press('Space');
  await page.waitForTimeout(350);
  const uncrouched = await state();
  check('S09-crouch-space-stands-no-jump', uncrouched.crouched === false && Math.abs(uncrouched.position[1] - crouched.position[1]) < 0.05, { crouched, uncrouched });

  // A second jump press (after release) really jumps.
  await page.waitForTimeout(200);
  await page.keyboard.press('Space');
  await page.waitForTimeout(120);
  const jumped = await state();
  check('S10-standing-space-jumps', jumped.position[1] > uncrouched.position[1] + 0.05 || jumped.grounded === false, { uncrouched, jumped });

  await page.screenshot({ path: `${outDir}/stance-final.png` });
  await page.close();
} finally {
  await browser.close();
}

fs.writeFileSync(`${outDir}/lean-stance.json`, JSON.stringify({ date: new Date().toISOString(), errors, results }, null, 2));
if (results.some(result => !result.pass) || errors.length) {
  console.error('page errors:', errors);
  process.exitCode = 1;
} else {
  console.log('all pixel/lean/stance checks passed');
}
