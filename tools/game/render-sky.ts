import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const b = await chromium.launch({ headless: true, executablePath: exe });
for (const sky of ['morning','noon','dusk']) {
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(`http://127.0.0.1:5174/game.html?prep=2&turn=1&sky=${sky}&res=32&bots=0`, { waitUntil: 'load' });
  await p.waitForTimeout(500);
  await p.locator('.lobby-primary').first().click();
  await p.waitForTimeout(2600);
  await p.locator('.lobby-primary.start').click().catch(async () => {});
  await p.waitForTimeout(900);
  await p.locator('.prep-close').click().catch(() => {});
  await p.evaluate(() => { const g = (window as any).__game; if (g) { g.controller.yaw = 0; g.controller.pitch = -0.05; } });
  await p.waitForTimeout(600);
  await p.screenshot({ path: `previews/skies/cc0/candidates/game-${sky}.png` });
  await p.close();
}
await b.close();
