import { captureGif } from './gif';
import type { CharacterAction } from '../../src/game/characters/animations';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5174/preview/anim.html';
const frames = Number(process.env.PREVIEW_FRAMES || 72);
const fps = Number(process.env.PREVIEW_FPS || 30);

const jobs: Array<{ action: CharacterAction; out: string; t: number; zoom: 'full' | 'hands'; arc?: number; start?: number }> = [
  { action: 'walk', out: 'walk-turntable.gif', t: 0.22, zoom: 'full', arc: 360, start: -45 },
  { action: 'walk', out: 'grip-turntable.gif', t: 0.22, zoom: 'hands', arc: 160, start: -80 },
  { action: 'reload', out: 'reload-turntable.gif', t: 0.62, zoom: 'hands', arc: 160, start: -80 },
];

for (const job of jobs) {
  const url = `${base}?action=${job.action}&capture=1&view=orbit&orbitFrames=${frames}&orbitT=${job.t}&orbitZoom=${job.zoom}&orbitArc=${job.arc ?? 360}&orbitStart=${job.start ?? -45}`;
  const out = `previews/anim/character/${job.out}`;
  const t0 = Date.now();
  const result = await captureGif({
    out,
    url,
    width: 640,
    height: 640,
    frames,
    fps,
    selector: '#stage',
    waitForFunction: 'window.__previewReady === true',
    background: '#070a0c',
  });
  console.log(`[turntable] ${job.out} → ${result.gif} (${frames}f, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
