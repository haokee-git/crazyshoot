import { captureGif } from './gif';
const url = 'http://127.0.0.1:5174/preview/anim.html?action=walk&capture=1&view=orbit&orbitFrames=72&orbitT=0.22&orbitZoom=hands&orbitArc=160&orbitStart=-80&debug=1';
const r = await captureGif({
  out: 'previews/anim/character/grip-turntable-debug.gif',
  url,
  width: 640,
  height: 640,
  frames: 72,
  fps: 30,
  selector: '#stage',
  waitForFunction: 'window.__previewReady === true',
  background: '#070a0c',
});
console.log(r.gif);
