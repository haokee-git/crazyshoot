import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const b = await chromium.launch({ headless: true, executablePath: exe });
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
p.on('console', (m) => console.log('CONSOLE', m.type(), m.text().slice(0, 400)));
p.on('pageerror', (e) => console.log('PAGEERR', String(e)));
p.on('requestfailed', (r) => console.log('REQFAIL', r.url(), r.failure()?.errorText));
p.on('response', (r) => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url()); });
const direct = await p.evaluate(async () => {
  const out: any = {};
  for (const url of ['/textures/64/asphalt_clean.png', '/skies/noon.jpg']) {
    try {
      const r = await fetch(url);
      const blob = await r.blob();
      const bmp = await createImageBitmap(blob);
      out[url] = { status: r.status, type: r.headers.get('content-type'), bytes: blob.size, w: bmp.width, h: bmp.height };
    } catch (e) { out[url] = { error: String(e) }; }
  }
  return out;
}).catch((e) => ({ err: String(e) }));
console.log('DIRECT', JSON.stringify(direct));
await p.goto('https://crazyshoot.haokee.org/game.html?prep=6&sky=noon&res=64', { waitUntil: 'load' });
await p.waitForTimeout(700);await p.locator('.lobby-solo').click();
await p.waitForTimeout(6000);
const info = await p.evaluate(() => {
  const g = (window as any).__game;
  if (!g) return { noGame: true };
  const scene = g.arena.scene;
  const meshes = scene.children.filter((o: any) => o.isInstancedMesh).slice(0, 4);
  return {
    bg: scene.background ? { w: scene.background.image?.width, src: scene.background.image?.src } : null,
    meshes: meshes.map((m: any) => ({
      name: m.name,
      hasMap: !!m.material.map,
      imgW: m.material.map?.image?.width,
      imgH: m.material.map?.image?.height,
      imgSrc: m.material.map?.image?.src,
      color: m.material.color?.getHexString?.(),
      count: m.count,
    })),
  };
});
console.log('INFO', JSON.stringify(info, null, 2));
await p.screenshot({ path: 'previews/ui/tex-debug.png' });
await b.close();
