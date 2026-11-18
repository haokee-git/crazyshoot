import { chromium } from 'playwright';
import fs from 'node:fs';
const exe = ['/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'].find(fs.existsSync)!;
const url = 'http://127.0.0.1:5174/game.html?prep=2&turn=1&res=32&bots=0';
const b = await chromium.launch({ headless: true, executablePath: exe });
const host = await b.newPage({ viewport: { width: 1280, height: 720 } });
const guest = await b.newPage({ viewport: { width: 1280, height: 720 } });
await host.goto(url); await guest.goto(url);
await host.waitForTimeout(700); await host.locator('.lobby-primary').first().click(); await host.waitForTimeout(2500);
const code = (await host.locator('.lobby-code').first().textContent())!.trim();
await guest.locator('.lobby-input.code').fill(code); await guest.locator('.lobby-secondary').click();
await host.waitForFunction(()=>{const e=document.querySelector('.lobby-primary.start') as HTMLButtonElement; return !!e&&!e.disabled;},null,{timeout:20000}).catch(()=>{});
await host.locator('.lobby-primary.start').click({timeout:5000}).catch(()=>{});
for (const p of [host,guest]) { await p.waitForTimeout(1000); await p.locator('.prep-close').click().catch(()=>{}); await p.waitForFunction(()=>(window as any).__game?.phase==='live',null,{timeout:12000}).catch(()=>{}); }
await host.waitForTimeout(1200);
await host.screenshot({ path: 'previews/game/00-minimap.png' });
console.log('phase', await host.evaluate(()=>(window as any).__game?.phase));
await b.close();
