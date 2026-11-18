/**
 * 手动部署验收：死亡后至少 5 秒锁定，倒计时结束仍保持死亡，必须点击“部署”才复活。
 * 用法：npx tsx tools/game/audit/manual-respawn-check.ts
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import { browserExecutable } from './browser';

const BASE = process.env.CRAZYSHOOT_URL ?? 'http://127.0.0.1:5174';
const OUT = process.env.RESPAWN_AUDIT_OUT ?? 'docs/map-pharaoh/acceptance-0.20.3/manual-respawn';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: browserExecutable() });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`${BASE}/game.html?map=pharaoh&size=4&prep=999&bots=0&audit=1`);
await page.locator('.lobby-solo').click();
await page.waitForFunction(() => (window as any).__game?.activated === true, null, { timeout: 120000 });
await page.evaluate(() => (window as any).__game.forceStart());
await page.waitForFunction(() => (window as any).__game?.phase === 'live', null, { timeout: 30000 });

// 进入死亡；最短 5 秒等待从 respawnAt 开始，overlay 不打开，模拟玩家停在部署界面。
await page.evaluate(() => {
  const g = (window as any).__game;
  g.dead = true;
  g.health = 0;
  g.overlayOpen = false;
  g.respawnAt = g.simulationNow + 5000;
  g.hudDirty = true;
});
await page.waitForTimeout(1200);
const early = await page.evaluate(() => {
  const g = (window as any).__game;
  const button = document.querySelector('.respawn-go') as HTMLButtonElement | null;
  return { dead: g.dead, seconds: g.hudState(g.simulationNow).respawnSeconds, disabled: button?.disabled ?? null, label: button?.textContent?.trim() ?? null, overlay: !!document.querySelector('.game-respawn') };
});
await page.screenshot({ path: `${OUT}/01-countdown-locked.png` });

await page.waitForTimeout(4600);
const ready = await page.evaluate(() => {
  const g = (window as any).__game;
  const button = document.querySelector('.respawn-go') as HTMLButtonElement | null;
  return { dead: g.dead, seconds: g.hudState(g.simulationNow).respawnSeconds, disabled: button?.disabled ?? null, label: button?.textContent?.trim() ?? null };
});
await page.screenshot({ path: `${OUT}/02-ready-manual-click.png` });

await page.locator('.respawn-go').click();
await page.waitForTimeout(500);
const after = await page.evaluate(() => {
  const g = (window as any).__game;
  return { dead: g.dead, health: g.health, protectedUntil: g.protectedUntil, now: g.simulationNow };
});
await page.screenshot({ path: `${OUT}/03-deployed.png` });

const pass = early.dead === true && early.disabled === true && early.overlay === true
  && ready.dead === true && ready.disabled === false && ready.label === '部署'
  && after.dead === false && after.health === 100 && after.protectedUntil > after.now;
const report = { generatedAt: new Date().toISOString(), pass, early, ready, after, errors, screenshots: fs.readdirSync(OUT).filter((f) => f.endsWith('.png')) };
fs.writeFileSync(`${OUT}/manual-respawn.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (!pass || errors.length) process.exitCode = 1;
