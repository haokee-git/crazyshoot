import { browserExecutable } from '../game/audit/browser';
import { chromium } from 'playwright';import fs from 'node:fs';
const b=await chromium.launch({headless:true,args:['--enable-precise-memory-info'],executablePath:browserExecutable()}),page=await b.newPage({viewport:{width:1280,height:720}});await page.addInitScript('window.__name=v=>v');
const checks:any[]=[],errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));let fail=true;
await page.route('**/ui/weapons/m16.png',r=>fail?r.abort():r.continue());await page.goto((process.env.GAME_URL||'http://127.0.0.1:5174')+'/game.html?map=docks&bots=0&prep=999');await page.waitForTimeout(700);await page.locator('.lobby-solo').click();await page.waitForSelector('.game-fault');
checks.push({id:'P01-error-no-false-ready',pass:await page.evaluate(()=>!((window as any).__game?.worldReady)&&Number(document.querySelector('progress')?.value)<100)});
fail=false;await page.locator('.game-fault button').first().click();await page.waitForFunction(()=>(window as any).__game?.activated,null,{timeout:60000});checks.push({id:'P01-retry',pass:true});
checks.push({id:'I01-default-window',pass:await page.evaluate(()=>document.fullscreenElement===null)});
await page.evaluate(()=>{const g=(window as any).__game;g.forceStart();g.controller.position.set(150,g.arena.navigationHeight(150,280),280);g.paused=true;g.input.pointerLocked=true;g.input.keys.add('KeyW');});const before=await page.evaluate(()=>(window as any).__game.controller.position.toArray());await page.waitForTimeout(700);const after=await page.evaluate(()=>(window as any).__game.controller.position.toArray());checks.push({id:'I02-pause',pass:JSON.stringify(before)===JSON.stringify(after),before,after});
const cdp=await page.context().newCDPSession(page);await cdp.send('HeapProfiler.collectGarbage');const heapBefore=await cdp.send('Runtime.getHeapUsage');
const memory=await page.evaluate(()=>{const g=(window as any).__game;cancelAnimationFrame(g.raf);g.disposed=true;g.input.clear();const rows:any[]=[];
 const record=(cycle:number)=>{g.presentation.render(g.renderer,g.scene,g.camera,g.viewmodel);rows.push({cycle,geometry:g.renderer.info.memory.geometries,textures:g.renderer.info.memory.textures,heap:(performance as any).memory?.usedJSHeapSize});};
 g.viewmodel.setWeapon('m16','red_dot');record(0);
 for(let i=1;i<=100;i++){g.viewmodel.setWeapon(i%2?'awm':'m16',i%2?'8x':'red_dot');g.presentation.render(g.renderer,g.scene,g.camera,g.viewmodel);if(i%10===0)record(i);}
 const weapons=rows.splice(0),p=g.controller.position.clone(),V=p.constructor;
 p.add(new V(0,0,-4));record(0);
 for(let i=1;i<=100;i++){
  g.createBody('corpse-'+i,g.myTeam,p,0,false,new V(),g.simulationNow-1500);
  g.presentation.render(g.renderer,g.scene,g.camera,g.viewmodel);
  g.simulationNow+=23000;g.updateBodies(1/60);
  if(i%10===0)record(i);
 }
 return {weapons,corpses:rows};});
checks.push({id:'P09-100-weapons',pass:memory.weapons.at(-1).geometry<=memory.weapons[0].geometry+2&&memory.weapons.at(-1).textures<=memory.weapons[0].textures+2});checks.push({id:'P09-100-corpses',pass:memory.corpses.at(-1).geometry<=memory.corpses[0].geometry+2&&memory.corpses.at(-1).textures<=memory.corpses[0].textures+2});
await cdp.send('HeapProfiler.collectGarbage');const heapAfter=await cdp.send('Runtime.getHeapUsage');checks.push({id:'P09-retained-heap-after-GC',pass:heapAfter.usedSize-heapBefore.usedSize<12*1024*1024,before:heapBefore.usedSize,after:heapAfter.usedSize});
const buildInfo=await (await page.request.get((process.env.GAME_URL||'http://127.0.0.1:5174')+'/version.json')).json();
fs.writeFileSync('docs/round2-2026-11-07/lifecycle.json',JSON.stringify({buildInfo,checks,memory,errors},null,2));console.log(JSON.stringify({buildInfo,checks,memory,errors},null,2));await b.close();if(checks.some(c=>!c.pass)||errors.length)process.exitCode=1;
