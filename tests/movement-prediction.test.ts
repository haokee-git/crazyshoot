import {describe,it,expect} from 'vitest';
import {PerspectiveCamera,Vector3} from 'three';
import {PlayerController} from '../src/game/player/controller';
import type {Arena} from '../src/game/world/arena';
import {capturePredictedMovement,matchesPredictedMovement,replayMovementFromAuthority,simulateMovementCommand,type MovementCommand,type PredictedMovement} from '../src/game/core/movement-prediction';

const arena={bounds:{minX:-200,maxX:200,minZ:-200,maxZ:200},heightAt:()=>0,supportAt:()=>0,blockedAt:()=>false} as unknown as Arena;
function player(){const c=new PlayerController(new PerspectiveCamera());c.teleport(new Vector3());return c;}
function authority(c:PlayerController,seq:number){return {ackInput:seq,p:c.position.toArray(),velocity:c.velocity.toArray(),grounded:c.grounded,jumpHeld:c.jumpDown,crouching:c.crouched,prone:c.prone,motion:c.motionSnapshot};}
function command(seq:number):MovementCommand{
 return {seq,yaw:Math.sin(seq*.025)*1.4,pitch:Math.sin(seq*.1)*.4,keys:seq%180<140?['KeyW',...(seq%85<8?['Space']:[]),...(seq%180>=90?['ControlLeft']:[])]:[],active:seq%240<225,ads:seq%130<25,aiming:seq%130<25&&seq%260>15};
}
describe('acknowledged movement reconciliation',()=>{
 it('keeps two independent guests deterministic at 0–100 ms latency without losing inputs',()=>{
  for(const delay of [0,1,3,6])for(const guestId of [1,2]){
   let hostSeq=0;const guest=player(),host=player(),history:PredictedMovement[]=[],pending:MovementCommand[]=[],snapshots:{due:number;st:ReturnType<typeof authority>}[]=[];
   for(let tick=1;tick<=900;tick++){
    const c=command(tick);pending.push(c);simulateMovementCommand(guest,c,arena,1/60);history.push(capturePredictedMovement(guest,tick));
    // Different packet cadence/order of processing per guest, up to 100 ms one way.
    if(tick%(guestId+1)===0){
     for(const queued of pending)if(queued.seq<=tick-delay&&queued.seq>hostSeq){
      simulateMovementCommand(host,queued,arena,1/60);hostSeq=queued.seq;
      snapshots.push({due:tick+delay,st:authority(host,queued.seq)});
     }
    }
    while(snapshots.length&&snapshots[0].due<=tick){
     const st=snapshots.shift()!.st,sample=history.find(h=>h.seq===st.ackInput)!;
     expect(matchesPredictedMovement(sample,st),`guest ${guestId}, delay ${delay}, ack ${st.ackInput}`).toBe(true);
     // Confirmation never changes current pose, current jump latch, or look.
     while(pending.length&&pending[0].seq<=st.ackInput)pending.shift();
     while(history.length&&history[0].seq<st.ackInput)history.shift();
    }
   }
  }
 });
 it('replays all unacknowledged turns, jumps, posture and inactive ticks after an authoritative correction',()=>{
  const guest=player(),host=player(),expected=player(),commands:MovementCommand[]=[],history:PredictedMovement[]=[];
  for(let seq=1;seq<=180;seq++){
   const c=command(seq);simulateMovementCommand(guest,c,arena,1/60);
   if(seq<=80)simulateMovementCommand(host,c,arena,1/60);else commands.push(c);
  }
  host.position.x+=.4;host.velocity.z+=.6;
  const st=authority(host,80),yaw=guest.yaw,pitch=guest.pitch;
  expected.position.fromArray(st.p);expected.velocity.fromArray(st.velocity);expected.crouched=st.crouching;expected.prone=st.prone;expected.restoreMotion(st.motion);expected.grounded=st.grounded;expected.jumpDown=st.jumpHeld;
  for(const c of commands)simulateMovementCommand(expected,c,arena,1/60,true);
  replayMovementFromAuthority(guest,st,commands,history,arena,1/60);
  expect(guest.position.distanceTo(expected.position)).toBeLessThan(1e-9);
  expect(guest.velocity.distanceTo(expected.velocity)).toBeLessThan(1e-9);
  expect(guest.motionSnapshot).toEqual(expected.motionSnapshot);
  expect(guest.yaw).toBe(yaw);expect(guest.pitch).toBe(pitch);
  expect(history.at(-1)?.seq).toBe(180);
 });
 it('detects velocity and jump state errors even before their positions diverge',()=>{
  const guest=player(),host=player(),sample=capturePredictedMovement(guest,1);
  expect(matchesPredictedMovement(sample,authority(host,1))).toBe(true);
  host.velocity.x=1;expect(matchesPredictedMovement(sample,authority(host,1))).toBe(false);
  host.velocity.x=0;host.jumpDown=true;expect(matchesPredictedMovement(sample,authority(host,1))).toBe(false);
 });
});
