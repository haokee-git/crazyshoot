import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const url = process.env.GAME_URL || 'http://127.0.0.1:5174/game.html?prep=2&turn=1&sky=noon&res=32&bots=0';
const b = await chromium.launch({ headless: true, executablePath: exe });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
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
await host.waitForFunction(() => (window as any).__game === undefined, null, { timeout: 500 }).catch(() => {});
// host lobby start button becomes enabled after P2P
await host.waitForFunction(() => {
  const b = document.querySelector('.lobby-primary.start') as HTMLButtonElement | null;
  return !!b && !b.disabled;
}, null, { timeout: 20000 });
await host.locator('.lobby-primary.start').click();
await host.waitForTimeout(1000);
await host.locator('.prep-close').click().catch(() => {});
await guest.locator('.prep-close').click().catch(() => {});
// wait for live on both, not just fixed sleep
for (const p of [host, guest]) {
  await p.waitForFunction(() => (window as any).__game?.phase === 'live', null, { timeout: 12000 });
}
await host.waitForTimeout(500);

const st = async (p: any) => p.evaluate(() => {
  const g = (window as any).__game;
  return {
    phase: g?.phase,
    pos: g?.controller?.position.toArray(),
    guestPos: g?.guestController?.position.toArray(),
    remote: g?.remote?.rig?.root.position.toArray(),
    score: g?.score,
  };
});
console.log('START', JSON.stringify({ host: await st(host), guest: await st(guest) }));

await host.bringToFront();
await host.keyboard.down('KeyW'); await host.waitForTimeout(700); await host.keyboard.up('KeyW');
await host.waitForTimeout(250);
console.log('HOST_MOVE', JSON.stringify({ host: await st(host), guest: await st(guest) }));

await guest.bringToFront();
await guest.keyboard.down('KeyA'); await guest.waitForTimeout(700); await guest.keyboard.up('KeyA');
await guest.waitForTimeout(350);
console.log('GUEST_MOVE', JSON.stringify({ host: await st(host), guest: await st(guest) }));

await guest.waitForTimeout(1200);
console.log('GUEST_STOP', JSON.stringify({ host: await st(host), guest: await st(guest) }));
console.log('ERRORS', JSON.stringify(errors));
await b.close();
