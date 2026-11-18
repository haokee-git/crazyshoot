import {describe,it,expect} from 'vitest';
import {advanceVehiclePose,findFreeVehiclePose,vehicleContact,vehiclePoseBlocked,maxVehicleGrade,type MotionWorld} from '../src/game/vehicles/motion';
import {boxesOverlapXZ} from '../src/game/world/queries';

/** Synthetic flat world with an optional wall, water strip and terrain step. */
function world(options:{wall?:{x:number;z:number;w:number;d:number};water?:{fromX:number;toX:number;surface:number};step?:{atX:number;height:number}}={}):MotionWorld {
  const wall=options.wall,water=options.water,step=options.step;
  return {
    bounds:{minX:-100,maxX:100,minZ:-100,maxZ:100},
    ground:(x)=>step&&x>=step.atX?step.height:0,
    footprintBlocked:(x,z,w,d,yaw,feet,height)=>{
      if(!wall)return false;
      return boxesOverlapXZ({x,z,w,d,rot:yaw,bottom:feet,top:feet+height},{x:wall.x,z:wall.z,w:wall.w,d:wall.d,rot:0,bottom:0,top:4});
    },
    waterAt:(x,z,feet)=>{
      if(!water||x<water.fromX||x>water.toX)return null;
      const surface=water.surface;
      if((feet??0)>surface+.15)return null;
      return {surface,bottom:surface-3};
    },
    heightAt:()=>0,
    supportAt:()=>0,
  };
}

describe('vehicle hull motion',()=>{
  it('refuses a pose that overlaps a wall and accepts the open lane beside it',()=>{
    const w=world({wall:{x:0,z:6,w:1,d:6}});
    const hull={w:2.8,d:5.3,h:2.3};
    expect(vehiclePoseBlocked(w,hull,{x:0,z:2,yaw:0})).toBe(true);
    expect(vehiclePoseBlocked(w,hull,{x:-6,z:2,yaw:0})).toBe(false);
  });

  it('stops a hull that drives straight into a wall and does not tunnel through it',()=>{
    const w=world({wall:{x:0,z:6,w:1,d:6}});
    const v={x:0,z:0,yaw:0,speed:0,steering:0};
    for(let i=0;i<600;i++)advanceVehiclePose(w,v,'light_tank',1,0,1/60);
    // Hull half-length 2.65 m against a wall whose face is at z=3.
    expect(v.z).toBeLessThan(1);
    expect(v.z).toBeGreaterThan(0);
    expect(v.speed).toBe(0);
  });

  it('lets a tracked hull pivot in place so it can leave a dead end',()=>{
    const w=world();
    const v={x:0,z:0,yaw:0,speed:0,steering:0};
    for(let i=0;i<120;i++)advanceVehiclePose(w,v,'light_tank',0,1,1/60);
    expect(Math.abs(v.yaw)).toBeGreaterThan(.6);
    expect(Math.abs(v.x)+Math.abs(v.z)).toBeLessThan(.05);
  });

  it('backs a hull out of geometry it is already embedded in',()=>{
    const w=world({wall:{x:0,z:0,w:1,d:2}});
    const hull={w:2.8,d:5.3,h:2.3};
    expect(vehiclePoseBlocked(w,hull,{x:0,z:0,yaw:Math.PI/2})).toBe(true);
    expect(findFreeVehiclePose(w,hull,0,0,Math.PI/2,4)).not.toBeNull();
    const v={x:0,z:0,yaw:Math.PI/2,speed:0,steering:0};
    for(let i=0;i<120;i++)advanceVehiclePose(w,v,'light_tank',0,0,1/60);
    expect(vehiclePoseBlocked(w,hull,{x:v.x,z:v.z,yaw:v.yaw},{from:v})).toBe(false);
  });

  it('refuses water deeper than a ford and accepts shallow water',()=>{
    const hull={w:2.8,d:5.3,h:2.3},pose={x:20,z:0,yaw:0};
    const river=(bed:number):MotionWorld=>{const base=world({water:{fromX:10,toX:30,surface:-2}});return {...base,ground:(x)=>x>=10&&x<=30?bed:0};};
    expect(vehiclePoseBlocked(river(-4.5),hull,pose)).toBe(true);
    expect(vehiclePoseBlocked(river(-2.8),hull,pose)).toBe(false);
  });

  it('refuses a lip taller than the step limit but accepts a 1 m lip',()=>{
    const hull={w:2.8,d:5.3,h:2.3};
    const from={x:0,z:0,yaw:0};
    const hard=world({step:{atX:2,height:2}});
    const single=world({step:{atX:2,height:1}});
    expect(vehiclePoseBlocked(hard,hull,{x:6,z:0,yaw:0},{from})).toBe(true);
    expect(vehiclePoseBlocked(single,hull,{x:6,z:0,yaw:0},{from})).toBe(false);
  });

  it('settles pitch and roll on a slope instead of floating flat',()=>{
    const w:MotionWorld={...world(),ground:(x)=>x*.2};
    const along=vehicleContact(w,{w:2.8,d:5.3,h:2.3},0,0,Math.PI/2);
    const across=vehicleContact(w,{w:2.8,d:5.3,h:2.3},0,0,0);
    expect(Math.abs(along.pitch)).toBeGreaterThan(.15);
    expect(Math.abs(across.roll)).toBeGreaterThan(.18);
    expect(maxVehicleGrade({w:2.8,d:5.3,h:2.3})).toBeGreaterThan(2.5);
  });
});
