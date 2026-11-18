import fs from 'node:fs';import {chromium} from 'playwright';import {browserExecutable} from './browser';
const out=process.argv[2]??`tmp/tactical-situations-${Date.now()}`;fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:browserExecutable()}),page=await browser.newPage();await page.addInitScript('window.__name=v=>v');
const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`${process.env.CRAZYSHOOT_BASE_URL??'http://127.0.0.1:5174'}/game.html?map=broken_bridge&size=20&bots=1&prep=999&quality=low&audit=1`);await page.locator('.lobby-solo').click();await page.waitForFunction(()=>(window as any).__game?.activated,null,{timeout:120000});
 const checks=await page.evaluate(()=>{
  const g=(window as any).__game;g.forceStart();cancelAnimationFrame(g.raf);g.disposed=true;g.lite=true;g.dead=true;
  const all=[...g.hosted.values()] as any[],h=all.find(h=>h.team==='blue'),foe=all.find(h=>h.team==='orange'),friend=all.find(h=>h.team==='blue'&&h!==all.find(h=>h.team==='blue'));
  const V=g.controller.position.constructor,checks:any[]=[];
  for(const v of g.vehicles){v.destroyed=true;v.seats.fill(null);}
  function setup(role:string,weapon:string,distance:number){
   g.simulationNow+=3000;g.tacticalMemory.clear();g.localNavigation.forget(h.id);
   for(const a of all){a.dead=true;a.vehicleId=null;a.vehicleOrder=undefined;}
   const start=distance>50?110:70;
   for(const a of [h,foe]){const z=a===h?start:start-distance;a.dead=false;a.protectedUntil=0;a.health=100;a.input.clear();a.controller.teleport(new V(20,g.arena.navigationHeight(20,z),z),a===h?0:Math.PI);}
   g.applyBotLoadout(h,{role,weaponId:weapon,opticId:'iron'});
   Object.assign(h,{yaw:0,pitch:0,nextThink:0,targetId:null,lastSeen:0,nextBotFire:0,reloadEnd:0,lastDamageAt:-Infinity,objective:'',objectiveUntil:0,tactical:undefined,tacticalPoint:undefined,tacticalCovered:false,aimVelocity:undefined,aimObservedAt:undefined,nextAimSample:0,stanceIntent:'stand',nextStanceAt:0,friendlyFireBlockedUntil:0,burnUntil:0,waterCross:undefined,dangerDetour:undefined,scanPoint:undefined,scanUntil:0});
  }
  const think=()=>{h.nextThink=0;g.updateBotAI(h,g.simulationNow);return h.tactical?.action;};
  setup('rifle','m16',30);foe.dead=true;checks.push({id:'no-contact-advance',action:think(),pass:h.tactical?.action==='advance'});
  setup('rifle','m16',20);h.health=18;h.ammo=0;h.reloadEnd=g.simulationNow+2200;h.lastDamageAt=g.simulationNow;
  checks.push({id:'wounded-reload-withdraw',action:think(),point:h.tacticalPoint,position:h.controller.position.toArray(),keys:[...h.input.keys],move:h.input.worldMove,pass:h.tactical?.action==='withdraw'&&Math.hypot(h.input.worldMove?.x??0,h.input.worldMove?.z??0)>.1});
  setup('sniper','awm',70);checks.push({id:'sniper-overwatch',action:think(),pass:h.tactical?.action==='overwatch'});
  setup('sniper','awm',8);h.lastDamageAt=g.simulationNow;checks.push({id:'sniper-close-disengage',action:think(),pass:h.tactical?.action==='withdraw'});
  setup('rifle','m16',30);friend.dead=false;friend.protectedUntil=0;friend.controller.teleport(new V(20,g.arena.navigationHeight(20,55),55));
  const startAmmo=h.ammo;
  for(let i=0;i<10;i++){g.simulationNow+=150;think();}
  checks.push({id:'friendly-fire-lane-reposition',action:h.tactical?.action,ammo:h.ammo,startAmmo,pass:(h.tactical?.action==='flank'||h.tactical?.action==='reposition')&&h.ammo===startAmmo});
  setup('rifle','m16',30);foe.dead=true;
  const v=g.vehicles.find((v:any)=>v.team==='blue'&&v.kind==='light_tank');v.destroyed=false;v.x=193;v.z=94;v.model.position.set(v.x,g.arena.vehicleGroundAt(v.x,v.z),v.z);v.seats[0]=h.id;h.vehicleId=v.id;h.vehicleSeat=0;v.health=v.maxHealth;v.ammo=30;v.weapons[0].ammo=30;
  for(const c of g.caps){c.owner=c.id==='C'?'blue':'orange';c.progress=c.owner==='blue'?1:-1;}
  function decide(){h.vehicleDecision=undefined;h.nextVehicleDecisionAt=0;return g.vehicleObjective(h,v,g.simulationNow);}
  let goal=decide();checks.push({id:'quiet-home-attack-front',goal:goal.id,action:h.vehicleDecision.action,pass:goal.id==='B'});
  for(let i=0;i<3;i++)g.tacticalMemory.observe('blue','seen-'+i,{x:195+i,y:7,z:105},i===0,g.simulationNow);
  goal=decide();checks.push({id:'same-position-defend-observed-incursion',goal:goal.id,action:h.vehicleDecision.action,pass:goal.id==='C'&&h.vehicleDecision.action==='defend'});
  v.ammo=0;goal=decide();checks.push({id:'empty-authoritative-shell-pool-resupply',action:h.vehicleDecision.action,pass:h.vehicleDecision.action==='resupply'});v.ammo=30;
  v.health=v.maxHealth*.15;goal=decide();checks.push({id:'damaged-armor-resupply',goal:goal.id,action:h.vehicleDecision.action,pass:h.vehicleDecision.action==='resupply'&&goal.base});
  return checks;
 });
 fs.writeFileSync(out+'/report.json',JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));if(errors.length||checks.some((c:any)=>!c.pass))process.exitCode=1;
}finally{await browser.close();}
