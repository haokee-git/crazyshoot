import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const ids = ['m16','m4a1','akm','mp5','mk14','awm','uzi','vector','ump45','m870','m249'];
const b = await chromium.launch({ headless: true, executablePath: exe });
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
for (const id of ids) {
  await p.goto(`http://127.0.0.1:5174/preview/weapons.html?weapon=${id}&view=side&capture=1&ui=0&silhouette=1&angle=0`, { waitUntil: 'load' });
  await p.waitForTimeout(250);
  await p.screenshot({ path: `previews/weapons/${id}-silhouette-white.png` });
  console.log(id);
}
await b.close();
