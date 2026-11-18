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
// 14 synthetic guests: the 1 real guest + 14 = 15 guests, host + 15 = 16 = 8v8
const res = await host.evaluate(() => {
  const g = (window as any).__game;
  for (let i = 0; i < 14; i++) {
    g.receiveNet({ t: 'input', keys: ['KeyW'], yaw: 0, pitch: 0 }, `fake-${i}`);
  }
  return { hosted: g.hosted.size, remotes: g.remotes.size };
});
await host.waitForTimeout(350);
const out = await host.evaluate(() => {
  const g = (window as any).__game;
  const teams = [...g.remotes.values()].map((r: any) => r.team);
  return {
    local: g.localNetId,
    hosted: g.hosted.size,
    remotes: g.remotes.size,
    teams,
    blue: teams.filter((t: string) => t === 'blue').length + 1,
    orange: teams.filter((t: string) => t === 'orange').length,
    fakePositions: [...g.hosted.entries()].filter(([id]: any) => id.startsWith('fake-')).slice(0, 3).map(([, h]: any) => h.controller.position.toArray()),
  };
});
console.log('INJECT', JSON.stringify(res));
console.log('STATE', JSON.stringify(out, null, 2));
console.log('ERRORS', JSON.stringify(errors));
await host.screenshot({ path: 'previews/ui/host16.png' });
await b.close();
