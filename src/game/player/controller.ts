import {copyMantle,type MantleState} from './motion';
import {leanArc, leanTarget} from './stance';
import * as THREE from 'three';
import { getSettings } from '../core/settings';
import type { Arena } from '../world/arena';
import { findWaterMantle, SWIM_ASCENT_DEPTH, SWIM_DEPTH, SWIM_REST_DEPTH, SWIM_TRAVEL_DEPTH } from './swimming';

export interface PlayerInput {
  worldMove?:{x:number;z:number}|null;
  replaying?:boolean;
  down(code: string): boolean;
  consumeLook(): { x: number; y: number };
}

const PLAYER_RADIUS = 0.38;
const WALK_SPEED = 5.3;
const SPRINT_SPEED = 7.9;
const CROUCH_SPEED = 2.8;
const ACCEL = 38;
const FRICTION = 14;
const GRAVITY = 18;
const JUMP_SPEED = 6.6;
const MAX_STEP = 1.05;
const LOW_BANK_HEIGHT = .25;

export class PlayerController {
  readonly position = new THREE.Vector3(0, 0, 32);
  readonly velocity = new THREE.Vector3();
  lookScale=1;
  aiming=false;
  readonly impactVelocity=new THREE.Vector3();
  sprintAllowed=true;mantle:MantleState|null=null;
  private platform:{id:string;x:number;z:number;yaw:number;y:number;carry?:boolean;manualCarry?:boolean}|null=null;
  private jumpBuffer=0;private coyote=0;private penetrationTime=0;
  get mantleProgress(){return this.mantle?Math.min(1,this.mantle.elapsed/this.mantle.duration):0;}
  get motionSnapshot(){return {lean:this.lean,mantle:copyMantle(this.mantle),climbing:this.climbing,ladderId:this.ladderId,platformId:this.platform?.id??null,jumpBuffer:this.jumpBuffer,coyote:this.coyote,eyeHeight:this.eyeHeight,stepOffset:this.cameraStepOffset,impact:this.impactVelocity.toArray(),platform:this.platform?{...this.platform}:null,ladderCooldown:this.ladderCooldown,penetrationTime:this.penetrationTime,bodyH:this.bodyH,stanceElapsed:this.stanceElapsed,stanceDur:this.stanceDur,stanceFromH:this.stanceFromH,stanceToH:this.stanceToH,stanceFromEye:this.stanceFromEye,stanceToEye:this.stanceToEye};}
  restoreMotion(m:Partial<PlayerController['motionSnapshot']>){
    this.lean=m.lean??0;this.mantle=copyMantle(m.mantle??null);this.climbing=!!m.climbing;this.ladderId=m.ladderId??null;
    this.jumpBuffer=m.jumpBuffer??0;this.coyote=m.coyote??0;this.eyeHeight=m.eyeHeight??1.65;this.cameraStepOffset=m.stepOffset??0;
    this.impactVelocity.fromArray(m.impact??[0,0,0]);this.platform=m.platform?{...m.platform}:null;
    this.ladderCooldown=m.ladderCooldown??0;this.penetrationTime=m.penetrationTime??0;this.bodyH=m.bodyH??(this.prone?.74:this.crouched?1.25:1.8);this.stanceElapsed=m.stanceElapsed??0;this.stanceDur=m.stanceDur??0;this.stanceFromH=m.stanceFromH??this.bodyH;this.stanceToH=m.stanceToH??this.bodyH;this.stanceFromEye=m.stanceFromEye??this.eyeHeight;this.stanceToEye=m.stanceToEye??this.eyeHeight;
  }
  yaw = 0;
  pitch = 0;
  /** -1 = full left lean, 0 = upright, 1 = full right lean. Replicated for other players. */
  lean = 0;
  grounded = true;
  crouched = false;
  sprinting = false;
  moving = false;
  outOfBoundsSeconds=0;recoveryNotice=0;private safePosition=new THREE.Vector3(0,0,32);
  climbing=false;ladderId:string|null=null;private ladderCooldown=0;
  inWater = false;
  underwater = false;
  swimming = false;
  bob = 0;
  bobSide = 0;
  private eyeHeight = 1.65;
  /** Interpolated body height for collision/hit boxes while changing stance. */
  private bodyH = 1.8;
  private stanceElapsed = 0;
  private stanceDur = 0;
  private stanceFromH = 1.8;
  private stanceToH = 1.8;
  private stanceFromEye = 1.65;
  private stanceToEye = 1.65;
  private crouchLerp = 0;
  private bobPhase = 0;
  get gaitPhase(){return this.bobPhase;}
  private jumpHeld=false;
  private cameraStepOffset=0;
  private readonly camera: THREE.PerspectiveCamera;

