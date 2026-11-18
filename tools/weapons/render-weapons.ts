import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { captureGif } from '../anim/gif';

const exe = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  '/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
].filter(Boolean).find((p) => fs.existsSync(p as string)) as string | undefined;

const base = process.env.WEAPON_PREVIEW_URL || 'http://127.0.0.1:5174/preview/weapons.html';
const weapons = ['m16', 'm4a1', 'akm', 'mp5', 'mk14', 'awm', 'uzi', 'vector', 'ump45', 'm870', 'm249'] as const;
const outDir = 'previews/weapons';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: exe });
const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
for (const id of weapons) {
  await page.goto(`${base}?weapon=${id}&capture=1`, { waitUntil: 'load' });
  await page.waitForFunction('window.__weaponReady === true');
  await page.evaluate(() => (window as any).__weaponSetFrame({ angle: -0.15 }));
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.screenshot({ path: path.join(outDir, `${id}-ui.png`) });
  await page.evaluate(() => document.body.classList.add('capture'));
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.screenshot({ path: path.join(outDir, `${id}-model.png`) });
  console.log('still', id);
}
await browser.close();

const gif = await captureGif({
  out: path.join(outDir, 'm16-turntable.gif'),
  url: `${base}?weapon=m16&capture=1`,
  width: 640,
  height: 640,
  frames: 48,
  fps: 30,
  selector: '#weapon-stage',
  waitForFunction: 'window.__weaponReady === true',
  setFrameExpression: (frame, t) => `window.__weaponSetFrame && window.__weaponSetFrame({frame:${frame}, t:${t}});`,
  background: '#070a0c',
});
console.log('gif', gif.gif, gif.frames);
