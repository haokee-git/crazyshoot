import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const b = await chromium.launch({ headless: true, executablePath: exe });
for (const map of ['docks','broken_bridge','garden','airfield']) {
  const host = await b.newPage({ viewport: { width: 960, height: 600 } });
  const guest = await b.newPage({ viewport: { width: 960, height: 600 } });
  const errors: string[] = [];
  for (const [n,p] of [['h',host],['g',guest]] as const) p.on('pageerror',(e)=>errors.push(`${n}:${e}`));
  const url = `http://127.0.0.1:5174/game.html?prep=2&turn=1&res=32&bots=0&sky=noon&map=${map}`;
  await host.goto(url); await guest.goto(url);
  await host.waitForTimeout(700); await host.locator('.lobby-primary').first().click(); await host.waitForTimeout(2200);
  const code=(await host.locator('.lobby-code').first().textContent())!.trim();
  await guest.locator('.lobby-input.code').fill(code); await guest.locator('.lobby-secondary').click();
  await host.waitForFunction(()=>{const e=document.querySelector('.lobby-primary.start') as HTMLButtonElement; return !!e&&!e.disabled;},null,{timeout:20000}).catch(()=>{});
  await host.locator('.lobby-primary.start').click({timeout:5000}).catch(()=>{});
  for (const p of [host,guest]) { await p.waitForTimeout(900); await p.locator('.prep-close').click().catch(()=>{}); }
  await host.waitForFunction(()=>(window as any).__game?.phase==='live',null,{timeout:15000}).catch(()=>{});
  await host.waitForTimeout(600);
  const info=await host.evaluate(()=>{ const g=(window as any).__game; return {phase:g?.phase,map:g?.arena?.name,pos:g?.controller.position.toArray(),caps:g?.caps.map((c:any)=>c.id),plan:!!g?.arena?.minimapPlan}; });
  console.log(map, JSON.stringify(info), 'ERRORS', errors.slice(0,2));
  await host.close(); await guest.close();
}
await b.close();
