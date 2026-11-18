import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { browserExecutable } from './browser';

const base = process.env.CRAZYSHOOT_BASE_URL ?? 'http://127.0.0.1:5174';
const browsers = await Promise.all([0,1].map(() => chromium.launch({headless:true,executablePath:browserExecutable()})));
const [host, guest] = await Promise.all(browsers.map(b => b.newPage({viewport:{width:900,height:600}})));
const errors:string[] = [];

try {
  for(const page of [host,guest]){
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(`${base}/game.html?map=garden&size=4&bots=0&quality=low&res=32&prep=60`);
  }
  await host.getByRole('button',{name:/创建房间/}).click();
  await host.waitForFunction(()=>/^\d{4}$/.test(document.querySelector('.lobby-code')?.textContent?.trim()??''));
  await guest.getByRole('textbox',{name:'房间码'}).fill((await host.locator('.lobby-code').innerText()).trim());
  await guest.getByRole('button',{name:'加入',exact:true}).click();
  await host.locator('.lobby-primary.start').click();
  await Promise.all([host,guest].map(p=>p.waitForFunction(()=>(window as any).__game?.activated,null,{timeout:90000})));
  await host.evaluate(()=>(window as any).__game.forceStart());
  await guest.waitForFunction(()=>(window as any).__game.phase==='live');
  const id=await guest.evaluate(()=>(window as any).__game.localNetId as string);

  async function place(x:number,z:number,yaw=0,depth?:number) {
    const point=await host.evaluate(({id,x,z,yaw,depth})=>{
      const g=(window as any).__game,h=g.hosted.get(id);
      const w=g.arena.waterAt(x,z);
      const y=depth===undefined?g.arena.navigationHeight(x,z):w.surface-depth;
      h.input.clear();h.pendingInputs=[];h.yaw=yaw;h.pitch=0;
      h.controller.teleport(h.controller.position.clone().set(x,y,z),yaw);
      return {x,y,z,surface:w?.surface};
    },{id,x,z,yaw,depth});
    await guest.waitForFunction(p=>{
      const pos=(window as any).__game.controller.position;
      return Math.hypot(pos.x-p.x,pos.z-p.z)<.04;
    },point);
    await guest.evaluate(yaw=>{(window as any).__game.controller.yaw=yaw;},yaw);
    return point;
  }

  await place(15.5,150.5);
  const resume=guest.getByRole('button',{name:'继续游戏'});
  if(await resume.isVisible())await resume.click();
  else await guest.locator('.game-canvas').click({position:{x:10,y:10}});
  await guest.waitForFunction(()=>(window as any).__game.input.pointerLocked);
  await guest.keyboard.press('KeyC');
  await host.waitForFunction(id=>(window as any).__game.hosted.get(id).controller.crouched,id);
  await guest.waitForFunction(()=>(window as any).__game.controller.crouched);
  await guest.keyboard.press('KeyC');
  await host.waitForFunction(id=>!(window as any).__game.hosted.get(id).controller.crouched,id);
  await guest.keyboard.down('ControlLeft');
  await guest.keyboard.down('KeyW');
  await host.waitForFunction(id=>{
    const p=(window as any).__game.hosted.get(id).controller;
    return p.velocity.z < -1.7 && p.velocity.z > -2 && !p.crouched;
  },id);
  await guest.keyboard.up('KeyW');
  await guest.keyboard.up('ControlLeft');

  const {surface}=await place(146.5,153.5,0,.5);
  await host.waitForFunction(({id,surface})=>{
    const p=(window as any).__game.hosted.get(id).controller;
    return p.swimming&&Math.abs(p.position.y-surface+1.53)<.08&&Math.abs(p.velocity.y)<.2;
  },{id,surface});
  await host.waitForFunction(id=>(window as any).__game.remotes.get(id).action==='swim_idle',id);
  await guest.keyboard.down('Space');
  await host.waitForFunction(({id,surface})=>(window as any).__game.hosted.get(id).controller.position.y>surface-.7,{id,surface});
  await guest.keyboard.up('Space');
  await guest.keyboard.down('ControlLeft');
  await host.waitForFunction(id=>{
    const p=(window as any).__game.hosted.get(id).controller;
    return p.underwater&&!p.crouched;
  },id);
  await guest.waitForFunction(()=>(window as any).__game.controller.underwater);
  await guest.keyboard.up('ControlLeft');
  await host.waitForFunction(id=>!(window as any).__game.hosted.get(id).controller.underwater,id);

  await guest.keyboard.down('KeyW');
  await host.waitForFunction(({id,surface})=>{
    const p=(window as any).__game.hosted.get(id).controller;
    return p.velocity.z< -2.5&&p.velocity.z> -2.8&&p.position.y>surface-1.28;
  },{id,surface});
  await guest.keyboard.down('ShiftLeft');
  await host.waitForFunction(id=>(window as any).__game.hosted.get(id).controller.velocity.z < -4.1,id);
  await guest.keyboard.up('ShiftLeft');
  await guest.keyboard.up('KeyW');

  const rim=await place(143.58,145.5,Math.PI/2,1.53);
  await guest.keyboard.down('KeyW');
  await guest.keyboard.down('Space');
  await host.waitForFunction(id=>!!(window as any).__game.hosted.get(id).controller.mantle,id);
  await host.waitForFunction(({id,surface})=>{
    const p=(window as any).__game.hosted.get(id).controller;
    return !p.mantle&&p.grounded&&p.position.x<143&&p.position.y>surface+.8;
  },{id,surface:rim.surface});
  await guest.keyboard.up('Space');
  await guest.keyboard.up('KeyW');
  await guest.waitForFunction(()=>!(window as any).__game.controller.swimming);
  const lowBank=await place(146.5,150.5,Math.PI/2,1.53);
  await guest.keyboard.down('KeyW');
  await host.waitForFunction(({id,surface})=>{
    const p=(window as any).__game.hosted.get(id).controller;
    return p.position.x<142&&Math.abs(p.position.y-surface)<.05&&p.grounded&&!p.inWater&&!p.mantle;
  },{id,surface:lowBank.surface},{timeout:8000});
  await guest.keyboard.up('KeyW');
  await guest.waitForFunction(()=>{
    const p=(window as any).__game.controller;
    return p.position.x<142&&!p.inWater;
  });
  await place(15.5,150.5);

  const ids=await host.evaluate(()=>{
    const g=(window as any).__game,team=g.myTeam;
    const starts=[[145.5,145.5],[154.5,154.5],[146.5,151.5],[153.5,146.5]];
    return starts.map(([x,z],i)=>{
      const id='water-audit-'+i;
      g.addPlayer(id,id,team,true);
      const h=g.hosted.get(id),water=g.arena.waterAt(x,z);
      h.controller.teleport(h.controller.position.clone().set(x,water.bottom,z),0);
      return id;
    });
  });
  await host.waitForFunction(ids=>{
    const g=(window as any).__game;
    return ids.every((id:string)=>{
      const p=g.hosted.get(id).controller;
      const w=g.arena.waterAt(p.position.x,p.position.z,p.position.y);
      return p.grounded&&!p.mantle&&(!w||p.position.y>=w.surface-.015);
    });
  },ids,{timeout:18000});
  const escaped=await host.evaluate(ids=>ids.map(id=>(window as any).__game.hosted.get(id).controller.position.toArray()),ids);
  await host.waitForTimeout(1800);
  assert.ok(await host.evaluate(ids=>ids.every(id=>!(window as any).__game.hosted.get(id).controller.inWater),ids));

  const retreatId=await host.evaluate(ids=>{
    const g=(window as any).__game, id='water-audit-retreat';
    for(const peer of ids)g.removePlayer(peer);
    g.addPlayer(id,id,g.myTeam==='blue'?'orange':'blue',true);
    const bot=g.hosted.get(id);
    g.controller.teleport(g.controller.position.clone().set(141.5,8,142.5),Math.PI);
    bot.controller.teleport(bot.controller.position.clone().set(141.5,8,148.5),0);
    bot.yaw=0;bot.health=100;bot.lastDamageAt=g.simulationNow;
    if(g.seekBotWaterCover(bot,g.controller,g.simulationNow))throw new Error('Healthy bot chose a water retreat');
    bot.health=35;
    bot.nextThink=0;
    return id;
  },ids);
  await host.waitForFunction(id=>{
    const h=(window as any).__game.hosted.get(id);
    return h.controller.swimming&&h.waterRetreatAt>0;
  },retreatId,{timeout:8000});
  await host.waitForFunction(id=>{
    const p=(window as any).__game.hosted.get(id).controller;
    return !p.inWater&&p.grounded&&!p.mantle;
  },retreatId,{timeout:12000});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({defaultControls:true,guestDive:true,guestFastSwim:true,guestMantledOneBlockRim:true,guestWalkedOntoLowBank:true,botsEscaped:escaped,woundedBotRetreatedAndExited:true,errors}));
}finally{
  await Promise.all(browsers.map(b=>b.close()));
}
