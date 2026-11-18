/**
 * CRAZYSHOOT 载具 AI 浏览器回归
 *
 *  a) 红房子斜坡：AI 坦克在 house-e 西侧斜坡朝北起步，30 s 内必须驶离、不嵌入墙体。
 *  b) 全图 60 s：真实对局里每辆载具的位移 / 最长静止时长，确认没有死锁。
 *
 * 运行：npx tsx tools/game/audit/vehicle-ai-regression.ts
 * 产物：docs/audit-2026-11-10/vehicle-ai.json + 前后截图
 */
import fs from 'node:fs';
import {browserExecutable} from './browser';

process.env.PLAYWRIGHT_BROWSERS_PATH='/private/tmp/crazyshoot-browsers';
fs.mkdirSync('/private/tmp/crazyshoot-browsers/ffmpeg-1013',{recursive:true});
if(!fs.existsSync('/private/tmp/crazyshoot-browsers/ffmpeg-1013/ffmpeg-mac')&&fs.existsSync('/opt/homebrew/bin/ffmpeg')){
  fs.symlinkSync('/opt/homebrew/bin/ffmpeg','/private/tmp/crazyshoot-browsers/ffmpeg-1013/ffmpeg-mac');
}
const OUT=process.env.CRAZYSHOOT_AUDIT_DIR??'docs/audit-2026-11-10';
fs.mkdirSync(OUT,{recursive:true});
const URL='http://127.0.0.1:5174/game.html?map=broken_bridge&prep=999&bots=1&size=8&res=32&audit=1&quality=low';
const {chromium}=await import('playwright');
const browser=await chromium.launch({headless:true,executablePath:browserExecutable()});

