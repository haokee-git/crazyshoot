import * as THREE from 'three';
import {setSunShadowMesh} from './sun-shadows';
import {addSkyReflection,addSunDisc,surfaceResponse} from './daylight';
import type {TerrainData} from './voxel-map-data';
import {bakeVoxelSky} from './voxel-skylight';
import {buildPixelSurface,ultraSurface,PIXEL_SURFACE_TBN_GLSL} from '../rendering/pixel-surfaces';
import {BLOCK_TEXTURES,MATERIAL_SLOTS,materialOpacity,materialUrl,isWaterMaterial} from '../../content/materials/battlefield';
const responses=Array.from({length:MATERIAL_SLOTS+1},(_,id)=>surfaceResponse(BLOCK_TEXTURES[id]??''));
const ALL_MATERIAL_NAMES=[...new Set(Object.values(BLOCK_TEXTURES))];

/**
 * Material names this terrain really references (chunk vertices + detail boxes).
 * Only these are decoded/uploaded, so a classic map never pulls the 30 pharaoh
 * finishes and a pharaoh map never uploads all 56 classic ones.
 */
export function usedMaterialNames(data:TerrainData):string[]{
 const seen=new Uint8Array(MATERIAL_SLOTS+1);
 for(const chunk of data.chunks){const block=chunk.block;for(let i=0;i<block.length;i++){const id=Math.abs(block[i])|0;if(id>0&&id<=MATERIAL_SLOTS)seen[id]=1;}}
 for(const box of data.detailBoxes??[]){const id=Math.abs(box.material)|0;if(id>0&&id<=MATERIAL_SLOTS)seen[id]=1;}
 const names=new Set<string>();
 for(let id=1;id<=MATERIAL_SLOTS;id++)if(seen[id]){const name=BLOCK_TEXTURES[id];if(name)names.add(name);}
 return [...names];
}

