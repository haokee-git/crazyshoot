/**
 * 双端手动部署验收：客机死亡后至少 5 秒锁定，倒计时结束仍保持死亡，
 * 必须由客机点击“部署”才由房主复活（host 不再自动复活人类客机）。
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import { browserExecutable } from './browser';

const BASE = process.env.CRAZYSHOOT_URL ?? 'http://127.0.0.1:5174';
const OUT = process.env.RESPAWN_AUDIT_OUT ?? 'docs/map-pharaoh/acceptance-0.20.3/manual-respawn';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: browserExecutable() });
const host = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const guest = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
for (const p of [host, guest]) p.on('pageerror', (e) => errors.push(String(e)));
const url = `${BASE}/game.html?map=docks&size=4&prep=999&bots=0&seed=1106&audit=1`;
await Promise.all([host.goto(url), guest.goto(url)]);
await host.locator('.lobby-primary').first().click();
await host.waitForFunction(() => /^\d{4}$/.test(document.querySelector('.lobby-code')?.textContent?.trim() ?? ''), null, { timeout: 30000 });
const code = (await host.locator('.lobby-code').textContent())!.trim();
await guest.locator('.lobby-input.code').fill(code);
await guest.locator('.lobby-secondary').click();
await host.waitForFunction(() => {
  const el = document.querySelector('.lobby-primary.start') as HTMLButtonElement | null;
  return !!el && !el.disabled;
}, null, { timeout: 30000 });
await host.locator('.lobby-primary.start').click();
await host.waitForFunction(() => (window as any).__game?.localLoaded === true, null, { timeout: 120000 });
await guest.waitForFunction(() => (window as any).__game?.localLoaded === true, null, { timeout: 120000 });
await host.evaluate(() => (window as any).__game.forceStart());
await guest.waitForFunction(() => (window as any).__game?.phase === 'live', null, { timeout: 30000 });

// 房主侧把客机打为死亡，5 s 最短等待；客机本地会从快照收到 respawnSeconds。
await host.evaluate(() => {
  const g = (window as any).__game;
  const h = [...g.hosted.values()][0] as any;
  h.dead = true;
  h.health = 0;
  h.respawnAt = g.simulationNow + 5000;
  h.overlayOpen = false;
  h.input.clear();
  g.hudDirty = true;
});
await guest.waitForFunction(() => (window as any).__game?.dead === true, null, { timeout: 10000 });
await guest.waitForTimeout(1200);
const early = await guest.evaluate(() => {
  const g = (window as any).__game;
  const button = document.querySelector('.respawn-go') as HTMLButtonElement | null;
  return { dead: g.dead, seconds: g.hudState(g.simulationNow).respawnSeconds, disabled: button?.disabled ?? null, label: button?.textContent?.trim() ?? null };
});
await guest.screenshot({ path: `${OUT}/04-guest-countdown-locked.png` });

await guest.waitForTimeout(4600);
const ready = await guest.evaluate(() => {
  const g = (window as any).__game;
  const button = document.querySelector('.respawn-go') as HTMLButtonElement | null;
  return { dead: g.dead, seconds: g.hudState(g.simulationNow).respawnSeconds, disabled: button?.disabled ?? null, label: button?.textContent?.trim() ?? null };
});
const hostStillDead = await host.evaluate(() => {
  const g = (window as any).__game;
  const h = [...g.hosted.values()][0] as any;
  return { dead: h.dead };
});
await guest.screenshot({ path: `${OUT}/05-guest-ready-manual-click.png` });

await guest.locator('.respawn-go').click();
await guest.waitForFunction(() => (window as any).__game?.dead === false, null, {timeout: 8000}).catch(() => {});
await guest.waitForTimeout(500);
const after = await guest.evaluate(() => {
  const g = (window as any).__game;
  return { dead: g.dead, health: g.health };
});
const hostAfter = await host.evaluate(() => {
  const g = (window as any).__game;
  const h = [...g.hosted.values()][0] as any;
  return { dead: h.dead, health: h.health };
});
await guest.screenshot({ path: `${OUT}/06-guest-deployed.png` });

const pass = early.dead && early.disabled === true
  && ready.dead && ready.disabled === false && ready.label === '部署'
  && hostStillDead.dead === true
  && after.dead === false && after.health === 100
  && hostAfter.dead === false && hostAfter.health === 100;
const report = { generatedAt: new Date().toISOString(), pass, early, ready, hostStillDead, after, hostAfter, errors };
fs.writeFileSync(`${OUT}/manual-respawn-network.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
if (!pass || errors.length) process.exitCode = 1;
