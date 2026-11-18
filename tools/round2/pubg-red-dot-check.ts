import fs from 'node:fs';import path from 'node:path';import {chromium} from 'playwright';
import {browserExecutable} from '../game/audit/browser';import {RED_DOT_REFERENCE} from '../../src/content/weapons/red-dot-profile';
const out=path.resolve('docs/red-dot-overlay-2026-11-07'),prefix=process.env.CAPTURE_PREFIX||'local',base=process.env.GAME_URL||'http://127.0.0.1:5175';fs.mkdirSync(out,{recursive:true});
const b=await chromium.launch({headless:true,executablePath:browserExecutable()}),p=await b.newPage({viewport:{width:1280,height:720}}),errors:string[]=[],rows:any[]=[];await p.addInitScript('window.__name=v=>v');p.on('pageerror',e=>errors.push(e.message));
await p.goto(base+'/game.html?map=docks&bots=0&prep=999&res=128&quality=medium');await p.waitForTimeout(700);await p.locator('.lobby-solo').click();await p.waitForFunction(()=>(window as any).__game?.worldReady,null,{timeout:90000});
await p.evaluate(()=>{const g=(window as any).__game;g.forceStart();cancelAnimationFrame(g.raf);g.paused=false;g.input.pointerLocked=true;g.bannerUntil=0;g.controller.teleport(g.controller.position.clone().set(145,g.arena.navigationHeight(145,275),275),0);});
for(const weapon of ['m16','m4a1','akm','mk14','awm','uzi','vector','ump45','mp5','m870','m249']){
 rows.push(await p.evaluate(weapon=>{const g=(window as any).__game;g.phase='prep';g.setLoadout({...g.selection,weaponId:weapon,opticId:'red_dot'});g.phase='live';g.input.clear();g.input.mouse.right=true;g.adsIntent=false;g.lastRight=false;
  for(let i=0;i<150;i++){g.simulationNow+=1000/60;g.simulate(1/60);}g.callbacks.onHud(g.hudState(g.simulationNow));g.presentation.render(g.renderer,g.scene,g.camera,g.viewmodel);
  const vm=g.viewmodel,optic=vm.opticDefinition,point=g.controller.position.clone();optic.lens.getWorldPosition(point);point.project(vm.camera);let triangles=0;vm.scene.traverse((o:any)=>{if(o.isMesh)triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;});
  const profile=optic.group.userData.redDotProfile,project=(pts:number[][])=>pts.map(([x,y])=>{const v=g.controller.position.clone().set(x,y+profile.height,profile.z);optic.group.localToWorld(v);v.project(vm.camera);return [(v.x+1)*640,(1-v.y)*360];});
  const gl=g.renderer.getContext(),pixel=new Uint8Array(4);gl.readPixels(640,360,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
  return{weapon,ads:g.ads,error:Math.hypot(point.x*640,point.y*360),triangles,centerPixel:Array.from(pixel),outer:project(profile.outer),inner:project(profile.inner)};
 },weapon));
 if(weapon==='m16'){await p.screenshot({path:out+'/'+prefix+'-ads.png'});await p.evaluate(()=>{const g=(window as any).__game;g.input.mouse.right=false;g.adsIntent=false;for(let i=0;i<100;i++){g.simulationNow+=1000/60;g.simulate(1/60);}g.presentation.render(g.renderer,g.scene,g.camera,g.viewmodel);});await p.screenshot({path:out+'/'+prefix+'-hip.png'});}
}
const identity=await(await p.request.get(base+'/version.json?verify='+Date.now())).json();
fs.writeFileSync(out+'/'+prefix+'-validation.json',JSON.stringify({identity,reference:RED_DOT_REFERENCE,base,rows,errors},null,2));await b.close();
console.log(JSON.stringify({identity,errors,maxAlignment:Math.max(...rows.map(r=>r.error)),maxTriangles:Math.max(...rows.map(r=>r.triangles))}));
if(errors.length||rows.some(r=>r.error>1||!r.ads||r.triangles>12000||r.centerPixel[0]<200||r.centerPixel[1]<120))process.exitCode=1;
