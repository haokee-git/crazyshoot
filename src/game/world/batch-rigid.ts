import * as THREE from 'three';
import {setDaylightMaterial} from './daylight';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
/** Rigid parts share one skinned draw; existing transform anchors remain authoritative. */
export function batchRigid(root:THREE.Group,anchors:THREE.Object3D[]){
 root.updateMatrixWorld(true);const nodes=[root,...anchors],parts:THREE.BufferGeometry[]=[],meshes:THREE.Mesh[]=[];let track:THREE.Texture|null=null;
 root.traverse(o=>{if((o as THREE.Mesh).isMesh)meshes.push(o as THREE.Mesh);});
 for(const mesh of meshes){const geo=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();geo.applyMatrix4(mesh.matrixWorld);let p:THREE.Object3D|null=mesh.parent;while(p&&!nodes.includes(p))p=p.parent;const bone=Math.max(0,nodes.indexOf(p!)),n=geo.getAttribute('position').count,indices=new Uint16Array(n*4),weights=new Float32Array(n*4),colors=new Float32Array(n*3),maps=new Float32Array(n),surface=new Float32Array(n*2);const mat=mesh.material as THREE.MeshStandardMaterial;if(mat.map)track=mat.map;
  for(let i=0;i<n;i++){indices[i*4]=bone;weights[i*4]=1;colors.set([mat.color.r,mat.color.g,mat.color.b],i*3);maps[i]=mat.map?1:0;surface[i*2]=mat.roughness??.8;surface[i*2+1]=mat.metalness??0;}
  geo.clearGroups();geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setAttribute('trackPart',new THREE.Float32BufferAttribute(maps,1));geo.setAttribute('surfaceResponse',new THREE.Float32BufferAttribute(surface,2));parts.push(geo);mesh.geometry.dispose();mesh.removeFromParent();
 }
 const geo=mergeGeometries(parts,false)!;for(const p of parts)p.dispose();const material=new THREE.MeshStandardMaterial({vertexColors:true,map:track});
 material.onBeforeCompile=s=>{
  s.vertexShader='attribute float trackPart;attribute vec2 surfaceResponse;flat varying float vTrackPart;flat varying vec2 vSurface;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvTrackPart=trackPart;vSurface=surfaceResponse;');
  s.fragmentShader='flat varying float vTrackPart;flat varying vec2 vSurface;\n'+s.fragmentShader
   .replace('#include <map_fragment>','#ifdef USE_MAP\ndiffuseColor *= mix(vec4(1.0),texture2D(map,vMapUv),vTrackPart);\n#endif')
   .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=vSurface.x;')
   .replace('#include <metalnessmap_fragment>','#include <metalnessmap_fragment>\nmetalnessFactor=vSurface.y;');
 };
 material.customProgramCacheKey=()=> 'rigid-daylight';
 setDaylightMaterial(material);
 const mesh=new THREE.SkinnedMesh(geo,material),skeleton=new THREE.Skeleton(nodes as unknown as THREE.Bone[]);root.add(mesh);mesh.bind(skeleton);mesh.computeBoundingSphere();root.userData.dispose=()=>skeleton.dispose();
}
