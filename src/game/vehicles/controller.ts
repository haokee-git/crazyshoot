import * as THREE from 'three';
// World +X right, +Z down on the map, +Y up. Vehicle local forward is +Z.
// Positive THREE yaw turns +Z toward +X (counterclockwise from overhead).
// A => positive yaw forward; reverse uses ACTUAL signed speed, never throttle.
export const angleDelta=(target:number,current:number)=>Math.atan2(Math.sin(target-current),Math.cos(target-current));
export function hullYawRate(speed:number,steer:number,_maxSpeed:number,tracked:boolean){
 const magnitude=Math.abs(speed),radius=tracked?3.5:4.6,lateralAcceleration=tracked?4.8:5.4;
 if(magnitude<.35)return tracked?steer*.56:0;
 return steer*Math.sign(speed)*Math.min(tracked?.95:1.15,magnitude/radius,lateralAcceleration/magnitude);
}
export function advanceVehicleSpeed(speed:number,throttle:number,maxSpeed:number,dt:number,tracked:boolean,accelScale=1){
 const target=throttle*(throttle<0?maxSpeed*.43:maxSpeed);
 const braking=throttle!==0&&speed*throttle<0;
 const acceleration=braking?(tracked?5.2:6.4):throttle?(tracked?1.9:2.8)*(1-.55*Math.min(1,Math.abs(speed)/maxSpeed)):.52+Math.abs(speed)*.075;
 const scaled=acceleration*Math.max(.25,accelScale);
 return speed+THREE.MathUtils.clamp(target-speed,-scaled*dt,scaled*dt);
}
export const enclosedVehicle=(kind:string)=>kind!=='motorcycle'&&kind!=='jeep';
export interface Axis {angle:number;velocity:number;}
export function advanceAxis(axis:Axis,target:number,dt:number,maxSpeed:number,accel:number,min=-Infinity,max=Infinity,wrap=false){
 target=THREE.MathUtils.clamp(target,min,max);const error=wrap?angleDelta(target,axis.angle):target-axis.angle;
 const desired=Math.sign(error)*Math.min(maxSpeed,Math.sqrt(2*accel*Math.abs(error)));
 axis.velocity+=THREE.MathUtils.clamp(desired-axis.velocity,-accel*dt,accel*dt);
 const step=axis.velocity*dt;if(Math.abs(step)>Math.abs(error)&&Math.sign(step)===Math.sign(error)){axis.angle+=error;axis.velocity=0;}else axis.angle+=step;
 axis.angle=THREE.MathUtils.clamp(axis.angle,min,max);if(wrap)axis.angle=angleDelta(axis.angle,0);
}
export const vehicleSize=(kind:string)=>kind==='motorcycle'?{w:.8,d:2.1,h:1.4}:kind==='jeep'?{w:1.9,d:3.7,h:1.9}:kind==='mbt'?{w:3.4,d:6.6,h:2.5}:kind==='light_tank'?{w:2.8,d:5.3,h:2.3}:{w:2.8,d:5.4,h:2.4};
/** Top speed per hull (m/s). Shared by player driving, AI and the motion tests. */
export const vehicleMaxSpeed=(kind:string)=>kind==='motorcycle'?22:kind==='jeep'?19:kind==='apc'?14:kind==='ifv'?13:kind==='light_tank'?12:9.7;
/** Hulls that can neutral-steer (pivot on the spot). */
export const trackedHull=(kind:string)=>kind==='mbt'||kind==='light_tank'||kind==='ifv';
/** Runtime durability. Tuned against the AMR: 3/3/5/7 hits for APC/IFV/light tank/MBT. */
export const vehicleHealth=(kind:string)=>kind==='motorcycle'?60:kind==='jeep'?180:kind==='apc'?380:kind==='ifv'?420:kind==='light_tank'?700:1000;

/** Pedestrian impact damage. Vehicle speed is signed and expressed in metres per second. */
export function pedestrianImpactDamage(speed:number){
 const magnitude=Math.abs(speed);
 return magnitude*3.6>=40-1e-8?120:Math.max(0,(magnitude-2.5)*7);
}
