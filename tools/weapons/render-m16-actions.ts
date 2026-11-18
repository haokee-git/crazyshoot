import { captureGif } from '../anim/gif';

const base = process.env.WEAPON_PREVIEW_URL || 'http://127.0.0.1:5174/preview/weapons.html';
const frames = 48;
const fps = 30;
const gif = await captureGif({
  out: 'previews/weapons/m16-reload.gif',
  url: `${base}?weapon=m16&capture=1`,
  width: 640,
  height: 640,
  frames,
  fps,
  selector: '#weapon-stage',
  waitForFunction: 'window.__weaponReady === true',
  setFrameExpression: (frame, t) =>
    `window.__weaponSetAction && window.__weaponSetAction({action:'reload', t:${frame}/(${frames}-1)});`,
  background: '#070a0c',
});
console.log('reload gif', gif.gif, gif.frames);
