import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const base = 'http://127.0.0.1:5174/preview/maps-3d.html';
const b = await chromium.launch({ headless: true, executablePath: exe });
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
for (const map of ['broken_bridge']) {
  for (const view of ['A', 'B', 'C']) {
    await p.goto(`${base}?map=${map}&view=${view}&capture=1&ui=0`, { waitUntil: 'load' });
    await p.waitForFunction('window.__mapReady === true');
    await p.evaluate((v) => (window as any).__mapSetView(v), view);
    await p.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await p.screenshot({ path: path.join('previews/maps', `3d-${map}-cap-${view}.png`) });
    console.log(map, view);
  }
}
await b.close();
