import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { captureGif } from '../anim/gif';

const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const base = process.env.VM_PREVIEW_URL || 'http://127.0.0.1:5174/preview/viewmodel.html';
const outDir = 'previews/weapons';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: exe });
const page = await browser.newPage({ viewport: { width: 720, height: 540 }, deviceScaleFactor: 1 });
for (const action of ['ads', 'fire', 'reload'] as const) {
  await page.goto(`${base}?capture=1`, { waitUntil: 'load' });
  await page.waitForFunction('window.__vmReady === true');
  await page.evaluate((a) => (window as any).__vmSetFrame(a, 0), action);
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.screenshot({ path: path.join(outDir, `viewmodel-${action}.png`) });
  console.log('still', action);
}
await browser.close();

const gif = await captureGif({
  out: path.join(outDir, 'viewmodel-reload.gif'),
  url: `${base}?capture=1`,
  width: 640, height: 480, frames: 60, fps: 30,
  selector: '#vm-stage',
  waitForFunction: 'window.__vmReady === true',
  setFrameExpression: (frame, t) => `window.__vmSetFrame && window.__vmSetFrame('reload',${t});`,
  background: '#080c0e',
});
console.log('gif', gif.gif, gif.frames);
const fire = await captureGif({
  out: path.join(outDir, 'viewmodel-fire.gif'),
  url: `${base}?capture=1`,
  width: 640, height: 480, frames: 48, fps: 30,
  selector: '#vm-stage',
  waitForFunction: 'window.__vmReady === true',
  setFrameExpression: (frame, t) => `window.__vmSetFrame && window.__vmSetFrame('fire',${t});`,
  background: '#080c0e',
});
console.log('gif', fire.gif, fire.frames);
