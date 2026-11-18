import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const base = process.env.GAME_URL || 'https://crazyshoot.haokee.org/game.html?prep=2&turn=1&sky=noon&res=32&quality=low&bots=0';
const browsers = [await chromium.launch({ headless: true, executablePath: exe }), await chromium.launch({ headless: true, executablePath: exe }), await chromium.launch({ headless: true, executablePath: exe })];
const ctxs = [
  await browsers[0].newContext({ viewport: { width: 480, height: 320 } }),
  await browsers[1].newContext({ viewport: { width: 320, height: 240 } }),
  await browsers[2].newContext({ viewport: { width: 320, height: 240 } }),
];
const host = await ctxs[0].newPage();
const guests: any[] = [];
const errors: string[] = [];
host.on('pageerror', (e) => errors.push(`host: ${e}`));
host.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`host: ${m.text()}`); });
await host.goto(base, { waitUntil: 'load' });
await host.waitForTimeout(1000);
await host.locator('.lobby-primary').first().click();
await host.waitForTimeout(2500);
const code = (await host.locator('.lobby-code').first().textContent())!.trim();
console.log('code', code);
async function join(ctx: any, i: number) {
  const p = await ctx.newPage();
  p.on('pageerror', (e: any) => errors.push(`g${i}: ${e}`));
  p.on('console', (m: any) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`g${i}: ${m.text()}`); });
  await p.goto(base, { waitUntil: 'load' });
  await p.waitForTimeout(320);
  await p.locator('.lobby-input.code').fill(code);
  await p.locator('.lobby-secondary').click({ force: true });
  guests.push(p);
  if (i % 5 === 0) console.log('joined', i);
}
for (let i = 0; i < 7; i++) await join(ctxs[0], i);
for (let i = 7; i < 15; i++) await join(ctxs[1], i);
for (let i = 15; i < 23; i++) await join(ctxs[2], i);
console.log('guest pages', guests.length);
await host.waitForTimeout(7000);
const startInfo = await host.evaluate(() => {
  const b = document.querySelector('.lobby-primary.start') as HTMLButtonElement | null;
  return { disabled: b?.disabled ?? null };
});
console.log('startInfo', JSON.stringify(startInfo));
if (startInfo.disabled) { console.log('START_DISABLED'); for (const b of browsers) await b.close(); process.exit(0); }
await host.locator('.lobby-primary.start').click({ force: true });
await host.waitForTimeout(3500);
for (const p of [host, ...guests]) {
  await p.locator('.prep-close').click({ timeout: 1500, force: true }).catch(() => {});
  await p.waitForFunction(() => (window as any).__game?.phase === 'live', null, { timeout: 18000 }).catch(() => {});
}
await host.waitForTimeout(2000);
const hostState = await host.evaluate(() => { const g = (window as any).__game; return { hosted: g?.hosted?.size, remotes: g?.remotes?.size, phase: g?.phase }; });
let live = 0; let bad = 0;
for (const p of guests) {
  const s = await p.evaluate(() => { const g = (window as any).__game; return { live: g?.phase === 'live', remotes: g?.remotes?.size }; }).catch(() => ({ live: false, remotes: -1 }));
  if (s.live) live++;
  if (s.live && s.remotes !== 23) bad++;
}
console.log('HOST', JSON.stringify(hostState));
console.log('GUESTS_LIVE', live, '/23; BAD_REMOTES', bad);
async function measure(page: any) {
  return await page.evaluate(`(async () => {
    let frames = 0;
    const start = performance.now();
    await new Promise((resolve) => {
      function tick(t) { frames++; if (t - start < 2000) requestAnimationFrame(tick); else resolve(); }
      requestAnimationFrame(tick);
    });
    const mem = (performance.memory && performance.memory.usedJSHeapSize) || 0;
    return { fps: frames / ((performance.now() - start) / 1000), heapMB: mem / 1048576, remotes: (window.__game && window.__game.remotes && window.__game.remotes.size) || 0 };
  })()`);
}
console.log('PERF_HOST', JSON.stringify(await measure(host)));
console.log('PERF_GUEST', JSON.stringify(await measure(guests[0])));
console.log('ERRORS', JSON.stringify(errors.slice(0, 8)), 'total', errors.length);
for (const b of browsers) await b.close();
