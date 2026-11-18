import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const b=await chromium.launch({headless:true,executablePath:exe});
const p=await b.newPage({viewport:{width:1280,height:800}});
await p.goto('http://127.0.0.1:5174/game.html?map=docks',{waitUntil:'load'});
await p.waitForTimeout(500);
await p.screenshot({path:'previews/game/00-lobby-maps.png'});
await b.close();
