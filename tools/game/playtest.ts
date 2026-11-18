import { chromium } from 'playwright';
import fs from 'node:fs';

const exe = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  '/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean).find((p) => fs.existsSync(p as string)) as string | undefined;

const browser = await chromium.launch({ headless: true, executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const gameUrl = process.env.GAME_URL || 'http://127.0.0.1:5174/game.html?prep=4';
await page.goto(gameUrl, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const prefix = process.env.SHOT_PREFIX || 'game';
await page.screenshot({ path: `previews/ui/${prefix}-01-prep.png` });

await page.locator('.prep-close').first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `previews/ui/${prefix}-02-unarmed.png` });

const before = await page.evaluate(() => {
  const g = (window as any).__game;
  return { phase: g.phase, overlay: g.overlayOpen, armed: g.armed, ammo: g.ammo, pos: g.controller.position.toArray() };
});

await page.waitForTimeout(3800);
const live = await page.evaluate(() => {
  const g = (window as any).__game;
  return { phase: g.phase, overlay: g.overlayOpen, armed: g.armed, ammo: g.ammo, pos: g.controller.position.toArray() };
});
await page.screenshot({ path: `previews/ui/${prefix}-03-live.png` });

// move forward briefly (no pointer lock needed for keys)
await page.keyboard.down('KeyW');
await page.waitForTimeout(500);
await page.keyboard.up('KeyW');
const moved = await page.evaluate(() => (window as any).__game.controller.position.toArray());

// click canvas center for pointer lock, then fire at the center target
await page.mouse.click(800, 450);
await page.waitForTimeout(200);
await page.mouse.down();
await page.waitForTimeout(200);
await page.mouse.up();
await page.waitForTimeout(300);
const after = await page.evaluate(() => {
  const g = (window as any).__game;
  return { phase: g.phase, ammo: g.ammo, score: g.score, armed: g.armed, overlay: g.overlayOpen };
});
await page.screenshot({ path: `previews/ui/${prefix}-04-fire.png` });

console.log(JSON.stringify({ before, live, moved, after, errors }, null, 2));
await browser.close();
