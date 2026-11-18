import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const url = 'http://127.0.0.1:5174/game.html?prep=2&turn=1&sky=noon&res=32&bots=0';
const b = await chromium.launch({ headless: true, executablePath: exe });
const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
const host = await ctx.newPage();
const guest = await ctx.newPage();
const errors: string[] = [];
for (const [name, p] of [['host', host], ['guest', guest]] as const) {
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`${name}: ${m.text()}`); });
}
await host.goto(url); await guest.goto(url);
await host.waitForTimeout(700);
await host.locator('.lobby-primary').first().click();
await host.waitForTimeout(3000);
const code = (await host.locator('.lobby-code').first().textContent())!.trim();
await guest.locator('.lobby-input.code').fill(code);
await guest.locator('.lobby-secondary').click();
await host.waitForFunction(() => {
  const b = document.querySelector('.lobby-primary.start') as HTMLButtonElement | null;
  return !!b && !b.disabled;
}, null, { timeout: 20000 });
await host.locator('.lobby-primary.start').click();
await host.waitForTimeout(1000);
for (const p of [host, guest]) {
  await p.locator('.prep-close').click().catch(() => {});
  await p.waitForFunction(() => (window as any).__game?.phase === 'live', null, { timeout: 12000 });
}
await host.waitForTimeout(400);
const st = async (p: any) => p.evaluate(() => {
  const g = (window as any).__game;
  return { id: g?.localNetId, health: g?.health, dead: g?.dead, scores: g?.scores, feed: g?.killFeed?.map((k: any) => k.text), remotes: g ? [...g.remotes.values()].map((r: any) => ({ id: r.id, health: r.health, dead: r.dead, p: r.target.toArray(), team: r.team })) : [] };
});
console.log('START', JSON.stringify({ host: await st(host), guest: await st(guest) }));
// host shoots guest (host local blue -> guest orange)
const shoot = await host.evaluate(() => {
  const g = (window as any).__game;
  const r = [...g.remotes.values()][0];
  const origin = g.controller.position.clone(); origin.y = 1.2;
  const target = r.target.clone(); target.y = 1.0;
  const dir = target.clone().sub(origin).normalize();
  g.damagePlayers(origin, dir, g.localNetId, 200, performance.now());
  return { guestId: r.id, guestHealth: r.health, guestDead: r.dead };
});
await host.waitForTimeout(400);
console.log('AFTER_HOST_SHOT', JSON.stringify({ shoot, host: await st(host), guest: await st(guest) }));
await host.waitForTimeout(5400);
console.log('AFTER_GUEST_RESPAWN', JSON.stringify({ host: await st(host), guest: await st(guest) }));
// guest shoots host (orange -> blue)
const shootBack = await host.evaluate(() => {
  const g = (window as any).__game;
  const r = [...g.remotes.values()][0];
  const origin = r.target.clone(); origin.y = 1.2;
  const target = g.controller.position.clone(); target.y = 1.0;
  const dir = target.clone().sub(origin).normalize();
  g.damagePlayers(origin, dir, r.id, 200, performance.now());
  return { guestId: r.id, hostHealth: g.health, hostDead: g.dead };
});
await host.waitForTimeout(400);
console.log('AFTER_GUEST_SHOT', JSON.stringify({ shootBack, host: await st(host), guest: await st(guest) }));
// wall occlusion: put the guest behind the left warehouse and shoot through it
const wall = await host.evaluate(() => {
  const g = (window as any).__game;
  const r = [...g.remotes.values()][0];
  const h = g.hosted.get(r.id);
  h.controller.position.set(-20, 0, -20);
  h.health = 100; h.dead = false;
  const origin = g.controller.position.clone(); origin.set(0, 1.2, 24);
  const target = h.controller.position.clone(); target.y = 1.0;
  const dir = target.clone().sub(origin).normalize();
  g.damagePlayers(origin, dir, g.localNetId, 200, performance.now());
  return { guestHealth: h.health, guestDead: h.dead };
});
await host.waitForTimeout(200);
console.log('WALL_OCCLUSION', JSON.stringify(wall));
console.log('ERRORS', JSON.stringify(errors));
await b.close();
