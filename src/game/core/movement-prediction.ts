import type {PlayerController} from '../player/controller';
import type {Arena} from '../world/arena';

export const MAX_MOVEMENT_COMMANDS=180;
export interface MovementCommand {
  seq:number;keys:string[];yaw:number;pitch:number;ads?:boolean;
  active?:boolean;aiming?:boolean;epoch?:number;
}
export interface PredictedMovement {
  seq:number;x:number;y:number;z:number;vx:number;vy:number;vz:number;
  grounded:boolean;jumpHeld:boolean;crouching:boolean;prone:boolean;
  motion:PlayerController['motionSnapshot'];
}
export function capturePredictedMovement(controller:PlayerController,seq:number):PredictedMovement {
  const p=controller.position,v=controller.velocity;
  return {seq,x:p.x,y:p.y,z:p.z,vx:v.x,vy:v.y,vz:v.z,grounded:controller.grounded,
    jumpHeld:controller.jumpDown,crouching:controller.crouched,prone:controller.prone,motion:controller.motionSnapshot};
}
// Only compare movement dynamics. Animation and presentation stay on local time.
const motionScalars=['climbing','ladderId','jumpBuffer','coyote','ladderCooldown','penetrationTime','bodyH','stanceElapsed','stanceDur','stanceFromH','stanceToH'] as const;
function equalNumbers(a:readonly number[]|undefined,b:readonly number[]|undefined){
  return !!a&&!!b&&a.length===b.length&&a.every((n,i)=>Math.abs(n-b[i])<1e-6);
}
export function matchesPredictedMovement(p:PredictedMovement,st:any):boolean {
  if(!equalNumbers([p.x,p.y,p.z],st.p)||!equalNumbers([p.vx,p.vy,p.vz],st.velocity)||
    p.grounded!==!!st.grounded||p.jumpHeld!==!!st.jumpHeld||p.crouching!==!!st.crouching||p.prone!==!!st.prone)return false;
  const a=p.motion,b=st.motion;
  if(!b)return false;
  for(const key of motionScalars){
    const v=a[key],w=b[key];
    if(typeof v==='number'&&typeof w==='number'?Math.abs(v-w)>1e-6:v!==w)return false;
  }
  if(!equalNumbers(a.impact,b.impact))return false;
  // Traversal is uncommon and depends on moving world contacts. Re-simulate it
  // from the authoritative traversal state instead of translating a saved path.
  return !a.mantle&&!b.mantle&&!a.platform&&!b.platform;
}
export function simulateMovementCommand(controller:PlayerController,command:MovementCommand,arena:Arena,step:number,replaying=false,allowed=true){
  controller.yaw=command.yaw;controller.pitch=command.pitch;
  controller.sprintAllowed=!command.ads;controller.aiming=command.aiming??!!command.ads;
  controller.update(step,{replaying,down:k=>command.keys.includes(k),consumeLook:()=>({x:0,y:0})},arena,command.active!==false&&allowed);
}

/** Restore the acknowledged simulation state, then run every later input once.
 * Local look remains immediate even when the acknowledged look is old. */
export function replayMovementFromAuthority(controller:PlayerController,st:any,commands:readonly MovementCommand[],history:PredictedMovement[],arena:Arena,step:number){
  const yaw=controller.yaw,pitch=controller.pitch;
  controller.position.fromArray(st.p);
  controller.crouched=!!st.crouching;controller.prone=!!st.prone;
  if(st.motion)controller.restoreMotion(st.motion);
  if(Array.isArray(st.velocity))controller.velocity.fromArray(st.velocity);
  controller.grounded=!!st.grounded;controller.jumpDown=!!st.jumpHeld;
  history.length=0;
  history.push(capturePredictedMovement(controller,st.ackInput));
  for(const command of commands){
    simulateMovementCommand(controller,command,arena,step,true);
    history.push(capturePredictedMovement(controller,command.seq));
  }
  controller.yaw=yaw;controller.pitch=pitch;
}
