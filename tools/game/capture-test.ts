import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const url = 'http://127.0.0.1:5174/game.html?prep=2&turn=1&sky=noon&res=32&bots=0';
const b = await chromium.launch({ headless: true, executablePath: exe });
const ctx = await b.newContext({ viewport: { width: 1000, height: 700 } });
const host = await ctx.newPage(); const guest = await ctx.newPage();
const errors: string[] = [];
for (const [n,p] of [['host',host],['guest',guest]] as const) { p.on('pageerror',(e)=>errors.push(`${n}: ${e}`)); p.on('console',(m)=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(`${n}: ${m.text()}`);}); }
await host.goto(url); await guest.goto(url);
await host.waitForTimeout(700); await host.locator('.lobby-primary').first().click(); await host.waitForTimeout(3000);
const code=(await host.locator('.lobby-code').first().textContent())!.trim();
await guest.locator('.lobby-input.code').fill(code); await guest.locator('.lobby-secondary').click();
await host.waitForFunction(()=>{const b=document.querySelector('.lobby-primary.start') as HTMLButtonElement; return !!b&&!b.disabled;},null,{timeout:20000});
await host.locator('.lobby-primary.start').click(); await host.waitForTimeout(1000);
for (const p of [host,guest]) { await p.locator('.prep-close').click().catch(()=>{}); await p.waitForFunction(()=>(window as any).__game?.phase==='live',null,{timeout:12000}); }
await host.waitForTimeout(300);
const set=await host.evaluate(()=>{const g=(window as any).__game; const r=[...g.remotes.values()][0]; g.controller.position.set(-14,0,14); const h=g.hosted.get(r.id); h.controller.position.set(0,0,14); return {guest:r.id};});
await host.waitForTimeout(1600);
const st=async(p:any)=>p.evaluate(()=>{const g=(window as any).__game; return {scores:g?.scores,caps:g?.caps?.map((c:any)=>({id:c.id,owner:c.owner})),match:g?.matchRemaining, winner:g?.winner};});
console.log('SET',JSON.stringify(set));
console.log('HOST',JSON.stringify(await st(host)));
console.log('GUEST',JSON.stringify(await st(guest)));
await host.screenshot({path:'previews/ui/capture-host.png'});
console.log('ERRORS',JSON.stringify(errors));
await b.close();
