/** Translate all still-unacknowledged samples when the predicted controller is rebased. */
export function rebasePredictionHistory(samples:{seq:number;x:number;y:number;z:number}[],ack:number,dx:number,dy:number,dz:number){
  for(const sample of samples)if(sample.seq>ack){sample.x+=dx;sample.y+=dy;sample.z+=dz;}
}

/** Ease a visual correction without moving the camera backwards while walking forward. */
export function predictionOffsetDecay(offset:{x:number;z:number},velocity:{x:number;z:number},dt:number):number {
  let decay=1-Math.exp(-dt*18);
  const speed=Math.hypot(velocity.x,velocity.z);
  if(speed>.5){
    const againstMovement=(offset.x*velocity.x+offset.z*velocity.z)/speed;
    if(againstMovement>0)decay=Math.min(decay,speed*dt*.65/againstMovement);
  }
  return Math.max(0,Math.min(1,decay));
}

/** Interpolate toward received authority only. A velocity lead can overshoot
 * the next packet and make an observer see a forward runner slide backwards. */
export function smoothRemotePosition(position:{x:number;y:number;z:number},target:{x:number;y:number;z:number},speed:number,dt:number){
  const dx=target.x-position.x,dy=target.y-position.y,dz=target.z-position.z,distance=Math.hypot(dx,dy,dz);
  if(distance>8){position.x=target.x;position.y=target.y;position.z=target.z;return;}
  if(distance<1e-5)return;
  const blend=Math.min(1-Math.exp(-Math.max(0,dt)*55),(Math.max(4,speed)+4)*Math.max(0,dt)/distance);
  position.x+=dx*blend;position.y+=dy*blend;position.z+=dz*blend;
}
