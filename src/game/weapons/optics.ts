import {RED_DOT_REFERENCE} from '../../content/weapons/red-dot-profile';
import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import type {OpticId} from '../../content/weapons/catalog';
import {mergeOpaque} from './hero-model';
export interface OpticDef {group:THREE.Group;eye:THREE.Vector3;relief:number;zoom:number;lens?:THREE.Mesh;mountBottom:number;}
/** Perspective magnification relative to the 55-degree 1x ADS view. */
export function opticFov(zoom:number){return 2*Math.atan(Math.tan(55*Math.PI/360)/Math.max(1,zoom))*180/Math.PI;}
export function buildOptic(id:OpticId):OpticDef {
 const group=new THREE.Group();group.name='optic-'+id;
 const body=new THREE.MeshStandardMaterial({color:0x272e30,roughness:.63,metalness:.18}),edge=new THREE.MeshStandardMaterial({color:0x505a5b,roughness:.58,metalness:.25});
 const box=(w:number,h:number,d:number,x:number,y:number,z:number,mat=body)=>{const m=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,1,Math.min(.003,w/5,h/5,d/5)),mat);m.position.set(x,y,z);group.add(m);return m;};
 const ring=(radius:number,tube:number,y:number,z:number)=>{const m=new THREE.Mesh(new THREE.TorusGeometry(radius,tube,6,48),body);m.position.set(0,y,z);group.add(m);return m;};
 const tube=(r:number,length:number,y:number,z:number)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,length,48,1,true),body);m.rotation.x=Math.PI/2;m.position.set(0,y,z);group.add(m);return m;};
 const zoom=id==='2x'?2:id==='3x'?3:id==='4x'?4:id==='6x'?6:id==='8x'?8:1;
 let height=.058,w=.064,h=.046,z=.014,relief=.25,shape=0;let apertureGeometry:THREE.BufferGeometry|undefined;
 const baseWidth=id==='red_dot'?.046:.07,baseLength=id==='red_dot'?.145:.105;
 box(baseWidth,.014,baseLength,0,.007,0); // authoritative base starts on the rail
 box(.007,.014,baseLength,baseWidth/2,.007,0,edge);box(.007,.014,baseLength,-baseWidth/2,.007,0,edge);
 if(id==='iron'){
  box(.008,.035,.014,-.018,.030,.025);box(.008,.035,.014,.018,.030,.025);box(.045,.008,.014,0,.016,.025);box(.006,.022,.008,0,.036,-.18,edge);
  mergeOpaque(group);return {group,eye:new THREE.Vector3(0,.046,.025),relief:.32,zoom:1,mountBottom:0};
 }
 if(id==='red_dot'){
  // Width-normalized gameplay trace, including the lower side bulge.
  shape=2;w=.050;h=.036;height=.054;z=-.022;relief=.25;
  const reference=RED_DOT_REFERENCE,unit=reference.worldWidth/reference.width;
  const profile=(trace:number[][])=>{const p=new THREE.Shape(),pts=trace.map(([x,y])=>new THREE.Vector2((x-reference.center[0])*unit,(reference.center[1]-y)*unit));
   for(let i=0;i<pts.length;i++){const v=pts[i],prev=pts[(i+pts.length-1)%pts.length],next=pts[(i+1)%pts.length],enter=v.clone().lerp(prev,Math.min(.22,.00045/v.distanceTo(prev))),leave=v.clone().lerp(next,Math.min(.22,.00045/v.distanceTo(next)));if(i===0)p.moveTo(enter.x,enter.y);else p.lineTo(enter.x,enter.y);p.quadraticCurveTo(v.x,v.y,leave.x,leave.y);}p.closePath();return p;};
  const outline=profile(reference.outer),hole=profile(reference.inner);outline.holes.push(hole);
  apertureGeometry=new THREE.ShapeGeometry(hole,4);
  group.userData.redDotProfile={outer:outline.getPoints(4).map(p=>[p.x,p.y]),inner:hole.getPoints(4).map(p=>[p.x,p.y]),height,z};
  const hood=new THREE.Mesh(new THREE.ExtrudeGeometry(outline,{depth:.006,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.00035,bevelThickness:.00035,curveSegments:4}),body);hood.position.set(0,height,z-.003);group.add(hood);
  for(const x of [-.017,.017])box(.008,.023,.012,x,.024,z-.001);
  box(.037,.016,.063,0,.022,.037);box(.029,.004,.030,0,.032,.051,edge);
  const dial=new THREE.Mesh(new THREE.CylinderGeometry(.006,.006,.005,16),body);dial.position.set(.011,.037,.047);group.add(dial);
 }else if(id==='holo'){
  shape=1;w=.088;h=.067;height=.067;relief=.255;
  const outline=new THREE.Shape(),hole=new THREE.Path();const rr=(p:THREE.Shape|THREE.Path,x:number,y:number,ww:number,hh:number,r:number)=>{p.moveTo(x+r,y);p.lineTo(x+ww-r,y);p.quadraticCurveTo(x+ww,y,x+ww,y+r);p.lineTo(x+ww,y+hh-r);p.quadraticCurveTo(x+ww,y+hh,x+ww-r,y+hh);p.lineTo(x+r,y+hh);p.quadraticCurveTo(x,y+hh,x,y+hh-r);p.lineTo(x,y+r);p.quadraticCurveTo(x,y,x+r,y);};
  rr(outline,-w/2-.005,-h/2-.005,w+.010,h+.010,.014);rr(hole,-w/2,-h/2,w,h,.009);outline.holes.push(hole);
  const hood=new THREE.Mesh(new THREE.ExtrudeGeometry(outline,{depth:.055,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.001,bevelThickness:.001,curveSegments:12}),body);hood.position.set(0,height,-.02);group.add(hood);
  box(w+.010,.023,.11,0,.025,-.015);box(.016,.012,.012,w/2+.008,.028,.018,edge);
 }else{
  shape=0;height=.066;w=h=.064;relief=.10;z=.105;
  const length=zoom>4?.27:.18;
  for(const zz of [-.05,.045]){box(.028,.032,.025,0,.027,zz);ring(.028,.0045,height,zz);}
  tube(.029,length,height,-.025);tube(.038,.036,height,z-.016);ring(.037,.005,height,z);ring(.036,.004,height,-length/2-.025);
  box(.024,.027,.025,0,height+.035,-.015,edge);box(.025,.022,.025,.036,height,-.015,edge);
 }
 mergeOpaque(group);
 const material=new THREE.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,side:THREE.DoubleSide,uniforms:{glowStrength:{value:1},worldMap:{value:null},screenSize:{value:new THREE.Vector2(1,1)},scopeBlend:{value:0},eye:{value:new THREE.Vector3(0,0,1)},reticleCenter:{value:new THREE.Vector2()},size:{value:new THREE.Vector2(w,h)},shape:{value:shape},kind:{value:zoom>1?2:0}},vertexShader:'varying vec2 pos;void main(){pos=position.xy;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',fragmentShader:`uniform float glowStrength;uniform sampler2D worldMap;uniform vec2 screenSize;uniform float scopeBlend;varying vec2 pos;uniform vec3 eye;uniform vec2 reticleCenter;uniform vec2 size;uniform float shape;uniform float kind;
 void main(){vec2 uv=pos/(size*.5);if(shape<.5&&dot(uv,uv)>1.0)discard;vec2 q=abs(pos)-size*.5+vec2(.006);if(shape>.5&&shape<1.5&&length(max(q,0.0))+min(max(q.x,q.y),0.0)>.006)discard;
 vec2 aim=pos-mix(eye.xy,reticleCenter,smoothstep(.12,.78,scopeBlend));float aa=max(fwidth(aim.x),fwidth(aim.y));float d=length(aim);float pointRadius=aa*1.8;float dotMark=1.0-smoothstep(pointRadius-aa*.6,pointRadius+aa*.6,d);float mark=dotMark;float centerMark=0.0;
 if(kind>1.5){float line=min(abs(aim.x),abs(aim.y));float lineWidth=max(.00012,aa*.85);mark=1.0-smoothstep(lineWidth-aa*.5,lineWidth+aa*.5,line);mark*=smoothstep(.0007,.0011,d);centerMark=1.0-smoothstep(.00025-aa*.5,.00025+aa*.5,d);}
 if(kind>1.5&&aim.y<-.003){float tickWidth=max(.000115,aa*.80);float tick=1.0-smoothstep(tickWidth-aa*.5,tickWidth+aa*.5,abs(mod(-aim.y,.004)-.002));tick*=1.0-smoothstep(.0018,.0018+aa,abs(aim.x));mark=max(mark,tick);}
 float facing=step(.001,eye.z);mark*=facing;centerMark*=facing;vec3 tint=vec3(.16,.28,.27);float alpha=.025+pow(1.0-abs(normalize(eye).z),4.0)*.10;vec3 under=tint;float optical=kind>1.5?smoothstep(.45,.85,scopeBlend):0.0;if(optical>0.0){under=mix(tint,texture2D(worldMap,gl_FragCoord.xy/screenSize).rgb,optical);alpha=mix(alpha,1.0,optical);}// Local emissive falloff; no full-screen blur/bloom or extra world pass.
 float coreRadius=kind>1.5?max(.00025,aa*1.2):pointRadius;float glowRadius=max(coreRadius*1.80,aa*2.55);
 float glow=.40*exp(-d*d/(2.0*glowRadius*glowRadius))+.07*exp(-d*d/(5.0*glowRadius*glowRadius));
 glow*=facing*glowStrength;float litAlpha=alpha+glow*(1.0-alpha);vec3 lit=(under*alpha*(1.0-glow)+vec3(1.0,.025,.006)*glow)/max(litAlpha,.00001);
 vec3 reticle=mix(lit,kind>1.5?vec3(.035,.04,.035):vec3(1.0,.025,.006),mark);reticle=mix(reticle,vec3(1.0,.012,.004),centerMark);float hotCore=exp(-pow(d/max(coreRadius*.78,aa*1.1),2.4))*facing;reticle=mix(reticle,vec3(1.0,.86,.72),hotCore);gl_FragColor=vec4(reticle,max(litAlpha,max(max(mark,centerMark),hotCore)*.98));
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 }`});
 const lens=new THREE.Mesh(apertureGeometry??new THREE.PlaneGeometry(w,h),material);lens.name='collimated-lens';lens.position.set(0,height,z);lens.renderOrder=3;group.add(lens);
 const inverse=new THREE.Matrix4();lens.onBeforeRender=(_r,_s,camera)=>{inverse.copy(lens.matrixWorld).invert();material.uniforms.eye.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inverse);};
 return {group,eye:new THREE.Vector3(0,height,z),relief,zoom,lens,mountBottom:0};
}
