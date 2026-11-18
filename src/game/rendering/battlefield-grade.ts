export const GRADE=Object.freeze({
  contrast:1.14,
  pivot:.42,
  saturation:.88,
  shadowLift:.004,
  shoulderKnee:.82,
  shoulderSoftness:1.0,
  warmHighlight:[1.035,1.01,.97] as const,
  coolShadow:[.97,1.015,1.04] as const,
  splitPivot:.5,
  greenDesat:.78,
});

export const BATTLEFIELD_GRADE_GLSL=`
uniform float gradeStrength;
uniform float gradeContrast;
uniform float gradePivot;
uniform float gradeSaturation;
uniform float gradeShadowLift;
uniform float gradeKnee;
uniform float gradeKneeSoft;
uniform vec3 gradeWarm;
uniform vec3 gradeCool;
uniform float gradeSplitPivot;
uniform float gradeGreen;
vec3 battlefieldGrade(vec3 c,vec3 raw){
  c=pow(max(c,vec3(0.0)),vec3(gradeContrast))*pow(gradePivot,1.0-gradeContrast);
  float luma=clamp(dot(c,vec3(.2126,.7152,.0722)),0.0,2.0);
  c*=mix(gradeCool,gradeWarm,clamp((luma-gradeSplitPivot)*.8+.5,0.0,1.0));
  float l2=clamp(dot(c,vec3(.2126,.7152,.0722)),0.0,2.0);
  c=mix(vec3(l2),c,gradeSaturation);
  float g=clamp((c.g-(c.r+c.b)*.5)*2.2,0.0,1.0);
  c=mix(c,vec3(l2),g*(1.0-gradeGreen));
  c=vec3(gradeShadowLift)+(1.0-gradeShadowLift)*max(c,vec3(0.0));
  float l3=dot(c,vec3(.2126,.7152,.0722));
  if(l3>gradeKnee){
    float t=gradeKnee+(1.0-gradeKnee)*(1.0-exp(-(l3-gradeKnee)*gradeKneeSoft/(1.0-gradeKnee)));
    c*=t/max(l3,1e-4);
  }
  return mix(raw,c,gradeStrength);
}`;
