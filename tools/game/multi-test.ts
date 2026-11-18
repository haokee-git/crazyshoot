import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const url = process.env.GAME_URL || 'http://127.0.0.1:5174/game.html?prep=2&turn=1&sky=noon&res=32&bots=0';
const b = await chromium.launch({ headless: true, executablePath: exe });
const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
const host = await ctx.newPage();
const g1 = await ctx.newPage();
const g2 = await ctx.newPage();
const errors: string[] = [];
for (const [name, p] of [['host', host], ['g1', g1], ['g2', g2]] as const) {
  p.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`${name}: ${m.text()}`); });
}
await Promise.all([host.goto(url), g1.goto(url), g2.goto(url)]);
await host.waitForTimeout(600);
await host.locator('.lobby-primary').first().click();
await host.waitForTimeout(3500);
const code = (await host.locator('.lobby-code').first().textContent())!.trim();
console.log('code', code);
for (const p of [g1, g2]) {
  await p.locator('.lobby-input.code').fill(code);
  await p.locator('.lobby-secondary').click();
  await p.waitForTimeout(1500);
}
await host.waitForFunction(() => {
  const b = document.querySelector('.lobby-primary.start') as HTMLButtonElement | null;
  return !!b && !b.disabled;
}, null, { timeout: 20000 });
await host.locator('.lobby-primary.start').click();
await host.waitForTimeout(1000);
for (const [name, p] of [['host', host], ['g1', g1], ['g2', g2]] as const) {
  await p.locator('.prep-close').click().catch(() => {});
  try {
    await p.waitForFunction(() => (window as any).__game?.phase === 'live', null, { timeout: 12000 });
  } catch {
    console.log('STUCK', name, await p.evaluate(() => ({
      game: !!(window as any).__game,
      phase: (window as any).__game?.phase,
      overlay: !!document.querySelector('.lobby'),
      status: document.querySelector('.lobby-statusline')?.textContent,
      body: document.body.innerText.slice(0, 160),
    })));
    throw new Error('stuck');
  }
}
await host.waitForTimeout(500);
const st = async (p: any) => p.evaluate(() => {
  const g = (window as any).__game;
  return {
    id: g?.localNetId,
    pos: g?.controller?.position.toArray(),
    remotes: g ? [...g.remotes.values()].map((r: any) => ({ id: r.id, p: r.rig.root.position.toArray(), target: r.target.toArray(), seen: r.seen })) : [],
    hosted: g ? [...g.hosted.keys()] : [],
  };
});
console.log('START', JSON.stringify({ host: await st(host), g1: await st(g1), g2: await st(g2) }));
await host.bringToFront(); await host.keyboard.down('KeyW'); await host.waitForTimeout(600); await host.keyboard.up('KeyW');
await g1.bringToFront(); await g1.keyboard.down('KeyA'); await g1.waitForTimeout(600); await g1.keyboard.up('KeyA');
await g2.bringToFront(); await g2.keyboard.down('KeyD'); await g2.waitForTimeout(600); await g2.keyboard.up('KeyD');
await host.waitForTimeout(600);
console.log('MOVED', JSON.stringify({ host: await st(host), g1: await st(g1), g2: await st(g2) }));
await host.screenshot({ path: 'previews/ui/multi-host.png' });
await g1.screenshot({ path: 'previews/ui/multi-g1.png' });
await g2.screenshot({ path: 'previews/ui/multi-g2.png' });
console.log('ERRORS', JSON.stringify(errors));
await b.close();
