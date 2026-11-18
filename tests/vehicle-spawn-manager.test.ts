import {describe,it,expect} from 'vitest';
import {
  VehicleSpawnManager,
  SPAWN_DEFAULTS,
  type ManagedVehicleInit,
  type PadState,
  type SpawnAction,
  type SpawnManagerConfig,
  type VehiclePadSpec,
  type VehicleSync,
} from '../src/game/vehicles/spawn-manager';

function pad(id:string,x=0,z=0,team:'blue'|'orange'|'neutral'='blue',kind='mbt'):VehiclePadSpec{
  return {id,kind,team,x,z,angle:0};
}

/** 一个最小的「引擎世界」：初始车 = 每个车位一辆，update 后按指令增删载具。 */
function build(pads:VehiclePadSpec[],config:Partial<Omit<SpawnManagerConfig,'pads'|'initial'>>={}){
  const initial:ManagedVehicleInit[] = pads.map((p,i)=>({
    id:`${p.kind}-${i}`,kind:p.kind,team:p.team,padId:p.id,x:p.x,z:p.z,
  }));
  const manager=new VehicleSpawnManager({pads,initial,...config});
  const world={
    vehicles: initial.map((v):VehicleSync=>({id:v.id,x:v.x,z:v.z,destroyed:false})),
    canSpawn:true,
    clearCalls:[] as number[],
    spawns:[] as Extract<SpawnAction,{type:'spawn'}>[],
    removes:[] as {id:string;reason:string}[],
  };
  const step=(now:number,allow?:boolean)=>{
    const result=manager.update(now,world.vehicles,(_pad,ignoreIds)=>{
      world.clearCalls.push(now);
      expect(Array.isArray(ignoreIds)).toBe(true);
      return allow ?? world.canSpawn;
    });
    for(const action of result.actions){
      if(action.type==='spawn'){
        world.spawns.push(action);
        world.vehicles.push({id:action.vehicleId,x:action.x,z:action.z,destroyed:false});
      }else{
        world.removes.push({id:action.vehicleId,reason:action.reason});
        for(let i=world.vehicles.length-1;i>=0;i--)if(world.vehicles[i].id===action.vehicleId)world.vehicles.splice(i,1);
      }
    }
    return result;
  };
  const move=(id:string,x:number,z:number)=>{
    const v=world.vehicles.find(v=>v.id===id);
    if(!v)throw new Error(`missing vehicle ${id}`);
    v.x=x;v.z=z;
  };
  const destroy=(id:string,destroyed=true)=>{
    const v=world.vehicles.find(v=>v.id===id);
    if(!v)throw new Error(`missing vehicle ${id}`);
    v.destroyed=destroyed;
  };
  const padState=(now:number,index=0):PadState=>step(now).pads[index];
  return {...world,manager,initial,step,move,destroy,padState};
}

describe('vehicle spawn manager · 弃车刷新',()=>{
  it('离开车位 24 m 持续 20 s 才开始 15 s 倒计时，返回 24 m 内取消',()=>{
    const sim=build([pad('padA')]);
    const id=sim.initial[0].id;

    // 开走 40 m。
    sim.move(id,40,0);
    expect(sim.step(0).pads[0].state).toBe('occupied');
    expect(sim.step(10_000).pads[0].state).toBe('occupied');
    // 19.999 s 还没到 20 s：仍是被占用，没有倒计时。
    expect(sim.step(19_999).pads[0].state).toBe('occupied');
    // 20 s：起 15 s 刷新倒计时。
    const started=sim.step(20_000).pads[0];
    expect(started.state).toBe('respawning');
    expect(started.seconds).toBe(15);

    // 倒计时结束前把车开回 24 m 内 → 取消。
    sim.move(id,10,0);
    expect(sim.step(25_000).pads[0].state).toBe('ready');
    // 原本的倒计时（35 s）已经过去，也不会再刷新。
    expect(sim.step(40_000).pads[0].state).toBe('ready');
    expect(sim.spawns).toHaveLength(0);
  });

  it('毁损后 45 s 刷新：旧残骸先移除，新车绑定同一车位',()=>{
    const sim=build([pad('padA')]);
    const id=sim.initial[0].id;
    sim.destroy(id);

    expect(sim.step(1_000).pads[0].seconds).toBe(45);
    expect(sim.step(45_999).pads[0].state).toBe('respawning');
    expect(sim.spawns).toHaveLength(0);

    const due=sim.step(46_000);
    expect(due.pads[0].state).toBe('ready');
    expect(sim.spawns).toHaveLength(1);
    expect(sim.spawns[0].padId).toBe('padA');
    expect(sim.spawns[0].kind).toBe('mbt');
    // 车位自己的旧残骸在刷新前被清掉。
    expect(sim.removes).toEqual([{id,reason:'respawn'}]);
    expect(sim.vehicles.some(v=>v.id===id)).toBe(false);
  });
});

