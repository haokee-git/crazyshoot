import { browserExecutable } from './browser';
import { chromium } from 'playwright';import fs from 'node:fs';import path from 'node:path';
const outFile=process.argv[2]||`tmp/lifecycle-regression-${Date.now()}.json`;
fs.mkdirSync(path.dirname(outFile),{recursive:true});
const b=await chromium.launch({headless:true,args:['--enable-precise-memory-info'],executablePath:browserExecutable()}),page=await b.newPage({viewport:{width:1280,height:720}});await page.addInitScript('window.__name=v=>v');
const checks:any[]=[],errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));let fail=true;
await page.route('**/ui/weapons/m16.png',r=>fail?r.abort():r.continue());await page.goto('http://127.0.0.1:5174/game.html?map=docks&bots=0&prep=999&audit=1');await page.waitForTimeout(700);await page.locator('.lobby-solo').click();await page.waitForSelector('.game-fault');
checks.push({id:'P01-error-no-false-ready',pass:await page.evaluate(()=>!((window as any).__game?.worldReady)&&Number(document.querySelector('progress')?.value)<100)});
fail=false;await page.locator('.game-fault button').first().click();await page.waitForFunction(()=>(window as any).__game?.activated,null,{timeout:60000});checks.push({id:'P01-retry',pass:true});
checks.push({id:'I01-default-window',pass:await page.evaluate(()=>document.fullscreenElement===null)});
await page.evaluate(()=>{const g=(window as any).__game;g.forceStart();g.controller.position.set(150,0,280);g.paused=true;g.input.pointerLocked=true;g.input.keys.add('KeyW');});const before=await page.evaluate(()=>(window as any).__game.controller.position.toArray());await page.waitForTimeout(700);const after=await page.evaluate(()=>(window as any).__game.controller.position.toArray());checks.push({id:'I02-pause',pass:JSON.stringify(before)===JSON.stringify(after),before,after});
const memory=await page.evaluate(()=>{const g=(window as any).__game;cancelAnimationFrame(g.raf);g.disposed=true;g.input.clear();const rows:any[]=[];
 const record=(cycle:number)=>{g.renderer.render(g.scene,g.camera);rows.push({cycle,geometry:g.renderer.info.memory.geometries,textures:g.renderer.info.memory.textures,heap:(performance as any).memory?.usedJSHeapSize});};
 g.viewmodel.setWeapon('m16','red_dot');record(0);
 for(let i=1;i<=100;i++){g.viewmodel.setWeapon(i%2?'awm':'m16',i%2?'8x':'red_dot');g.renderer.render(g.scene,g.camera);if(i%10===0)record(i);}
 const weapons=rows.splice(0),p=g.controller.position.clone(),V=p.constructor;
 p.add(new V(0,0,-4));record(0);
 for(let i=1;i<=100;i++){
  g.createBody('corpse-'+i,g.myTeam,p,0,false,new V(),g.simulationNow-1500);
  g.renderer.render(g.scene,g.camera);
  g.simulationNow+=23000;g.updateBodies(1/60);
  if(i%10===0)record(i);
 }
 return {weapons,corpses:rows};});
checks.push({id:'P09-100-weapons',pass:memory.weapons.at(-1).geometry<=memory.weapons[0].geometry+2&&memory.weapons.at(-1).textures<=memory.weapons[0].textures+2});checks.push({id:'P09-100-corpses',pass:memory.corpses.at(-1).geometry<=memory.corpses[0].geometry+2&&memory.corpses.at(-1).textures<=memory.corpses[0].textures+2});
fs.writeFileSync(outFile,JSON.stringify({checks,memory,errors},null,2));console.log(`lifecycle-regression output: ${outFile}`);console.log(JSON.stringify({checks,memory,errors},null,2));await b.close();if(checks.some(c=>!c.pass)||errors.length)process.exitCode=1;
