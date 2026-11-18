import { browserExecutable } from './browser';
import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2] || process.env.AUDIT_OUT || 'docs/audit-2026-11-06/before.json';
const browser = await chromium.launch({headless:true, executablePath:browserExecutable()});
const page = await browser.newPage({viewport:{width:1280,height:720}});
const errors:string[]=[]; page.on('pageerror', e=>errors.push(e.message));
await page.addInitScript('window.__name = (v) => v');
await page.goto('http://127.0.0.1:5174/game.html?map=garden&prep=999&bots=0&seed=1106&audit=1');
await page.waitForTimeout(700);await page.locator('.lobby-solo').click();
await page.waitForFunction(()=>!!(window as any).__game, null, {timeout:60000});
await page.waitForFunction(()=>!document.querySelector('.game-loading'),null,{timeout:60000});
const results=await page.evaluate(async()=>{
 const g=(window as any).__game; cancelAnimationFrame(g.raf); g.disposed=true;g.forceStart();
 const T=await import(/* @vite-ignore */ String('/node_modules/three/build/three.module.js'));
 const checks:any[]=[]; const check=(id:string,pass:boolean,detail:any)=>checks.push({id,pass,detail});
 const r0=g.vehicles.map((v:any)=>({y:v.model.position.y,ground:g.arena.supportAt?.(v.x,v.z,(g.arena.navigationHeight?.(v.x,v.z)??g.arena.heightAt(v.x,v.z))+1.05)??g.arena.heightAt(v.x,v.z)}));
 check('V01',r0.every((v:any)=>Math.abs(v.y-v.ground)<0.5),r0);
 g.addPlayer('probe','PROBE', g.myTeam==='blue'?'orange':'blue'); const h=g.hosted.get('probe'),r=g.remotes.get('probe');
 r.rig.root.position.set(299,0,299); r.target.set(12,0,12); g.camera.position.set(10,2,10);g.updateRemotes(1/30);
 check('P15',r.rig.root.position.distanceTo(r.target)<400&&r.rig.root.position.x<299&&r.rig.root.visible,{pos:r.rig.root.position.toArray(),visible:r.rig.root.visible});
 g.phase='live';g.dead=true;g.overlayOpen=true; h.input.setKeys(['KeyW']);h.lastInput=performance.now();h.controller.position.set(150,g.arena.heightAt(150,280),280);h.yaw=0;const z=h.controller.position.z;
 // Exercise the actual tick, with a stable clock rather than a stale browser delta.
 if(h.pendingInputs)h.pendingInputs=Array.from({length:60},(_,i)=>({seq:i+1,keys:['KeyW'],yaw:0,pitch:0}));
 g.clock.getDelta=()=>1/60; for(let i=0;i<60;i++){h.lastInput=g.simulationNow;h.inputCredit=1;h.inputCreditAt=performance.now();g.tick();}check('N01',h.controller.position.z<z-2,{from:z,to:h.controller.position.z});
 const cap=g.caps[0];check('M03',Math.abs(cap.ring.position.y-(g.arena.navigationHeight?.(cap.x,cap.z)??g.arena.heightAt(cap.x,cap.z)))<0.5,{y:cap.ring.position.y,ground:g.arena.heightAt(cap.x,cap.z)});
 h.dead=true;h.respawnAt=performance.now()-1;h.overlayOpen=true;g.updateRespawns(performance.now());check('N02',h.dead,{dead:h.dead});
 // All necessary textures must be ready when loading disappears.
 let pending=0;g.arena.scene.traverse((o:any)=>{for(const m of (Array.isArray(o.material)?o.material:[o.material])) if(m?.map&&!m.map.image)pending++;});
 check('P01',pending===0&&!!g.scene.background?.image,{pending,sky:!!g.scene.background?.image});
 const v=g.vehicles[0];g.vehicles=[v];v.x=50;v.z=50;v.health=700;v.kind='mbt';v.team=h.team;v.destroyed=false;v.model.position.set(50,0,50);h.vehicleId=v.id;h.controller.position.set(50,0,50);h.dead=false;h.health=100;g.arena.scene=new T.Scene();g.arena.heightAt=()=>0;g.arena.rayDistance=()=>Infinity;
 const origin=new T.Vector3(50,1,40),dir=new T.Vector3(0,0,1);
 if(g.traceCombat) {const hit=g.traceCombat(origin,dir,160,g.localNetId);g.applyCombatHit(hit,g.localNetId,{armor:'bullet',damage:26,falloffStart:50,maxRange:160,minDamageScale:1},performance.now());}
 else {g.damageVehicleShot(origin,dir,26,g.localNetId);g.damagePlayers(origin,dir,g.localNetId,26,performance.now());}
 check('V04',h.health===100,{vehicle:v.health,occupant:h.health});
 return checks;
});
fs.writeFileSync(out,JSON.stringify({date:new Date().toISOString(),viewport:'1280x720',errors,results},null,2));
await browser.close();if(results.some((c:any)=>!c.pass)||errors.length)process.exitCode=1;console.log(JSON.stringify({out,results},null,2));
