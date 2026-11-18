import type {Arena} from '../world/arena';

export interface WaterCrossing { x:number; nearZ:number; entryZ:number; farZ:number; direction:number; }

/** Find a clear swim lane and dry approach using the same voxel queries as movement. */
export function findBridgeWaterCrossing(arena:Arena, from:{x:number;z:number}, goal:{x:number;z:number}, seed:number):WaterCrossing|null {
  if(arena.mapId!=='broken_bridge'||!arena.waterAt||!arena.waterExitAt)return null;
  const direction=from.z<135&&goal.z>165?1:from.z>165&&goal.z<135?-1:0;
  if(!direction)return null;
  // These bank approaches were walked with the real capsule controller in both
  // directions; an open water column alone does not guarantee a clear bank.
  const lanes=direction>0?[90,160,180,200,220]:[70,110,180,200];
  let best:WaterCrossing|null=null,bestScore=Infinity;
  for(let i=0;i<lanes.length;i++){
    const x=lanes[(i+seed%lanes.length)%lanes.length]+.5;
    let first=-1,last=-1,clear=true;
    for(let z=120;z<=180;z++){
      const water=arena.waterAt(x,z+.5,-3);
      if(!water)continue;
      if(first<0)first=z;last=z;
      if(arena.blockedAt?.(x,z+.5,.38,water.surface-.48,1.8))clear=false;
    }
    if(!clear||first<0||last-first<8)continue;
    const nearZ=direction>0?first-5.5:last+6.5,entryZ=direction>0?first+2.5:last-1.5,farZ=direction>0?last-1.5:first+2.5;
    const y=arena.navigationHeight?.(x,nearZ)??arena.heightAt?.(x,nearZ)??0;
    if(arena.waterAt(x,nearZ,y)||arena.blockedAt?.(x,nearZ,.4,y)||!arena.waterExitAt(x,farZ))continue;
    const score=Math.abs(x-from.x)+Math.abs(x-goal.x)*.35+i*2;
    if(score<bestScore){bestScore=score;best={x,nearZ,entryZ,farZ,direction};}
  }
  return best;
}
