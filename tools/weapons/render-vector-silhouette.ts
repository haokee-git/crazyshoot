import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const b = await chromium.launch({ headless: true, executablePath: exe });
const p = await b.newPage({ viewport: { width: 1100, height: 760 } });
await p.goto('http://127.0.0.1:5174/preview/weapons.html?weapon=vector&view=side&capture=1&ui=0&silhouette=1&angle=0', { waitUntil: 'load' });
await p.waitForTimeout(500);
await p.screenshot({ path: 'previews/weapons/vector-silhouette-white.png' });
await b.close();
