import {describe,it,expect} from 'vitest';
import {
  advanceVehiclePose,maxVehicleGrade,supportPlaneFit,vehiclePoseBlocked,vehicleSlopeLimits,
  HULL_SUPPORT_POINTS,VEHICLE_STEP_LIMIT,type MotionHull,type MotionWorld,
} from '../src/game/vehicles/motion';
import {vehicleSize} from '../src/game/vehicles/controller';
import {boxesOverlapXZ} from '../src/game/world/queries';
import {getMap} from '../src/maps';
import {buildVoxelMapData} from '../src/game/world/voxel-map-data';
import {VoxelWorldQueries} from '../src/game/world/voxel-world-queries';

const DEG = Math.PI / 180;
const MBT = vehicleSize('mbt');
const LIGHT = vehicleSize('light_tank');
const JEEP = vehicleSize('jeep');
const MOTORCYCLE = vehicleSize('motorcycle');

/**
 * Uniform hillside rising along +Z at `angle` degrees.
 *  - `stepped` quantises it to the 1 m integer decks the voxel world really produces;
 *  - `riser` adds a vertical edge at `atZ`;
 *  - `pit` lowers (negative: raises) a 2×2 m patch under the hull centre;
 *  - `footprint` installs the same deck-band rule `VoxelWorldQueries.footprint` uses,
 *    so the drive tests exercise the band the real world passes to it.
 */
function hillside(angleDeg:number,options:{stepped?:boolean;riser?:{atZ:number;height:number};pit?:number;footprint?:boolean}={}):MotionWorld {
  const grade = Math.tan(angleDeg * DEG);
  const ground = (x:number,z:number) => {
    const deck = grade * z;
    if (options.riser && z >= options.riser.atZ) return deck + options.riser.height;
    if (options.pit && Math.abs(x) <= 1 && Math.abs(z) <= 1) return deck - options.pit;
    return options.stepped ? Math.floor(deck) : deck;
  };
  const footprintBlocked = options.footprint
    ? (x:number,z:number,w:number,d:number,yaw:number,feet:number,height:number,terrain?:{min:number;max:number})=>{
        if (!terrain) return false;
        const radius=Math.hypot(w,d)/2, hull={x,z,w,d,rot:yaw,bottom:feet,top:feet+height};
        for (let iz=Math.floor(z-radius);iz<=Math.floor(z+radius);iz++) for (let ix=Math.floor(x-radius);ix<=Math.floor(x+radius);ix++) {
          if (!boxesOverlapXZ(hull,{x:ix+.5,z:iz+.5,w:1,d:1,rot:0,bottom:feet,top:feet+height})) continue;
          const floor=ground(ix+.5,iz+.5);
          if (floor<terrain.min||floor>terrain.max) return true;
        }
        return false;
      }
    : undefined;
  return {
    bounds:{minX:-500,maxX:500,minZ:-500,maxZ:500},
    ground, heightAt:ground, supportAt:(x,z)=>ground(x,z), waterAt:()=>null, footprintBlocked,
  };
}

/** The nine deck samples under a hull pose plus their spread and fitted plane. */
function samples(world:MotionWorld,hull:MotionHull,x:number,z:number,yaw:number){
  const c=Math.cos(yaw),s=Math.sin(yaw);
  const heights=HULL_SUPPORT_POINTS.map(([side,end])=>world.ground(
    x+side*hull.w*.5*c+end*hull.d*.5*s,
    z-side*hull.w*.5*s+end*hull.d*.5*c));
  return {heights,spread:Math.max(...heights)-Math.min(...heights),fit:supportPlaneFit(hull,heights)};
}

/** Drive with throttle for `frames`, returning the number of blocked steps. */
function drive(world:MotionWorld,kind:string,state:{x:number;z:number;yaw:number;speed:number;steering:number},throttle:number,frames:number){
  let blocked=0;
  for (let i=0;i<frames;i++) if (advanceVehiclePose(world,state,kind,throttle,0,1/60).blocked) blocked++;
  return blocked;
}

