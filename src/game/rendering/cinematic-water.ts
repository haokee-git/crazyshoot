import * as THREE from 'three';
import {isWaterMaterial} from '../../content/materials/battlefield';

const WATER_LAYER=29;
export const F0=.02037;

export function fresnelSchlick(cos:number){return F0+(1-F0)*Math.pow(1-Math.min(1,Math.max(0,cos)),5);}

export function splitWaterTriangles(index:THREE.BufferAttribute,block:THREE.BufferAttribute){
  const water:number[]=[],glass:number[]=[];
  for(let t=0;t<index.count;t+=3){
    const id=Math.abs(block.getX(index.getX(t)));
    (isWaterMaterial(id)?water:glass).push(index.getX(t),index.getX(t+1),index.getX(t+2));
  }
  return {water,glass};
}

export function waterLevelAreas(position:THREE.BufferAttribute,normal:THREE.BufferAttribute,tris:number[]){
  const areas=new Map<number,number>();
  const p=new THREE.Vector3(),q=new THREE.Vector3(),r=new THREE.Vector3(),e1=new THREE.Vector3(),e2=new THREE.Vector3();
  for(let i=0;i<tris.length;i+=3){
    if(normal.getY(tris[i])<.5)continue;
    p.fromBufferAttribute(position,tris[i]);q.fromBufferAttribute(position,tris[i+1]);r.fromBufferAttribute(position,tris[i+2]);
    e1.subVectors(q,p);e2.subVectors(r,p);
    const level=Math.round((p.y+q.y+r.y)/3*2)/2;
    areas.set(level,(areas.get(level)??0)+e1.cross(e2).length()*.5);
  }
  return areas;
}

export function applyObliqueClip(proj:THREE.Matrix4,clip:THREE.Vector4,q:THREE.Vector4,bias:number){
  q.x=(Math.sign(clip.x)+proj.elements[8])/proj.elements[0];
  q.y=(Math.sign(clip.y)+proj.elements[9])/proj.elements[5];
  q.z=-1;
  q.w=(1+proj.elements[10])/proj.elements[14];
  clip.multiplyScalar(2/clip.dot(q));
  proj.elements[2]=clip.x;proj.elements[6]=clip.y;proj.elements[10]=clip.z+1-bias;proj.elements[14]=clip.w;
}

export interface SunShadowEntry{
  readonly map:THREE.Texture|null;
  readonly matrix:THREE.Matrix4;
  readonly distance:number;
  readonly bias:number;
}

const WATER_VERTEX=`
attribute float voxelBlock;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vBlockUv;
varying float vBlock;
varying vec4 vMirrorCoord;
uniform mat4 reflectionMatrix;
void main(){
  vBlockUv=uv;
  vBlock=voxelBlock;
  vec4 world=modelMatrix*vec4(position,1.0);
  vWorld=world.xyz;
  vNormal=normalize(mat3(modelMatrix)*normal);
  vMirrorCoord=reflectionMatrix*world;
  gl_Position=projectionMatrix*viewMatrix*world;
}`;

