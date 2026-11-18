import {browserExecutable} from './browser';
import {chromium,Page} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const outDir=process.argv[2]||`tmp/pharaoh-ao-${Date.now()}`;
fs.mkdirSync(outDir,{recursive:true});
const ev=(page:Page,code:string):Promise<any>=>page.evaluate(`(${code})()`);
const failures:string[]=[];
const fail=(id:string,detail:unknown)=>{failures.push(`${id}: ${JSON.stringify(detail)}`);};
const yawPitchTo=(dx:number,dy:number,dz:number)=>({yaw:Math.atan2(-dx,-dz),pitch:Math.asin(dy/Math.hypot(dx,dy,dz))});

// pos = 脚部位置（地面 +0.1），look = 视线目标。
// 金字塔 builder 内部坐标整体平移 (-140,-80)：local(330,690) → world(190,610)。
// 狮身/地道本来就是世界坐标。
const SHOTS:{id:string;pos:[number,number,number];look:[number,number,number];variants:('on'|'off'|'alloff'|'aomap')[]}[]=[
 {id:'pyr-chamber',pos:[190,5.1,600],look:[190,7,620],variants:['on','off','alloff','aomap']},
 {id:'pyr-chamber-pit',pos:[190,5.1,604],look:[190,3.5,612],variants:['on','aomap']},
 {id:'pyr-corridor',pos:[190,5.1,540],look:[190,5.5,480],variants:['on','aomap']},
 {id:'pyr-gallery',pos:[162,5.1,635],look:[208,6,636],variants:['on','aomap']},
 {id:'pyr-east-corridor',pos:[260,5.1,600],look:[318,5.5,600],variants:['on','aomap']},
 {id:'sphinx-hall',pos:[436,4.1,640],look:[478,7,640],variants:['on','off','alloff','aomap']},
 {id:'sphinx-ring',pos:[480,4.1,624.5],look:[436,5,624.5],variants:['on','aomap']},
 {id:'sphinx-rear',pos:[428,4.1,640],look:[388,5.5,640],variants:['on','aomap']},
 {id:'tunnel-exit-shaft',pos:[389,2.6,551],look:[396,3.5,549],variants:['on','off','aomap']},
 {id:'tunnel-deep',pos:[432.4,1.6,597.4],look:[420,3,606],variants:['on','off','aomap']},
 {id:'tunnel-mouth',pos:[310,5.1,600],look:[322,5.5,600],variants:['on','off','aomap']},
];

const setQuality=async(page:Page,q:string)=>{
 await ev(page,`()=>{window.__game.pauseLocal();}`);
 await page.waitForSelector('.pause-menu >> visible=true',{timeout:15000});
 await page.locator('.pause-menu').getByRole('button',{name:'设置',exact:true}).click();
 await page.waitForSelector('text=光影质量',{timeout:10000});
 await page.locator('label:has-text("光影质量") select').selectOption(q);
 await page.getByRole('button',{name:'关闭设置'}).click();
 await ev(page,`()=>{window.__game.paused=false;}`);
 await page.waitForTimeout(300);
};

const pose=async(page:Page,x:number,y:number,z:number,yaw:number,pitch:number)=>{
 await ev(page,`()=>{const g=window.__game;const c=g.controller;
  c.position.set(${x},${y},${z});c.velocity.set(0,0,0);c.mantle=null;c.crouched=false;c.prone=false;
  c.yaw=${yaw};c.pitch=${pitch};}`);
 await page.waitForTimeout(250);
};

const browser=await chromium.launch({headless:true,executablePath:browserExecutable()});
const page=await browser.newPage({viewport:{width:1280,height:720}});
const errors:string[]=[];
page.on('pageerror',(e:Error)=>errors.push(e.message));
page.on('console',(m:any)=>{const t=m.text();
 if(/THREE\.Clock|Multiple instances/i.test(t))return;
 if(m.type()==='error'||(m.type()==='warning'&&/THREE|Shader|WebGL|GL_|framebuffer|program|feedback/i.test(t)))errors.push(`[${m.type()}] ${t}`);});
await page.addInitScript('window.__name = (v) => v');
await page.goto(`http://127.0.0.1:5174/game.html?map=pharaoh&prep=999&bots=0&res=64&audit=1`);
await page.waitForTimeout(700);
await page.locator('.lobby-solo').click();
await page.waitForFunction(()=>!!(window as any).__game?.worldReady,null,{timeout:120000});
await page.waitForFunction(()=>!document.querySelector('.game-loading'),null,{timeout:90000});
await page.waitForTimeout(1500);
await setQuality(page,'ultra');
await page.waitForTimeout(1200);

const st=await ev(page,`()=>{const g=window.__game;const p=g.presentation.cinematicPipeline;
 const d=g.lightingDebug();
 return {q:d.quality,eff:d.effective,cine:!!p,ao:p?.lightingMaterial?.uniforms?.aoStrength?.value,
  root:!!g.arena.scene.getObjectByName('minecraft-voxel-world')};}`);
if(!(st.q==='ultra'&&st.cine&&st.ao>0))fail('ultra-state',st);
await ev(page,`()=>{const s=document.createElement('style');s.id='ao-hide';
 s.textContent='.game-hud,.nameplate-layer,.prep-overlay,.pause-backdrop{display:none!important}';
 document.head.appendChild(s);
 const g=window.__game;for(const c of g.caps){c.beam.visible=false;c.ring.visible=false;}}`);

const setAo=(page:Page,gtao:number,voxel:boolean,output=-1)=>ev(page,`()=>{const g=window.__game;
 const p=g.presentation.cinematicPipeline;
 p.lightingMaterial.uniforms.aoStrength.value=${gtao};
 p.gtao.output=${output};
 g.arena.scene.getObjectByName('minecraft-voxel-world').userData.setAmbientOcclusion(${voxel});}`);

for(const s of SHOTS){
 const aim=yawPitchTo(s.look[0]-s.pos[0],s.look[1]-s.pos[1]-1.65,s.look[2]-s.pos[2]);
 for(const v of s.variants){
  if(v==='on')await setAo(page,.65,true);
  else if(v==='off')await setAo(page,0,true);
  else if(v==='aomap')await setAo(page,.65,true,5);
  else await setAo(page,0,false);
  await pose(page,s.pos[0],s.pos[1],s.pos[2],aim.yaw,aim.pitch);
  await page.locator('canvas.game-canvas').screenshot({path:path.join(outDir,`${s.id}-ao-${v}.png`)});
 }
}
await setAo(page,.65,true,-1);
fs.writeFileSync(path.join(outDir,'state.json'),JSON.stringify({st,shots:SHOTS.map(s=>s.id)},null,2));
fs.writeFileSync(path.join(outDir,'failures.json'),JSON.stringify([...failures,...(errors.length?['errors: '+JSON.stringify(errors.slice(0,10))]:[])],null,2));
await browser.close();
console.log(`pharaoh-ao output: ${outDir}`);
if(failures.length||errors.length){console.log('FAIL',JSON.stringify([...failures,...errors.slice(0,10)]));process.exitCode=1;}else console.log('PASS');
