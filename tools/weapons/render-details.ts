import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const base = process.env.WEAPON_PREVIEW_URL || 'http://127.0.0.1:5174/preview/weapons.html';
const out = 'previews/weapons';
const b = await chromium.launch({ headless: true, executablePath: exe });
const p = await b.newPage({ viewport: { width: 900, height: 700 } });
for (const id of ['m16', 'm4a1', 'akm', 'mp5', 'awm', 'mk14', 'vector', 'ump45', 'm249'] as const) {
  for (const view of ['side', 'stock', 'sight'] as const) {
    await p.goto(`${base}?weapon=${id}&view=${view}&capture=1&ui=0`, { waitUntil: 'load' });
    await p.waitForFunction('window.__weaponReady === true');
    await p.evaluate(() => (window as any).__weaponSetFrame?.({ angle: 0 }));
    await p.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
    await p.screenshot({ path: path.join(out, `${id}-${view}-detail.png`) });
    console.log(id, view);
  }
}
await b.close();
