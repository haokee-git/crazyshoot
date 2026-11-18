import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2] || 'http://127.0.0.1:5174/preview/anim.html?action=walk&capture=1&view=side';
const out = process.argv[3] || 'previews/anim/_still.png';
const t = Number(process.argv[4] || 0.18);
const exeCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  '/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean) as string[];
const exe = exeCandidates.find((p) => fs.existsSync(p));
const browser = await chromium.launch({ headless: true, executablePath: exe });
const page = await browser.newPage({ viewport: { width: 640, height: 640 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction('window.__previewReady === true');
await page.evaluate(async () => { await (document as Document & { fonts?: FontFaceSet }).fonts?.ready; });
await page.evaluate((tt) => (window as unknown as { __previewSetFrame: (v: {frame:number;t:number}) => void }).__previewSetFrame({ frame: 0, t: tt }), t);
await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const dbg = await page.evaluate(() => (window as unknown as { __previewDebug?: () => unknown }).__previewDebug?.());
console.log(JSON.stringify(dbg));
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 640, height: 640 } });
await browser.close();
console.log(out);
