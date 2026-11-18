import {browserExecutable} from './browser';
import {chromium,Page} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const args=new Set(process.argv.slice(2));
const mode=[...args].find(a=>a.startsWith('--mode='))?.split('=')[1]??'before';
const outDir=[...args].find(a=>!a.startsWith('--'))??`tmp/battlefield-look-${Date.now()}`;
const recipeFile=path.join(outDir,'recipes.json');
fs.mkdirSync(outDir,{recursive:true});
const ev=(page:Page,code:string):Promise<any>=>page.evaluate(`(${code})()`);
const shot=(page:Page,name:string)=>page.locator('canvas.game-canvas').screenshot({path:path.join(outDir,name)});
const failures:string[]=[];
const fail=(id:string,detail:unknown)=>{failures.push(`${id}: ${JSON.stringify(detail)}`);};
const url=(q:string)=>`http://127.0.0.1:5174/game.html?${q}&audit=1`;
const yawPitchTo=(dx:number,dy:number,dz:number)=>({yaw:Math.atan2(-dx,-dz),pitch:Math.asin(dy/Math.hypot(dx,dy,dz))});
const hide=`()=>{if(!document.getElementById('look-hide')){const s=document.createElement('style');s.id='look-hide';s.textContent='.game-hud,.nameplate-layer,.prep-overlay{display:none!important}';document.head.appendChild(s);}}`;
const unhide=`()=>{document.getElementById('look-hide')?.remove();}`;
const setQuality=async(page:Page,q:string,motionBlur?:boolean)=>{
 let menuOpened=false;
 for(let a=0;a<3&&!menuOpened;a++){
  await ev(page,`()=>{window.__game.pauseLocal();}`);
  try{await page.waitForSelector('.pause-menu >> visible=true',{timeout:8000});menuOpened=true;}catch{}
 }
 if(!menuOpened){
  const dbg=await ev(page,`()=>{const g=window.__game;const b=document.querySelector('.pause-backdrop');const m=document.querySelector('.pause-menu');
   return {paused:g.paused,phase:g.phase,loading:!!document.querySelector('.game-loading'),fault:document.querySelector('.game-fault')?.textContent??null,
    menu:!!m,menuDisplay:m?getComputedStyle(m).display:null,backdrop:!!b,bdDisplay:b?getComputedStyle(b).display:null,
    bdStyle:b?b.getAttribute('style'):null,bdOuter:b?b.outerHTML.slice(0,220):null,lookHide:!!document.getElementById('look-hide')};}`);
  throw new Error(`pause menu did not open ${JSON.stringify(dbg)}`);
 }
 await page.locator('.pause-menu').getByRole('button',{name:'设置',exact:true}).click();
 await page.waitForSelector('text=光影质量',{timeout:10000});
 await page.locator('label:has-text("光影质量") select').selectOption(q);
 if(motionBlur!==undefined&&q==='ultra'){
  const box=page.locator('label:has-text("动态模糊") input[type=checkbox]');
  if(await box.count())await box.setChecked(motionBlur);
 }
 await page.getByRole('button',{name:'关闭设置'}).click();
 await ev(page,`()=>{window.__game.paused=false;}`);
 await page.waitForTimeout(300);
};
const pose=async(page:Page,x:number,y:number,z:number,yaw:number,pitch:number)=>{
 await ev(page,`()=>{const g=window.__game;const c=g.controller;
  c.position.set(${x},${y},${z});c.velocity.set(0,0,0);c.yaw=${yaw};c.pitch=${pitch};}`);
 await page.waitForTimeout(200);
};
const freeze=async(page:Page)=>ev(page,`()=>{const g=window.__game;if(!g.__frozenNow){g.__realNow=performance.now.bind(performance);const t=performance.now();g.__frozenNow=t;performance.now=()=>t;}}`);
const thaw=async(page:Page)=>ev(page,`()=>{const g=window.__game;if(g.__frozenNow!==undefined){performance.now=g.__realNow;delete g.__frozenNow;delete g.__realNow;}}`);