  constructor(camera: THREE.PerspectiveCamera,readonly entityId='local') {
    this.camera = camera;
    camera.rotation.order = 'YXZ';
  }

  teleportSerial = 0;

  teleport(pos: THREE.Vector3, yaw = 0) {
    this.teleportSerial++;
    this.position.copy(pos);this.safePosition.copy(pos);this.outOfBoundsSeconds=0;this.recoveryNotice=0;
    this.velocity.set(0, 0, 0);this.impactVelocity.set(0,0,0);this.mantle=null;this.platform=null;this.jumpBuffer=0;this.jumpHeld=false;this.coyote=0;this.penetrationTime=0;
    this.yaw = yaw;
    this.pitch = 0;
    this.grounded = true;
    this.crouched = false;
    this.crouchLerp = 0;
    this.eyeHeight = 1.65;this.cameraStepOffset=0;
    this.bodyH = 1.8;this.stanceElapsed = 0;this.stanceDur = 0;this.stanceFromH = 1.8;this.stanceToH = 1.8;this.stanceFromEye = 1.65;this.stanceToEye = 1.65;
    this.bob = 0;
    this.bobSide = 0;
    this.climbing=false;this.ladderId=null;this.ladderCooldown=0;this.prone=false;this.lean=0;
    this.inWater = false;
    this.underwater = false;
    this.swimming = false;
  }

  reset(spawn: THREE.Vector3, yaw: number) {
    this.teleport(spawn, yaw);
  }

  private updateSafeZone(dt:number,arena:Arena){
    this.recoveryNotice=Math.max(0,this.recoveryNotice-dt);if(!arena.bounds)return;
    const b=arena.bounds,inside=this.position.x>=b.minX&&this.position.x<=b.maxX&&this.position.z>=b.minZ&&this.position.z<=b.maxZ;
    if(inside){this.outOfBoundsSeconds=0;if(this.grounded&&!this.inWater&&!(arena.blockedAt?.(this.position.x,this.position.z,.35,this.position.y)??false))this.safePosition.copy(this.position);}
    else this.outOfBoundsSeconds+=dt;
    if(this.outOfBoundsSeconds>=6||this.position.y< -12){this.teleportSerial++;this.position.copy(this.safePosition);this.velocity.set(0,0,0);this.grounded=true;this.climbing=false;this.ladderId=null;this.cameraStepOffset=0;this.outOfBoundsSeconds=0;this.recoveryNotice=2;}
  }

