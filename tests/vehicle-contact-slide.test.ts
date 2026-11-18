import {describe,it,expect} from 'vitest';
import {advanceVehiclePose,vehiclePoseBlocked,type MotionHull,type MotionWorld} from '../src/game/vehicles/motion';
import {vehicleSize} from '../src/game/vehicles/controller';
import {boxesOverlapXZ} from '../src/game/world/queries';

const DEG=Math.PI/180;
const LIGHT=vehicleSize('light_tank');

interface DriveTrace {
  v:{x:number;z:number;yaw:number;speed:number;steering:number};
  blockedFrames:number;
  zeroSpeedFrames:number;
  minSpeed:number;
  maxX:number;
  maxZ:number;
  maxStep:number;
  maxZeroRun:number;
  /** First frame at which the hull reported exactly 0 speed, or -1. */
  stoppedAt:number;
}

/**
 * Flat synthetic world with one optional obstacle. `footprintBlocked` uses the
 * same rotated-box query as `tests/vehicle-motion.test.ts`; the step/water strips
 * exercise the terrain gates through `ground`/`waterAt`.
 */
function world(options:{
  wall?:{x:number;z:number;w:number;d:number};
  step?:{fromX:number;height:number};
  water?:{fromX:number;toX:number;surface:number;bed:number};
}={}):MotionWorld {
  const {wall,step,water}=options;
  return {
    bounds:{minX:-300,maxX:300,minZ:-300,maxZ:300},
    ground:(x)=>{
      if(step&&x>=step.fromX) return step.height;
      if(water&&x>=water.fromX&&x<=water.toX) return water.bed;
      return 0;
    },
    heightAt:(x)=>water&&x>=water.fromX&&x<=water.toX?water.bed:step&&x>=step.fromX?step.height:0,
    supportAt:(x)=>water&&x>=water.fromX&&x<=water.toX?water.bed:step&&x>=step.fromX?step.height:0,
    waterAt:(x,z,feet)=>{
      if(!water||x<water.fromX||x>water.toX) return null;
      if((feet??0)>water.surface+.15) return null;
      return {surface:water.surface,bottom:water.bed};
    },
    footprintBlocked:wall
      ? (x,z,w,d,yaw,feet,height)=>boxesOverlapXZ(
          {x,z,w,d,rot:yaw,bottom:feet,top:feet+height},
          {x:wall.x,z:wall.z,w:wall.w,d:wall.d,rot:0,bottom:0,top:4})
      : undefined,
  };
}

/** Stepped 1 m deck at `angle` degrees rising along +Z, with the real deck band. */
function hillside(angleDeg:number):MotionWorld {
  const grade=Math.tan(angleDeg*DEG);
  const ground=(x:number,z:number)=>Math.floor(grade*z);
  return {
    bounds:{minX:-500,maxX:500,minZ:-500,maxZ:500},
    ground,heightAt:ground,supportAt:(x,z)=>ground(x,z),waterAt:()=>null,
    footprintBlocked:(x,z,w,d,yaw,feet,height,terrain)=>{
      if(!terrain) return false;
      const radius=Math.hypot(w,d)/2, hull={x,z,w,d,rot:yaw,bottom:feet,top:feet+height};
      for(let iz=Math.floor(z-radius);iz<=Math.floor(z+radius);iz++){
        for(let ix=Math.floor(x-radius);ix<=Math.floor(x+radius);ix++){
          if(!boxesOverlapXZ(hull,{x:ix+.5,z:iz+.5,w:1,d:1,rot:0,bottom:feet,top:feet+height})) continue;
          const floor=ground(ix+.5,iz+.5);
          if(floor<terrain.min||floor>terrain.max) return true;
        }
      }
      return false;
    },
  };
}