describe('support-plane slope gate',()=>{
  it('fits h = c + a·u + b·v: a diagonal heading splits one slope into pitch and roll',()=>{
    const hw=MBT.w*.5, hd=MBT.d*.5;
    const plane=HULL_SUPPORT_POINTS.map(([side,end])=>7+2*side*hw+3*end*hd);
    const fit=supportPlaneFit(MBT,plane);
    expect(fit.y).toBeCloseTo(7,10);
    expect(fit.lateral).toBeCloseTo(2,10);
    expect(fit.longitudinal).toBeCloseTo(3,10);
    expect(fit.residual).toBeCloseTo(0,10);

    const world=hillside(25);
    for (const yaw of [0,30,45,90]) {
      const {fit:measured}=samples(world,MBT,0,0,yaw*DEG);
      // World gradient is (0, tan25); lateral axis is (cos yaw, −sin yaw), forward (sin yaw, cos yaw).
      expect(measured.longitudinal).toBeCloseTo(Math.tan(25*DEG)*Math.cos(yaw*DEG),9);
      expect(measured.lateral).toBeCloseTo(-Math.tan(25*DEG)*Math.sin(yaw*DEG),9);
      expect(measured.residual).toBeCloseTo(0,9);
      // The steepest direction is the same 25° whatever heading the hull holds.
      expect(Math.atan(Math.hypot(measured.lateral,measured.longitudinal))/DEG).toBeCloseTo(25,9);
    }
  });

  it('drives a uniform 25° hillside diagonally, which the old diagonal-spread gate vetoed',()=>{
    const world=hillside(25);
    const grade=maxVehicleGrade(MBT);
    for (const yaw of [0,30,45,90]) {
      const {spread}=samples(world,MBT,0,0,yaw*DEG);
      if (yaw===0||yaw===30||yaw===45) {
        // This is exactly the old failure: (w+d)·tanθ over the diagonal beats maxVehicleGrade.
        expect(spread,`yaw ${yaw}° spread must exceed the old gate ${grade.toFixed(2)}`).toBeGreaterThan(grade);
      }
      expect(vehiclePoseBlocked(world,MBT,{x:0,z:0,yaw:yaw*DEG}),`yaw ${yaw}°`).toBe(false);
    }

    // …and a diagonal travel path stays clear frame to frame (from → pose), both ways.
    const state={x:0,z:-10,yaw:30*DEG};
    for (let i=0;i<12;i++) {
      const nx=state.x+Math.sin(state.yaw)*.6, nz=state.z+Math.cos(state.yaw)*.6;
      expect(vehiclePoseBlocked(world,MBT,{x:nx,z:nz,yaw:state.yaw},{from:{...state}})).toBe(false);
      state.x=nx;state.z=nz;
    }
    for (let i=0;i<12;i++) {
      const nx=state.x-Math.sin(state.yaw)*.6, nz=state.z-Math.cos(state.yaw)*.6;
      expect(vehiclePoseBlocked(world,MBT,{x:nx,z:nz,yaw:state.yaw},{from:{...state}}),'reverse').toBe(false);
      state.x=nx;state.z=nz;
    }
  });

  it('lets tracked hulls climb 20–30° and 35°, and refuses 40° and 45° at every heading',()=>{
    for (const hull of [MBT,LIGHT]) {
      for (const angle of [20,25,30,35]) {
        for (const yaw of [0,30,45]) {
          expect(vehiclePoseBlocked(hillside(angle),hull,{x:0,z:0,yaw:yaw*DEG}),`${angle}° yaw ${yaw}°`).toBe(false);
        }
      }
    }
    for (const angle of [40,45,50]) {
      for (const yaw of [0,30,45,90]) {
        expect(vehiclePoseBlocked(hillside(angle),MBT,{x:0,z:0,yaw:yaw*DEG}),`${angle}° yaw ${yaw}°`).toBe(true);
      }
    }
  });

  it('refuses a 35° bank broadside even though the same hill is climbable head-on',()=>{
    expect(vehiclePoseBlocked(hillside(35),MBT,{x:0,z:0,yaw:0})).toBe(false);
    // 35° of roll is past the 32° tracked side-slope envelope: the hull would tip.
    expect(vehiclePoseBlocked(hillside(35),MBT,{x:0,z:0,yaw:90*DEG})).toBe(true);
    expect(vehiclePoseBlocked(hillside(28),MBT,{x:0,z:0,yaw:90*DEG})).toBe(false);
  });

  it('gives tracked, wheeled and motorcycle hulls their own envelope',()=>{
    const mbt=vehicleSlopeLimits(MBT), light=vehicleSlopeLimits(LIGHT), jeep=vehicleSlopeLimits(JEEP), motorcycle=vehicleSlopeLimits(MOTORCYCLE);
    expect(mbt.pitch).toBeGreaterThanOrEqual(32*DEG);
    expect(mbt.pitch).toBeLessThanOrEqual(36*DEG);
    expect(light.pitch).toBeGreaterThanOrEqual(32*DEG);
    expect(jeep.pitch).toBeGreaterThanOrEqual(26*DEG);
    expect(jeep.pitch).toBeLessThanOrEqual(30*DEG);
    expect(mbt.pitch,`tracked > wheeled > motorcycle`).toBeGreaterThan(jeep.pitch);
    expect(jeep.pitch).toBeGreaterThan(motorcycle.pitch);
    expect(vehicleSlopeLimits(MBT,'mbt')).toEqual(mbt);
    // APC and IFV share one collision box: probes that only carry the box get the
    // tighter wheeled envelope instead of silently guessing "tracked".
    expect(vehicleSlopeLimits({w:2.8,d:5.4,h:2.4})).toEqual(vehicleSlopeLimits(vehicleSize('apc')));

    // A continuous slope is judged with the strict envelope, no lattice allowance.
    expect(vehiclePoseBlocked(hillside(32),MBT,{x:0,z:0,yaw:0})).toBe(false);
    expect(vehiclePoseBlocked(hillside(32),JEEP,{x:0,z:0,yaw:0})).toBe(true);
    expect(vehiclePoseBlocked(hillside(20),MOTORCYCLE,{x:0,z:0,yaw:0})).toBe(false);
    expect(vehiclePoseBlocked(hillside(24),MOTORCYCLE,{x:0,z:0,yaw:0})).toBe(true);
  });
});

