import { captureGif } from './gif';
const base = 'http://127.0.0.1:5174/preview/anim.html';
for (const action of ['walk', 'reload']) {
  const url = `${base}?action=${action}&capture=1&view=right`;
  const out = `previews/anim/character/${action}-right.gif`;
  const r = await captureGif({ out, url, width: 640, height: 640, frames: 45, fps: 30, selector: '#stage', waitForFunction: 'window.__previewReady === true', background: '#070a0c' });
  console.log(r.gif);
}