const WATER_FRAGMENT=`
uniform highp sampler2DArray blockMaps;
uniform sampler2D tRefraction;
uniform sampler2D tRefrDepth;
uniform sampler2D tMirror;
uniform sampler2D tSky;
uniform sampler2D shadowMap0;
uniform sampler2D shadowMap1;
uniform sampler2D shadowMap2;
uniform mat4 shadowMatrix0;
uniform mat4 shadowMatrix1;
uniform mat4 shadowMatrix2;
uniform vec3 shadowSplits;
uniform vec3 shadowBias3;
uniform float hasShadow;
uniform float hasMirror;
uniform float hasRefraction;
uniform float hasSky;
uniform float backgroundIntensity;
uniform mat4 reflectionMatrix;
uniform float waterLevel;
uniform float waterTime;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform vec3 cameraPos;
uniform vec3 sunDirection;
uniform vec3 sunRadiance;
uniform vec3 fogColor;
uniform float fogDensity;
const float F0=0.02037;
const float PI=3.14159265;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vBlockUv;
varying float vBlock;
varying vec4 vMirrorCoord;
#include <packing>
float shadowAt(vec3 world,float viewZ){
  float sum=0.0;
  if(hasShadow<0.5||viewZ>=shadowSplits.z)return 1.0;
  vec3 wp=world+vNormal*0.03;
  int cascade=viewZ<shadowSplits.x?0:(viewZ<shadowSplits.y?1:2);
  vec4 coord;
  if(cascade==0)coord=shadowMatrix0*vec4(wp,1.0);
  else if(cascade==1)coord=shadowMatrix1*vec4(wp,1.0);
  else coord=shadowMatrix2*vec4(wp,1.0);
  vec3 uv=coord.xyz/coord.w;
  if(uv.x<0.0||uv.x>1.0||uv.y<0.0||uv.y>1.0||uv.z>1.0)return 1.0;
  float bias=cascade==0?shadowBias3.x:(cascade==1?shadowBias3.y:shadowBias3.z);
  float depth=uv.z+bias;
  vec2 texel=vec2(0.00049);
  for(int i=0;i<4;i++){
    vec2 o=vec2(float(i%2)-0.5,float(i/2)-0.5)*texel;
    float d;
    if(cascade==0)d=unpackRGBAToDepth(texture2D(shadowMap0,uv.xy+o));
    else if(cascade==1)d=unpackRGBAToDepth(texture2D(shadowMap1,uv.xy+o));
    else d=unpackRGBAToDepth(texture2D(shadowMap2,uv.xy+o));
    sum+=d>=depth?1.0:0.0;
  }
  return sum*0.25;
}
vec3 rippleNormal(vec2 p,float t){
  float a1=sin(dot(p,vec2(1.7,.9))+t*1.45);
  float a2=cos(dot(p,vec2(-.7,1.9))-t*1.17);
  float a3=sin(dot(p,vec2(2.3,-1.3))+t*0.9);
  float a4=cos(dot(p,vec2(-1.1,-2.7))+t*1.9);
  return vec3(a1+a3*.6+a4*.4,a2+a4*.6+a3*.4,0.0);
}
vec3 skyFallback(vec3 dir){
  if(hasSky>0.5){
    vec2 sUv=vec2(atan(dir.z,dir.x)/(2.0*PI)+.5,asin(clamp(dir.y,-1.0,1.0))/PI+.5);
    return texture2D(tSky,sUv).rgb*backgroundIntensity;
  }
  float up=smoothstep(-0.16,0.45,dir.y);
  return mix(vec3(0.16,0.15,0.10),vec3(0.55,0.76,1.0),up);
}
void main(){
  vec3 view=vWorld-cameraPos;
  float viewDist=max(1e-4,length(view));
  vec3 viewDir=view/viewDist;
  vec3 baseN=normalize(vNormal);
  vec3 ripple=rippleNormal(vWorld.xz,waterTime);
  vec3 N=normalize(vec3(baseN.x+ripple.x*.045,baseN.y,baseN.z+ripple.y*.045));
  if(dot(N,-viewDir)<0.0)N=-N;
  vec4 mv=viewMatrix*vec4(vWorld,1.0);
  float viewZ=-mv.z;
  vec2 screenUv=gl_FragCoord.xy/resolution;
  float layer=vBlock-1.0;
  vec3 albedo=texture(blockMaps,vec3(vBlockUv+waterTime*vec2(.012,.006),layer)).rgb;
  float id=vBlock;
  vec3 absorb=id>=64.0&&id<=66.0?vec3(.30,.06,.05):(id==98.0?vec3(.28,.09,.06):vec3(.24,.075,.045));
  vec3 deep=id>=64.0&&id<=66.0?vec3(.09,.22,.16):(id==98.0?vec3(.06,.16,.20):vec3(.08,.17,.22));
  vec2 distort=ripple.xy*.006*clamp(6.0/viewDist,0.0,1.0);
  vec2 rUv=clamp(screenUv+distort,0.001,0.999);
  float sceneDepth=hasRefraction>0.5?texture2D(tRefrDepth,rUv).r:1.0;
  float sceneViewZ=-perspectiveDepthToViewZ(sceneDepth,cameraNear,cameraFar);
  if(sceneViewZ<viewZ-.02){rUv=screenUv;sceneDepth=hasRefraction>0.5?texture2D(tRefrDepth,rUv).r:1.0;sceneViewZ=-perspectiveDepthToViewZ(sceneDepth,cameraNear,cameraFar);}
  vec3 refractColor=hasRefraction>0.5?texture2D(tRefraction,rUv).rgb:skyFallback(-viewDir);
  float rayScale=viewDist/max(.001,viewZ);
  float thickness=max(0.0,sceneViewZ-viewZ)*rayScale;
  if(sceneDepth>=0.99999)thickness=24.0;
  vec3 transmit=exp(-absorb*thickness);
  vec3 refracted=refractColor*transmit+mix(albedo,deep,.6)*(1.0-transmit);
  float foam=(1.0-smoothstep(.05,.35,thickness))*(.55+.45*sin(vWorld.x*3.1+vWorld.z*2.7+waterTime*1.4));
  refracted=mix(refracted,vec3(.72,.78,.75),clamp(foam,0.0,1.0)*.35);
  float fres=F0+(1.0-F0)*pow(1.0-max(0.0,dot(N,-viewDir)),5.0);
  vec3 R=reflect(viewDir,N);
  vec3 reflected;
  if(baseN.y>.5&&abs(vWorld.y-waterLevel)<.05&&hasMirror>0.5){
    vec3 mc=vMirrorCoord.xyz/max(1e-4,vMirrorCoord.w);
    vec2 mUv=clamp(mc.xy+ripple.xy*.008,0.001,0.999);
    reflected=texture2D(tMirror,mUv).rgb;
    float edge=smoothstep(0.0,.06,mUv.x)*(1.0-smoothstep(.94,1.0,mUv.x))*smoothstep(0.0,.06,mUv.y)*(1.0-smoothstep(.94,1.0,mUv.y));
    reflected=mix(skyFallback(R),reflected,edge);
  }else reflected=skyFallback(R);
  float shadow=shadowAt(vWorld,viewZ);
  vec3 H=normalize(sunDirection-viewDir);
  float ndh=max(0.0,dot(N,H));
  float rough=.14;
  float alpha=rough*rough;
  float alpha2=alpha*alpha;
  float D=alpha2/(PI*pow(max(1e-4,ndh*ndh*(alpha2-1.0)+1.0),2.0));
  float ndv=max(1e-3,dot(N,-viewDir)),ndl=max(0.0,dot(N,sunDirection));
  float V=.5/max(ndl*sqrt(ndv*ndv*(1.0-alpha2)+alpha2)+ndv*sqrt(ndl*ndl*(1.0-alpha2)+alpha2),1e-5);
  float fvh=F0+(1.0-F0)*pow(1.0-clamp(dot(-viewDir,H),0.0,1.0),5.0);
  vec3 spec=sunRadiance*D*V*fvh*ndl*shadow;
  vec3 color=mix(refracted,reflected,fres)+spec;
  float fogF=1.0-exp(-viewDist*viewDist*fogDensity*fogDensity);
  color=mix(color,fogColor,fogF);
  gl_FragColor=vec4(color,1.0);
}`;

