// 喷火器性能验收：基线 / 喷火 / 烧脸致盲 三段的帧时间与渲染统计。
// 用法：npx tsx tools/game/audit/flame-perf.ts [outFile]
import { chromium } from 'playwright';
import fs from 'node:fs';
import { browserExecutable } from './browser';

const out = process.argv[2] || 'docs/flame-visual/perf.json';
const browser = await chromium.launch({ headless: true, executablePath: browserExecutable() });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.addInitScript('window.__name = (v) => v');
await page.goto('http://127.0.0.1:5174/game.html?map=garden&bots=1&prep=999&seed=1106');
await page.waitForTimeout(700);await page.locator('.lobby-solo').click();
await page.waitForFunction(() => !!(window as any).__game, null, { timeout: 90000 });
await page.waitForFunction(() => !document.querySelector('.game-loading'), null, { timeout: 90000 });

const result = await page.evaluate(async () => {
  const T: any = await import(/* @vite-ignore */ String('/node_modules/three/build/three.module.js'));
  const W: any = await import(/* @vite-ignore */ String('/src/content/weapons/special.ts'));
  const g: any = (window as any).__game;
  (window as any).__T = T;
  g.forceStart();
  g.overlayOpen = false; g.paused = false; g.dead = false; g.winner = null;
  g.input.pointerLocked = true; g.bannerUntil = 0; g.protectedUntil = 0;
  g.armed = true; g.equipWeapon(W.FLAME_WEAPON); g.ammo = 100;
  const all = [...g.hosted.values()];
  const enemy = all.find((h: any) => h.bot && h.team !== g.myTeam);
  for (const h of all) { h.nextThink = Infinity; h.input.clear(); if (h !== enemy) { h.dead = true; h.respawnAt = Infinity; } }
  enemy.dead = false; enemy.health = 100;

  g.controller.teleport(new T.Vector3(288, 3, 150), Math.PI / 2);
  g.controller.pitch = -.03;
  enemy.controller.teleport(new T.Vector3(282, 3, 150), -Math.PI / 2);
  enemy.yaw = -Math.PI / 2; enemy.targetId = g.localNetId;
  await new Promise((r) => setTimeout(r, 900));

  /** 采样 ms 毫秒的帧间隔（只统计游戏渲染帧）。 */
  const sample = (ms: number) => new Promise<any>((resolve) => {
    const gaps: number[] = [];
    let last = performance.now();
    const start = last;
    function frame() {
      const now = performance.now();
      gaps.push(now - last); last = now;
      if (now - start < ms) requestAnimationFrame(frame);
      else {
        const sorted = gaps.slice(1).sort((a, b) => a - b);
        const avg = sorted.reduce((a, b) => a + b, 0) / Math.max(1, sorted.length);
        resolve({
          frames: sorted.length,
          avgMs: +avg.toFixed(2),
          p50: +sorted[Math.floor(sorted.length * .5)].toFixed(2),
          p95: +sorted[Math.floor(sorted.length * .95)].toFixed(2),
          max: +sorted[sorted.length - 1].toFixed(2),
        });
      }
    }
    requestAnimationFrame(frame);
  });
  const stats = () => ({ calls: g.renderer.info.render.calls, triangles: g.renderer.info.render.triangles, geometries: g.renderer.info.memory.geometries, textures: g.renderer.info.memory.textures });
  const spray = (on: boolean) => {
    (window as any).__spray = on;
    if (!on) return;
    if (!(window as any).__sprayLoop) {
      (window as any).__sprayLoop = true;
      const tick = () => {
        if ((window as any).__spray) {
          const origin = new T.Vector3(); g.viewmodel.getMuzzleWorld(origin);
          g.flameJet.emit(origin, g.aimDirection(true), 1 / 60);
          g.ammo = 100;
          g.fire();
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
  };

  // 基线：不喷火。
  const base = await sample(2500);
  const baseStats = stats();

  // 喷火中。
  spray(true);
  await new Promise((r) => setTimeout(r, 400));
  const spraying = await sample(2500);
  const sprayStats = stats();
  spray(false);

  // 烧脸致盲（HUD 火幕 + 镜头抖动）：用仿真时钟，并每帧续期保持满强度。
  const origin = new T.Vector3(282.55, 4.42, 150);
  const dir = new T.Vector3(1, .03, 0).normalize();
  (window as any).__blind = true;
  const blindTick = () => {
    if ((window as any).__blind) { g.burnBlindUntil = g.simulationNow + 1500; g.health = 100; }
    requestAnimationFrame(blindTick);
  };
  requestAnimationFrame(blindTick);
  g.health = 100;
  g.flameDamage(enemy.id, origin, dir);
  await new Promise((r) => setTimeout(r, 400));
  const intensity = g.hudState(g.simulationNow).burnBlind;
  const blinded = await sample(2500);
  const blindStats = stats();
  (window as any).__blind = false;
  g.burnBlindUntil = 0;
  return { base, baseStats, spraying, sprayStats, blinded, blindStats, intensity };
});

fs.mkdirSync('docs/flame-visual', { recursive: true });
fs.writeFileSync(out, JSON.stringify({ ...result, errors }, null, 2));
console.log(JSON.stringify({ ...result, errors }, null, 2));
await browser.close();
if (errors.length) process.exitCode = 1;
