import * as THREE from 'three';
import {surfaceResponse} from '../world/daylight';

export const ultraSurface={value:0};

export const PIXEL_SURFACE_TBN_GLSL=`
mat3 pixelSurfaceTBN(vec3 eyePos,vec3 surfNorm,vec2 uv){
  vec3 q0=dFdx(eyePos);
  vec3 q1=dFdy(eyePos);
  vec2 st0=dFdx(uv);
  vec2 st1=dFdy(uv);
  vec3 N=normalize(surfNorm);
  vec3 q1perp=cross(q1,N);
  vec3 q0perp=cross(N,q0);
  vec3 T=q1perp*st0.x+q0perp*st1.x;
  vec3 B=q1perp*st0.y+q0perp*st1.y;
  float det=max(dot(T,T),dot(B,B));
  float scale=det<=0.0?0.0:inversesqrt(det);
  return mat3(T*scale,B*scale,N);
}`;

export function pixelSurfaceTexture(image:CanvasImageSource&{width:number;height:number},name:string):THREE.DataTexture|undefined{
  const w=image.width,h=image.height;
  if(!w||!h)return undefined;
  const canvas=document.createElement('canvas');
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!;
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(image,0,0);
  const packed=buildPixelSurface(ctx.getImageData(0,0,w,h).data,w,h,name);
  const tex=new THREE.DataTexture(packed,w,h,THREE.RGBAFormat,THREE.UnsignedByteType);
  tex.colorSpace=THREE.NoColorSpace;
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.magFilter=THREE.NearestFilter;
  tex.minFilter=THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps=true;
  tex.flipY=true;
  tex.needsUpdate=true;
  return tex;
}

