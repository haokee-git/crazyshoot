import fs from 'node:fs';
import {chromium} from 'playwright';
import {browserExecutable} from './browser';
const out=process.argv[2]??`tmp/armored-frontline-${Date.now()}`;fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:browserExecutable()}),page=await browser.newPage({viewport:{width:960,height:540}});
page.setDefaultTimeout(180000);await page.addInitScript('window.__name=v=>v');
const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(`${process.env.CRAZYSHOOT_BASE_URL??'http://127.0.0.1:5174'}/game.html?map=broken_bridge&prep=999&bots=1&size=20&res=32&audit=1&quality=low&seed=1106`);
 await page.locator('.lobby-solo').click();await page.waitForFunction(()=>(window as any).__game?.activated,null,{timeout:120000});
 const result=await page.evaluate((scenario:string)=>{
  const g=(window as any).__game;g.forceStart();cancelAnimationFrame(g.raf);g.disposed=true;g.lite=true;g.dead=true;
  // Keep combat target selection/aiming live while making this a repeatable
  // mobility test: destruction must not conceal a parked vehicle's failure.
  g.applyCombatHit=()=>{};g.explode=()=>{};g.fireVehicleFor=()=>{};
  if(scenario.startsWith('convoy')){
   g.botsEnabled=false;
   const crew=[...g.hosted.values()].filter((h:any)=>h.team==='blue').slice(0,4) as any[];
   for(const h of g.hosted.values()){h.dead=true;h.vehicleId=null;h.vehicleOrder=undefined;}
   const armor=g.vehicles.filter((v:any)=>v.team==='blue'&&['apc','light_tank'].includes(v.kind));
   for(const v of g.vehicles){v.seats.fill(null);if(!armor.includes(v)){v.destroyed=true;v.model.visible=false;}}
   armor.forEach((v:any,i:number)=>{
    v.x=193;v.z=94-i*10;v.yaw=0;v.speed=0;v.model.position.set(v.x,g.arena.vehicleGroundAt(v.x,v.z),v.z);v.model.rotation.set(0,0,0);
    for(let seat=0;seat<2;seat++){const h=crew[i*2+seat];h.dead=false;h.bot=true;h.vehicleId=v.id;h.vehicleSeat=seat;h.vehicleBoardedAt=g.simulationNow-10000;h.objective='C';h.objectiveUntil=g.simulationNow+18000;h.pilot=undefined;v.seats[seat]=h.id;h.controller.position.copy(g.seatPosition(v,seat));}
   });
   if(scenario==='convoy-enemy'){
    const enemy=[...g.hosted.values()].find((h:any)=>h.team==='orange') as any,v=g.vehicles.find((v:any)=>v.team==='orange'&&v.kind==='light_tank');
    enemy.dead=false;enemy.bot=false;enemy.vehicleId=v.id;enemy.vehicleSeat=0;enemy.protectedUntil=0;v.destroyed=false;v.model.visible=true;v.seats[0]=enemy.id;v.x=127;v.z=163;v.yaw=Math.PI;v.model.position.set(v.x,g.arena.vehicleGroundAt(v.x,v.z),v.z);v.model.rotation.set(0,v.yaw,0);enemy.controller.position.copy(g.seatPosition(v,0));
   }
   for(const c of g.caps){c.owner=c.id==='C'?'blue':'orange';c.progress=c.owner==='blue'?1:-1;}
  }
  const rows:any[]=[];
  for(let i=0;i<120*60;i++){
   g.simulationNow+=1000/60;g.simulate(1/60);
   if(i%300===0)rows.push({t:i/60,caps:g.caps.map((c:any)=>({id:c.id,owner:c.owner,progress:c.progress})),vehicles:g.vehicles.filter((v:any)=>['apc','light_tank'].includes(v.kind)).map((v:any)=>{const h=g.hosted.get(v.seats[0]);return {id:v.id,kind:v.kind,team:v.team,x:v.x,z:v.z,yaw:v.yaw,speed:v.speed,driver:v.seats[0],goal:h?.objective,mode:h?.pilot?.debugMode,reason:h?.pilot?.giveUpReason,throttle:h?.vehThrottle,decision:h?.vehicleDecision?.action,parking:h?.vehicleParking,following:h?.trafficFollowing,avoiding:h?.trafficAvoidUntil,reaches:h?.pilot?.reachesGoal,aim:h?.pilot?.debugAim,index:h?.pilot?.index,path:h?.pilot?.path};})});
  }
  return {rows};
 },process.env.CRAZYSHOOT_ARMOR_SCENARIO??'natural');
 fs.writeFileSync(out+'/'+(process.env.CRAZYSHOOT_ARMOR_SCENARIO??'natural')+'.json',JSON.stringify({result,errors},null,2));
 const blue=result.rows[0].vehicles.filter((v:any)=>v.team==='blue').map((v:any)=>v.id);
 const reached=blue.map((id:string)=>({id,firstBridge:result.rows.find((r:any)=>r.vehicles.some((v:any)=>v.id===id&&v.driver&&v.x>=110&&v.x<=150&&v.z>=140&&v.z<=170))?.t}));
 const pass=!errors.length&&reached.every((r:any)=>r.firstBridge!==undefined&&r.firstBridge<=90);
 fs.writeFileSync(out+'/report.json',JSON.stringify({pass,reached,errors},null,2));console.log(JSON.stringify({pass,reached,errors}));if(!pass)process.exitCode=1;
}finally{await browser.close();}
