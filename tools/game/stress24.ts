import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const base = process.env.GAME_URL || 'https://crazyshoot.haokee.org/game.html?prep=2&turn=1&sky=noon&res=32&quality=low&bots=0';
const hostUrl = base;
const guestUrl = `${base}&lite=1`;
const bA = await chromium.launch({ headless: true, executablePath: exe });
const bB = await chromium.launch({ headless: true, executablePath: exe });
const ctxA = await bA.newContext({ viewport: { width: 420, height: 300 } });
const ctxB = await bB.newContext({ viewport: { width: 480, height: 320 } });
const host = await ctxA.newPage();
const guests: any[] = [];
const errors: string[] = [];
host.on('pageerror', (e) => errors.push(`host: ${e}`));
host.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`host: ${m.text()}`); });
await host.goto(hostUrl, { waitUntil: 'load' });
await host.waitForTimeout(900);
await host.locator('.lobby-primary').first().click();
await host.waitForTimeout(2500);
const code = (await host.locator('.lobby-code').first().textContent())!.trim();
console.log('code', code);
async function join(ctx: any, i: number) {
  const p = await ctx.newPage();
  p.on('pageerror', (e: any) => errors.push(`g${i}: ${e}`));
  p.on('console', (m: any) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`g${i}: ${m.text()}`); });
  await p.goto(guestUrl, { waitUntil: 'load' });
  await p.waitForTimeout(220);
  await p.locator('.lobby-input.code').fill(code);
  await p.locator('.lobby-secondary').click({ force: true });
  guests.push(p);
  if (i % 5 === 0) console.log('joined', i);
}
for (let i = 0; i < 11; i++) await join(ctxA, i);
for (let i = 11; i < 23; i++) await join(ctxB, i);
console.log('guest pages', guests.length);
await host.waitForTimeout(5000);
const startInfo = await host.evaluate(() => {
  const b = document.querySelector('.lobby-primary.start') as HTMLButtonElement | null;
  return { disabled: b?.disabled ?? null };
});
console.log('startInfo', JSON.stringify(startInfo));
if (startInfo.disabled) { console.log('START_DISABLED'); await bA.close(); await bB.close(); process.exit(0); }
await host.locator('.lobby-primary.start').click({ force: true });
await host.waitForTimeout(2500);
for (const p of [host, ...guests]) {
  await p.locator('.prep-close').click({ timeout: 1200, force: true }).catch(() => {});
  await p.waitForFunction(() => (window as any).__game?.phase === 'live', null, { timeout: 15000 }).catch(() => {});
}
await host.waitForTimeout(1500);
const hostState = await host.evaluate(() => { const g = (window as any).__game; return { hosted: g?.hosted?.size, remotes: g?.remotes?.size, phase: g?.phase, teams: g ? [...g.remotes.values()].map((r: any) => r.team) : [] }; });
let live = 0; let bad = 0; let sample: any[] = [];
for (let i = 0; i < guests.length; i++) {
  const s = await guests[i].evaluate(() => { const g = (window as any).__game; return { live: g?.phase === 'live', remotes: g?.remotes?.size, id: g?.localNetId }; }).catch((e: unknown) => ({ error: String(e).slice(0, 80) }));
  if (s.live) live++;
  if (s.live && s.remotes !== 23) bad++;
  if (i < 3 || !s.live) sample.push(s);
}
const teams = hostState.teams as string[];
console.log('HOST', JSON.stringify({ hosted: hostState.hosted, remotes: hostState.remotes, phase: hostState.phase, blue: teams.filter((t) => t === 'blue').length + 1, orange: teams.filter((t) => t === 'orange').length }));
console.log('GUESTS_LIVE', live, '/23; BAD_REMOTES', bad);
console.log('SAMPLE', JSON.stringify(sample));
console.log('ERRORS', JSON.stringify(errors.slice(0, 8)), 'total', errors.length);
await bA.close(); await bB.close();