export function setPixelSurfaceMaterial(material:THREE.MeshStandardMaterial,name:string){
  const compile=material.onBeforeCompile,key=material.customProgramCacheKey();
  material.onBeforeCompile=function(shader,renderer){
    compile.call(this,shader,renderer);
    let surf=material.userData.pixelSurface as THREE.DataTexture|undefined;
    if(!surf&&material.map?.image){surf=pixelSurfaceTexture(material.map.image as CanvasImageSource&{width:number;height:number},name);if(surf)material.userData.pixelSurface=surf;}
    shader.uniforms.ultraSurfaceMap={value:surf??null};
    shader.uniforms.ultraSurface=ultraSurface;
    shader.uniforms.ultraSurfValid={value:surf?1:0};
    shader.vertexShader='varying vec2 vSurfUv;\n'+shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
     vSurfUv=uv;`);
    shader.fragmentShader=`uniform sampler2D ultraSurfaceMap;
uniform float ultraSurface;
uniform float ultraSurfValid;
varying vec2 vSurfUv;
${PIXEL_SURFACE_TBN_GLSL}
`+shader.fragmentShader.replace('#include <map_fragment>',`
      #include <map_fragment>
      vec4 ultraSurf=vec4(.5,.5,1.0,1.0);
      if(ultraSurface>0.5&&ultraSurfValid>0.5)ultraSurf=texture2D(ultraSurfaceMap,vSurfUv);
     `).replace('#include <roughnessmap_fragment>',`
      #include <roughnessmap_fragment>
      roughnessFactor=mix(roughnessFactor,ultraSurf.b,ultraSurface*ultraSurfValid);
     `).replace('#include <normal_fragment_maps>',`
      #include <normal_fragment_maps>
      if(ultraSurface>0.5&&ultraSurfValid>0.5){
        vec3 surfN=vec3(ultraSurf.rg*2.0-1.0,1.0);
        surfN.xy*=1.6;
        normal=normalize(pixelSurfaceTBN(-vViewPosition,normal,vSurfUv)*surfN);
      }
     `).replace('#include <aomap_fragment>',`
      #include <aomap_fragment>
      reflectedLight.indirectDiffuse*=mix(1.0,ultraSurf.a,ultraSurface*ultraSurfValid);
     `);
  };
  material.customProgramCacheKey=()=>key+'|pixel-surface';
}

interface SurfaceProfile{
  readonly mode:'masonry'|'rock'|'wood'|'metal'|'water'|'generic';
  readonly relief:number;
  readonly roughMin:number;
  readonly roughMax:number;
  readonly roughJitter:number;
}

const profileFor=(name:string):SurfaceProfile=>{
  if(/water/.test(name))return {mode:'water',relief:0,roughMin:.1,roughMax:.22,roughJitter:0};
  if(/corroded|rust/.test(name))return {mode:'metal',relief:.3,roughMin:.6,roughMax:.95,roughJitter:.1};
  if(/metal|steel|container|floor_plate/.test(name))return {mode:'metal',relief:.16,roughMin:.3,roughMax:.65,roughJitter:.08};
  if(/wood|plank|crate/.test(name))return {mode:'wood',relief:.4,roughMin:.62,roughMax:.9,roughJitter:.1};
  if(/brick|concrete|plaster|stone|bedrock|limestone|slate|roof|asphalt/.test(name))return {mode:'masonry',relief:.85,roughMin:.72,roughMax:.95,roughJitter:.1};
  if(/rock|cliff|dirt|sand|soil|gravel/.test(name))return {mode:'rock',relief:.6,roughMin:.7,roughMax:.95,roughJitter:.12};
  return {mode:'generic',relief:.4,roughMin:.22,roughMax:.98,roughJitter:.1};
};

export function buildPixelSurface(rgba:Uint8ClampedArray|Uint8Array,width:number,height:number,name:string):Uint8Array{
  const profile=profileFor(name);
  const out=new Uint8Array(width*height*4);
  const heightField=new Float32Array(width*height);
  const lum=new Float32Array(width*height);
  const inv=1/255;
  const [baseRough]=surfaceResponse(name);
  for(let i=0;i<width*height;i++){
    const r=rgba[i*4]*inv,g=rgba[i*4+1]*inv,b=rgba[i*4+2]*inv;
    const l=Math.min(1,Math.max(0,Math.pow(r*.2126+g*.7152+b*.0722,.85)));
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b);
    const sat=mx>1e-4?(mx-mn)/mx:0;
    lum[i]=l;
    let h=l;
    if(profile.mode==='masonry'){
      const mortar=Math.min(1,Math.max(0,(l-.5)*4))*Math.min(1,Math.max(0,1-sat*4));
      const warmth=Math.min(1,Math.max(0,(r-b)*2.5))*sat;
      h=Math.min(1,Math.max(0,l*.82+warmth*.28-mortar*.52));
    }else if(profile.mode==='metal'){
      h=.5+(l-.5)*.55;
    }
    heightField[i]=h;
  }
  const scale=Math.max(1,Math.min(128,width))/32;
  const amp=profile.relief*scale*1.9;
  for(let y=0;y<height;y++){
    const ym=(y-1+height)%height,yp=(y+1)%height;
    for(let x=0;x<width;x++){
      const i=y*width+x;
      const xm=(x-1+width)%width,xp=(x+1)%width;
      const gx=heightField[y*width+xp]-heightField[y*width+xm];
      const gy=heightField[yp*width+x]-heightField[ym*width+x];
      let nx=-gx*amp,ny=-gy*amp;
      const len=Math.hypot(nx,ny);
      if(len>.5){nx*=.5/len;ny*=.5/len;}
      const l=lum[i];
      const rough=Math.min(profile.roughMax,Math.max(profile.roughMin,baseRough+(0.5-l)*profile.roughJitter*2));
      const here=heightField[i];
      const around=(heightField[y*width+xm]+heightField[y*width+xp]+heightField[ym*width+x]+heightField[yp*width+x])*.25;
      const cavity=Math.min(1,Math.max(0,(around-here)*4*profile.relief));
      out[i*4]=Math.round((nx*.5+.5)*255);
      out[i*4+1]=Math.round((ny*.5+.5)*255);
      out[i*4+2]=Math.round(rough*255);
      out[i*4+3]=Math.round((1-.08*cavity)*255);
    }
  }
  return out;
}
