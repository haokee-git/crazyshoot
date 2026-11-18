import {chromium} from 'playwright';
import {browserExecutable} from './browser';
const browser=await chromium.launch({headless:true,executablePath:browserExecutable()});
const page=await browser.newPage();page.setDefaultTimeout(120000);await page.addInitScript('window.__name=v=>v');
page.on('pageerror',e=>console.log('PAGEERROR',e.message));
await page.goto('http://127.0.0.1:5174/game.html?map=broken_bridge&prep=999&bots=1&size=8&res=32&audit=1&quality=low');await page.waitForTimeout(700);await page.locator('.lobby-solo').click();
await page.waitForFunction(()=>(window as any).__game?.activated,null,{timeout:120000});
const result=await page.evaluate(()=>{
 const g=(window as any).__game;g.forceStart();cancelAnimationFrame(g.raf);g.disposed=true;g.lite=true;g.botsEnabled=false;
 const h=[...g.hosted.values()].find((h:any)=>h.team==='blue'&&[...h.id].reduce((a:number,c:string)=>a+c.charCodeAt(0),0)%3===0) as any;
 for(const [id] of g.hosted)if(id!==h.id)g.hosted.delete(id);
 const V=h.controller.position.constructor;h.controller.teleport(new V(200,g.arena.navigationHeight(200,120),120),0);h.objective='A';h.objectiveUntil=g.simulationNow+100000;h.vehicleOrder=undefined;h.vehicleId=null;h.botRole='rifle';
 let samples:any[]=[];for(let i=0;i<45*60;i++){g.simulationNow+=1000/60;g.simulate(1/60);if(i%120===0)samples.push({t:i/60,x:+h.controller.position.x.toFixed(1),z:+h.controller.position.z.toFixed(1),y:+h.controller.position.y.toFixed(1),swim:h.controller.swimming,cross:h.waterCross&&{...h.waterCross},goal:h.objective,dead:h.dead,retry:h.waterCrossRetryAt,waypoint:h.routeWaypoint,keys:[...h.input.keys]});}
 return {id:h.id,samples};
});console.log(JSON.stringify(result,null,2));await browser.close();if(!result.samples.some((s:any)=>s.swim&&s.cross?.entered&&s.z>150)||!result.samples.some((s:any)=>!s.swim&&s.z>180))process.exitCode=1;