export function voxelMaterials(res:32|64|128,manager?:THREE.LoadingManager,required:readonly string[]=ALL_MATERIAL_NAMES){
 const pixels=new Uint8Array(res*res*4*MATERIAL_SLOTS),texture=new THREE.DataArrayTexture(pixels,res,res,MATERIAL_SLOTS);
 const surfacePixels=new Uint8Array(res*res*4*MATERIAL_SLOTS),surfaceTexture=new THREE.DataArrayTexture(surfacePixels,res,res,MATERIAL_SLOTS);
 // Strict texel magnification: every block face is a grid of flat colour squares.
 texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestMipmapLinearFilter;texture.generateMipmaps=true;texture.anisotropy=8;
 surfaceTexture.colorSpace=THREE.NoColorSpace;surfaceTexture.wrapS=surfaceTexture.wrapT=THREE.RepeatWrapping;surfaceTexture.magFilter=THREE.NearestFilter;surfaceTexture.minFilter=THREE.LinearMipmapLinearFilter;surfaceTexture.generateMipmaps=true;surfaceTexture.anisotropy=4;
 const loader=new THREE.TextureLoader(manager),names=[...new Set(required)];
 const ready=Promise.all(names.map(async name=>[name,await loader.loadAsync(materialUrl(name,res))] as const)).then(pairs=>{
  const images=new Map(pairs),canvas=document.createElement('canvas');canvas.width=canvas.height=res;const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.imageSmoothingEnabled=false;
  for(let layer=0;layer<MATERIAL_SLOTS;layer++){const name=BLOCK_TEXTURES[layer+1],image=images.get(name)?.image as HTMLImageElement|undefined;ctx.clearRect(0,0,res,res);if(image)ctx.drawImage(image,0,0,res,res);else{ctx.fillStyle='#88877d';ctx.fillRect(0,0,res,res);}const data=ctx.getImageData(0,0,res,res).data;pixels.set(data,layer*res*res*4);surfacePixels.set(buildPixelSurface(data,res,res,name??''),layer*res*res*4);}
  texture.needsUpdate=true;surfaceTexture.needsUpdate=true;for(const [,t] of pairs)t.dispose();
 });
 const aoStrength={value:.32};
 const create=(transparent:boolean)=>{
  const material=new THREE.MeshStandardMaterial({vertexColors:true,transparent,depthWrite:!transparent,side:transparent?THREE.DoubleSide:THREE.FrontSide});
  material.forceSinglePass=true;
  material.userData.arrayTexture=texture;
  material.userData.surfaceTexture=surfaceTexture;
  const time={value:0};
  material.onBeforeCompile=shader=>{
   shader.uniforms.blockMaps={value:texture};
   shader.uniforms.surfaceMaps={value:surfaceTexture};
   shader.uniforms.ultraSurface=ultraSurface;
   shader.uniforms.voxelTime=time;
   shader.uniforms.voxelAoStrength=aoStrength;
   shader.vertexShader=`
    attribute float voxelBlock;
    attribute vec2 voxelSurface;
    attribute vec2 voxelOptical;
    attribute float voxelOcclusion;
    attribute float voxelSky;
    varying vec2 blockUV;
    varying float blockOcclusion;
    varying float blockSky;
    flat varying vec3 blockMaterial;
    flat varying vec2 blockSurface;
   `+shader.vertexShader.replace('#include <begin_vertex>',`
    #include <begin_vertex>
    blockUV=uv;
    blockOcclusion=voxelOcclusion;
    blockSky=voxelSky;
    blockMaterial=vec3(voxelBlock-1.0,voxelOptical);
    blockSurface=voxelSurface;
   `);
   shader.fragmentShader=`
    uniform highp sampler2DArray blockMaps;
    uniform highp sampler2DArray surfaceMaps;
    uniform float ultraSurface;
    uniform float voxelTime;
    uniform float voxelAoStrength;
    varying vec2 blockUV;
    varying float blockOcclusion;
    varying float blockSky;
    flat varying vec3 blockMaterial;
    flat varying vec2 blockSurface;
    ${PIXEL_SURFACE_TBN_GLSL}
   `+shader.fragmentShader.replace('#include <map_fragment>',`
    vec4 texel=texture(blockMaps,vec3(blockUV+blockMaterial.z*voxelTime*vec2(.012,.006),blockMaterial.x));
    diffuseColor*=vec4(texel.rgb,min(texel.a,blockMaterial.y));
    vec4 ultraSurf=vec4(.5,.5,1.0,1.0);
    if(ultraSurface>0.5)ultraSurf=texture(surfaceMaps,vec3(blockUV,blockMaterial.x));
   `).replace('#include <roughnessmap_fragment>',`
    #include <roughnessmap_fragment>
    roughnessFactor=mix(blockSurface.x,ultraSurf.b,ultraSurface);
   `).replace('#include <metalnessmap_fragment>',`
    #include <metalnessmap_fragment>
    metalnessFactor=blockSurface.y;
   `).replace('#include <normal_fragment_maps>',`
    #include <normal_fragment_maps>
    if(ultraSurface>0.5){
      vec3 surfN=vec3(ultraSurf.rg*2.0-1.0,1.0);
      surfN.xy*=1.6;
      normal=normalize(pixelSurfaceTBN(-vViewPosition,normal,blockUV)*surfN);
    }
    if(blockMaterial.z>.5){
      vec3 worldNormal=transformDirectionByInverseViewMatrix(normal,viewMatrix);
      if(worldNormal.y>.5){
        float amplitude=1.0-smoothstep(14.0,48.0,length(vViewPosition));
        vec2 p=blockUV;
        vec2 ripples=vec2(sin(dot(p,vec2(1.7,.9))+voxelTime*1.45),
                         cos(dot(p,vec2(-.7,1.9))-voxelTime*1.17));
        worldNormal.xz+=ripples*.032*amplitude;
        normal=normalize(mat3(viewMatrix)*worldNormal);
      }
    }
   `).replace('#include <aomap_fragment>',`
    #include <aomap_fragment>
    reflectedLight.indirectDiffuse*=1.0-blockOcclusion*voxelAoStrength;
    reflectedLight.indirectDiffuse*=mix(1.0,ultraSurf.a*mix(.12,1.0,blockSky),ultraSurface);
    reflectedLight.indirectSpecular*=mix(1.0,mix(.20,1.0,blockSky),ultraSurface);
   `);
   addSkyReflection(shader);
  };
  material.onBeforeRender=()=>{time.value=performance.now()/1000;};
  material.customProgramCacheKey=()=>`voxel-daylight-${res}-${transparent}`;
  return material;
 };
 return {opaque:create(false),transparent:create(true),ready,texture,surfaceTexture,aoStrength};

}
export function renderVoxelMap(data:TerrainData,res:32|64|128,manager?:THREE.LoadingManager){const group=new THREE.Group();group.name='minecraft-voxel-world';if(data.chunks.some(c=>!c.skyLight||c.skyLight.length!==c.block.length))bakeVoxelSky(data);const names=usedMaterialNames(data),materials=voxelMaterials(res,manager,names);group.userData.ready=materials.ready;
 // Per-map ambient-occlusion strength (pharaoh lowers it so stacked terraces do not read as outlines).
 const configuredAo=(data as TerrainData&{aoStrength?:number}).aoStrength??.32;
 materials.aoStrength.value=configuredAo;
 let current=materials,request=0,aoEnabled=true,aoScale=1;
 const applyAo=()=>{current.aoStrength.value=aoEnabled?configuredAo*aoScale:0;};
 group.userData.setAmbientOcclusion=(enabled:boolean,scale=1)=>{aoEnabled=enabled;aoScale=scale;applyAo();};
 group.userData.ultraSurface=ultraSurface;
 group.userData.lightingState=()=>({enabled:aoEnabled,scale:aoScale,strength:current.aoStrength.value,ultraSurface:ultraSurface.value,skyBaked:data.chunks.every(c=>c.transparent||c.skyLight?.length===c.block.length)});
 group.userData.setTextureResolution=async(next:32|64|128)=>{
  const revision=++request;if(next===res)return;
  const nextMaterials=voxelMaterials(next,undefined,names);
  const dispose=(m:typeof materials)=>{m.texture.dispose();m.surfaceTexture.dispose();m.opaque.dispose();m.transparent.dispose();};
  try{await nextMaterials.ready;}catch(error){dispose(nextMaterials);throw error;}
  if(revision!==request||!group.parent){dispose(nextMaterials);return;}
  for(const child of group.children){const mesh=child as THREE.Mesh;mesh.material=mesh.material===current.transparent?nextMaterials.transparent:nextMaterials.opaque;setSunShadowMesh(mesh,!mesh.material.transparent);}
  dispose(current);current=nextMaterials;res=next;applyAo();
 };
 for(const chunk of data.chunks){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(chunk.position,3));geo.setAttribute('normal',new THREE.BufferAttribute(chunk.normal,3));geo.setAttribute('uv',new THREE.BufferAttribute(chunk.uv,2));geo.setAttribute('color',new THREE.BufferAttribute(chunk.color,3));geo.setAttribute('voxelBlock',new THREE.BufferAttribute(chunk.block,1));const surface=new Float32Array(chunk.block.length*2),optical=new Float32Array(chunk.block.length*2);
 for(let i=0;i<chunk.block.length;i++){const id=chunk.block[i];surface.set(responses[id],i*2);optical[i*2]=materialOpacity(id);optical[i*2+1]=Number(isWaterMaterial(id));}
 geo.setAttribute('voxelSurface',new THREE.BufferAttribute(surface,2));geo.setAttribute('voxelOptical',new THREE.BufferAttribute(optical,2));
 geo.setAttribute('voxelOcclusion',new THREE.BufferAttribute(chunk.occlusion??new Uint8Array(chunk.block.length),1,true));geo.setAttribute('voxelSky',new THREE.BufferAttribute(chunk.skyLight??new Uint8Array(chunk.block.length).fill(255),1,true));geo.setIndex(new THREE.BufferAttribute(chunk.index,1));geo.computeBoundingSphere();const mesh=new THREE.Mesh(geo,chunk.transparent?materials.transparent:materials.opaque);mesh.name=chunk.transparent?'voxel-water-glass':'voxel-blocks';setSunShadowMesh(mesh,!chunk.transparent);group.add(mesh);}return group;}
export function addSkybox(scene:THREE.Scene,sky='noon',_size=300,manager?:THREE.LoadingManager){
 const name=['noon','morning','dusk'].includes(sky)?sky:'noon',dusk=name==='dusk';
 const texture=new THREE.TextureLoader(manager).load(`/skies/${name}.jpg`);texture.colorSpace=THREE.SRGBColorSpace;texture.mapping=THREE.EquirectangularReflectionMapping;scene.background=texture;scene.backgroundIntensity=1;
 scene.fog=new THREE.FogExp2(dusk?'#ad8b80':name==='morning'?'#adc8d1':'#b4cfdb',.0020);
 scene.add(new THREE.HemisphereLight(dusk?0xffdec0:0xe3efff,dusk?0xa68773:0xc0ba9f,dusk?1.9:2.65));
 scene.add(new THREE.AmbientLight(0xfff1d7,dusk?.28:.48));
 const sun=new THREE.DirectionalLight(dusk?0xffbc83:name==='morning'?0xffe0b7:0xfff0d8,dusk?2.55:3.15);
 sun.name='battlefield-sun';sun.position.set(-120,dusk?62:name==='morning'?105:155,80);scene.add(sun);
 addSunDisc(scene,sun);
}