function drive(w: MotionWorld, kind: string, start:{x:number;z:number;yaw:number;speed:number}, frames:number, throttle=1, steer=0):DriveTrace {
  const v={...start,steering:0};
  const trace:DriveTrace={v,blockedFrames:0,zeroSpeedFrames:0,minSpeed:Infinity,maxX:-Infinity,maxZ:-Infinity,maxStep:0,maxZeroRun:0,stoppedAt:-1};
  let run=0, px=v.x, pz=v.z;
  for(let i=0;i<frames;i++){
    const step=advanceVehiclePose(w,v,kind,throttle,steer,1/60);
    if(step.blocked) trace.blockedFrames++;
    if(v.speed===0){
      trace.zeroSpeedFrames++;
      if(trace.stoppedAt<0) trace.stoppedAt=i;
    }
    trace.minSpeed=Math.min(trace.minSpeed,v.speed);
    trace.maxX=Math.max(trace.maxX,v.x);
    trace.maxZ=Math.max(trace.maxZ,v.z);
    const moved=Math.hypot(v.x-px,v.z-pz);
    trace.maxStep=Math.max(trace.maxStep,moved);
    if(moved<1e-6){run++;trace.maxZeroRun=Math.max(trace.maxZeroRun,run);}else run=0;
    px=v.x;pz=v.z;
  }
  return trace;
}

describe('vehicle wall contact: graze vs head-on',()=>{
  // Wall face at x = 2.5, long enough that the hull cannot round its end.
  const wallWorld=()=>world({wall:{x:3,z:60,w:1,d:140}});

  for(const angle of [10,12,15]) {
    it(`slides a ${angle}° graze along the wall instead of stopping`,()=>{
      const w=wallWorld();
      const trace=drive(w,'light_tank',{x:0,z:0,yaw:angle*DEG,speed:9},60);
      const v=trace.v;
      // Contract 1: never drops to 0, keeps most of its speed, covers >5 m.
      expect(trace.zeroSpeedFrames,'speed must never snap to zero').toBe(0);
      expect(trace.minSpeed).toBeGreaterThan(2);
      expect(v.z,'distance along the wall').toBeGreaterThan(5);
      expect(v.speed,'keeps >60% of the initial 9 m/s').toBeGreaterThan(9*.6);
      // The nose turns along the wall gradually (a stopped hull would keep 10–15°).
      expect(Math.abs(v.yaw)).toBeLessThan(angle*DEG);
      expect(Math.abs(v.yaw)).toBeLessThan(8*DEG);
      // Never tunnels: the hull centre stays well left of the wall face at x=2.5.
      expect(trace.maxX).toBeLessThan(2);
      expect(vehiclePoseBlocked(w,LIGHT,{x:v.x,z:v.z,yaw:v.yaw})).toBe(false);
    });
  }

  it('keeps the normal-ratio direction: 12° > 30° > 45° > 90° speed retention',()=>{
    const finalSpeed=(angle:number)=>drive(wallWorld(),'light_tank',{x:0,z:0,yaw:angle*DEG,speed:9},60).v.speed;
    const graze=finalSpeed(12), mid=finalSpeed(30), oblique=finalSpeed(45), headOn=finalSpeed(90);
    expect(graze).toBeGreaterThan(9*.6);      // shallow: small normal ratio
    expect(mid).toBeLessThan(graze);
    expect(oblique).toBeLessThan(mid);        // steeper: more normal speed lost
    expect(headOn).toBe(0);                   // perpendicular: stopped
  });

  it('still stops dead on a 90° wall without tunnelling (contract 2)',()=>{
    const w=wallWorld();
    const trace=drive(w,'light_tank',{x:0,z:0,yaw:90*DEG,speed:9},120);
    const v=trace.v;
    expect(trace.stoppedAt,'stopped within a reasonable time').toBeGreaterThanOrEqual(0);
    expect(trace.stoppedAt).toBeLessThan(90);
    expect(v.speed).toBe(0);
    // Wall face z=5.5, hull half-length 2.65: the centre may not pass ~2.93 m.
    expect(trace.maxZ).toBeLessThan(3.05);
    expect(vehiclePoseBlocked(w,LIGHT,{x:v.x,z:v.z,yaw:v.yaw})).toBe(false);
  });
});