  private updateLadder(dt:number,input:PlayerInput,arena:Arena,active:boolean){
    this.ladderCooldown=Math.max(0,this.ladderCooldown-dt);const jump=active&&input.down('Space');
    let ladder=this.ladderId?arena.ladders?.find(l=>l.id===this.ladderId):undefined;
    if(!this.climbing&&active&&!jump&&this.ladderCooldown<=0&&(input.down('KeyW')||input.down('KeyS'))){
      ladder=arena.ladders?.find(l=>{const dx=this.position.x-l.x,dz=this.position.z-l.z,along=Math.abs(dx*(-l.normalZ)+dz*l.normalX),across=Math.abs(dx*l.normalX+dz*l.normalZ),facing=(-Math.sin(this.yaw))*(-l.normalX)+(-Math.cos(this.yaw))*(-l.normalZ);return along<.7&&across<1.05&&this.position.y>=l.bottom-.15&&this.position.y<=l.top+.35&&(facing>.25||this.position.y>=l.top-.2&&input.down('KeyS'));});
      if(ladder){this.climbing=true;this.ladderId=ladder.id;this.velocity.set(0,0,0);this.position.x=ladder.x+ladder.normalX*.48;this.position.z=ladder.z+ladder.normalZ*.48;}
    }
    if(!this.climbing||!ladder){this.climbing=false;this.ladderId=null;return false;}
    if(jump&&!this.jumpHeld){this.climbing=false;this.ladderId=null;this.ladderCooldown=.45;this.grounded=false;this.velocity.set(ladder.normalX*2.6,3.8,ladder.normalZ*2.6);this.position.x+=ladder.normalX*.12;this.position.z+=ladder.normalZ*.12;return false;}
    this.jumpHeld=jump;this.crouched=false;this.prone=false;this.setStanceTarget(false,false);this.advanceStance(dt);this.grounded=false;this.sprinting=false;this.swimming=false;this.inWater=false;this.underwater=false;this.bob=0;this.bobSide=0;
    const drive=active?(Number(input.down('KeyW'))-Number(input.down('KeyS'))):0;this.velocity.set(0,drive*2.6,0);this.moving=drive!==0;
    const next=this.position.y+drive*2.6*dt;
    if(next>=ladder.top-.015&&drive>0){
      const blocked=arena.playerBlocked?.(ladder.exitX,ladder.exitZ,.38,ladder.top,1.8,this.entityId)??arena.blockedAt?.(ladder.exitX,ladder.exitZ,.38,ladder.top)??false;
      if(!blocked){this.position.set(ladder.exitX,ladder.top,ladder.exitZ);this.climbing=false;this.ladderId=null;this.ladderCooldown=.35;this.grounded=true;this.velocity.set(0,0,0);}else this.position.y=Math.min(this.position.y,ladder.top-.1);
    }else if(next<=ladder.bottom&&drive<0){this.position.y=ladder.bottom;this.climbing=false;this.ladderId=null;this.ladderCooldown=.3;this.grounded=true;this.velocity.set(0,0,0);}
    else this.position.y=THREE.MathUtils.clamp(next,ladder.bottom,ladder.top);
    // Climbing settles the lean back upright; the camera still goes through the lean-aware helper.
    this.lean=THREE.MathUtils.damp(this.lean,0,7,dt);this.updateCamera(arena);return true;
  }

