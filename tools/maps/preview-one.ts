import { chromium } from 'playwright';
import { renderMapPlan } from './plan-svg';
import { assertMapValid } from '../../src/maps/helpers';
import type { MapDef } from '../../src/maps/types';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

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

const slug = process.argv[2];
if (!slug) {
  console.error('usage: tsx tools/maps/preview-one.ts <map-module-slug>');
  process.exit(1);
}

const modulePath = path.resolve('src/maps', `${slug}.ts`);
if (!fs.existsSync(modulePath)) {
  console.error(`map module not found: ${modulePath}`);
  process.exit(1);
}

const mod = (await import(pathToFileURL(modulePath).href)) as Record<string, unknown> & {
  default?: MapDef;
};
const map =
  mod.default ??
  (Object.values(mod).find(
    (v): v is MapDef =>
      !!v && typeof v === 'object' && 'id' in v && 'capturePoints' in v && 'vehiclePads' in v,
  ) as MapDef | undefined);

if (!map) {
  console.error('no MapDef export found; export a default MapDef or a named MapDef');
  process.exit(1);
}

const errors = assertMapValid(map);
if (errors.length) {
  console.error('map validation errors:\n' + errors.join('\n'));
  process.exit(1);
}

const outDir = path.resolve('previews/maps');
fs.mkdirSync(outDir, { recursive: true });
const stem = `${String(map.order).padStart(2, '0')}-${map.id}`;
const svgPath = path.join(outDir, `${stem}.svg`);
const pngPath = path.join(outDir, `${stem}.png`);
fs.writeFileSync(svgPath, renderMapPlan(map), 'utf8');

const browser = await chromium.launch({ headless: true, executablePath: browserExecutable() });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await page.setContent(
  `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#0b0e11;overflow:hidden}svg{display:block}</style></head><body>${renderMapPlan(map)}</body></html>`,
  { waitUntil: 'load' },
);
await page.evaluate(async () => {
  await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
});
await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width: W, height: H } });
await browser.close();

console.log(`[preview] ${map.id} ${map.name} → ${pngPath}`);
console.log(
  `caps=${map.capturePoints.length} spawns=${map.spawns.length} vehicles=${map.vehiclePads.length} mg=${map.mgNests.length} specials=${map.specialCrates.length} covers=${map.covers.length} buildings=${map.buildings.length}`,
);
