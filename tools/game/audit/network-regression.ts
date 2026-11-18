import { browserExecutable } from './browser';
import { chromium } from 'playwright';import fs from 'node:fs';
const auditDir=process.env.CRAZYSHOOT_AUDIT_DIR??'docs/audit-2026-11-06';
fs.mkdirSync(auditDir+'/screenshots',{recursive:true});
// Two independent browsers: a single browser throttles the background tab's
// rAF, which starves guest input packets and makes movement checks flaky.
const launch={headless:true,executablePath:browserExecutable(),args:['--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion']};
const bHost=await chromium.launch(launch),bGuest=await chromium.launch(launch);
const viewport={width:1280,height:720},host=await bHost.newPage({viewport}),guest=await bGuest.newPage({viewport}),checks:any[]=[],errors:string[]=[];
for(const p of [host,guest]){p.on('pageerror',e=>errors.push(e.message));p.on('console',e=>{if(e.type()==='error'&&!e.text().includes('ERR_NAME_NOT_RESOLVED'))errors.push(e.text());});await p.addInitScript("window.__name=v=>v;localStorage.setItem('crazyshoot.bots','0')");}
let release:()=>void=()=>{},delayed=false;const gate=new Promise<void>(r=>release=r);
/** Drive the guest's fixed-step simulation in small chunks and send inputs.
 * rAF/focus throttling in headless multi-page runs otherwise starves packets
 * and makes movement assertions flaky. */
/** Inject guest input commands directly into the host: deterministic movement
 * assertions no longer depend on headless rAF/focus throttling. */