  prone=false;
  /** Interpolated hit-box height: stance changes take about a second. */
  get bodyHeight(){return this.bodyH;}
  private bodyBlocked(arena:Arena,x:number,y:number,z:number,height=this.bodyHeight){
    return arena.playerBlocked?.(x,z,PLAYER_RADIUS,y,height,this.entityId)??arena.blockedAt?.(x,z,PLAYER_RADIUS,y,height)??arena.blocked(x,z,PLAYER_RADIUS);
  }
  private support(arena:Arena,x:number,z:number,max:number){
    const at=(xx:number,zz:number)=>Math.max(arena.supportAt?.(xx,zz,max)??arena.heightAt?.(xx,zz)??0,arena.platformAt?.(xx,zz,max)?.y??-Infinity);
    const r=PLAYER_RADIUS+.005,d=r*Math.SQRT1_2;return Math.max(at(x,z),at(x-r,z),at(x+r,z),at(x,z-r),at(x,z+r),at(x-d,z-d),at(x+d,z-d),at(x-d,z+d),at(x+d,z+d));
  }
  findMantle(arena:Arena,dx:number,dz:number):MantleState|null{
    if(this.prone||this.climbing||this.mantle)return null;
    const len=Math.hypot(dx,dz);if(len<.1){dx=-Math.sin(this.yaw);dz=-Math.cos(this.yaw);}else{dx/=len;dz/=len;}
    const foot=this.position.y;
    const water=arena.waterAt?.(this.position.x,this.position.z,foot);
    if(water&&foot<water.surface){
      const exit=findWaterMantle(arena,this.position.x,foot,this.position.z,water.surface,dx,dz,this.entityId);
      if(exit||water.surface-water.bottom>=SWIM_DEPTH)return exit;
    }
    for(const distance of [.45,.65,.85,1.05,1.25]){
      const x=this.position.x+dx*distance,z=this.position.z+dz*distance;
      const top=arena.supportAt?.(x,z,foot+1.8)??arena.heightAt?.(x,z)??0;
      const rise=top-foot;if(rise<=1.22||rise>1.8)continue;
      // Land far enough inside the top for the whole capsule, not on an imaginary ledge.
      const tx=x+dx*.4,tz=z+dz*.4,target=arena.supportAt?.(tx,tz,top+.02)??top;
      if(Math.abs(target-top)>.03||this.bodyBlocked(arena,tx,top,tz,1.8))continue;
      let clear=true;for(let i=0;i<=8;i++){const t=i/8;if(this.bodyBlocked(arena,this.position.x+(tx-this.position.x)*t,top+.04,this.position.z+(tz-this.position.z)*t,1.8)){clear=false;break;}}
      if(!clear)continue;
      return {from:this.position.toArray() as [number,number,number],to:[tx,top,tz],edge:[x,top,z],elapsed:0,duration:.72};
    }return null;
  }
  private advanceMantle(dt:number,arena:Arena){
    const m=this.mantle!;m.elapsed+=dt;const t=Math.min(1,m.elapsed/m.duration),ease=(v:number)=>{const u=THREE.MathUtils.clamp(v,0,1);return u*u*(3-2*u);};
    const lift=ease(t/.52),move=ease((t-.5)/.5),x=m.from[0]+(m.to[0]-m.from[0])*move,z=m.from[2]+(m.to[2]-m.from[2])*move,y=m.from[1]+(m.to[1]-m.from[1]) *lift;
    if(this.bodyBlocked(arena,x,y,z,1.8)){this.mantle=null;this.velocity.set(0,0,0);this.grounded=false;return;}
    this.position.set(x,y,z);this.moving=true;this.sprinting=false;this.bob=0;this.bobSide=0;
    if(t===1){this.mantle=null;this.grounded=true;this.velocity.set(0,0,0);}
  }
  /**
   * 蹲/趴/站之间切换要花时间（趴下/起身约 1.2s，蹲起约 0.55s）：身位和眼睛高度一起
   * 平滑过渡，所以低身位不能瞬间获得，AI 也不能靠瞬间趴下躲子弹。
   */
  private setStanceTarget(prone:boolean,crouched:boolean){
    const height=prone?.74:crouched?1.25:1.8;
    if(Math.abs(height-this.stanceToH)<1e-3)return;
    const eye=prone?.48:crouched?1.12:1.65;
    this.stanceFromH=this.bodyH;this.stanceFromEye=this.eyeHeight;
    this.stanceToH=height;this.stanceToEye=eye;
    this.stanceElapsed=0;
    this.stanceDur=(prone||this.stanceToH<1.0)?1.2:crouched?.55:.55;
  }
  private advanceStance(dt:number){
    if(this.stanceDur<=0){this.bodyH=this.stanceToH;this.eyeHeight=this.stanceToEye;return;}
    this.stanceElapsed=Math.min(this.stanceDur,this.stanceElapsed+dt);
    const k=this.stanceElapsed/this.stanceDur,e=k*k*(3-2*k);
    this.bodyH=this.stanceFromH+(this.stanceToH-this.stanceFromH)*e;
    this.eyeHeight=this.stanceFromEye+(this.stanceToEye-this.stanceFromEye)*e;
    if(this.stanceElapsed>=this.stanceDur)this.stanceDur=0;
  }
  /**
   * Lean moves the eye, it never tilts it. The head/hands/gun ride the same arc
   * around the waist pivot, so the translation keeps the crosshair dead centre:
   * rotation stays exactly (pitch, yaw, 0) — no roll, no yaw change.
   */
  private updateCamera(arena?:Arena|null){
    const baseY=this.position.y+this.eyeHeight+this.bob+this.cameraStepOffset;
    const arc=leanArc(this.lean),rightX=Math.cos(this.yaw),rightZ=-Math.sin(this.yaw);
    let scale=1;
    if(Math.abs(arc.side)>1e-5||arc.drop>1e-5){
      // Never slide the shifted eye into geometry: fall back towards the upright eye.
      scale=0;
      for(const t of [1,.66,.33]){
        const x=this.position.x+rightX*arc.side*t,z=this.position.z+rightZ*arc.side*t,y=baseY-arc.drop*t;
        if(!(arena?.blockedAt?.(x,z,.07,y-.05,.12)??false)){scale=t;break;}
      }
    }
    this.camera.position.set(this.position.x+rightX*arc.side*scale,baseY-arc.drop*scale,this.position.z+rightZ*arc.side*scale);
    this.camera.rotation.set(this.pitch,this.yaw,0);
  }
  /** Rebuild the view after a network reset without running another physics tick. */
  refreshCamera(arena:Arena){this.updateCamera(arena);}
  private sampleWater(arena:Arena){
    const {x,y,z}=this.position;
    const water=arena.waterAt?.(x,z,y)??null;
    this.inWater=!!water&&y<water.surface-.015;
    this.swimming=!!water&&this.inWater&&water.surface-water.bottom>=SWIM_DEPTH;
    return water;
  }
  private lowBankAhead(arena:Arena,surface:number,dx:number,dz:number){
    const x=this.position.x+dx*.9,z=this.position.z+dz*.9;
    const top=arena.supportAt?.(x,z,surface+LOW_BANK_HEIGHT)??arena.heightAt?.(x,z)??-Infinity;
    if(top>=surface-LOW_BANK_HEIGHT&&top<=surface+LOW_BANK_HEIGHT&&!this.bodyBlocked(arena,x,top,z))return top;
  }
  update(dt:number,input:PlayerInput,arena:Arena,active:boolean,allowMovement=true){
    this.cameraStepOffset*=Math.exp(-dt*18);const look=input.consumeLook();
    if(active){this.yaw-=look.x*.0022*getSettings().sensitivity*this.lookScale;this.pitch=THREE.MathUtils.clamp(this.pitch-look.y*.0022*getSettings().sensitivity*this.lookScale*(getSettings().invertY?-1:1),-1.35,1.35);}
    const waterHere=this.sampleWater(arena);
    const wantCrouch=active&&!this.swimming&&input.down('ControlLeft');
    const wasLow=this.crouched||this.prone;
    if(active&&!this.mantle){
      const wantsProne=input.down('KeyZ')&&!this.inWater;
      this.prone=wantsProne||(this.prone&&this.bodyBlocked(arena,this.position.x,this.position.y,this.position.z,1.25));
      this.crouched=!this.prone&&(wantCrouch||(wasLow&&this.bodyBlocked(arena,this.position.x,this.position.y,this.position.z,1.8)));
    }
    this.setStanceTarget(this.prone,this.crouched);this.advanceStance(dt);
    this.crouchLerp=THREE.MathUtils.damp(this.crouchLerp,this.crouched?1:0,6,dt);
    if(!allowMovement){this.velocity.set(0,0,0);this.sprinting=false;this.moving=false;this.lean=THREE.MathUtils.damp(this.lean,0,7,dt);this.updateCamera(arena);return;}
    if(this.mantle){
      this.advanceMantle(dt,arena);this.lean=THREE.MathUtils.damp(this.lean,0,7,dt);this.updateCamera(arena);
      const water=this.sampleWater(arena);
      this.underwater=!!water&&this.camera.position.y<water.surface;
      return;
    }
    if(this.updateLadder(dt,input,arena,active))return;
    if(this.platform&&this.grounded&&!this.platform.manualCarry){const platform=arena.platformAt?.(this.position.x,this.position.z,this.position.y+2);if(platform?.id===this.platform.id){const delta=platform.yaw-this.platform.yaw,c=Math.cos(delta),sn=Math.sin(delta),x=this.position.x-this.platform.x,z=this.position.z-this.platform.z;const nx=platform.x+x*c+z*sn,nz=platform.z-x*sn+z*c,ny=this.position.y+platform.y-this.platform.y;if(this.platform.carry||!this.bodyBlocked(arena,nx,ny,nz)){this.position.set(nx,ny,nz);}}}
    let mx=0,mz=0;if(active){const f=Number(input.down('KeyW'))-Number(input.down('KeyS')),r=Number(input.down('KeyD'))-Number(input.down('KeyA'));mx=-Math.sin(this.yaw)*f+Math.cos(this.yaw)*r;mz=-Math.cos(this.yaw)*f-Math.sin(this.yaw)*r;if(input.worldMove){mx=input.worldMove.x;mz=input.worldMove.z;}const length=Math.hypot(mx,mz);if(length){mx/=length;mz/=length;}}
    const shift=active&&(input.down('ShiftLeft')||input.down('ShiftRight'));
    const dive=active&&input.down('AltLeft');
    const bank=this.inWater&&waterHere&&!this.prone&&!dive&&(mx||mz)?this.lowBankAhead(arena,waterHere.surface,mx,mz):undefined;
    this.sprinting=shift&&this.sprintAllowed&&!this.prone&&!this.crouched&&!this.inWater&&!dive&&Math.hypot(mx,mz)>.1;
    // Leaning needs a planted stance: no prone, swimming, climbing, mantle or sprint.
    const leanAllowed=active&&!this.prone&&!this.swimming&&!this.climbing&&!this.mantle&&!this.sprinting&&!this.inWater;
    this.lean=THREE.MathUtils.damp(this.lean,leanTarget(input.down('KeyQ'),input.down('KeyE'),leanAllowed),7,dt);
    const speed=this.swimming?(shift?4.4:2.7):this.inWater?2.7:this.prone?1.25:this.crouched?CROUCH_SPEED:this.sprinting?SPRINT_SPEED:dive?1.85:this.aiming?2.35:WALK_SPEED,response=mx||mz?11:13;
    this.velocity.x=THREE.MathUtils.damp(this.velocity.x,mx*speed,response,dt);this.velocity.z=THREE.MathUtils.damp(this.velocity.z,mz*speed,response,dt);
    const jump=active&&!this.prone&&input.down('Space');if(jump&&!this.jumpHeld)this.jumpBuffer=.14;else this.jumpBuffer=Math.max(0,this.jumpBuffer-dt);this.jumpHeld=jump;
    this.coyote=this.grounded?.09:Math.max(0,this.coyote-dt);
    if(this.swimming)this.grounded=false;
    if(!this.prone&&!this.crouched&&(this.inWater ? jump&&!dive : this.jumpBuffer>0)){
      const mantle=this.findMantle(arena,mx,mz);
      if(mantle){
        this.mantle=mantle;this.velocity.set(0,0,0);this.grounded=false;this.sprinting=false;
        this.jumpBuffer=0;this.advanceMantle(dt,arena);this.updateCamera(arena);return;
      }
      if(!this.swimming&&this.coyote>0){
        // A swimmer can keep holding Space across a shallow shelf before climbing its dry lip.
        const lip=this.inWater&&waterHere&&(mx||mz)&&findWaterMantle(arena,this.position.x,
          Math.max(this.position.y,waterHere.surface-SWIM_ASCENT_DEPTH),this.position.z,waterHere.surface,mx,mz,this.entityId);
        if(this.jumpBuffer>0||lip){this.velocity.y=JUMP_SPEED;this.grounded=false;this.coyote=0;this.jumpBuffer=0;}
      }
    }
    const moveAxis=(dx:number,dz:number)=>{
      const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.12));
      for(let i=0;i<steps;i++){
        const x=this.position.x+dx/steps,z=this.position.z+dz/steps,foot=this.position.y;
        const swimStep=bank===undefined?.30:.36;
        const stepLimit=foot+(this.grounded?(this.prone?.28:MAX_STEP):this.swimming?swimStep:.015);
        const max=this.grounded&&bank!==undefined?Math.max(stepLimit,bank):stepLimit;
        const surface=this.support(arena,x,z,max);
        const shelf=this.swimming&&waterHere&&surface>waterHere.surface-SWIM_DEPTH&&
          surface<=waterHere.surface+(bank===undefined?0:LOW_BANK_HEIGHT);
        const feet=this.grounded||shelf?Math.max(foot,surface):foot;
        if(!Number.isFinite(feet)||surface>max+.01||this.bodyBlocked(arena,x,feet,z))return false;
        if(feet>foot+.001){
          if(this.bodyBlocked(arena,this.position.x,feet,this.position.z))return false;
          const cameraLimit=bank===undefined?MAX_STEP:Math.max(MAX_STEP,feet-foot);
          this.cameraStepOffset=THREE.MathUtils.clamp(this.cameraStepOffset+foot-feet,-cameraLimit,cameraLimit);
          this.position.y=feet;
          if(shelf&&bank!==undefined&&surface>=waterHere.surface-LOW_BANK_HEIGHT)this.velocity.y=0;
        }
        this.position.x=x;this.position.z=z;
      }return true;
    };
    if(!moveAxis((this.velocity.x+this.impactVelocity.x)*dt,0)){this.velocity.x=0;this.impactVelocity.x=0;}
    if(!moveAxis(0,(this.velocity.z+this.impactVelocity.z)*dt)){this.velocity.z=0;this.impactVelocity.z=0;}
    this.impactVelocity.multiplyScalar(Math.exp(-dt*5));
    const water=this.sampleWater(arena);
    if(this.swimming&&water){
      this.grounded=false;
      if(dive&&!jump)this.velocity.y=THREE.MathUtils.damp(this.velocity.y,-2.7,6,dt);
      else{
        const moving=Math.hypot(this.velocity.x,this.velocity.z)>.25;
        const depth=jump&&!dive?SWIM_ASCENT_DEPTH:moving?SWIM_TRAVEL_DEPTH:SWIM_REST_DEPTH;
        // Bring the body up to the step gradually while swimming into a low bank.
        const approachingBank=bank!==undefined&&water.surface===waterHere?.surface;
        const target=approachingBank?Math.min(water.surface-.055,bank-.12):water.surface-depth;
        this.velocity.y+=(target-this.position.y)*(approachingBank?16:8)*dt;
        this.velocity.y*=Math.exp(-dt*(approachingBank?8:5.5));
      }
      this.velocity.y=THREE.MathUtils.clamp(this.velocity.y,-3.8,3.8);
    }else this.velocity.y-=GRAVITY*dt;
    // Continuous conservative vertical sweep: includes both feet and head, at every crossed layer.
    const amount=this.velocity.y*dt,steps=Math.max(1,Math.ceil(Math.abs(amount)/.08));let landed=false;
    for(let i=0;i<steps;i++){const old=this.position.y,next=old+amount/steps,ground=this.support(arena,this.position.x,this.position.z,old+.015);
      if(amount<=0&&next<=ground&&ground<=old+.02&&!this.bodyBlocked(arena,this.position.x,ground,this.position.z)){this.position.y=ground;this.velocity.y=0;landed=true;break;}
      if(this.bodyBlocked(arena,this.position.x,next,this.position.z)){let a=old,b=next;for(let j=0;j<9;j++){const mid=(a+b)/2;if(this.bodyBlocked(arena,this.position.x,mid,this.position.z))b=mid;else a=mid;}this.position.y=a;this.velocity.y=0;landed=amount<0;break;}this.position.y=next;
    }
    const finalWater=this.sampleWater(arena);
    this.grounded=landed&&!this.swimming;this.platform=this.grounded?(arena.platformAt?.(this.position.x,this.position.z,this.position.y+.03)??null):null;
    this.penetrationTime=this.bodyBlocked(arena,this.position.x,this.position.y,this.position.z)?this.penetrationTime+dt:0;
    if(this.penetrationTime>.25){let recovered=false;for(let radius=.1;radius<=2&&!recovered;radius+=.2)for(let i=0;i<12;i++){const a=i*Math.PI/6,x=this.position.x+Math.cos(a)*radius,z=this.position.z+Math.sin(a)*radius,y=this.support(arena,x,z,this.position.y+1.05);if(Number.isFinite(y)&&Math.abs(y-this.position.y)<1.1&&!this.bodyBlocked(arena,x,y,z)){this.position.set(x,y,z);this.velocity.set(0,0,0);this.penetrationTime=0;this.recoveryNotice=1;recovered=true;break;}}}
    // Replayed input is past simulation time. It cannot advance the boundary timer again.
    if(!input.replaying)this.updateSafeZone(dt,arena);
    const horizontal=Math.hypot(this.velocity.x,this.velocity.z);this.moving=horizontal>.25;
    // Prediction replay reconciles movement without advancing the local animation twice.
    if(!input.replaying){
      if(this.moving&&this.grounded&&!this.inWater){
        this.bobPhase+=dt*(this.sprinting?15:this.aiming?11:12);
        const gait=Math.min(1,horizontal/(this.aiming?2.35:WALK_SPEED));
        this.bob=Math.sin(this.bobPhase)*.033*gait;
        this.bobSide=Math.cos(this.bobPhase*.5)*.022*gait;
      }else{
        this.bob*=Math.exp(-dt*8);
        this.bobSide*=Math.exp(-dt*8);
      }
    }
    this.updateCamera(arena);this.underwater=!!finalWater&&this.camera.position.y<finalWater.surface;
  }

  applyNetworkPosition(x: number, y: number, z: number) {
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.grounded = true;
    this.updateCamera();
  }

  get jumpDown(){return this.jumpHeld;}
  set jumpDown(value:boolean){this.jumpHeld=value;}
  get eye() { return this.eyeHeight; }
  get crouchAmount() { return this.crouchLerp; }
}
