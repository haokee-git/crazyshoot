import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const hostUrl = 'http://127.0.0.1:5174/game.html?prep=2&turn=1&sky=noon&res=32&quality=low&bots=0';
const guestUrl = `${hostUrl}&lite=1`;
const b = await chromium.launch({ headless: true, executablePath: exe, args: ['--disable-dev-shm-usage'] });
const ctx = await b.newContext({ viewport: { width: 480, height: 320 } });
const host = await ctx.newPage();
const guests: any[] = [];
const errors: string[] = [];
host.on('pageerror', (e) => errors.push(`host: ${e}`));
host.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`host: ${m.text()}`); });
await host.goto(hostUrl);
await host.waitForTimeout(800);
await host.locator('.lobby-primary').first().click();
await host.waitForTimeout(2500);
const code = (await host.locator('.lobby-code').first().textContent())!.trim();
console.log('code', code);
for (let i = 0; i < 15; i++) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(`g${i}: ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`g${i}: ${m.text()}`); });
  await p.goto(guestUrl);
  await p.waitForTimeout(250);
  await p.locator('.lobby-input.code').fill(code);
  await p.locator('.lobby-secondary').click();
  guests.push(p);
  if (i % 4 === 0) console.log('joined', i + 1, 'peers', await host.evaluate(() => (window as any).__peers?.length ?? document.querySelectorAll('.lobby-peer').length));
}
console.log('guest pages', guests.length);
await host.waitForTimeout(4000);
const startInfo = await host.evaluate(() => {
  const b = document.querySelector('.lobby-primary.start') as HTMLButtonElement | null;
  return { disabled: b?.disabled ?? null, peers: document.querySelectorAll('.lobby-peer').length };
});
console.log('startInfo', JSON.stringify(startInfo));
if (startInfo.disabled) { console.log('START_DISABLED'); await b.close(); process.exit(0); }
await host.locator('.lobby-primary.start').click();
await host.waitForTimeout(2500);
for (const p of [host, ...guests]) {
  await p.locator('.prep-close').click({ timeout: 1500 }).catch(() => {});
  await p.waitForFunction(() => (window as any).__game?.phase === 'live', null, { timeout: 15000 }).catch(() => {});
}
await host.waitForTimeout(1200);
const hostState = await host.evaluate(() => { const g = (window as any).__game; return { hosted: g?.hosted?.size, remotes: g?.remotes?.size, phase: g?.phase, teams: g ? [...g.remotes.values()].map((r: any) => r.team) : [] }; });
const guestStates = [];
for (let i = 0; i < guests.length; i++) {
  const s = await guests[i].evaluate(() => { const g = (window as any).__game; return { live: g?.phase === 'live', remotes: g?.remotes?.size, id: g?.localNetId }; }).catch((e: unknown) => ({ error: String(e).slice(0, 80) }));
  guestStates.push(s);
}
const okGuests = guestStates.filter((s: any) => s.live).length;
const badRemotes = guestStates.filter((s: any) => s.live && s.remotes !== 15).length;
console.log('HOST', JSON.stringify(hostState));
console.log('GUESTS_LIVE', okGuests, '/15; BAD_REMOTES', badRemotes);
console.log('ERRORS', JSON.stringify(errors.slice(0, 10)), 'total', errors.length);
await b.close();
