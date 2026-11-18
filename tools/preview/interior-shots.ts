import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const exeCandidates=[process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,'/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const exe=exeCandidates.filter(Boolean).find(p=>fs.existsSync(p as string));
const base=process.env.INTERIOR_PREVIEW_URL||'http://127.0.0.1:5174/preview/interiors-3d.html';
const out=path.resolve('previews/interiors');
fs.mkdirSync(out,{recursive:true});
const shots=[
 {map:'docks',building:'dock-nw',views:['door','exterior','interior','detail','stairs','upper']},
 {map:'docks',building:'dock-w',views:['exterior','interior']},
 {map:'broken_bridge',building:'house-w',views:['door','interior','detail']},
 {map:'broken_bridge',building:'church',views:['detail','interior','upper']},
 {map:'garden',building:'manor-main',views:['facade','interior','detail','upper']},
 {map:'garden',building:'greenhouse-n',views:['interior','detail']},
 {map:'airfield',building:'hangar-1',views:['door','exterior','interior','detail','stairs','upper']},
 {map:'airfield',building:'terminal-w',views:['facade','interior','detail','upper']},
 {map:'airfield',building:'control',views:['upper']},
];
const b=await chromium.launch({headless:true,executablePath:exe as string|undefined});
const page=await b.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors:string[]=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
for(const shot of shots){
 for(const view of shot.views){
  const url=`${base}?map=${shot.map}&building=${shot.building}&view=${view}&capture=1`;
  await page.goto(url,{waitUntil:'load'});
  await page.waitForFunction('window.__previewReady === true',null,{timeout:60000});
  await page.waitForTimeout(250);
  const file=path.join(out,`${shot.map}-${shot.building}-${view}.png`);
  await page.screenshot({path:file});
  console.log('shot',path.relative(process.cwd(),file));
 }
}
await b.close();
console.log('ERRORS',JSON.stringify(errors.slice(0,10)));
