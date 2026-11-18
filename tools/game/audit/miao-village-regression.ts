import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { browserExecutable } from './browser';

const base = process.env.GAME_BASE_URL ?? 'http://127.0.0.1:5174';
const baseline = process.argv.includes('--baseline');
const output = process.argv.find(arg => arg.startsWith('--out='))?.slice(6) ?? 'tmp/miao-village-audit';
const quality = process.env.MIAO_AUDIT_QUALITY ?? 'medium';
const extraArgs = (process.env.CRAZYSHOOT_CHROMIUM_ARGS ?? '').split(' ').filter(Boolean);
const cameraPoses = [
  { name: 'market-street', x: 150, z: 172, yaw: Math.PI, pitch: 0, height: 1.65, indoor: false, budget: 650_000 },
  { name: 'market-house', x: 129, z: 183.75, yaw: 0, pitch: 0, height: 2.65, indoor: true, budget: 500_000 },
  { name: 'hillside-house', x: 122, z: 348.25, yaw: Math.PI, pitch: 0, height: 2.65, indoor: true, budget: 500_000 },
  { name: 'covered-bridge', x: 207, z: 291, yaw: -0.73, pitch: -0.12, height: 10, indoor: false, budget: 650_000 },
];

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: browserExecutable(),
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', ...extraArgs],
});
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 405 } });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(lightingQuality => {
    localStorage.setItem('crazyshoot.settings', JSON.stringify({ rev: 3, frameLimit: 0, lightingQuality }));
  }, quality);
  await page.goto(`${base}/game.html?map=miao_village&size=8&bots=1&prep=999&res=32&audit=1&seed=1106`);
  await page.locator('.lobby-solo').evaluate(button => (button as HTMLButtonElement).click());
  await page.waitForFunction(() => (window as any).__game?.activated && !document.querySelector('.game-loading'), null, { timeout: 180_000 });
  await page.evaluate(() => (window as any).__game.forceStart());
  const results = [];
  for (const pose of cameraPoses) {
    const view = await page.evaluate(async ({ x, z, yaw, pitch, height, indoor, photo }) => {
      const game = (window as any).__game;
      const y = game.arena.heightAt(x, z) + height;
      if (indoor && game.arena.blockedAt(x, z, 0.3, y - 1.65, 1.8)) throw new Error('Indoor audit pose is obstructed');
      game.controller.position.set(x, y - 1.65, z);
      game.auditView(x, y, z, yaw, pitch);
      const world = game.arena.scene.getObjectByName('minecraft-voxel-world');
      const contact = game.arena.scene.getObjectByName('battlefield-contact-shadows');
      const triangles: number[] = [], calls: number[] = [], frameMs: number[] = [];
      let previous = await new Promise<number>(requestAnimationFrame);
      for (let frame = 0; frame < 10; frame++) {
        const now = await new Promise<number>(requestAnimationFrame);
        if (frame > 2) {
          triangles.push(game.renderer.info.render.triangles);
          calls.push(game.renderer.info.render.calls);
          frameMs.push(now - previous);
        }
        previous = now;
      }
      return {
        frameMs, triangles, calls, camera: game.camera.position.toArray(),
        contactInstances: contact?.count ?? 0,
        worldTriangles: world.children.reduce((sum: number, mesh: any) => sum + mesh.geometry.index.count / 3, 0),
        simP95: game.auditPerf().simP95,
        png: photo ? game.renderer.domElement.toDataURL('image/png') : null,
      };
    }, { ...pose, photo: !baseline });
    const { png, ...samples } = view;
    const result = {
      name: pose.name, camera: samples.camera,
      triangles: median(samples.triangles), calls: median(samples.calls),
      frameMs: median(samples.frameMs), simP95: samples.simP95,
      worldTriangles: samples.worldTriangles, contactInstances: samples.contactInstances,
    };
    console.log(JSON.stringify(result));
    results.push(result);
    if (png) await fs.writeFile(path.join(output, `${pose.name}.png`), Buffer.from(png.split(',')[1], 'base64'));
    if (!baseline && quality === 'medium') {
      assert(result.triangles < pose.budget, `${pose.name} exceeded its triangle budget: ${result.triangles}`);
      assert(result.calls < 250, `${pose.name} exceeded its draw call budget: ${result.calls}`);
      assert.equal(result.contactInstances, 0, 'Per-part static contact decals returned');
    }
  }
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'performance.json'), JSON.stringify({ baseline, quality, results }, null, 2));
} finally {
  await browser.close();
}
