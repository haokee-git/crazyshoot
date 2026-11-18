import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { captureGif } from '../anim/gif';

const exe = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  '/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
].filter(Boolean).find((p) => fs.existsSync(p as string)) as string | undefined;
const base = process.env.VEHICLE_PREVIEW_URL || 'http://127.0.0.1:5174/preview/vehicles.html';
const ids = ['motorcycle', 'jeep', 'apc', 'ifv', 'light_tank', 'mbt'] as const;
const outDir = 'previews/vehicles';
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true, executablePath: exe });
const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 });
for (const id of ids) {
  await page.goto(`${base}?vehicle=${id}&capture=1`, { waitUntil: 'load' });
  await page.waitForFunction('window.__vehicleReady === true');
  await page.evaluate(() => (window as any).__vehicleSetFrame({ angle: 0.65 }));
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.screenshot({ path: path.join(outDir, `${id}-ui.png`) });
  await page.evaluate(() => document.body.classList.add('capture'));
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await page.screenshot({ path: path.join(outDir, `${id}-model.png`) });
  console.log('still', id);
}
await browser.close();

const gif = await captureGif({
  out: path.join(outDir, 'jeep-turntable.gif'),
  url: `${base}?vehicle=jeep&capture=1&ui=0`,
  width: 720,
  height: 540,
  frames: 48,
  fps: 30,
  selector: '#vehicle-stage',
  waitForFunction: 'window.__vehicleReady === true',
  setFrameExpression: (frame, t) => `window.__vehicleSetFrame && window.__vehicleSetFrame({frame:${frame}, t:${t}});`,
  background: '#070a0c',
});
console.log('gif', gif.gif, gif.frames);
const drive = await captureGif({
  out: path.join(outDir, 'jeep-drive.gif'),
  url: `${base}?vehicle=jeep&capture=1&ui=0`,
  width: 720, height: 540, frames: 48, fps: 30,
  selector: '#vehicle-stage',
  waitForFunction: 'window.__vehicleReady === true',
  setFrameExpression: (frame, t) => `window.__vehicleSetFrame && window.__vehicleSetFrame({angle:0.3}); window.__vehicleSetAction && window.__vehicleSetAction('drive',${t});`,
  background: '#070a0c',
});
console.log('gif', drive.gif, drive.frames);
const turret = await captureGif({
  out: path.join(outDir, 'ifv-turret.gif'),
  url: `${base}?vehicle=ifv&capture=1&ui=0`,
  width: 720, height: 540, frames: 60, fps: 30,
  selector: '#vehicle-stage',
  waitForFunction: 'window.__vehicleReady === true',
  setFrameExpression: (frame, t) => `window.__vehicleSetFrame && window.__vehicleSetFrame({angle:0.3}); window.__vehicleSetAction && window.__vehicleSetAction('turret',${t});`,
  background: '#070a0c',
});
console.log('gif', turret.gif, turret.frames);
const ifvDrive = await captureGif({
  out: path.join(outDir, 'ifv-drive.gif'),
  url: `${base}?vehicle=ifv&capture=1&ui=0`,
  width: 720, height: 540, frames: 48, fps: 30,
  selector: '#vehicle-stage',
  waitForFunction: 'window.__vehicleReady === true',
  setFrameExpression: (frame, t) => `window.__vehicleSetFrame && window.__vehicleSetFrame({angle:0.3}); window.__vehicleSetAction && window.__vehicleSetAction('drive',${t});`,
  background: '#070a0c',
});
console.log('gif', ifvDrive.gif, ifvDrive.frames);
const mbtTurret = await captureGif({
  out: path.join(outDir, 'mbt-turret.gif'),
  url: `${base}?vehicle=mbt&capture=1&ui=0`,
  width: 720, height: 540, frames: 60, fps: 30,
  selector: '#vehicle-stage',
  waitForFunction: 'window.__vehicleReady === true',
  setFrameExpression: (frame, t) => `window.__vehicleSetFrame && window.__vehicleSetFrame({angle:0.3}); window.__vehicleSetAction && window.__vehicleSetAction('turret',${t});`,
  background: '#070a0c',
});
console.log('gif', mbtTurret.gif, mbtTurret.frames);
