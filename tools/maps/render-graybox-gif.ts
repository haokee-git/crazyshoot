import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { captureGif } from '../anim/gif';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const base = process.env.MAP_PREVIEW_URL || 'http://127.0.0.1:5174/preview/maps-3d.html';
const gif = await captureGif({
  out: path.join('previews/maps', '3d-docks-orbit.gif'),
  url: `${base}?map=docks&capture=1&ui=0&view=overview`,
  width: 960, height: 600, frames: 64, fps: 30,
  selector: '#map-stage',
  waitForFunction: 'window.__mapReady === true',
  setFrameExpression: (frame, t) => `window.__mapSetOrbit && window.__mapSetOrbit(${t});`,
  background: '#080d0f',
});
console.log(gif.gif, gif.frames);