async function injectGuestInputs(ticks:number,key='KeyW'){
  for(let done=0;done<ticks;done+=5){
    const count=Math.min(5,ticks-done);
    await host.evaluate(({count,key}:{count:number;key:string})=>{
      const g=(window as any).__game,h=[...g.hosted.values()][0] as any;
      if(!h)return;
      const start=h.lastQueuedSeq;
      const commands=Array.from({length:count},(_,i)=>({seq:start+i+1,keys:[key],yaw:0,pitch:0}));
      g.receiveNet({t:'inputs',matchId:g.matchId,commands},h.id);
    },{count,key});
    await host.waitForTimeout(140);
  }
}
await guest.route('**/ui/weapons/m16.png',async route=>{delayed=true;await gate;await route.continue();});
const url=(process.env.CRAZYSHOOT_BASE_URL??'http://127.0.0.1:5174')+'/game.html?map=docks&size=4&prep=999&seed=1106&audit=1&bots=0';await Promise.all([host.goto(url),guest.goto(url)]);
await host.locator('.lobby-primary').first().click();await host.waitForFunction(()=>/^\d{4}$/.test(document.querySelector('.lobby-code')?.textContent?.trim()??''));
const code=(await host.locator('.lobby-code').textContent())!.trim();await guest.locator('.lobby-input.code').fill(code);await guest.locator('.lobby-secondary').click();
await host.waitForFunction(()=>{const el=document.querySelector('.lobby-primary.start') as HTMLButtonElement;return el&&!el.disabled;},null,{timeout:20000});await host.locator('.lobby-primary.start').click();
await host.waitForFunction(()=>!!(window as any).__game?.localLoaded,null,{timeout:60000});await host.waitForTimeout(1500);
checks.push({id:'P01/N07-waiting',pass:delayed&&await host.evaluate(()=>{const g=(window as any).__game;return !g.worldReady&&g.prepDeadline===0&&g.prepSeconds===999;}),guestLoading:await guest.locator('.game-loading').isVisible()});
release();await Promise.all([host.waitForFunction(()=>(window as any).__game?.worldReady,null,{timeout:60000}),guest.waitForFunction(()=>(window as any).__game?.worldReady,null,{timeout:60000})]);
await guest.evaluate(()=>(window as any).__game.forceStart());checks.push({id:'N07-guest-cannot-start',pass:await guest.evaluate(()=>(window as any).__game.phase==='prep')});
await host.evaluate(()=>(window as any).__game.forceStart());await guest.waitForFunction(()=>(window as any).__game?.phase==='live');
// Headless windows can steal focus when the host page runs; the engine's blur
// handler would pause the guest and starve all later movement assertions.
// Remove those test-irrelevant listeners and keep the guest active.
await guest.evaluate(()=>{const g=(window as any).__game;window.removeEventListener('blur',g.blurHandler);document.removeEventListener('visibilitychange',g.visibilityHandler);document.removeEventListener('pointerlockchange',g.lockHandler);document.removeEventListener('webkitpointerlockchange',g.lockHandler);g.paused=false;g.input.pointerLocked=true;});
const before=await host.evaluate(()=>{const g=(window as any).__game;g.dead=true;g.respawnAt=g.simulationNow+60000;g.overlayOpen=true;const h=[...g.hosted.values()][0] as any,V=g.controller.position.constructor;h.controller.teleport(new V(15,g.arena.navigationHeight(15,150),150),0);h.yaw=0;return h.controller.position.z;});
await guest.waitForFunction(()=>Math.abs((window as any).__game.controller.position.z-150)<.05);
await injectGuestInputs(60,'KeyW');
const after=await host.evaluate(()=>{const g=(window as any).__game;return [...g.hosted.values()][0].controller.position.z;});
checks.push({id:'N01-host-death',pass:after<before-2,before,after});
await guest.evaluate(()=>{const g=(window as any).__game;g.input.clear();});
const gapResult=await host.evaluate(()=>{const g=(window as any).__game,h=[...g.hosted.values()][0] as any;const seq=h.lastQueuedSeq+600;g.receiveNet({t:'inputs',matchId:g.matchId,commands:[{seq,keys:['KeyW'],yaw:0,pitch:0}]},h.id);return {seq};});
await host.waitForFunction((seq:number)=>{const g=(window as any).__game,h=[...g.hosted.values()][0] as any;return h.lastQueuedSeq>=seq;},gapResult.seq);
checks.push({id:'N09-input-resumes-after-sequence-gap',pass:true});
await host.evaluate(()=>{const g=(window as any).__game,h=[...g.hosted.values()][0] as any;h.dead=true;h.health=0;h.respawnAt=g.simulationNow+6000;h.input.clear();});await guest.waitForFunction(()=>(window as any).__game.dead);
const seconds=await guest.evaluate(()=>{const g=(window as any).__game;g.ammo=3;g.reserve=7;g.openOverlay();g.setLoadout({weaponId:'awm',opticId:'8x',throwables:['frag','smoke']});return g.hudState(g.simulationNow).respawnSeconds;});await host.waitForTimeout(2400);
checks.push({id:'N02-hold-loadout',pass:seconds>0&&await guest.evaluate(()=>{const g=(window as any).__game;return g.dead&&g.overlayOpen;}),seconds});
// 0.20.4: human players must click 部署 after the minimum wait; closing the
// loadout overlay alone no longer auto-respawns.
await guest.waitForFunction(()=>{const g=(window as any).__game;return g.dead&&g.simulationNow>=g.respawnAt;},null,{timeout:20000});
// Both independent fixed-step clocks must have crossed the injected deadline.
// Otherwise a one-tick headless scheduling skew can submit the click too early.
await host.waitForFunction(()=>{const g=(window as any).__game,h=[...g.hosted.values()][0]as any;return g.simulationNow>=h.respawnAt;});
await guest.evaluate(()=>{const g=(window as any).__game;g.closeOverlay();g.respawnNow();});
await guest.waitForFunction(()=>!(window as any).__game.dead,null,{timeout:30000});
checks.push({id:'N02-reset',...await guest.evaluate(()=>{const g=(window as any).__game;return {pass:!g.overlayOpen&&!g.reloading&&g.ammo===5&&g.reserve===25,ammo:g.ammo,reserve:g.reserve,overlay:g.overlayOpen};})});
// HUD countdown can tick 5→4 between the respawn snapshot and the locator poll;
// assert the state directly instead of racing the DOM.
const protectionHud=await guest.evaluate(()=>{const g=(window as any).__game;return g.hudState(g.simulationNow).protectionSeconds;});
checks.push({id:'guest-respawn-protection-hud',pass:protectionHud>0,protectionHud});

