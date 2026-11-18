import fs from 'node:fs';
import {chromium} from 'playwright';
import {browserExecutable} from './browser';
const out=process.argv[2]??`tmp/tactical-brain-${Date.now()}`;fs.mkdirSync(out,{recursive:true});
const base=process.env.CRAZYSHOOT_BASE_URL??'http://127.0.0.1:5174';
const browser=await chromium.launch({headless:true,executablePath:browserExecutable()}),results:any[]=[];
try{
 for(const map of (process.env.CRAZYSHOOT_AI_MAPS??'docks,broken_bridge,garden,airfield').split(','))for(const seed of (process.env.CRAZYSHOOT_AI_SEEDS??'1106,42').split(',')){
  const page=await browser.newPage({viewport:{width:800,height:600}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript('window.__name=v=>v');
  await page.goto(`${base}/game.html?map=${map}&size=${process.env.CRAZYSHOOT_AI_SIZE??20}&prep=999&bots=1&seed=${seed}&res=32&quality=low&audit=1`);
  await page.locator('.lobby-solo').click();await page.waitForFunction(()=>(window as any).__game?.activated,null,{timeout:120000});
  const result=await page.evaluate(async(config:{seed:string;newTeam:string;legacy:string})=>{
   const g=(window as any).__game;
   if(config.newTeam){
    const legacy=await import(/* @vite-ignore */ config.legacy);
    for(const name of ['updateBotAI','observeBotTarget','botObjective','botTactics','botUpdateStance','botCoverStance','driveBotVehicle','vehicleObjective','aimBotVehicle']){
     const current=g[name].bind(g),old=legacy.GameEngine.prototype[name];if(typeof old!=='function')throw new Error('Missing legacy method '+name);
     g[name]=(actor:any,...args:any[])=>actor.team===config.newTeam?current(actor,...args):old.call(g,actor,...args);
    }
   }
   g.simulationNow=0;g.rngState=Number(config.seed);g.forceStart();cancelAnimationFrame(g.raf);g.disposed=true;g.lite=true;g.dead=true;
   const firstCaps:Record<string,number>={},visits=new Set<string>(),actions:Record<string,number>={},sim:number[]=[];
   const teamKills={blue:0,orange:0},teamShots={blue:0,orange:0},enemyDamage={blue:0,orange:0};
   const team=(id:string):'blue'|'orange'|undefined=>id===g.localNetId?g.myTeam:g.hosted.get(id)?.team;
   let shots=0,kills=0,damage=0;const launch=g.launch.bind(g),kill=g.addKill.bind(g),hit=g.applyCombatHit.bind(g);
   g.launch=(...a:any[])=>{shots++;const t=team(a[0]);if(t)teamShots[t]++;return launch(...a);};g.addKill=(...a:any[])=>{kills++;const t=team(a[0]);if(t)teamKills[t]++;return kill(...a);};
   g.applyCombatHit=(...a:any[])=>{const target=a[0],h=g.hosted.get(target?.id),v=g.vehicles.find((v:any)=>v.id===target?.id),before=h?.health??v?.health??g.health;const r=hit(...a),loss=Math.max(0,before-(h?.health??v?.health??g.health)),attacker=team(a[1]),victim=h?.team??v?.team??g.myTeam;damage+=loss;if(attacker&&victim!==attacker)enemyDamage[attacker]+=loss;return r;};
   let longStalls=0;const stalls:any[]=[];const probes=new Map<string,{x:number;z:number;stopped:number}>();
   for(let i=0;i<120*60;i++){
    g.simulationNow+=1000/60;const start=performance.now();g.simulate(1/60);if(i%10===0)sim.push(performance.now()-start);
    for(const c of g.caps)if(c.owner!=='neutral'&&firstCaps[c.id+':'+c.owner]===undefined)firstCaps[c.id+':'+c.owner]=i/60;
    for(const v of g.vehicles)if(v.seats[0]&&!v.destroyed)for(const c of g.caps)if(Math.hypot(v.x-c.x,v.z-c.z)<c.r+4)visits.add(v.id+':'+c.id);
    if(i%60===0)for(const h of g.hosted.values()){
     if(h.tactical)actions[h.tactical.action]=(actions[h.tactical.action]??0)+1;
     if(h.vehicleDecision)actions['vehicle:'+h.vehicleDecision.action]=(actions['vehicle:'+h.vehicleDecision.action]??0)+1;
     if(h.dead)continue;const pos=h.controller.position,previous=probes.get(h.id),goal=g.caps.find((c:any)=>c.id===h.objective);
     const attempting=h.vehicleId?Math.abs(h.vehThrottle)>.2&&!h.trafficFollowing:!h.targetId&&!h.reloadEnd&&!!h.routeWaypoint&&Math.hypot(h.routeWaypoint.x-pos.x,h.routeWaypoint.z-pos.z)>2&&h.botRole!=='sniper'&&h.botRole!=='marksman';
     const stopped=previous&&attempting&&Math.hypot(pos.x-previous.x,pos.z-previous.z)<.2?previous.stopped+1:0;
     if(stopped===8){longStalls++;stalls.push({at:i/60,id:h.id,role:h.botRole,health:h.health,vehicle:h.vehicleId,objective:h.objective,tactical:h.tactical?.action,goal:h.routeWaypoint,keys:[...h.input.keys],position:pos.toArray(),following:h.trafficFollowing,mode:h.pilot?.debugMode});}probes.set(h.id,{x:pos.x,z:pos.z,stopped});
    }
   }
   sim.sort((a,b)=>a-b);
   return {firstCaps,scores:g.scores,kills,shots,damage,teamKills,teamShots,enemyDamage,vehicleObjectiveVisits:visits.size,longStalls,stalls,actions,simulationP95:sim[Math.floor(sim.length*.95)],failed:g.frameFailed};
  },{seed,newTeam:process.env.CRAZYSHOOT_AI_NEW_TEAM??'',legacy:'/tmp/ai-brain-baseline/legacy-src/game/engine.ts'});
  results.push({map,seed,newTeam:process.env.CRAZYSHOOT_AI_NEW_TEAM??'',...result,errors});console.log(JSON.stringify(results.at(-1)));fs.writeFileSync(out+'/results.json',JSON.stringify(results,null,2));await page.close();
 }
}finally{await browser.close();}
if(results.some(r=>r.errors.length||r.failed))process.exitCode=1;
