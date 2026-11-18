import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2];
const out = process.argv[3];
const width = Number(process.argv[4] || 1920);
const height = Number(process.argv[5] || 1080);
const click = process.argv[6] || '';
if (!url || !out) {
  console.error('usage: tsx tools/preview/page-shot.ts <url> <out> [w] [h] [clickSelector]');
  process.exit(1);
}
const exeCandidates = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  '/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean) as string[];
const exe = exeCandidates.find((p) => fs.existsSync(p));
const browser = await chromium.launch({ headless: true, executablePath: exe });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1600);
if (click) {
  await page.locator(click).first().click();
  await page.waitForTimeout(700);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
await page.screenshot({ path: out, clip: { x: 0, y: 0, width, height } });
console.log(JSON.stringify({ out, errors }, null, 2));
await browser.close();