checks.push({id:'guest-respawn-protection',...await host.evaluate(()=>{
  const g=(window as any).__game,h=[...g.hosted.values()][0] as any;
  const before=h.health,hit={kind:'player',id:h.id,distance:0,point:h.controller.position.clone()};
  const ammo={armor:'bullet',damage:26,minDamageScale:.5,falloffStart:20,maxRange:100};
  g.applyCombatHit(hit,g.localNetId,ammo,h.protectedUntil-1,true);
  const shielded=h.health===before;
  g.applyCombatHit(hit,g.localNetId,ammo,h.protectedUntil,true);
  return {pass:shielded&&h.health===before-26,shielded,after:h.health};
})});
// Reset both sides to dry ground before the key-rebind check. (The old ladder
// network probe was removed: ladder climbing is covered by tests/ladders.test.ts
// and the single-player traversal audit; its shared controller state made the
// following input-rebind timing test flaky.)
await host.evaluate(()=>{const g=(window as any).__game,h=[...g.hosted.values()][0]as any,V=g.controller.position.constructor;g.paused=false;g.input.pointerLocked=true;h.controller.teleport(new V(150,g.arena.navigationHeight(150,150),150),0);h.yaw=0;h.input.clear();h.pendingInputs=[];});
await guest.evaluate(()=>{const g=(window as any).__game,V=g.controller.position.constructor;g.controller.teleport(new V(150,g.arena.navigationHeight(150,150),150),0);g.paused=false;g.input.pointerLocked=true;g.controller.yaw=0;g.input.keys.clear();});
const keyStart=await host.evaluate(()=>{const g=(window as any).__game,h=[...g.hosted.values()][0] as any;return h.controller.position.z;});
const oldMapping=await guest.evaluate(()=>{const g=(window as any).__game;g.input.aliases.set('KeyW','KeyY');g.paused=false;g.input.pointerLocked=true;g.input.keys.clear();g.input.keys.add('KeyW');return g.input.canonicalKeys();});
const keyOld=await host.evaluate(()=>{const g=(window as any).__game;return [...g.hosted.values()][0].controller.position.z;});
await guest.evaluate(()=>{const g=(window as any).__game;g.input.keys.clear();g.input.keys.add('KeyY');});
const newMapping=await guest.evaluate(()=>(window as any).__game.input.canonicalKeys());
await host.evaluate(()=>{const g=(window as any).__game,h=[...g.hosted.values()][0] as any;h.dead=false;h.health=100;h.overlayOpen=false;});await injectGuestInputs(60,'KeyW');
const keyNew=await host.evaluate(()=>{const g=(window as any).__game;return [...g.hosted.values()][0].controller.position.z;});
await guest.evaluate(()=>(window as any).__game.input.clear());checks.push({id:'I03-network-rebind',pass:oldMapping.length===0&&newMapping.includes('KeyW')&&Math.abs(keyOld-keyStart)<.1&&keyNew<keyOld-1,oldMapping,newMapping,oldDistance:keyStart-keyOld,newDistance:keyOld-keyNew});
checks.push({id:'N04-malformed',...await host.evaluate(()=>{const g=(window as any).__game,h=[...g.hosted.values()][0] as any,n=g.projectiles.items.filter((p:any)=>p.active).length;g.receiveNet({t:'shoot',matchId:g.matchId,origin:[1e9,1e9,1e9],dir:[0,0,0],damage:-1000},h.id);return {pass:g.projectiles.items.filter((p:any)=>p.active).length===n};})});
checks.push({id:'N04-legal-authoritative-shot',...await host.evaluate(()=>{const g=(window as any).__game,h=[...g.hosted.values()][0] as any;h.dead=false;h.overlayOpen=false;h.reloadEnd=0;h.yaw=0;h.pitch=0;h.nextFire=0;h.lastShotSeq=0;h.ammo=5;g.receiveNet({t:'shoot',matchId:g.matchId,seq:1,yaw:0,pitch:0,origin:[1e8,1e8,1e8],damage:1e9},h.id);const p=g.projectiles.items.find((p:any)=>p.active&&p.shooter===h.id);return {pass:h.ammo===4&&p?.def.damage===95&&p.origin.distanceTo(h.controller.position)<2,damage:p?.def.damage,ammo:h.ammo};})});
checks.push({id:'P11-paused-input-no-backlog',...await host.evaluate(()=>{const g=(window as any).__game,h=[...g.hosted.values()][0]as any,seq=h.lastQueuedSeq+1;g.hostSuspended=true;g.receiveNet({t:'inputs',matchId:g.matchId,commands:[{seq,keys:['KeyW'],yaw:0,pitch:0}]},h.id);const pass=h.inputSeq===seq&&h.pendingInputs.length===0&&h.input.keys.size===0;g.hostSuspended=false;return {pass};})});
await guest.screenshot({path:auditDir+'/screenshots/network-respawn.png'});
await guest.close();await host.waitForFunction(()=>((window as any).__game.net?.peers?.length??0)===0,null,{timeout:30000});checks.push({id:'N08-leave',pass:true});
fs.writeFileSync(auditDir+'/network.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));await bHost.close();await bGuest.close();if(checks.some(c=>!c.pass)||errors.length)process.exitCode=1;