describe('vehicle slope quantisation: diagonal 45° on a stepped 30° ramp',()=>{
  it('keeps moving across the lattice instead of freezing on a planar 9-point fit',()=>{
    const w=hillside(30);
    const trace=drive(w,'light_tank',{x:0,z:-40,yaw:45*DEG,speed:0},300);
    const v=trace.v;
    // This exact phase used to report blocked for 173 of 300 frames and end at
    // speed 0 after ~0.4 m; it must now climb continuously.
    expect(trace.zeroSpeedFrames).toBe(0);
    expect(trace.maxZeroRun,'no repeated stationary frames').toBeLessThanOrEqual(2);
    expect(trace.blockedFrames,'the ladder is no longer a wall').toBeLessThanOrEqual(3);
    expect(Math.hypot(v.x,v.z+40),'continuous displacement').toBeGreaterThan(15);
    expect(v.speed).toBeGreaterThan(6);
    expect(v.yaw).toBeCloseTo(45*DEG,1);
    expect(trace.maxStep,'no teleport on a quantised deck').toBeLessThanOrEqual(0.21);
    expect(vehiclePoseBlocked(w,LIGHT,{x:v.x,z:v.z,yaw:v.yaw})).toBe(false);
  });

  it('does not let a pinned low-speed hull teleport across the map',()=>{
    const w=hillside(30);
    const straight=drive(w,'light_tank',{x:0,z:-40,yaw:45*DEG,speed:0.1},60);
    // 1 s of throttle from 0.1 m/s: the hull starts moving, but no frame may jump
    // more than a crawl step (0.2 m) and the total must stay walking pace.
    expect(straight.maxStep).toBeLessThanOrEqual(0.21);
    expect(Math.hypot(straight.v.x,straight.v.z+40)).toBeLessThan(2);
    expect(Math.hypot(straight.v.x,straight.v.z+40)).toBeGreaterThan(0.15);
  });
});

describe('obstacles stay hard after the contact rewrite (contract 4)',()=>{
  it('never climbs or slides across a 2 m step, even diagonally',()=>{
    const stepWorld=world({step:{fromX:2,height:2}});
    // The slope-only probe still reports the 2 m rise as an obstacle, so the
    // classification used by the contact code cannot treat it as quantisation.
    expect(vehiclePoseBlocked(stepWorld,LIGHT,{x:6,z:0,yaw:0},{from:{x:0,z:0,yaw:0},ignoreSlope:true})).toBe(true);
    expect(vehiclePoseBlocked(stepWorld,LIGHT,{x:6,z:0,yaw:0},{from:{x:0,z:0,yaw:0}})).toBe(true);

    for(const yaw of [90*DEG,45*DEG]){
      const trace=drive(stepWorld,'light_tank',{x:-4,z:-6,yaw,speed:9},180);
      expect(trace.maxX,`yaw ${(yaw/DEG).toFixed(0)}° must not cross x=2`).toBeLessThan(1);
      expect(vehiclePoseBlocked(stepWorld,LIGHT,{x:trace.v.x,z:trace.v.z,yaw:trace.v.yaw})).toBe(false);
    }
  });

  it('never drives into water deeper than the ford depth',()=>{
    const river=world({water:{fromX:4,toX:24,surface:-2,bed:-4.5}});
    expect(vehiclePoseBlocked(river,LIGHT,{x:12,z:0,yaw:0})).toBe(true);
    const trace=drive(river,'light_tank',{x:-4,z:0,yaw:90*DEG,speed:9},180);
    expect(trace.maxX).toBeLessThan(4.2);
    expect(vehiclePoseBlocked(river,LIGHT,{x:trace.v.x,z:trace.v.z,yaw:trace.v.yaw})).toBe(false);
  });

  it('still refuses a stepped 40°/45° staircase (the crawl is not a winch)',()=>{
    // The continuous-slope contract lives in vehicle-slope.test.ts; this pins the
    // quantised case so the terrain crawl can never turn a 40° ladder into a road.
    for(const kind of ['light_tank','mbt']){
      for(const angle of [40,45]){
        const trace=drive(hillside(angle),kind,{x:0,z:0,yaw:0,speed:0},120);
        expect(trace.v.speed,`${kind} ${angle}° speed`).toBe(0);
        expect(Math.hypot(trace.v.x,trace.v.z),`${kind} ${angle}° displacement`).toBeLessThan(1);
      }
    }
  });
});
