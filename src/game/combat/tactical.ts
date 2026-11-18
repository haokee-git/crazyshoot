import * as THREE from 'three';
import type { Arena } from '../world/arena';
interface Grenade {active:boolean;kind:'frag'|'smoke';shooter:string;position:THREE.Vector3;velocity:THREE.Vector3;age:number;}
interface Smoke {active:boolean;center:THREE.Vector3;age:number;}
export class Tactical {
 readonly grenades:Grenade[]=Array.from({length:16},()=>({active:false,kind:'frag',shooter:'',position:new THREE.Vector3(),velocity:new THREE.Vector3(),age:0}));
 readonly smokes:Smoke[]=Array.from({length:4},()=>({active:false,center:new THREE.Vector3(),age:0}));
 readonly mesh:THREE.InstancedMesh;private smokeMeshes:THREE.Mesh[]=[];private transform=new THREE.Object3D();
 constructor(scene:THREE.Scene){this.mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.08,0),new THREE.MeshLambertMaterial({color:0x6c7954}),16);this.mesh.frustumCulled=false;this.mesh.count=0;scene.add(this.mesh);
  for(let i=0;i<4;i++){const m=new THREE.Mesh(new THREE.SphereGeometry(6,8,6),new THREE.MeshBasicMaterial({color:0xaab4b0,transparent:true,opacity:.75,depthWrite:false,side:THREE.DoubleSide}));
   // Impact decals (renderOrder 1) and dust (2) are instanced pools anchored at the
   // world origin, so depth sorting cannot place them behind a smoke cloud. Draw
   // smoke after both and let the depth buffer hide it behind nearer walls.
   m.name='smoke-cloud';m.renderOrder=3;m.visible=false;scene.add(m);this.smokeMeshes.push(m);}
 }
 spawn(shooter:string,kind:'frag'|'smoke',origin:THREE.Vector3,direction:THREE.Vector3){const p=this.grenades.find(p=>!p.active);if(!p)return false;p.active=true;p.kind=kind;p.shooter=shooter;p.position.copy(origin);p.velocity.copy(direction).multiplyScalar(18);p.velocity.y+=4;p.age=0;return true;}
 update(dt:number,arena:Arena,explode:(shooter:string,point:THREE.Vector3)=>void){
  for(const p of this.grenades){if(!p.active)continue;p.age+=dt;p.velocity.y-=9.81*dt;const direction=p.velocity.clone(),length=direction.length()*dt;direction.normalize();const hit=arena.rayDistance?.(p.position,direction,length)??Infinity;
   if(hit<length){p.position.addScaledVector(direction,Math.max(0,hit-.03));p.velocity.multiplyScalar(-.3);p.velocity.y=Math.abs(p.velocity.y);if(p.velocity.length()<1)p.velocity.set(0,0,0);}else p.position.addScaledVector(p.velocity,dt);
   if(p.age>=2.3){p.active=false;if(p.kind==='frag')explode(p.shooter,p.position);else{const s=this.smokes.find(s=>!s.active)??this.smokes[0];s.active=true;s.age=0;s.center.copy(p.position);s.center.y=Math.max(p.position.y,(arena.supportAt?.(p.position.x,p.position.z,p.position.y+.5)??arena.heightAt?.(p.position.x,p.position.z)??p.position.y)+2);}}
  }
  for(let i=0;i<this.smokes.length;i++){const s=this.smokes[i],mesh=this.smokeMeshes[i];if(s.active){s.age+=dt;if(s.age>=14)s.active=false;mesh.position.copy(s.center);mesh.scale.setScalar(Math.min(1,s.age/1.2));(mesh.material as THREE.Material).opacity=Math.min(.8,(14-s.age)*.5); }mesh.visible=s.active;}
  let count=0;for(const p of this.grenades)if(p.active){this.transform.position.copy(p.position);this.transform.updateMatrix();this.mesh.setMatrixAt(count++,this.transform.matrix);}this.mesh.count=count;this.mesh.instanceMatrix.needsUpdate=true;
 }
 blocksSight(a:THREE.Vector3,b:THREE.Vector3){const d=b.clone().sub(a),l=d.lengthSq();if(!l)return false;for(const s of this.smokes){if(!s.active)continue;const t=THREE.MathUtils.clamp(s.center.clone().sub(a).dot(d)/l,0,1);if(a.clone().addScaledVector(d,t).distanceToSquared(s.center)<36*Math.min(1,s.age/1.2)**2)return true;}return false;}
}