describe('vehicle spawn manager · 净空与重试',()=>{
  it('净空被占用时按 2 s 重试，成功一次只生成一辆',()=>{
    const sim=build([pad('padA')]);
    const id=sim.initial[0].id;
    sim.destroy(id);
    sim.step(1_000); // 45 s 倒计时（due = 46_000）

    const blocked=sim.step(46_000,false);
    expect(blocked.pads[0].state).toBe('occupied');
    expect(blocked.pads[0].seconds).toBe(2);
    expect(sim.spawns).toHaveLength(0);
    expect(sim.clearCalls).toEqual([46_000]);

    // 1 s 后还没到重试点：不重复检测、不生成。
    const early=sim.step(47_000,false);
    expect(early.pads[0].state).toBe('occupied');
    expect(sim.clearCalls).toEqual([46_000]);

    // 2 s 后再次检测，这次净空通过。
    const clear=sim.step(48_000,true);
    expect(clear.pads[0].state).toBe('ready');
    expect(sim.spawns).toHaveLength(1);
    expect(sim.clearCalls).toEqual([46_000,48_000]);

    // 后续帧不会重复生成。
    sim.step(48_100,true);
    sim.step(48_500,true);
    expect(sim.spawns).toHaveLength(1);
  });
});

describe('vehicle spawn manager · 全图上限',()=>{
  it('未摧毁载具满 40 时排队等待，去重且只补一辆',()=>{
    const pads=[pad('padA')];
    const sim=build(pads);
    // 40 辆额外的活车 + 车位那辆被毁 → 活车正好 40。
    for(let i=0;i<40;i++)sim.vehicles.push({id:`extra-${i}`,x:100+i,z:100,destroyed:false});
    sim.destroy(sim.initial[0].id);
    sim.step(1_000); // 45 s 倒计时（due = 46_000）

    const blocked=sim.step(46_000);
    expect(sim.spawns).toHaveLength(0);
    expect(blocked.pads[0].state).toBe('respawning');
    // 每车位只有一个待刷新：连续多帧都不会累积队列。
    sim.step(46_500);
    sim.step(47_000);
    sim.step(48_000);
    expect(sim.spawns).toHaveLength(0);

    // 打掉一辆额外载具腾出名额 → 下一次重试恰好补一辆。
    sim.destroy('extra-0');
    const spawned=sim.step(50_000);
    expect(spawned.pads[0].state).toBe('ready');
    expect(sim.spawns).toHaveLength(1);
    sim.step(50_100);
    sim.step(51_000);
    expect(sim.spawns).toHaveLength(1);
  });
});

describe('vehicle spawn manager · 车辆对象上限',()=>{
  it('对象到 56 时清理最老残骸再刷新',()=>{
    const sim=build([pad('padA')]);
    // 补到 57 个对象（含车位自己的那辆）：刷新时先清自己的残骸，再清最老残骸。
    for(let i=0;i<56;i++)sim.vehicles.push({id:`extra-${i}`,x:100+i,z:100,destroyed:false});
    // 按时间顺序打掉 31 辆额外载具（destroyedAt 递增，最老是 extra-0）。
    for(let i=0;i<31;i++){
      sim.destroy(`extra-${i}`);
      sim.step(1_000+i);
    }
    expect(sim.manager.objectCount).toBe(57);
    // 车位载具最后才毁，刷新时对象数仍是 56。
    sim.destroy(sim.initial[0].id);
    sim.step(40_000);
    const due=sim.step(85_000);

    expect(due.pads[0].state).toBe('ready');
    expect(sim.spawns).toHaveLength(1);
    // 先移除车位自己的残骸，再清理最老的一辆残骸（而不是活车）。
    expect(sim.removes).toEqual([
      {id:sim.initial[0].id,reason:'respawn'},
      {id:'extra-0',reason:'limit'},
    ]);
    expect(sim.manager.objectCount).toBe(56);
  });
});

