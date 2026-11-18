import fs from 'node:fs';import path from 'node:path';import {browserExecutable} from '../game/audit/browser';
process.env.PLAYWRIGHT_BROWSERS_PATH='/private/tmp/crazyshoot-browsers';const{chromium}=await import('playwright');
const out=path.resolve('docs/refinement-2026-11-07');fs.mkdirSync(out+'/optics',{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:browserExecutable()}),context=await browser.newContext({viewport:{width:1280,height:720},recordVideo:{dir:out+'/video',size:{width:1280,height:720}}}),page=await context.newPage();
await page.addInitScript('window.__name=v=>v');const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const base=process.env.GAME_URL||'http://127.0.0.1:5175';
await page.goto(base+'/game.html?map=docks&bots=0&prep=999&res=128&quality=medium');await page.waitForTimeout(700);await page.locator('.lobby-solo').click();await page.waitForFunction(()=>(window as any).__game?.worldReady,null,{timeout:90000});
await page.evaluate(()=>{const g=(window as any).__game;g.forceStart();g.paused=false;g.input.pointerLocked=true;g.bannerUntil=0;g.controller.teleport(g.controller.position.clone().set(145,g.arena.navigationHeight(145,275),275),0);});
const optics=['iron','red_dot','holo','2x','3x','4x','6x','8x'],matrix:any[]=[];
for(const optic of optics){
 await page.evaluate(optic=>{const g=(window as any).__game;g.phase='prep';g.setLoadout({...g.selection,weaponId:'m16',opticId:optic});g.phase='live';g.input.clear();g.input.mouse.right=true;g.paused=false;g.input.pointerLocked=true;g.adsIntent=false;g.lastRight=false;},optic);await page.waitForTimeout(1000);
 matrix.push(await page.evaluate(optic=>{const g=(window as any).__game,vm=g.viewmodel,lens=vm.opticDefinition.lens;let error=0;if(lens){const v=g.controller.position.clone();lens.getWorldPosition(v);v.project(vm.camera);error=Math.hypot(v.x*640,v.y*360);}g.presentation.render(g.renderer,g.scene,g.camera,vm);const gl=g.renderer.getContext(),pixel=new Uint8Array(4);gl.readPixels(640,360,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return{optic,fov:g.camera.fov,ads:g.ads,error,centerPixel:Array.from(pixel),calls:g.renderer.info.render.calls};},optic));
 await page.screenshot({path:out+'/optics/'+optic+'.png'});
}
// Record actual three-shot trigger bursts, not direct calls to fire or fake camera motion.
await page.evaluate(()=>{const g=(window as any).__game;g.phase='prep';g.setLoadout({...g.selection,weaponId:'m16',opticId:'red_dot'});g.phase='live';g.input.clear();g.adsIntent=false;g.lastRight=false;g.ammo=30;g.reserve=120;g._recoilTrace=[];const simulate=g.simulate.bind(g);g.simulate=(dt:number)=>{simulate(dt);g._recoilTrace.push({time:g.simulationNow,pitch:g.recoilPitch,yaw:g.recoilYaw,gun:g.viewmodel.group.rotation.toArray().slice(0,3),z:g.viewmodel.group.position.z,ammo:g.ammo,ads:g.ads});};});
await page.waitForTimeout(800);
for(let i=0;i<5;i++){await page.evaluate(()=>(window as any).__game.input.mouse.left=true);await page.waitForTimeout(110);await page.evaluate(()=>(window as any).__game.input.mouse.left=false);await page.waitForTimeout(230);}
await page.waitForTimeout(800);await page.evaluate(()=>(window as any).__game.input.mouse.right=true);await page.waitForTimeout(800);
for(let i=0;i<5;i++){await page.evaluate(()=>(window as any).__game.input.mouse.left=true);await page.waitForTimeout(110);await page.evaluate(()=>(window as any).__game.input.mouse.left=false);await page.waitForTimeout(230);}
await page.waitForTimeout(1200);
const recoil=await page.evaluate(()=>{const g=(window as any).__game,t=g._recoilTrace,ads=t.filter((r:any)=>r.ads),hip=t.filter((r:any)=>!r.ads),range=(key:string,rows:any[])=>[Math.min(...rows.map(r=>r[key])),Math.max(...rows.map(r=>r[key]))].map(v=>v*180/Math.PI);return{samples:t,roundsFired:30-g.ammo,adsPitchDegrees:range('pitch',ads),adsYawDegrees:range('yaw',ads),hipYawDegrees:range('yaw',hip),settled:{pitch:g.recoilPitch,yaw:g.recoilYaw},failed:g.frameFailed};});
const buildInfo=await(await page.request.get(base+'/version.json')).json();
fs.writeFileSync(out+'/validation.json',JSON.stringify({buildInfo,matrix,recoil,errors},null,2));const video=page.video();await context.close();await video!.saveAs(out+'/optics-and-m16.webm');await browser.close();
console.log(JSON.stringify({buildInfo,matrix,recoil:{...recoil,samples:recoil.samples.length},errors}));
if(errors.length||matrix.some(x=>!x.ads||x.error>1)||recoil.roundsFired!==30||recoil.failed)process.exitCode=1;