describe('support-plane residual and risers',()=>{
  it('refuses a 2 m riser under the hull although a 2 m riser fits a ~17° plane',()=>{
    const world=hillside(0,{riser:{atZ:0,height:2}});
    const {fit}=samples(world,MBT,0,0,0);
    // The plane alone cannot see this: it reads as a shallow ramp, under every angle cap.
    expect(Math.abs(Math.atan(fit.longitudinal))/DEG).toBeLessThan(36);
    expect(fit.residual).toBeGreaterThan(.3);
    // Straddling, driving into it and sitting across it are all refused.
    expect(vehiclePoseBlocked(world,MBT,{x:0,z:0,yaw:0})).toBe(true);
    expect(vehiclePoseBlocked(world,MBT,{x:0,z:0,yaw:90*DEG})).toBe(true);
    expect(vehiclePoseBlocked(world,MBT,{x:0,z:6,yaw:0},{from:{x:0,z:-6,yaw:0}})).toBe(true);
  });

  it('still treats a 1 m lip as a ramp (step-limit contract, no regression)',()=>{
    const open=hillside(0,{riser:{atZ:0,height:1}});
    const boxed=hillside(0,{riser:{atZ:0,height:1},footprint:true});
    for (const world of [open,boxed]) {
      expect(vehiclePoseBlocked(world,MBT,{x:0,z:0,yaw:0})).toBe(false);
      expect(vehiclePoseBlocked(world,MBT,{x:0,z:6,yaw:0},{from:{x:0,z:-6,yaw:0}})).toBe(false);
    }
  });

  it('rejects crests and basins that are locally flat but not drivable',()=>{
    const pit=hillside(0,{pit:2}), ridge=hillside(0,{pit:-2});
    expect(samples(pit,MBT,0,0,0).fit.residual).toBeGreaterThan(vehicleSlopeLimits(MBT).residual);
    expect(vehiclePoseBlocked(pit,MBT,{x:0,z:0,yaw:0})).toBe(true);
    expect(vehiclePoseBlocked(ridge,MBT,{x:0,z:0,yaw:0})).toBe(true);
    // A 1 m dip is one voxel step — the same thing the step rule calls a ramp.
    expect(vehiclePoseBlocked(hillside(0,{pit:1}),MBT,{x:0,z:0,yaw:0})).toBe(false);
  });

  it('feeds footprintBlocked a plane-based deck band, not the old highest−grade sweep',()=>{
    const bands:{x:number;z:number;yaw:number;min:number;max:number}[]=[];
    const base=hillside(25);
    const world:MotionWorld={...base,footprintBlocked:(x,z,_w,_d,yaw,_feet,_height,terrain)=>{
      if (terrain) bands.push({x,z,yaw,min:terrain.min,max:terrain.max});
      return false;
    }};
    const yaw=30*DEG;
    expect(vehiclePoseBlocked(world,MBT,{x:0,z:0,yaw})).toBe(false);
    const {fit}=samples(base,MBT,0,0,yaw);
    const span=Math.abs(fit.lateral)*MBT.w*.5+Math.abs(fit.longitudinal)*MBT.d*.5;
    expect(bands).toHaveLength(1);
    // Centred on the fitted plane, as wide as its corner range plus one step limit.
    expect((bands[0].max+bands[0].min)/2).toBeCloseTo(fit.y,6);
    expect(bands[0].max-bands[0].min).toBeCloseTo(2*(span+VEHICLE_STEP_LIMIT),6);
    expect(bands[0].min).toBeLessThanOrEqual(fit.lowest-VEHICLE_STEP_LIMIT+1e-9);
    expect(bands[0].max).toBeGreaterThanOrEqual(fit.highest+VEHICLE_STEP_LIMIT-1e-9);

    // Flat ground: one step limit either side, no grade term at all.
    const flat=hillside(0);
    const flatWorld:MotionWorld={...flat,footprintBlocked:(x,z,_w,_d,yaw,_feet,_height,terrain)=>{
      if (terrain) bands.push({x,z,yaw,min:terrain.min,max:terrain.max});
      return false;
    }};
    bands.length=0;
    expect(vehiclePoseBlocked(flatWorld,MBT,{x:0,z:0,yaw:0})).toBe(false);
    expect(bands[0].max-bands[0].min).toBeCloseTo(2*VEHICLE_STEP_LIMIT,6);
    expect(maxVehicleGrade(MBT)).toBeGreaterThan(2*VEHICLE_STEP_LIMIT);
  });
});