describe('vehicle spawn manager · 新车上位与重置',()=>{
  it('刷新出的新车绑定车位，旧车解绑后不再触发刷新',()=>{
    const sim=build([pad('padA')]);
    const oldId=sim.initial[0].id;
    sim.move(oldId,40,0);
    sim.step(0);
    sim.step(20_000);
    sim.step(35_000);
    expect(sim.spawns).toHaveLength(1);
    const fresh=sim.spawns[0].vehicleId;

    // 把旧车开回原车位范围：不会取消/影响新车。
    sim.move(oldId,2,0);
    const state=sim.step(36_000).pads[0];
    expect(state.state).toBe('ready');
    // 再开走旧车 40 s：它已解绑，不再触发刷新。
    sim.move(oldId,40,0);
    sim.step(37_000);
    sim.step(60_000);
    sim.step(80_000);
    expect(sim.spawns).toHaveLength(1);
    expect(sim.vehicles.some(v=>v.id===fresh)).toBe(true);
  });

  it('reset 清动态车、恢复 32 辆初始车与全部 ready 车位',()=>{
    const pads=Array.from({length:32},(_,i)=>pad(
      `pad-${i}`,
      i%2?200:0,
      Math.floor(i/2)*10,
      i<16?'blue':i<24?'orange':'neutral',
      'mbt',
    ));
    const sim=build(pads);
    expect(sim.manager.objectCount).toBe(32);

    // 制造一辆动态车：打掉 pad-0 的车，等 45 s 刷新。
    sim.destroy('mbt-0');
    sim.step(1_000);
    sim.step(46_000);
    expect(sim.spawns).toHaveLength(1);
    const dynamic=sim.spawns[0].vehicleId;
    expect(sim.manager.objectCount).toBe(32); // 清掉旧残骸 + 补一辆
    expect(sim.vehicles.some(v=>v.id===dynamic)).toBe(true);

    const actions=sim.manager.reset(100_000);
    expect(actions).toEqual([{type:'remove',vehicleId:dynamic,reason:'reset'}]);
    expect(sim.manager.objectCount).toBe(32);
    expect(sim.manager.dynamicIds()).toEqual([]);
    expect(sim.manager.states(100_000).every(p=>p.state==='ready')).toBe(true);
    // 初始车都恢复了。
    expect(sim.manager.states(100_000).length).toBe(32);
  });

  it('中立车位刷新出的载具保持 neutral（不会冒充蓝/橙）',()=>{
    const sim=build([pad('padN',0,0,'neutral','jeep')]);
    const id=sim.initial[0].id;
    sim.destroy(id);
    sim.step(1_000);
    sim.step(46_000);
    expect(sim.spawns).toHaveLength(1);
    expect(sim.spawns[0].team).toBe('neutral');
    expect(sim.step(46_100).pads[0].team).toBe('neutral');
    // 默认参数与契约一致。
    expect(SPAWN_DEFAULTS.abandonDistance).toBe(24);
    expect(SPAWN_DEFAULTS.abandonDelayMs).toBe(20_000);
    expect(SPAWN_DEFAULTS.respawnDelayMs).toBe(15_000);
    expect(SPAWN_DEFAULTS.destroyedDelayMs).toBe(45_000);
    expect(SPAWN_DEFAULTS.retryMs).toBe(2_000);
    expect(SPAWN_DEFAULTS.liveLimit).toBe(40);
    expect(SPAWN_DEFAULTS.objectLimit).toBe(56);
  });
});
