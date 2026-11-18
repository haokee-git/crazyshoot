import { captureGif } from './gif';
import { CHARACTER_ACTIONS, type CharacterAction } from '../../src/game/characters/animations';

const defaultActions: CharacterAction[] = ['idle', 'walk', 'run', 'aim', 'fire', 'reload'];
const arg = process.argv.find((a) => a.startsWith('--actions='));
const all = process.argv.includes('--all');
const requested = all
  ? CHARACTER_ACTIONS
  : arg
    ? (arg.split('=')[1].split(',').filter(Boolean) as CharacterAction[])
    : defaultActions;

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:5174/preview/anim.html';
const frames = Number(process.env.PREVIEW_FRAMES || 45);
const fps = Number(process.env.PREVIEW_FPS || 30);

for (const action of requested) {
  if (!CHARACTER_ACTIONS.includes(action)) {
    console.warn(`skip unknown action: ${action}`);
    continue;
  }
  const url = `${base}?action=${encodeURIComponent(action)}&capture=1`;
  const out = `previews/anim/character/${action}.gif`;
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
  console.log(`[anim] ${action} → ${result.gif} (${frames}f, ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
}
