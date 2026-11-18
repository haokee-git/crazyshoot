import * as THREE from 'three';
export class ContactShadows {
 readonly mesh:THREE.InstancedMesh;private dummy=new THREE.Object3D();
 constructor(scene:THREE.Scene,capacity=64){const c=document.createElement('canvas');c.width=c.height=32;const ctx=c.getContext('2d')!,g=ctx.createRadialGradient(16,16,2,16,16,16);g.addColorStop(0,'rgba(0,0,0,.35)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,32,32);const tex=new THREE.CanvasTexture(c);const material=new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false});this.mesh=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),material,capacity);this.mesh.frustumCulled=false;this.mesh.name='battlefield-contact-shadows';this.mesh.count=0;scene.add(this.mesh);}
 update(items:{x:number;y:number;z:number;w:number;d:number}[]){this.mesh.count=Math.min(this.mesh.instanceMatrix.count,items.length);for(let i=0;i<this.mesh.count;i++){const p=items[i];this.dummy.position.set(p.x,p.y+.025,p.z);this.dummy.rotation.set(-Math.PI/2,0,0);this.dummy.scale.set(p.w,p.d,1);this.dummy.updateMatrix();this.mesh.setMatrixAt(i,this.dummy.matrix);}this.mesh.instanceMatrix.needsUpdate=true;}
}
