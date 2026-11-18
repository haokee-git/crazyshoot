import {angleDelta} from '../vehicles/controller';
import type {MotionHull} from '../vehicles/motion';
interface TrafficPose {x:number;z:number;yaw:number;speed:number;}
/** Follow an occupied friendly lane without treating its leader as a wall.
 * Physics remains responsible for every actual hull/terrain collision. */
export function convoyFollowing(v:TrafficPose,leader:TrafficPose,hull:MotionHull,other:MotionHull){
  const dx=leader.x-v.x,dz=leader.z-v.z,along=dx*Math.sin(v.yaw)+dz*Math.cos(v.yaw),across=dx*Math.cos(v.yaw)-dz*Math.sin(v.yaw);
  const contact=(hull.d+other.d)*.5;
  if(along<=0||along>contact+9||Math.abs(across)>(hull.w+other.w)*.5+.3||Math.abs(angleDelta(leader.yaw,v.yaw))>.8||leader.speed<-.4)return;
  const gap=along-contact,speed=Math.max(0,Math.min(6.4,Math.max(0,leader.speed)+2,(gap-.7)*1.4));
  const turn=angleDelta(Math.atan2(dx,dz),v.yaw);
  let throttle=Math.max(-.6,Math.min(.65,(speed-v.speed)*.5));
  if(v.speed<.35&&throttle<0)throttle=0;
  return {along,throttle,steer:Math.max(-1,Math.min(1,turn*2.1))};
}