describe('hillside driving (advanceVehiclePose)',()=>{
  it('drives diagonally up and reverses back down a stepped 25° ramp without a single block',()=>{
    // Stepped decks + the real footprint band: the combination that used to wedge hulls.
    const world=hillside(25,{stepped:true,footprint:true});
    for (const kind of ['light_tank','mbt']) {
      const up={x:0,z:-20,yaw:30*DEG,speed:0,steering:0};
      expect(drive(world,kind,up,1,480),`${kind} must climb the 25° stepped ramp`).toBe(0);
      expect(Math.hypot(up.x,up.z+20),`${kind} climbed too little`).toBeGreaterThan(30);
      expect(world.ground(up.x,up.z),`${kind} gained height`).toBeGreaterThan(5);

      const top=world.ground(up.x,up.z);
      const down={x:up.x,z:up.z,yaw:30*DEG,speed:0,steering:0};
      expect(drive(world,kind,down,-1,300),`${kind} must reverse down without a support-spread veto`).toBe(0);
      expect(Math.hypot(down.x-up.x,down.z-up.z),`${kind} reversed`).toBeGreaterThan(8);
      expect(world.ground(down.x,down.z),`${kind} descended`).toBeLessThan(top-3);
    }
  });

  it('keeps wheeled and single-track hulls on stepped ramps (deck quantisation is not a wall)',()=>{
    const world=hillside(24,{stepped:true,footprint:true});
    for (const kind of ['jeep','apc','ifv','motorcycle']) {
      const up={x:0,z:-20,yaw:30*DEG,speed:0,steering:0};
      expect(drive(world,kind,up,1,420),`${kind} must climb a stepped 24° ramp`).toBe(0);
      expect(Math.hypot(up.x,up.z+20),`${kind} covered ground`).toBeGreaterThan(30);
    }
  });

  it('gives the driving path a small hillside allowance while probes stay strict',()=>{
    // 37° = past the 36° MBT envelope by less than the 2° hillside allowance.
    const world=hillside(37);
    expect(vehiclePoseBlocked(world,MBT,{x:0,z:0,yaw:0}),'strict probe refuses 37°').toBe(true);
    const state={x:0,z:0,yaw:0,speed:0,steering:0};
    expect(advanceVehiclePose(world,state,'mbt',1,0,1/60).blocked).toBe(false);
    drive(world,'mbt',state,1,90);
    expect(state.speed).toBeGreaterThan(1);
    expect(state.z).toBeGreaterThan(1);

    // 40° is still a wall, allowance or not: the hull never leaves the spot.
    const steep=hillside(40);
    const stuck={x:0,z:0,yaw:0,speed:0,steering:0};
    for (let i=0;i<3;i++) advanceVehiclePose(steep,stuck,'mbt',1,0,1/60);
    expect(Math.hypot(stuck.x,stuck.z)).toBeLessThan(.05);
    expect(stuck.speed).toBe(0);
  });
});

