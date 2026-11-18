import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const url = 'http://127.0.0.1:5174/game.html?prep=2&turn=1&res=32&bots=0&sky=noon&turn=1&map=docks';
const b = await chromium.launch({ headless: true, executablePath: exe });
const host = await b.newPage({ viewport: { width: 1280, height: 720 } });
const guest = await b.newPage({ viewport: { width: 1280, height: 720 } });
const errors: string[] = [];
for (const [n,p] of [['host',host],['guest',guest]] as const) { p.on('pageerror',(e)=>errors.push(`${n}: ${e}`)); p.on('console',(m)=>{ if(m.type()==='error'&&!m.text().includes('404')) errors.push(`${n}: ${m.text()}`); }); }
await host.goto(url); await guest.goto(url);
await host.waitForTimeout(900); await host.locator('.lobby-primary').first().click(); await host.waitForTimeout(2500);
const code = (await host.locator('.lobby-code').first().textContent())!.trim();
await guest.locator('.lobby-input.code').fill(code); await guest.locator('.lobby-secondary').click();
await host.waitForFunction(()=>{const e=document.querySelector('.lobby-primary.start') as HTMLButtonElement; return !!e&&!e.disabled;},null,{timeout:20000}).catch(()=>{});
await host.locator('.lobby-primary.start').click({timeout:5000}).catch(()=>{});
for (const p of [host,guest]) { await p.waitForTimeout(1000); await p.locator('.prep-close').click().catch(()=>{}); }
await host.waitForFunction(()=>(window as any).__game?.phase==='live',null,{timeout:15000}).catch(()=>{});
await host.waitForTimeout(1200);
const info=await host.evaluate(()=>{ const g=(window as any).__game; return { phase:g?.phase, pos:g?.controller.position.toArray(), caps:g?.caps.map((c:any)=>({id:c.id,x:c.x,z:c.z,r:c.r})), map:g?.arena?.name, plan:!!g?.arena?.minimapPlan }; });
console.log('INFO', JSON.stringify(info)); console.log('ERRORS', JSON.stringify(errors));
await host.screenshot({ path: 'previews/game/00-docks-ingame.png' });
await b.close();