async function openPage(){
  const context=await browser.newContext({viewport:{width:1280,height:720}});
  const page=await context.newPage();
  await page.addInitScript('window.__name=v=>v');
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
  await page.goto(URL,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(700);await page.locator('.lobby-solo').click();
  await page.waitForFunction(()=>(window as any).__game?.activated,null,{timeout:120000});
  await page.evaluate(()=>{
    const g=(window as any).__game;
    g.forceStart();cancelAnimationFrame(g.raf);g.disposed=true;g.lite=true;
    // 固定随机源，回归可重复。
    g.rngState=1106;
  });
  return {page,errors,context};
}

function step(page:any,frames:number){return page.evaluate((frames:number)=>{
  const g=(window as any).__game,dt=1/60;
  for(let i=0;i<frames;i++){g.simulationNow+=dt*1000;g.simulate(dt);}
},frames);}

function shot(page:any,file:string,target:'house'|'all'){
  return page.evaluate(({target}:{target:'house'|'all'})=>{
    const g=(window as any).__game;
    const v=g.vehicles.find((v:any)=>v.kind==='light_tank'&&v.team==='orange');
    if(target==='house'&&v){
      // 三分之四视角跟拍坦克，画面里同时能看到红砖房与斜坡。
      g.camera.position.set(v.x-13,v.model.position.y+7,v.z+12);
      g.camera.lookAt(v.x,v.model.position.y+.8,v.z);
    }else{
      g.camera.position.set(120,70,250);g.camera.lookAt(150,2,200);
    }
    g.renderer.render(g.scene,g.camera);
  },{target}).then(()=>page.screenshot({path:file}));
}

const report:any={at:new Date().toISOString(),url:URL,scenarioA:null,scenarioB:null,errors:[]};

// ── a) 红房子斜坡：30 s ───────────────────────────────────────────────────────
{
  const {page,errors}=await openPage();
  const setup=await page.evaluate(()=>{
    const g=(window as any).__game;
    const v=g.vehicles.find((v:any)=>v.kind==='light_tank'&&v.team==='orange');
    const crew=[...g.hosted.values()].filter((h:any)=>h.bot&&h.team==='orange');
    for(const other of g.vehicles)if(other!==v){other.x=150;other.z=270;other.model.position.set(150,2,270);other.seats=other.seats.map(()=>null);}
    v.x=181;v.z=197;v.yaw=Math.PI;v.speed=0;v.steering=0;
    v.model.position.set(v.x,g.arena.vehicleGroundAt(v.x,v.z),v.z);v.model.rotation.set(0,v.yaw,0);
    v.seats[0]=crew[0]?.id??null;v.seats[1]=crew[1]?.id??null;
    for(const [seat,id] of v.seats.entries()){
      const bot=g.hosted.get(id);if(!bot)continue;
      bot.vehicleId=v.id;bot.vehicleSeat=seat;bot.vehicleBoardedAt=g.simulationNow-9000;
      bot.vehicleGoalsBlocked=undefined;bot.pilot=undefined;bot.objective='';bot.objectiveUntil=0;
    }
    return {vehicle:v.id,crew:v.seats.filter(Boolean),start:{x:v.x,z:v.z,yaw:v.yaw}};
  });
  await shot(page,`${OUT}/vehicle-ai-red-house-before.png`,'house');
  const result=await page.evaluate((startPos:{x:number;z:number})=>{
    const g=(window as any).__game,dt=1/60;
    const v=g.vehicles.find((v:any)=>v.kind==='light_tank'&&v.team==='orange');
    let stuck=0,worst=0,lx=v.x,lz=v.z,travel=0;
    for(let i=0;i<30*60;i++){
      g.simulationNow+=dt*1000;g.simulate(dt);
      const moved=Math.hypot(v.x-lx,v.z-lz);travel+=moved;lx=v.x;lz=v.z;
      // Match scenario B: arriving in a capture circle is legitimate holding,
      // not a terrain deadlock. Keep the same strict 6 s driving-stall budget.
      const driver=g.hosted.get(v.seats[0]),cap=g.caps.find((c:any)=>c.id===driver?.objective);
      const holding=!!cap&&Math.hypot(v.x-cap.x,v.z-cap.z)<cap.r*1.1;
        const gun=v.weapons[0],gunner=g.hosted.get(v.seats[1]),fighting=!!driver?.vehicleBraking&&!!gunner?.targetId&&g.simulationNow-gunner.lastSeen<550&&!!gun&&gun.lastFire>0&&g.simulationNow-gun.lastFire<6000;
      if(!holding&&!fighting&&moved<.002&&Math.abs(v.speed)<.5)stuck++;else stuck=0;
      worst=Math.max(worst,stuck);
    }
    const house={x0:186,x1:204,z0:182,z1:196};
    const bot=g.hosted.get(v.seats[0]);
    return {end:{x:+v.x.toFixed(2),z:+v.z.toFixed(2)},y:+v.model.position.y.toFixed(2),
      pitch:+v.model.rotation.x.toFixed(3),roll:+v.model.rotation.z.toFixed(3),
      displacement:+Math.hypot(v.x-startPos.x,v.z-startPos.z).toFixed(2),travel:+travel.toFixed(2),
      insideHouse:v.x>house.x0&&v.x<house.x1&&v.z>house.z0&&v.z<house.z1,
      // Same predicate as driving: the hull must not be overlapping geometry.
      embedded:!!g.vehiclePathBlocked(v,v.x,v.z,v.yaw),
      seats:v.seats.filter(Boolean).length,objective:bot?.objective??'',
      blockedGoals:(bot?.vehicleGoalsBlocked??[]).map((b:any)=>b.id),
      stuckSeconds:+(worst/60).toFixed(2)};
  },setup.start);
  await shot(page,`${OUT}/vehicle-ai-red-house-after.png`,'house');
  report.scenarioA={...setup,result,seconds:30,errors};
  await page.context().close();
}

// ── b) 全图 60 s 自然对局 ────────────────────────────────────────────────────
{
  const {page,errors}=await openPage();
  const result=await page.evaluate(()=>{
    const g=(window as any).__game,dt=1/60;
    // Deterministic crews for both tanks: the run measures vehicle AI, not whether
    // a random bot won the race to the pad.
    for(const team of ['blue','orange'] as const){
      const tank=g.vehicles.find((v:any)=>v.kind==='light_tank'&&v.team===team);
      if(!tank)continue;
      const pool=[...g.hosted.values()].filter((h:any)=>h.bot&&h.team===team&&!h.vehicleId);
      for(const seat of [0,1]){
        const bot=pool[seat];if(!bot||tank.seats[seat])continue;
        tank.seats[seat]=bot.id;bot.vehicleId=tank.id;bot.vehicleSeat=seat;
        bot.vehicleBoardedAt=g.simulationNow-9000;bot.pilot=undefined;bot.vehicleGoalsBlocked=undefined;
      }
    }
    const start=new Map(g.vehicles.map((v:any)=>[v.id,{x:v.x,z:v.z}]));
    const stats=new Map<string,{stuck:number;worst:number;lx:number;lz:number;travel:number;crewed:number}>();
    for(const v of g.vehicles)stats.set(v.id,{stuck:0,worst:0,lx:v.x,lz:v.z,travel:0,crewed:0});
    for(let i=0;i<3600;i++){
      g.simulationNow+=dt*1000;g.simulate(dt);
      for(const v of g.vehicles){
        const s=stats.get(v.id)!,moved=Math.hypot(v.x-s.lx,v.z-s.lz);
        s.lx=v.x;s.lz=v.z;s.travel+=moved;
        if(!v.seats[0])continue;
        s.crewed++;
        // Holding on a captured objective is intended, not a stall.
        const driver=g.hosted.get(v.seats[0]);
        const cap=g.caps.find((c:any)=>c.id===driver?.objective);
        const holding=!!cap&&Math.hypot(v.x-cap.x,v.z-cap.z)<cap.r*1.1;
        const gun=v.weapons[0],gunner=g.hosted.get(v.seats[1]),fighting=!!driver?.vehicleBraking&&!!gunner?.targetId&&g.simulationNow-gunner.lastSeen<550&&!!gun&&gun.lastFire>0&&g.simulationNow-gun.lastFire<6000;
        if(!holding&&!fighting&&moved<.002&&Math.abs(v.speed)<.5)s.stuck++;else s.stuck=0;
        s.worst=Math.max(s.worst,s.stuck);
      }
    }
    return g.vehicles.map((v:any)=>{
      const s=stats.get(v.id)!,st:any=start.get(v.id);
      return {id:v.id,kind:v.kind,team:v.team,crewedSeconds:+(s.crewed/60).toFixed(1),
        displacement:+Math.hypot(v.x-st.x,v.z-st.z).toFixed(1),travel:+s.travel.toFixed(1),
        worstStuck:+(s.worst/60).toFixed(2),end:[+v.x.toFixed(1),+v.z.toFixed(1)],health:Math.round(v.health)};
    });
  });
  report.scenarioB={seconds:60,vehicles:result,errors};
  await page.context().close();
}

await browser.close();
fs.writeFileSync(`${OUT}/vehicle-ai.json`,JSON.stringify(report,null,2));

// ── 判定 ────────────────────────────────────────────────────────────────────
const failures:string[]=[];
const a=report.scenarioA?.result;
if(!a)failures.push('scenario A 未运行');
else{
  if(a.displacement<25)failures.push(`红房子坦克 30 s 位移仅 ${a.displacement} m（要求 >25 m）`);
  if(a.insideHouse)failures.push('坦克中心位于红砖房占地内（已嵌入）');
  if(Math.abs(a.pitch)>.75||Math.abs(a.roll)>.75)failures.push(`车体姿态异常 pitch=${a.pitch} roll=${a.roll}`);
  if(a.stuckSeconds>6)failures.push(`坦克静止 ${a.stuckSeconds} s（要求 ≤6 s）`);
}
if(report.errors.length||report.scenarioA?.errors?.length||report.scenarioB?.errors?.length)failures.push('页面报错');
const crewed=(report.scenarioB?.vehicles??[]).filter((v:any)=>v.crewedSeconds>5);
for(const v of crewed){
  // 判定只看「有驾驶员时长期不动」这个死锁指标；主动下车换步兵不算卡死。
  if(v.worstStuck>8)failures.push(`${v.kind}（${v.team}）静止 ${v.worstStuck} s`);
}
if(!crewed.some((v:any)=>v.displacement>40))failures.push('全图 60 s 没有一辆载具真正跑起来（位移全部 <40 m）');
console.log(JSON.stringify({scenarioA:report.scenarioA?.result,scenarioB:report.scenarioB?.vehicles??[],failures},null,1));
if(failures.length){console.error('VEHICLE AI REGRESSION FAILED:',failures);process.exitCode=1;}
