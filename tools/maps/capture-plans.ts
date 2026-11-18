import { chromium } from 'playwright';
import { MAPS } from '../../src/maps';
import { renderMapPlan } from './plan-svg';
import fs from 'node:fs';
import path from 'node:path';

const W = 2400;
const H = 1800;

function browserExecutable(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const candidates = [
    '/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  return candidates.find((p) => fs.existsSync(p));
}

const outDir = path.resolve('previews/maps');
fs.mkdirSync(outDir, { recursive: true });

const exe = browserExecutable();
const browser = await chromium.launch({ headless: true, executablePath: exe });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

for (const map of MAPS) {
  const svg = renderMapPlan(map);
  const svgPath = path.join(outDir, `${String(map.order).padStart(2, '0')}-${map.id}.svg`);
  const pngPath = path.join(outDir, `${String(map.order).padStart(2, '0')}-${map.id}.png`);
  fs.writeFileSync(svgPath, svg, 'utf8');
  await page.setContent(
    `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#0b0e11;overflow:hidden}svg{display:block}</style></head><body>${svg}</body></html>`,
    { waitUntil: 'load' },
  );
  await page.evaluate(async () => {
    // system fonts; wait for font metrics
    await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
  });
  await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width: W, height: H } });
  console.log(`[capture] ${map.id} → ${path.relative(process.cwd(), pngPath)}`);
}

await browser.close();