describe('real voxel decks (broken_bridge)',()=>{
  const map=getMap('broken_bridge')!;
  const data=buildVoxelMapData(map);
  const q=new VoxelWorldQueries(data);
  const world:MotionWorld={
    bounds:{minX:1,maxX:map.size-1,minZ:1,maxZ:map.size-1},
    ground:(x,z)=>q.primary(x,z),
    heightAt:(x,z)=>q.height(x,z),
    supportAt:(x,z,max)=>q.support(x,z,max),
    waterAt:(x,z,feet)=>q.water(x,z,feet),
    footprintBlocked:(x,z,w,d,yaw,feet,height,terrain)=>q.footprint(x,z,w,d,yaw,feet,height,terrain),
  };

  it('accepts a real 4 m stepped bank that the old diagonal-spread gate vetoed',()=>{
    // 9×9 primary decks around (164,68) climb 2 → 5: a ~24° bank, not a wall.
    const pose={x:164,z:68,yaw:0};
    const {spread,fit}=samples(world,LIGHT,pose.x,pose.z,pose.yaw);
    expect(spread).toBeGreaterThan(maxVehicleGrade(LIGHT));
    expect(Math.abs(Math.atan(fit.longitudinal))/DEG).toBeGreaterThan(20);
    expect(vehiclePoseBlocked(world,LIGHT,pose)).toBe(false);
  });

  it('keeps the reported red-house slope pose clear for a light tank',()=>{
    expect(vehiclePoseBlocked(world,LIGHT,{x:181,z:197,yaw:Math.PI})).toBe(false);
  });

  it('still refuses a hull inside the red-brick house (flat floor, walls only)',()=>{
    // The floor under the house is flat, so the slope gate can never stop this pose:
    // only the box/voxel query can, and it must keep working with a plane-based band.
    expect(q.footprint(195,189,LIGHT.w,LIGHT.d,0,q.primary(195,189)+.56,LIGHT.h)).toBe(true);
    expect(vehiclePoseBlocked(world,LIGHT,{x:195,z:189,yaw:0})).toBe(true);
  });
});
