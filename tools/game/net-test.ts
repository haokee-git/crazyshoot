import { chromium } from 'playwright';
import fs from 'node:fs';

const exe = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  '/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
].filter(Boolean).find((p) => fs.existsSync(p as string)) as string | undefined;

const browser = await chromium.launch({ headless: true, executablePath: exe, args: ['--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection', '--no-proxy-server'] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const host = await ctx.newPage();
const guest = await ctx.newPage();
const errors: string[] = [];
for (const [name, page] of [['host', host], ['guest', guest]] as const) {
  page.on('pageerror', (e) => errors.push(`${name}: ${e}`));
  page.on('console', (m) => {
    const text = `${name}: ${m.type()}: ${m.text()}`;
    if (m.type() === 'error') errors.push(text);
    else console.log('CONSOLE', text);
  });
}
const gameUrl = process.env.GAME_URL || 'http://127.0.0.1:5174/game.html?prep=4&turn=1';
await host.goto(gameUrl, { waitUntil: 'load' });
await guest.goto(gameUrl, { waitUntil: 'load' });
await host.waitForTimeout(800);
await host.screenshot({ path: 'previews/ui/net-01-lobby.png' });
await host.locator('.lobby-primary').first().click();
await host.waitForTimeout(7000);
const code = (await host.locator('.lobby-code').first().textContent())?.trim() || '';
console.log('CODE', code);
console.log('HOST_ERR', await host.locator('.lobby-error').textContent().catch(() => ''), 'STATUS', await host.locator('.lobby-statusline').textContent().catch(() => ''));
await guest.locator('.lobby-input.code').fill(code);
await guest.locator('.lobby-secondary').click();
await guest.waitForTimeout(7000);
await host.waitForTimeout(1500);
const hostConnected = await host.locator('.lobby-primary.start').isEnabled().catch(() => false);
const guestWait = await guest.locator('.lobby-waiting').textContent().catch(() => '');
console.log('HOST_CONNECTED', hostConnected, 'GUEST', guestWait);
await host.screenshot({ path: 'previews/ui/net-02-room.png' });
if (hostConnected) {
  await host.locator('.lobby-primary.start').click();
  await host.waitForTimeout(1500);
  await guest.waitForTimeout(200);
  const state = async (p: any) => p.evaluate(() => {
    const g = (window as any).__game;
    return g ? {
      phase: g.phase,
      overlay: g.overlayOpen,
      pos: g.controller?.position?.toArray?.(),
      score: g.score,
      targetsHit: g.arena ? g.arena.targets.filter((t: any) => t.hit).length : 0,
      remote: g.remote ? { pos: g.remote.rig.root.position.toArray(), visible: g.remote.rig.root.visible, seen: g.remote.seen } : null,
    } : null;
  });
  await host.locator('.prep-close').click().catch(() => {});
  await guest.locator('.prep-close').click().catch(() => {});
  await host.waitForTimeout(500);
  console.log('HOST_STATE', JSON.stringify(await state(host)));
  console.log('GUEST_STATE', JSON.stringify(await state(guest)));
  await host.bringToFront();
  await host.keyboard.down('KeyW');
  await host.waitForTimeout(700);
  await host.keyboard.up('KeyW');
  await host.waitForTimeout(400);
  console.log('AFTER_HOST_MOVE', JSON.stringify(await state(host)), JSON.stringify(await state(guest)));
  await guest.bringToFront();
  await guest.keyboard.down('KeyA');
  await guest.waitForTimeout(350);
  console.log('DBG_KEYS', JSON.stringify({
    guestKeys: await guest.evaluate(() => [...((window as any).__game.input.keys)]),
    hostKeys: await host.evaluate(() => [...((window as any).__game.guestInput.keys)]),
    last: await host.evaluate(() => (window as any).__game.guestLastInput),
    guestPos: await host.evaluate(() => (window as any).__game.guestController?.position.toArray()),
  }));
  await guest.waitForTimeout(350);
  await guest.keyboard.up('KeyA');
  await guest.waitForTimeout(400);
  console.log('AFTER_GUEST_MOVE', JSON.stringify(await state(host)), JSON.stringify(await state(guest)));
  await guest.waitForTimeout(4500);
  await guest.bringToFront();
  await guest.mouse.click(640, 400);
  await guest.waitForTimeout(200);
  await guest.mouse.down();
  await guest.waitForTimeout(120);
  await guest.mouse.up();
  await guest.waitForTimeout(600);
  console.log('AFTER_GUEST_FIRE', JSON.stringify(await state(host)), JSON.stringify(await state(guest)));
  await host.screenshot({ path: 'previews/ui/net-03-host-game.png' });
  await guest.screenshot({ path: 'previews/ui/net-04-guest-game.png' });
}
console.log('ERRORS', JSON.stringify(errors, null, 2));
await browser.close();