interface SourceMesh{mesh:THREE.Mesh;wasVisible:boolean}

export class CinematicWater{
  private readonly group=new THREE.Group();
  private readonly sources:SourceMesh[]=[];
  private readonly derived:THREE.Mesh[]=[];
  private readonly waterMeshes:THREE.Mesh[]=[];
  private waterLevel=0;
  private active=false;
  private hasPlane=false;
  private frameActive=false;
  private blockMap?:THREE.DataArrayTexture;
  private waterMaterial?:THREE.ShaderMaterial;
  private copyMaterial?:THREE.ShaderMaterial;
  private depthDebug?:THREE.ShaderMaterial;
  private copyQuad?:THREE.PlaneGeometry;
  private mirror?:THREE.WebGLRenderTarget;
  private refraction?:THREE.WebGLRenderTarget;
  private readonly mirrorCamera=new THREE.PerspectiveCamera();
  private sunShadows?:readonly SunShadowEntry[];
  private readonly mirrorMatrix=new THREE.Matrix4();
  private readonly clipPlane=new THREE.Plane();
  private readonly clipVec=new THREE.Vector4();
  private readonly q=new THREE.Vector4();
  private readonly reflDir=new THREE.Vector3();
  private readonly reflTarget=new THREE.Vector3();
  private readonly planeNormal=new THREE.Vector3(0,1,0);
  private readonly viewMatrix=new THREE.Matrix4();
  private readonly pvMatrix=new THREE.Matrix4();
  private readonly frustum=new THREE.Frustum();
  private readonly copyScene=new THREE.Scene();
  private readonly copyCamera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  private scene?:THREE.Scene;
  private initialized=false;

