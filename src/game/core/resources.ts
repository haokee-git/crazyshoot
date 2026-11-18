import * as THREE from 'three';
export function disposeObject(root:THREE.Object3D, textures=false){
 const gs=new Set<THREE.BufferGeometry>(),ms=new Set<THREE.Material>(),ts=new Set<THREE.Texture>();
 root.traverse(o=>{const mesh=o as THREE.Mesh;if(mesh.geometry)gs.add(mesh.geometry);for(const m of mesh.material?(Array.isArray(mesh.material)?mesh.material:[mesh.material]):[]){ms.add(m);if(textures){for(const v of Object.values(m))if(v instanceof THREE.Texture)ts.add(v);for(const v of Object.values(m.userData))if(v instanceof THREE.Texture)ts.add(v);}}});
 for(const g of gs)g.dispose();for(const m of ms)m.dispose();for(const t of ts)t.dispose();root.removeFromParent();
}
export function checkWebGL2(){const canvas=document.createElement('canvas');const gl=canvas.getContext('webgl2',{antialias:false});if(!gl)throw new Error('浏览器无法启用 WebGL2。请在浏览器设置中开启硬件加速并更新显卡驱动，然后重试。');const info={version:gl.getParameter(gl.VERSION),maxTexture:gl.getParameter(gl.MAX_TEXTURE_SIZE),maxRenderbuffer:gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)};gl.getExtension('WEBGL_lose_context')?.loseContext();return info;}
