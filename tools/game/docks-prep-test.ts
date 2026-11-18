import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const b=await chromium.launch({headless:true,executablePath:exe});
const p=await b.newPage({viewport:{width:1280,height:720}}); const logs:string[]=[];
p.on('pageerror',e=>logs.push('ERR '+e)); p.on('console',m=>{if(m.type()==='error')logs.push('CON '+m.text());});
const url='http://127.0.0.1:5174/game.html?prep=2&turn=1&res=32&bots=1&size=8&sky=noon&map=docks';
await p.goto(url,{waitUntil:'load'}); await p.waitForTimeout(700); await p.waitForTimeout(700);await p.locator('.lobby-solo').click();
for (let i=0;i<8;i++){ await p.waitForTimeout(1000); console.log(i, await p.evaluate(()=>{const g=(window as any).__game; return g?{phase:g.phase,prep:g.prepSeconds,hosted:g.hosted?.size,errors:0}:null;}).catch(e=>String(e))); }
console.log('LOGS',logs.slice(0,8)); await p.screenshot({path:'previews/game/00-docks-prep-stuck.png'}); await b.close();
