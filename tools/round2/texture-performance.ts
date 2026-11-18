import {chromium} from 'playwright';
import fs from 'node:fs';
import {browserExecutable} from '../game/audit/browser';
const base=process.env.GAME_URL||'http://127.0.0.1:5175';
const browser=await chromium.launch({headless:true,executablePath:browserExecutable(),args:['--enable-precise-memory-info']});
const rows:any[]=[];
for(const resolution of [32,64,128]){
 const page=await browser.newPage({viewport:{width:1280,height:720}}),errors:string[]=[];
 await page.addInitScript('window.__name=v=>v');page.on('pageerror',e=>errors.push(e.message));
 const started=Date.now();await page.goto(`${base}/game.html?map=docks&res=${resolution}&size=12&bots=1&prep=999&quality=low&seed=1106`);
 await page.waitForTimeout(700);await page.locator('.lobby-solo').click();await page.waitForFunction(()=>(window as any).__game?.activated,null,{timeout:90000});const readyMs=Date.now()-started;
 const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');
 const result=await page.evaluate(async()=>{
  const g=(window as any).__game;g.forceStart();g.paused=false;g.input.pointerLocked=true;g.controller.teleport(g.controller.position.clone().set(150,2,280),0);
  const frame:number[]=[],calls:number[]=[],submit:number[]=[];let last=performance.now();const render=g.presentation.render.bind(g.presentation);
  g.presentation.render=(...args:any[])=>{const now=performance.now();frame.push(now-last);last=now;const t=performance.now();render(...args);submit.push(performance.now()-t);calls.push(g.renderer.info.render.calls);};
  await new Promise(resolve=>setTimeout(resolve,15000));
  const stats=(a:number[])=>{a.sort((a,b)=>a-b);return{median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a.at(-1)};};
  const arrays:any[]=[];g.scene.traverse((o:any)=>{for(const m of Array.isArray(o.material)?o.material:[o.material])for(const u of [{value:m?.userData.arrayTexture},...Object.values(m?.uniforms||{})] as any[]){const t=u?.value;if(t?.isDataArrayTexture&&!arrays.some(a=>a.uuid===t.uuid))arrays.push({uuid:t.uuid,width:t.image.width,height:t.image.height,layers:t.image.depth,baseBytes:t.image.data.byteLength,mipmapped:t.generateMipmaps});}});
  return{frames:frame.length,frameMs:stats(frame.slice(10)),submitMs:stats(submit.slice(10)),drawCalls:stats(calls),players:g.hosted.size+1,arrays,gpuObjects:{...g.renderer.info.memory},worldSize:[g.presentation.target.width,g.presentation.target.height],outputSize:[g.renderer.domElement.width,g.renderer.domElement.height],failed:g.frameFailed};
 });
 await cdp.send('HeapProfiler.collectGarbage');const heap=await cdp.send('Runtime.getHeapUsage');
 rows.push({resolution,readyMs,...result,retainedJSHeapBytes:heap.usedSize,errors});await page.screenshot({path:`docs/round2-2026-11-07/screenshots/texture-live-${resolution}.png`});await page.close();
}
const identity=await(await browser.newPage()).request.get(base+'/version.json');
fs.writeFileSync('docs/round2-2026-11-07/texture-performance.json',JSON.stringify({buildInfo:await identity.json(),hardware:'Apple M5 Pro, Chromium headless; not J1900',notes:'15 seconds per tier, same scene and 24 actors; separate browser pages, warm OS cache. Submit time is CPU, not GPU timing. GPU object counts are not GPU byte usage.',rows},null,2));await browser.close();
console.log(JSON.stringify(rows));if(rows.some(r=>r.failed||r.errors.length||r.players!==24))process.exitCode=1;
