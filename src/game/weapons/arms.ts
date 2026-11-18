import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {mergeOpaque} from './hero-model';
/** Analytic two-bone arms. Hand targets are gun sockets or the mantle ledge. */
export class FirstPersonArms {
 readonly root=new THREE.Group();
 private arms:{upper:THREE.Mesh;fore:THREE.Mesh;hand:THREE.Group;side:number}[]=[];
 constructor(){
  const cloth=new THREE.MeshStandardMaterial({color:0x68715c,roughness:.95}),cuff=new THREE.MeshStandardMaterial({color:0x4b5346,roughness:.93});
  for(const side of [-1,1]){const upper=new THREE.Mesh(new THREE.CylinderGeometry(.066,.077,1,10),cloth),fore=new THREE.Mesh(new THREE.CylinderGeometry(.045,.063,1,10),cuff),hand=new THREE.Group();
   const glove=new THREE.MeshStandardMaterial({color:0x45483d,roughness:.88}),pad=new THREE.MeshStandardMaterial({color:0x626453,roughness:.9});
   const palm=new THREE.Mesh(new RoundedBoxGeometry(.085,.095,.12,2,.012),glove);hand.add(palm);
   for(let i=0;i<4;i++){const finger=new THREE.Mesh(new RoundedBoxGeometry(.018,.060,.045,1,.007),pad);finger.position.set((i-1.5)*.020,-.025,-.065);finger.rotation.x=-.35;hand.add(finger);}
   const thumb=new THREE.Mesh(new RoundedBoxGeometry(.025,.06,.05,1,.009),glove);thumb.position.set(-side*.047,.012,-.01);thumb.rotation.z=side*.45;hand.add(thumb);mergeOpaque(hand);
   this.root.add(upper,fore,hand);this.arms.push({upper,fore,hand,side});
  }
 }
 private segment(mesh:THREE.Mesh,a:THREE.Vector3,b:THREE.Vector3){const d=b.clone().sub(a);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.scale.y=d.length();mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());}
 update(right:THREE.Vector3,left:THREE.Vector3,gripRotation:THREE.Quaternion){
  for(const arm of this.arms){const wrist=arm.side===1?right:left,shoulder=new THREE.Vector3(arm.side*.29,-.47,.025),delta=wrist.clone().sub(shoulder),length=delta.length(),axis=delta.clone().normalize();
   const L=.43,a=Math.min(L,length*.5),bend=Math.sqrt(Math.max(.002,L*L-a*a)),direction=new THREE.Vector3(arm.side,-.7,.1);direction.addScaledVector(axis,-direction.dot(axis)).normalize();
   const elbow=shoulder.clone().addScaledVector(axis,length*.5).addScaledVector(direction,bend);
   this.segment(arm.upper,shoulder,elbow);this.segment(arm.fore,elbow,wrist);arm.hand.position.copy(wrist);arm.hand.quaternion.copy(gripRotation);
  }
 }
}