async function openGame(browser:any,q:string){
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 const errors:string[]=[];
 page.on('pageerror',(e:Error)=>errors.push(e.message));
 page.on('console',(m:any)=>{const t=m.text();
  if(m.type()==='error'||(m.type()==='warning'&&/THREE|Shader|WebGL|GL_|framebuffer|program/i.test(t))){
   if(!/THREE\.Clock|Multiple instances/i.test(t))errors.push(`[${m.type()}] ${t}`);}});
 await page.addInitScript('window.__name = (v) => v');
 await page.goto(url(q));
 await page.waitForTimeout(700);
 await page.locator('.lobby-solo').click();
 await page.waitForFunction(()=>!!(window as any).__game,null,{timeout:90000});
 await page.waitForFunction(()=>!document.querySelector('.game-loading'),null,{timeout:90000});
 return {page,errors};
}

interface Recipe{map:string;pos:[number,number,number];look:[number,number,number];note?:string}
const recipes:Record<string,Recipe>=mode==='after'&&fs.existsSync(recipeFile)?JSON.parse(fs.readFileSync(recipeFile,'utf8')):{};

const browser=await chromium.launch({headless:true,executablePath:browserExecutable()});

async function capture(page:Page,name:string,r:Recipe,settle=400){
 const aim=yawPitchTo(r.look[0]-r.pos[0],r.look[1]-(r.pos[1]+1.6),r.look[2]-r.pos[2]);
 await pose(page,r.pos[0],r.pos[1]+0.1,r.pos[2],aim.yaw,aim.pitch);
 await page.waitForTimeout(settle);
 await freeze(page);
 await shot(page,name);
 await thaw(page);
}

