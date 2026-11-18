import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const base = process.env.MAP_PREVIEW_URL || 'http://127.0.0.1:5174/preview/maps-3d.html';
const out = 'previews/maps';
const maps = ['docks', 'broken_bridge', 'garden', 'airfield'];
const b = await chromium.launch({ headless: true, executablePath: exe });
const page = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
for (const id of maps) {
  for (const view of ['overview', 'top']) {
    await page.goto(`${base}?map=${id}&view=${view}&capture=1&ui=0`, { waitUntil: 'load' });
    await page.waitForFunction('window.__mapReady === true', null, { timeout: 20000 });
    await page.evaluate((v) => (window as any).__mapSetView(v), view);
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await page.screenshot({ path: path.join(out, `3d-${id}-${view}.png`) });
    console.log(id, view);
  }
}
console.log('ERRORS', JSON.stringify(errors));
await b.close();
