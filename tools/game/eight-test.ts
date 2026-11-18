import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const url = 'http://127.0.0.1:5174/game.html?prep=2&turn=1&sky=noon&res=32&bots=0';
const b = await chromium.launch({ headless: true, executablePath: exe });
const ctx = await b.newContext({ viewport: { width: 900, height: 600 } });
const pages: any[] = [];
const errors: string[] = [];
for (let i = 0; i < 8; i++) {
  const p = await ctx.newPage();
  p.on('pageerror', (e: any) => errors.push(`p${i}: ${e}`));
  p.on('console', (m: any) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`p${i}: ${m.text()}`); });
  await p.goto(url);
  pages.push(p);
}
await pages[0].waitForTimeout(700);
await pages[0].locator('.lobby-primary').first().click();
await pages[0].waitForTimeout(4000);
const code = (await pages[0].locator('.lobby-code').first().textContent())!.trim();
console.log('code', code);
for (let i = 1; i < 8; i++) {
  await pages[i].locator('.lobby-input.code').fill(code);
  await pages[i].locator('.lobby-secondary').click();
  await pages[i].waitForTimeout(900);
}
await pages[0].waitForFunction(() => {
  const b = document.querySelector('.lobby-primary.start') as HTMLButtonElement | null;
  return !!b && !b.disabled;
}, null, { timeout: 30000 });
await pages[0].waitForTimeout(1000);
await pages[0].locator('.lobby-primary.start').click();
await pages[0].waitForTimeout(1200);
for (const p of pages) {
  await p.locator('.prep-close').click().catch(() => {});
  await p.waitForFunction(() => (window as any).__game?.phase === 'live', null, { timeout: 15000 });
}
await pages[0].waitForTimeout(600);
const st = async (p: any) => p.evaluate(() => {
  const g = (window as any).__game;
  return { id: g?.localNetId, hosted: g?.hosted?.size, remotes: g?.remotes?.size, teams: g ? [...g.remotes.values()].map((r: any) => r.team) : [], pos: g?.controller?.position.toArray() };
});
console.log('COUNTS', JSON.stringify(await Promise.all(pages.map(st))));
await pages[0].bringToFront(); await pages[0].keyboard.down('KeyW'); await pages[0].waitForTimeout(500); await pages[0].keyboard.up('KeyW');
await pages[1].bringToFront(); await pages[1].keyboard.down('KeyA'); await pages[1].waitForTimeout(500); await pages[1].keyboard.up('KeyA');
await pages[2].bringToFront(); await pages[2].keyboard.down('KeyD'); await pages[2].waitForTimeout(500); await pages[2].keyboard.up('KeyD');
await pages[0].waitForTimeout(700);
console.log('MOVED', JSON.stringify(await Promise.all(pages.map(st))));
await pages[1].screenshot({ path: 'previews/ui/eight-guest1.png' });
console.log('ERRORS', JSON.stringify(errors.slice(0, 20)));
await b.close();