{
 const {page,errors}=await openGame(browser,'map=garden&prep=999&bots=0&seed=1106&res=64');
 await page.waitForTimeout(1500);
 if(mode==='before'){
  const cam=await ev(page,`()=>{const g=window.__game;const p=g.controller.position;
   return {x:p.x,z:p.z,y:g.arena.heightAt(p.x,p.z),sun:g.sunDirection.toArray()};}`);
  const away=yawPitchTo(-cam.sun[0]*0.4-1,0.06,-cam.sun[2]*0.4+0.3);
  recipes['garden-outdoor']={map:'garden',pos:[cam.x,cam.y,cam.z],look:[cam.x-Math.sin(away.yaw)*Math.cos(away.pitch)*40,cam.y+1.6+Math.sin(away.pitch)*40,cam.z-Math.cos(away.yaw)*Math.cos(away.pitch)*40],note:'same fixed outdoor pose as lighting tier shots'};
  recipes['garden-doorway']={map:'garden',pos:[97,9,200.5],look:[97,10.5,198.5],note:'roofed room looking across door'};
 }
 await setQuality(page,'high');
 await ev(page,hide);
 for(const key of Object.keys(recipes).filter(k=>k.startsWith('garden')))await capture(page,`${mode}-high-${key}.png`,recipes[key]);
 await setQuality(page,'ultra',true);
 await page.waitForTimeout(2200);
 for(const key of Object.keys(recipes).filter(k=>k.startsWith('garden')))await capture(page,`${mode}-ultra-${key}.png`,recipes[key]);
 if(mode==='after'&&recipes['garden-doorway']){
  await ev(page,`()=>{window.__game.presentation.cinematicPipeline.bloom.strength=0;}`);
  await capture(page,'after-ultra-doorway-nobloom.png',recipes['garden-doorway'],400);
  await ev(page,`()=>{window.__game.presentation.cinematicPipeline.bloom.strength=.3;}`);
  await ev(page,`()=>{window.__game.arena.scene.traverse(o=>{if(o.name==='battlefield-sun-disc')o.visible=false;});}`);
  await capture(page,'after-ultra-doorway-nosun.png',recipes['garden-doorway'],400);
  await ev(page,`()=>{window.__game.arena.scene.traverse(o=>{if(o.name==='battlefield-sun-disc')o.visible=true;});}`);
 }
 if(errors.length)fail('garden-errors',errors.slice(0,10));
 await page.close();
}
{
 const {page,errors}=await openGame(browser,'map=training&prep=999&bots=0&seed=1106&res=64');
 await page.waitForTimeout(1500);
 if(mode==='before'){
  const spot=await ev(page,`()=>{const g=window.__game;
   const x=9,z=19,y=g.arena.supportAt?.(x,z,3)??g.arena.heightAt(x,z);
   return Number.isFinite(y)?{x,y,z}:null;}`);
  if(!spot)fail('training-spot','no floor');
  else recipes['training-closeup']={map:'training',pos:[spot.x,spot.y,spot.z],look:[13.5,1.5,14.5],note:'container/concrete closeup'};
 }
 await setQuality(page,'high');
 await ev(page,hide);
 if(recipes['training-closeup'])await capture(page,`${mode}-high-training-closeup.png`,recipes['training-closeup']);
 await setQuality(page,'ultra',true);
 await page.waitForTimeout(2200);
 if(recipes['training-closeup'])await capture(page,`${mode}-ultra-training-closeup.png`,recipes['training-closeup']);
 if(mode==='after'){
  const pair=await ev(page,`()=>{const g=window.__game;
   const x=11.5,z=18.5,y=g.arena.supportAt?.(x,z,3)??g.arena.heightAt(x,z);
   return Number.isFinite(y)?{x,y,z}:null;}`);
  if(pair){
   recipes['training-material-pair']={map:'training',pos:[pair.x,pair.y,pair.z],look:[14.5,1.6,13.5],note:'grazing view of container plus adjacent walls for normal/roughness on-off pair'};
   await capture(page,'after-ultra-training-material-pair.png',recipes['training-material-pair']);
  }else fail('training-pair','no spot');
 }
 if(errors.length)fail('training-errors',errors.slice(0,10));
 await page.close();
}
{
 const {page,errors}=await openGame(browser,'map=docks&prep=999&bots=0&seed=1106&res=64');
 await page.waitForTimeout(1500);
 if(mode==='before'){
  const spot=await ev(page,`()=>{const g=window.__game;
   for(let r=0;r<=18;r+=3)for(let a=0;a<16;a++){
    const x=246+Math.cos(a/16*Math.PI*2)*r,z=120+Math.sin(a/16*Math.PI*2)*r;
    const y=g.arena.heightAt(x,z);
    if(!Number.isFinite(y))continue;
    if(g.arena.playerBlocked?.(x,z,.45,y+.1))continue;
    const w=g.arena.waterAt?.(x+8,z+4);
    if(!w)continue;
    return {x,y,z,wx:x+8,wz:z+4,ws:w.surface};
   }return null;}`);
  if(!spot)fail('docks-shore','no shoreline');
  else recipes['docks-shore']={map:'docks',pos:[spot.x,spot.y,spot.z],look:[spot.wx+18,spot.ws,spot.wz+26],note:'shore looking across water toward crane/warehouse'};
 }
 await setQuality(page,'high');
 await ev(page,hide);
 if(recipes['docks-shore'])await capture(page,`${mode}-high-docks-shore.png`,recipes['docks-shore']);
 await setQuality(page,'ultra',true);
 await page.waitForTimeout(2200);
 if(recipes['docks-shore']){
  await capture(page,`${mode}-ultra-docks-shore.png`,recipes['docks-shore']);
  const r=recipes['docks-shore'];
  const shifted={...r,pos:[r.pos[0]+3.5,r.pos[1],r.pos[2]+2] as [number,number,number]};
  await capture(page,`${mode}-ultra-docks-shore-shift.png`,shifted);
 }
 if(mode==='after'){
  const depth=await ev(page,`()=>window.__game.presentation.cinematicPipeline?.debugWaterDepth(window.__game.renderer)??null`);
  fs.writeFileSync(path.join(outDir,'after-water-depth.json'),JSON.stringify({depth},null,2));
  if(depth&&depth.min>=.999)fail('water-depth',depth);
  const st=await ev(page,`()=>{const g=window.__game;const r=g.renderer;const gl=r.getContext();
   const ext=gl.getExtension('WEBGL_debug_renderer_info');
   const p=g.presentation.cinematicPipeline;const w=p.waterState;
   const shadows=g.cinematicShadows?.shadowEntries?.map(e=>({map:!!e.map,dist:e.distance,bias:e.bias}));
   return {renderer:{vendor:ext?gl.getParameter(ext.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),
     renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)},
    lighting:g.arena.scene.getObjectByName('minecraft-voxel-world')?.userData.lightingState?.()??null,
    water:w,gradeStrength:p.gradeDebug.gradeStrength.value,surface:p.surfaceDebug.value,shadows};}`);
  fs.writeFileSync(path.join(outDir,'after-ultra-state.json'),JSON.stringify(st,null,2));
 }
 if(errors.length)fail('docks-errors',errors.slice(0,10));
 await page.close();
}
{
 const {page,errors}=await openGame(browser,'map=broken_bridge&prep=999&bots=0&seed=1106&res=64');
 await page.waitForTimeout(1500);
 if(mode==='before'){
  const spot=await ev(page,`()=>{const g=window.__game;
   for(let r=0;r<=16;r+=2)for(let a=0;a<16;a++){
    const x=115+Math.cos(a/16*Math.PI*2)*r,z=150+Math.sin(a/16*Math.PI*2)*r;
    const y=g.arena.heightAt(x,z);
    if(!Number.isFinite(y))continue;
    if(g.arena.playerBlocked?.(x,z,.45,y+.1))continue;
    const w=g.arena.waterAt?.(130,150)??g.arena.waterAt?.(x+10,z);
    if(!w)continue;
    return {x,y,z,ws:w.surface};
   }return null;}`);
  if(!spot)fail('bridge-bank','no bank');
  else{
   recipes['bridge-bank']={map:'broken_bridge',pos:[spot.x,spot.y,spot.z],look:[130,spot.ws+1.5,150],note:'low bank view of bridge over water'};
   recipes['bridge-high']={map:'broken_bridge',pos:[spot.x,spot.y+6,spot.z],look:[130,spot.ws-2,150],note:'elevated view down to water depth'};
  }
 }
 await setQuality(page,'high');
 await ev(page,hide);
 for(const key of ['bridge-bank','bridge-high'])if(recipes[key])await capture(page,`${mode}-high-${key}.png`,recipes[key]);
 await setQuality(page,'ultra',true);
 await page.waitForTimeout(2200);
 for(const key of ['bridge-bank','bridge-high'])if(recipes[key])await capture(page,`${mode}-ultra-${key}.png`,recipes[key]);
 if(mode==='after'){
  const above=await ev(page,`()=>{const g=window.__game;
   let water=null;
   for(let x=105;x<=155;x+=3)for(let z=130;z<=175;z+=3){
    const w=g.arena.waterAt?.(x,z);
    if(w&&(!water||w.surface>water.ws))water={x,z,ws:w.surface,wb:w.bottom};
   }
   if(!water)return {water:null};
   for(let r=2;r<=30;r+=2)for(let a=0;a<24;a++){
    const x=water.x+Math.cos(a/24*Math.PI*2)*r,z=water.z+Math.sin(a/24*Math.PI*2)*r;
    const y=g.arena.heightAt(x,z);
    if(!Number.isFinite(y))continue;
    if(y<water.ws+.6)continue;
    if(g.arena.playerBlocked?.(x,z,.45,y+.1))continue;
    return {x,y,z,ws:water.ws,wx:water.x,wz:water.z};
   }return {water,spot:null};}`);
  if(above?.x!==undefined){
   recipes['bridge-bank-above']={map:'broken_bridge',pos:[above.x,above.y,above.z],look:[above.wx,above.ws+1.5,above.wz],note:'above-water bank view of bridge, added after underwater pose found'};
   await capture(page,'after-ultra-bridge-bank-above.png',recipes['bridge-bank-above']);
  }else fail('bridge-bank-above',above);
 }
 if(errors.length)fail('bridge-errors',errors.slice(0,10));
 await page.close();
}
if(mode==='after'){
 const {page,errors}=await openGame(browser,'map=training&prep=999&bots=0&seed=1106&res=64');
 await page.waitForTimeout(1500);
 await setQuality(page,'ultra',true);
 await ev(page,hide);
 const r=recipes['training-material-pair']??recipes['training-closeup']??recipes['garden-outdoor'];
 if(r){
  await capture(page,'after-grade-on.png',r,900);
  await ev(page,`()=>{window.__game.presentation.cinematicPipeline.gradeDebug.gradeStrength.value=0;}`);
  await capture(page,'after-grade-off.png',r,300);
  await ev(page,`()=>{window.__game.presentation.cinematicPipeline.gradeDebug.gradeStrength.value=1;}`);
  await ev(page,`()=>{window.__game.presentation.cinematicPipeline.surfaceDebug.value=0;}`);
  await capture(page,'after-surface-off.png',r,300);
  await ev(page,`()=>{window.__game.presentation.cinematicPipeline.surfaceDebug.value=1;}`);
  await capture(page,'after-surface-on.png',r,300);
 }
 if(r){
  await ev(page,`()=>{const g=window.__game;const orig=g.renderFrame.bind(g);g.renderFrame=(n)=>{g.controller.yaw+=0.045;orig(n);};window.__auditUnwind=()=>{g.renderFrame=orig;};}`);
  await page.waitForTimeout(400);
  const duringOn=await ev(page,`()=>window.__game.presentation.cinematicPipeline?.blurMaterial?.uniforms?.strength?.value??0`);
  await shot(page,'after-motion-on.png');
  await ev(page,`()=>{window.__auditUnwind?.();delete window.__auditUnwind;}`);
  await setQuality(page,'ultra',false);
  await ev(page,`()=>{const g=window.__game;const orig=g.renderFrame.bind(g);g.renderFrame=(n)=>{g.controller.yaw+=0.045;orig(n);};window.__auditUnwind=()=>{g.renderFrame=orig;};}`);
  await page.waitForTimeout(400);
  const duringOff=await ev(page,`()=>window.__game.presentation.cinematicPipeline?.blurMaterial?.uniforms?.strength?.value??0`);
  await shot(page,'after-motion-off.png');
  await ev(page,`()=>{window.__auditUnwind?.();delete window.__auditUnwind;}`);
  await setQuality(page,'ultra',true);
  await shot(page,'after-motion-static.png');
  fs.writeFileSync(path.join(outDir,'after-motion.json'),JSON.stringify({duringOn,duringOff},null,2));
  if(!(duringOn>0))fail('motion-strength-on',duringOn);
  if(duringOff!==0)fail('motion-strength-off',duringOff);
 }
 const swatch=await ev(page,`async()=>{const g=window.__game;
  const mod=await import('/src/game/rendering/battlefield-grade.ts');
  const THREE=await import('/node_modules/three/build/three.module.js').catch(()=>null);
  const T=THREE??await import('three');
  const r=g.renderer;
  const inputs=[0,.001,.002,.005,.01,.02,.04,.06,.1,.2,.42,.6,.82,.9,1];
  const mat=new T.ShaderMaterial({depthTest:false,depthWrite:false,
   uniforms:{swatch:{value:0},gradeStrength:{value:1},gradeContrast:{value:mod.GRADE.contrast},gradePivot:{value:mod.GRADE.pivot},
    gradeSaturation:{value:mod.GRADE.saturation},gradeShadowLift:{value:mod.GRADE.shadowLift},gradeKnee:{value:mod.GRADE.shoulderKnee},
    gradeKneeSoft:{value:mod.GRADE.shoulderSoftness},gradeWarm:{value:new T.Vector3(...mod.GRADE.warmHighlight)},
    gradeCool:{value:new T.Vector3(...mod.GRADE.coolShadow)},gradeSplitPivot:{value:mod.GRADE.splitPivot},gradeGreen:{value:mod.GRADE.greenDesat}},
   vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
   fragmentShader:'uniform float swatch;'+mod.BATTLEFIELD_GRADE_GLSL+'void main(){gl_FragColor=vec4(battlefieldGrade(vec3(swatch),vec3(swatch)),1.0);}'});
  const sc=new T.Scene();sc.add(new T.Mesh(new T.PlaneGeometry(2,2),mat));
  const cam=new T.OrthographicCamera(-1,1,1,-1,0,1);
  const rt=new T.WebGLRenderTarget(1,1,{type:T.FloatType});
  const prev=r.getRenderTarget();
  const out=[];
  try{for(const v of inputs){mat.uniforms.swatch.value=v;r.setRenderTarget(rt);r.render(sc,cam);
   const px=new Float32Array(4);r.readRenderTargetPixels(rt,0,0,1,1,px);out.push(px[0]);}
  }finally{r.setRenderTarget(prev);rt.dispose();mat.dispose();}
  return {out};}`).catch((e:Error)=>({error:String(e)}));
 fs.writeFileSync(path.join(outDir,'after-grade-swatch.json'),JSON.stringify(swatch,null,2));
 if(swatch?.error)fail('grade-swatch',swatch.error);
 if(swatch?.out){
  const o=swatch.out as number[];
  const bad=o.findIndex(v=>!(Number.isFinite(v)&&v>=0));
  if(bad>=0)fail('grade-swatch-finite',{i:bad,v:o[bad]});
  for(let i=1;i<o.length;i++)if(!(o[i]>o[i-1]))fail('grade-swatch-monotonic',{i,o});
 }
 await ev(page,`()=>{const g=window.__game;g.forceStart();g.armed=true;g.viewmodel.setEquipped(true);}`);
 const spawnInfo=await ev(page,`()=>{const g=window.__game;const b=g.arena.bounds;
  g.controller.teleport(g.arena.spawn,g.arena.spawnYaw);
  const p=g.controller.position;
  return {x:p.x,y:p.y,z:p.z,yaw:g.arena.spawnYaw,
   finite:Number.isFinite(p.x)&&Number.isFinite(p.y)&&Number.isFinite(p.z),
   inBounds:!b||(p.x>=b.minX&&p.x<=b.maxX&&p.z>=b.minZ&&p.z<=b.maxZ),
   blocked:!!g.arena.playerBlocked?.(p.x,p.z,.45,p.y+.1,1.8,g.localNetId)};}`);
 if(!(spawnInfo.finite&&spawnInfo.inBounds&&!spawnInfo.blocked))fail('ads-spawn',spawnInfo);
 await page.waitForTimeout(900);
 const ads=await ev(page,`async()=>{const g=window.__game;const c=g.controller;const v=g.viewmodel;
  const read=()=>({ads:v.adsAmount,fov:g.camera.fov,phase:g.phase,dead:g.dead,paused:g.paused,overlay:g.overlayOpen,
   mapOpen:g.mapOpen,locked:g.input.pointerLocked,right:g.input.mouse.right,adsIntent:g.adsIntent,aiming:c?.aiming,
   blocked:v.blocked,mantle:!!c?.mantle,climbing:!!c?.climbing,reloading:v?.isReloading??null,
   engReload:g.reloading??null,equipped:v?.group?.visible??null,obstruction:v?.obstructionTarget??null,
   keysDown:g.input?.keys?.size??null,winner:String(g.winner),susp:g.hostSuspended,driving:!!g.drivingId,
   adsHold:g.settings?.adsHold??null});
  for(let a=0;a<3;a++){
   g.paused=false;g.overlayOpen=false;g.input.mouse.right=false;g.adsIntent=false;
   await new Promise(r=>setTimeout(r,150));
   g.input.pointerLocked=true;g.input.mouse.right=true;
   for(let i=0;i<40;i++){if(v.adsAmount>0.95)return read();await new Promise(r=>setTimeout(r,90));}
  }
  return read();}`);
 fs.writeFileSync(path.join(outDir,'after-ads-state.json'),JSON.stringify({spawnInfo,ads},null,2));
 if(!(ads.ads>.95&&ads.fov<74))fail('ads-state',ads);
 await shot(page,'after-ads.png');
 await ev(page,`()=>{const g=window.__game;g.input.mouse.right=false;g.input.pointerLocked=false;g.adsIntent=false;}`);
 if(errors.length)fail('after-errors',errors.slice(0,10));
 await page.close();
}
if(mode==='before')fs.writeFileSync(recipeFile,JSON.stringify(recipes,null,2));
fs.writeFileSync(path.join(outDir,'failures.json'),JSON.stringify(failures,null,2));
await browser.close();
console.log(failures.length?`FAILURES(${failures.length}):\n - ${failures.join('\n - ')}`:`${mode.toUpperCase()} capture done: ${outDir}`);
process.exitCode=failures.length?1:0;
