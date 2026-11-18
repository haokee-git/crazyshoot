/** Two real network peers plus 38 bots; compare frames with the same players
 * and view while the tank/APC are moved away and next to them. */
import {browserExecutable} from './browser';
import {chromium, type Page} from 'playwright';
const launch={headless:true,executablePath:browserExecutable(),args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion']};
const bh=await chromium.launch(launch),bg=await chromium.launch(launch),host=await bh.newPage({viewport:{width:960,height:540}}),guest=await bg.newPage({viewport:{width:960,height:540}}),errors:string[]=[];
const tier=process.env.CRAZYSHOOT_LIGHTING;
for(const p of [host,guest]){
 p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(({quality})=>{(window as any).__name=(v:unknown)=>v;if(quality)localStorage.setItem('crazyshoot.settings',JSON.stringify({rev:3,lightingQuality:quality}));},{quality:tier});
}
const base=process.env.CRAZYSHOOT_BASE_URL??'http://127.0.0.1:5174';
const url=base+'/game.html?map=broken_bridge&size=20&prep=999&seed=1106&audit=1&bots=1&quality=low';
await Promise.all([host.goto(url),guest.goto(url)]);
await host.locator('.lobby-primary').first().click();await host.waitForFunction(()=>/^\d{4}$/.test(document.querySelector('.lobby-code')?.textContent?.trim()??''));
const code=(await host.locator('.lobby-code').textContent())!.trim();await guest.locator('.lobby-input.code').fill(code);await guest.locator('.lobby-secondary').click();
await host.waitForFunction(()=>{const e=document.querySelector('.lobby-primary.start') as HTMLButtonElement;return e&&!e.disabled},null,{timeout:30000});await host.locator('.lobby-primary.start').click();
await Promise.all([host.waitForFunction(()=>(window as any).__game?.worldReady,null,{timeout:120000}),guest.waitForFunction(()=>(window as any).__game?.worldReady,null,{timeout:120000})]);
await host.evaluate(()=>(window as any).__game.forceStart());await guest.waitForFunction(()=>(window as any).__game?.phase==='live');
for(const p of [host,guest])await p.evaluate(()=>{const g=(window as any).__game;window.removeEventListener('blur',g.blurHandler);document.removeEventListener('visibilitychange',g.visibilityHandler);document.removeEventListener('pointerlockchange',g.lockHandler);g.paused=false;g.input.pointerLocked=true;});
const state=await host.evaluate(()=>{const g=(window as any).__game,h=[...g.hosted.values()].find((h:any)=>!h.bot) as any,V=g.controller.position.constructor;
 const point=(x:number,z:number)=>new V(x,g.arena.navigationHeight(x,z),z);
 g.controller.teleport(point(128,140),Math.PI);h.controller.teleport(point(132,140),Math.PI);h.yaw=Math.PI;
 const vehicles=g.vehicles.filter((v:any)=>v.team==='blue'&&['light_tank','apc'].includes(v.kind));
 for(const [i,v] of vehicles.entries()){v.seats.fill(null);v.seats[0]='perf-hold';v.speed=0;v.health=v.maxHealth*.2;v.x=60+i*12;v.z=200;v.model.position.set(v.x,g.arena.vehicleGroundAt(v.x,v.z),v.z);}
 return {players:g.hosted.size+1,bots:[...g.hosted.values()].filter((h:any)=>h.bot).length,vehicles:vehicles.length};});
await guest.waitForFunction(()=>Math.hypot((window as any).__game.controller.position.x-132,(window as any).__game.controller.position.z-140)<2,null,{timeout:30000});
async function sample(page:Page){return page.evaluate(async()=>{const g=(window as any).__game,frames:number[]=[],sim:number[]=[],render:number[]=[];let last=performance.now();
 const originalSim=g.simulate,originalRender=g.renderFrame;
 g.simulate=function(dt:number){const t=performance.now();try{return originalSim.call(g,dt)}finally{sim.push(performance.now()-t)}};
 g.renderFrame=function(now:number){const t=performance.now();try{return originalRender.call(g,now)}finally{render.push(performance.now()-t)}};
 await new Promise<void>(resolve=>{const start=performance.now();const step=(now:number)=>{frames.push(now-last);last=now;if(now-start>=4000)resolve();else requestAnimationFrame(step)};requestAnimationFrame(step)});
 g.simulate=originalSim;g.renderFrame=originalRender;
 const stat=(a:number[])=>{a.sort((x,y)=>x-y);return {n:a.length,median:a[Math.floor(a.length*.5)]??0,p95:a[Math.floor(a.length*.95)]??0,max:a.at(-1)??0}};
 return {frame:stat(frames.slice(4)),simulation:stat(sim),render:stat(render),failed:g.frameFailed};});}
await Promise.all([host.waitForTimeout(1000),guest.waitForTimeout(1000)]);
const far=await Promise.all([sample(host),sample(guest)]);
await host.evaluate(()=>{const g=(window as any).__game,vehicles=g.vehicles.filter((v:any)=>v.team==='blue'&&['light_tank','apc'].includes(v.kind));for(const [i,v] of vehicles.entries()){v.x=130+i*6;v.z=150;v.model.position.set(v.x,g.arena.vehicleGroundAt(v.x,v.z),v.z);v.model.rotation.set(0,0,0);}});
await guest.waitForFunction(()=>{const g=(window as any).__game;return g.vehicles.some((v:any)=>v.team==='blue'&&v.kind==='light_tank'&&Math.abs(v.z-150)<1)},null,{timeout:30000});
await guest.waitForTimeout(500);
const near=await Promise.all([sample(host),sample(guest)]);
const result={lighting:tier??'low',state,far:{host:far[0],guest:far[1]},near:{host:near[0],guest:near[1]},errors};console.log(JSON.stringify(result,null,2));
await bh.close();await bg.close();if(state.players!==40||state.bots!==38||state.vehicles!==2||errors.length||[...far,...near].some(x=>x.failed||x.frame.n<80||x.frame.p95>100))process.exitCode=1;