  state(){
    const u=this.waterMaterial?.uniforms;
    return {active:this.active,level:this.waterLevel,hasPlane:this.hasPlane,mirror:!!this.mirror,meshes:this.derived.length,
      blockMap:this.blockMap?.uuid??null,
      frameActive:this.frameActive,hasMirror:u?.hasMirror.value??0,hasRefraction:u?.hasRefraction.value??0,
      hasSky:u?.hasSky.value??0,hasShadow:u?.hasShadow.value??0,
      splits:u?(u.shadowSplits.value as THREE.Vector3).toArray():null,
      bias:u?(u.shadowBias3.value as THREE.Vector3).toArray():null};
  }

  initialize(scene:THREE.Scene,voxelRoot:THREE.Object3D){
    if(this.initialized)return;
    this.initialized=true;
    this.scene=scene;
    const transparent=voxelRoot.children.filter(c=>c.name==='voxel-water-glass')as THREE.Mesh[];
    for(const mesh of transparent){
      const geo=mesh.geometry,index=geo.index;
      if(!index)continue;
      const block=geo.getAttribute('voxelBlock')as THREE.BufferAttribute;
      if(!block)continue;
      const {water:waterIdx,glass:glassIdx}=splitWaterTriangles(index,block);
      if(!waterIdx.length)continue;
      this.sources.push({mesh,wasVisible:mesh.visible});
      const build=(tris:number[],material:THREE.Material,name:string)=>{
        const geo2=new THREE.BufferGeometry();
        for(const key of ['position','normal','uv','color','voxelBlock','voxelSurface','voxelOptical','voxelOcclusion','voxelSky']){
          const attr=geo.getAttribute(key)as THREE.BufferAttribute|undefined;
          if(!attr)continue;
          const size=attr.itemSize,arr=new Float32Array(tris.length*size);
          for(let i=0;i<tris.length;i++)for(let c=0;c<size;c++)arr[i*size+c]=attr.getComponent(tris[i],c);
          geo2.setAttribute(key,new THREE.BufferAttribute(arr,size,false));
        }
        geo2.computeBoundingSphere();
        const derived=new THREE.Mesh(geo2,material);
        derived.name=name;
        derived.matrixAutoUpdate=false;
        derived.matrix.copy(mesh.matrixWorld);
        derived.userData.cinematicExclude=true;
        return derived;
      };
      if(glassIdx.length)this.derived.push(build(glassIdx,mesh.material as THREE.Material,'derived-glass'));
      if(!this.waterMaterial)this.waterMaterial=this.makeWaterMaterial(mesh.material as THREE.Material);
      const water=build(waterIdx,this.waterMaterial,'derived-water');
      water.layers.set(WATER_LAYER);
      this.derived.push(water);
      this.waterMeshes.push(water);
      const areas=waterLevelAreas(geo.getAttribute('position')as THREE.BufferAttribute,geo.getAttribute('normal')as THREE.BufferAttribute,waterIdx);
      for(const [level,area]of areas)this.areaMap.set(level,(this.areaMap.get(level)??0)+area);
    }
    if(!this.waterMeshes.length){this.sources.length=0;this.derived.length=0;return;}
    let topArea=0;
    for(const [level,area]of this.areaMap)if(area>topArea){topArea=area;this.waterLevel=level;}
    this.hasPlane=topArea>0;
    for(const s of this.sources)s.mesh.visible=false;
    for(const d of this.derived)this.group.add(d);
    scene.add(this.group);
    this.group.updateMatrixWorld(true);
    const depth=new THREE.DepthTexture(1,1);
    depth.type=THREE.UnsignedIntType;
    this.refraction=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,depthTexture:depth,type:THREE.HalfFloatType});
    this.mirror=new THREE.WebGLRenderTarget(1,1,{depthBuffer:true,type:THREE.HalfFloatType});
    this.copyMaterial=new THREE.ShaderMaterial({
      depthTest:true,depthFunc:THREE.AlwaysDepth,depthWrite:true,side:THREE.DoubleSide,
      uniforms:{tColor:{value:null},tDepth:{value:null}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader:'uniform sampler2D tColor;uniform highp sampler2D tDepth;varying vec2 vUv;void main(){gl_FragColor=vec4(texture2D(tColor,vUv).rgb,1.0);gl_FragDepth=texture2D(tDepth,vUv).r;}',
    });
    this.copyQuad=new THREE.PlaneGeometry(2,2);
    this.copyScene.add(new THREE.Mesh(this.copyQuad,this.copyMaterial));
    this.active=true;
  }

  private readonly areaMap=new Map<number,number>();

  private makeWaterMaterial(source:THREE.Material){
    this.blockMap=(source.userData.arrayTexture as THREE.DataArrayTexture|undefined);
    return new THREE.ShaderMaterial({
      vertexShader:WATER_VERTEX,
      fragmentShader:WATER_FRAGMENT,
      side:THREE.DoubleSide,
      uniforms:{
        blockMaps:{value:this.blockMap},
        tRefraction:{value:null},tRefrDepth:{value:null},tMirror:{value:null},tSky:{value:null},
        shadowMap0:{value:null},shadowMap1:{value:null},shadowMap2:{value:null},
        shadowMatrix0:{value:new THREE.Matrix4()},shadowMatrix1:{value:new THREE.Matrix4()},shadowMatrix2:{value:new THREE.Matrix4()},
        shadowSplits:{value:new THREE.Vector3(36,92,220)},shadowBias3:{value:new THREE.Vector3()},hasShadow:{value:0},
        hasMirror:{value:0},hasRefraction:{value:0},hasSky:{value:0},backgroundIntensity:{value:1},
        reflectionMatrix:{value:this.mirrorMatrix},
        waterLevel:{value:0},waterTime:{value:0},
        resolution:{value:new THREE.Vector2(1,1)},cameraNear:{value:.15},cameraFar:{value:700},
        cameraPos:{value:new THREE.Vector3()},sunDirection:{value:new THREE.Vector3(0,1,0)},
        sunRadiance:{value:new THREE.Color(1,1,1)},fogColor:{value:new THREE.Color()},fogDensity:{value:0},
      },
    });
  }

  refreshTextures(voxelRoot:THREE.Object3D){
    const mat=voxelRoot.children.find(c=>c.name==='voxel-water-glass')as THREE.Mesh|undefined;
    const next=(mat?.material as THREE.Material|undefined)?.userData?.arrayTexture as THREE.DataArrayTexture|undefined;
    if(next&&next!==this.blockMap&&this.waterMaterial){
      this.blockMap=next;
      this.waterMaterial.uniforms.blockMaps.value=next;
    }
    if(mat)for(const d of this.derived)if(d.name==='derived-glass')d.material=mat.material as THREE.Material;
  }

  resize(width:number,height:number){
    this.mirror?.setSize(Math.max(1,Math.floor(width)>>1),Math.max(1,Math.floor(height)>>1));
    this.refraction?.setSize(Math.max(1,Math.floor(width)),Math.max(1,Math.floor(height)));
    if(this.waterMaterial)(this.waterMaterial.uniforms.resolution.value as THREE.Vector2).set(width,height);
  }

  render(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,frame:{now:number;sunDirection:THREE.Vector3;sunRadiance?:THREE.Color;sunShadows?:readonly SunShadowEntry[]}){
    if(!this.active||!this.waterMaterial||!this.mirror||!this.refraction)return;
    const u=this.waterMaterial.uniforms;
    this.viewMatrix.copy(camera.matrixWorld).invert();
    this.pvMatrix.multiplyMatrices(camera.projectionMatrix,this.viewMatrix);
    this.frustum.setFromProjectionMatrix(this.pvMatrix);
    let visible=false;
    for(const m of this.waterMeshes)if(this.frustum.intersectsObject(m)){visible=true;break;}
    this.frameActive=visible;
    if(!visible){u.hasMirror.value=0;return;}
    u.waterTime.value=frame.now/1000;
    u.waterLevel.value=this.waterLevel;
    (u.cameraPos.value as THREE.Vector3).copy(camera.position);
    u.cameraNear.value=camera.near;u.cameraFar.value=camera.far;
    (u.sunDirection.value as THREE.Vector3).copy(frame.sunDirection);
    if(frame.sunRadiance)(u.sunRadiance.value as THREE.Color).copy(frame.sunRadiance);
    if(scene.fog instanceof THREE.FogExp2){(u.fogColor.value as THREE.Color).copy(scene.fog.color);u.fogDensity.value=scene.fog.density;}
    const bg=scene.background;
    if(bg instanceof THREE.Texture){u.tSky.value=bg;u.hasSky.value=1;u.backgroundIntensity.value=scene.backgroundIntensity;}
    else{u.tSky.value=null;u.hasSky.value=0;}
    this.sunShadows=frame.sunShadows;
    const above=camera.position.y>this.waterLevel+.05&&this.hasPlane;
    if(above){
      const m=this.mirrorCamera;
      m.fov=camera.fov;m.aspect=camera.aspect;m.near=camera.near;m.far=camera.far;
      m.position.copy(camera.position);m.position.y=2*this.waterLevel-m.position.y;
      camera.getWorldDirection(this.reflDir);
      this.reflDir.y=-this.reflDir.y;
      this.reflTarget.copy(m.position).add(this.reflDir);
      m.up.set(0,-1,0);
      m.lookAt(this.reflTarget);
      m.updateProjectionMatrix();
      m.updateMatrixWorld();
      this.clipPlane.set(this.planeNormal,-this.waterLevel);
      this.clipPlane.applyMatrix4(m.matrixWorldInverse);
      this.clipVec.set(this.clipPlane.normal.x,this.clipPlane.normal.y,this.clipPlane.normal.z,this.clipPlane.constant);
      const proj=m.projectionMatrix;
      applyObliqueClip(proj,this.clipVec,this.q,.0012);
      this.mirrorMatrix.set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
      this.mirrorMatrix.multiply(proj).multiply(m.matrixWorldInverse);
      const savedTarget=renderer.getRenderTarget();
      const savedMask=camera.layers.mask;
      const savedBg=scene.background;
      const savedAuto=renderer.shadowMap.autoUpdate;
      const savedNeeds=renderer.shadowMap.needsUpdate;
      const savedXr=renderer.xr.enabled;
      try{
        renderer.xr.enabled=false;
        renderer.shadowMap.autoUpdate=false;
        renderer.shadowMap.needsUpdate=false;
        for(const d of this.waterMeshes)d.visible=false;
        renderer.setRenderTarget(this.mirror);
        renderer.clear();
        renderer.render(scene,m);
      }finally{
        for(const d of this.waterMeshes)d.visible=true;
        scene.background=savedBg;
        renderer.shadowMap.autoUpdate=savedAuto;
        renderer.shadowMap.needsUpdate=savedNeeds;
        renderer.xr.enabled=savedXr;
        renderer.setRenderTarget(savedTarget);
        camera.layers.mask=savedMask;
      }
      u.tMirror.value=this.mirror.texture;
      u.hasMirror.value=1;
    }else u.hasMirror.value=0;
    u.tRefraction.value=this.refraction.texture;
    u.tRefrDepth.value=this.refraction.depthTexture;
    u.hasRefraction.value=1;
  }

  copyRefraction(renderer:THREE.WebGLRenderer,world:THREE.WebGLRenderTarget){
    if(!this.active||!this.frameActive||!this.copyMaterial||!this.refraction)return;
    this.copyMaterial.uniforms.tColor.value=world.texture;
    this.copyMaterial.uniforms.tDepth.value=world.depthTexture;
    renderer.setRenderTarget(this.refraction);
    renderer.render(this.copyScene,this.copyCamera);
  }

  renderWater(renderer:THREE.WebGLRenderer,scene:THREE.Scene,camera:THREE.PerspectiveCamera,world:THREE.WebGLRenderTarget){
    if(!this.active||!this.frameActive||!this.waterMaterial)return;
    const u=this.waterMaterial.uniforms;
    const shadows=this.sunShadows;
    let shadowCount=0;
    for(let i=0;i<3;i++){
      const e=shadows&&i<shadows.length?shadows[i]:undefined;
      (u[`shadowMap${i}`] as {value:THREE.Texture|null}).value=e?e.map:null;
      if(e){
        (u[`shadowMatrix${i}`] as {value:THREE.Matrix4}).value.copy(e.matrix);
        const splits=u.shadowSplits.value as THREE.Vector3,bias=u.shadowBias3.value as THREE.Vector3;
        splits.setComponent(i,e.distance);
        bias.setComponent(i,e.bias);
        shadowCount++;
      }
    }
    u.hasShadow.value=shadowCount?1:0;
    const savedMask=camera.layers.mask;
    const savedBg=scene.background;
    const savedClear=renderer.autoClear;
    try{
      camera.layers.set(WATER_LAYER);
      scene.background=null;
      renderer.autoClear=false;
      renderer.setRenderTarget(world);
      renderer.render(scene,camera);
    }finally{
      camera.layers.mask=savedMask;
      scene.background=savedBg;
      renderer.autoClear=savedClear;
    }
  }

  debugDepthStats(renderer:THREE.WebGLRenderer):{min:number;max:number}|null{
    if(!this.refraction?.depthTexture||!this.copyScene.children.length||!this.copyMaterial)return null;
    if(!this.depthDebug)this.depthDebug=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,
      uniforms:{tDepth:{value:null}},
      vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
      fragmentShader:'uniform highp sampler2D tDepth;varying vec2 vUv;void main(){gl_FragColor=vec4(texture2D(tDepth,vUv).rrr,1.0);}',
    });
    this.depthDebug.uniforms.tDepth.value=this.refraction.depthTexture;
    const mesh=this.copyScene.children[0] as THREE.Mesh;
    const saved=mesh.material;
    mesh.material=this.depthDebug;
    const rt=new THREE.WebGLRenderTarget(8,8,{type:THREE.UnsignedByteType});
    const prev=renderer.getRenderTarget();
    try{renderer.setRenderTarget(rt);renderer.render(this.copyScene,this.copyCamera);}finally{renderer.setRenderTarget(prev);mesh.material=saved;}
    const px=new Uint8Array(8*8*4);
    renderer.readRenderTargetPixels(rt,0,0,8,8,px);
    rt.dispose();
    let min=255,max=0;
    for(let i=0;i<px.length;i+=4){if(px[i]<min)min=px[i];if(px[i]>max)max=px[i];}
    return {min:min/255,max:max/255};
  }

  dispose(){
    for(const s of this.sources)s.mesh.visible=s.wasVisible;
    this.sources.length=0;
    for(const d of this.derived){d.geometry.dispose();d.removeFromParent();}
    this.derived.length=0;
    this.waterMeshes.length=0;
    this.areaMap.clear();
    this.scene?.remove(this.group);
    this.scene=undefined;
    this.waterMaterial?.dispose();
    this.copyMaterial?.dispose();
    this.depthDebug?.dispose();
    this.copyQuad?.dispose();
    this.copyQuad=undefined;
    this.copyScene.clear();
    this.mirror?.dispose();
    this.refraction?.dispose();
    this.waterMaterial=undefined;this.copyMaterial=undefined;this.mirror=undefined;this.refraction=undefined;
    this.blockMap=undefined;
    this.active=false;this.hasPlane=false;this.frameActive=false;this.initialized=false;
  }
}
