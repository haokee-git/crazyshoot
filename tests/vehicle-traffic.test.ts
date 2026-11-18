import {describe,it,expect} from 'vitest';
import {convoyFollowing} from '../src/game/ai/vehicle-traffic';
import {vehicleSize,advanceVehicleSpeed,vehicleMaxSpeed} from '../src/game/vehicles/controller';
describe('armored convoy following',()=>{
 const hull=vehicleSize('light_tank'),apc=vehicleSize('apc');
 it('slows behind a capturing APC without asking the tank to reverse or abandon its route',()=>{
  const v={x:130,z:138,yaw:0,speed:0},leader={x:130,z:146,yaw:0,speed:0};
  for(let i=0;i<300;i++){
   const command=convoyFollowing(v,leader,hull,apc)!;expect(command).toBeDefined();
   v.speed=advanceVehicleSpeed(v.speed,command.throttle,vehicleMaxSpeed('light_tank'),1/60,true);v.z+=v.speed/60;
   expect(v.speed).toBeGreaterThanOrEqual(0);expect(leader.z-v.z).toBeGreaterThan((hull.d+apc.d)*.5);
  }
  expect(v.z).toBeGreaterThan(138.5);
  leader.speed=3;leader.z+=1;expect(convoyFollowing(v,leader,hull,apc)!.throttle).toBeGreaterThan(0);
 });
 it('does not follow adjacent lanes, oncoming vehicles or a car behind it',()=>{
  const v={x:130,z:138,yaw:0,speed:3};
  expect(convoyFollowing(v,{x:135,z:145,yaw:0,speed:0},hull,apc)).toBeUndefined();
  expect(convoyFollowing(v,{x:130,z:145,yaw:Math.PI,speed:0},hull,apc)).toBeUndefined();
  expect(convoyFollowing(v,{x:130,z:130,yaw:0,speed:0},hull,apc)).toBeUndefined();
 });
});
