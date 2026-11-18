import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const url = 'http://127.0.0.1:5174/game.html?prep=2&turn=1&sky=noon&res=32';
const b = await chromium.launch({ headless: true, executablePath: exe });
const ctx = await b.newContext({ viewport: { width: 1200, height: 800 } });
const host = await ctx.newPage(); const guest = await ctx.newPage();
const errors: string[] = [];
for (const [n,p] of [['host',host],['guest',guest]] as const) { p.on('pageerror',(e)=>errors.push(`${n}: ${e}`)); p.on('console',(m)=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(`${n}: ${m.text()}`);}); }
await host.goto(url); await guest.goto(url);
await host.waitForTimeout(700);
const setting = host.locator('.lobby-setting').filter({ hasText: 'AI 补位' });
await setting.locator('button').filter({ hasText: '关' }).click();
await host.locator('.lobby-primary').first().click(); await host.waitForTimeout(3000);
const code=(await host.locator('.lobby-code').first().textContent())!.trim();
await guest.locator('.lobby-input.code').fill(code); await guest.locator('.lobby-secondary').click();
await host.waitForFunction(()=>{const b=document.querySelector('.lobby-primary.start') as HTMLButtonElement; return !!b&&!b.disabled;},null,{timeout:20000});
await host.locator('.lobby-primary.start').click(); await host.waitForTimeout(1000);
for (const p of [host,guest]) { await p.locator('.prep-close').click().catch(()=>{}); await p.waitForFunction(()=>(window as any).__game?.phase==='live',null,{timeout:12000}); }
const st=await host.evaluate(()=>{const g=(window as any).__game; return {hosted:g.hosted.size,remotes:g.remotes.size,bots:[...g.hosted.values()].filter((h:any)=>h.bot).length};});
console.log('BOTS_OFF',JSON.stringify(st)); console.log('ERRORS',JSON.stringify(errors));
await b.close();
