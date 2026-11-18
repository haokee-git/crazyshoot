import {describe,it,expect} from 'vitest';
import {LIGHTING_PRESETS,LIGHTING_QUALITIES,isLightingQuality,lightingPreset} from '../src/game/rendering/lighting-presets';

describe('lighting quality presets',()=>{
  it('exposes exactly five tiers in order',()=>{
    expect(LIGHTING_QUALITIES).toEqual(['off','low','medium','high','ultra']);
  });

  it('is frozen and holds five unique profiles',()=>{
    expect(Object.isFrozen(LIGHTING_PRESETS)).toBe(true);
    for(const q of LIGHTING_QUALITIES)expect(Object.isFrozen(LIGHTING_PRESETS[q])).toBe(true);
    const signatures=LIGHTING_QUALITIES.map(q=>{
      const p=LIGHTING_PRESETS[q];
      return [p.sunShadows,p.contactShadows,p.ambientOcclusion,p.ambientOcclusionScale,p.glow,p.fogScale,p.cinematic].join('|');
    });
    expect(new Set(signatures).size).toBe(5);
  });

  it('maps the settled tier definitions',()=>{
    expect(LIGHTING_PRESETS.off).toMatchObject({sunShadows:'off',contactShadows:false,ambientOcclusion:false,glow:'off',fogScale:1.35,cinematic:false});
    expect(LIGHTING_PRESETS.low).toMatchObject({sunShadows:'fast',contactShadows:false,ambientOcclusion:false,glow:'off',fogScale:1.15,cinematic:false});
    expect(LIGHTING_PRESETS.medium).toMatchObject({sunShadows:'soft',contactShadows:true,ambientOcclusion:true,glow:'soft',fogScale:1,cinematic:false});
    expect(LIGHTING_PRESETS.high).toMatchObject({sunShadows:'fine',contactShadows:true,ambientOcclusion:true,glow:'strong',fogScale:.82,cinematic:false});
    expect(LIGHTING_PRESETS.ultra).toMatchObject({contactShadows:true,ambientOcclusion:true,ambientOcclusionScale:.65,fogScale:.9,cinematic:true});
  });

  it('keeps advanced effects exclusive to ultra',()=>{
    expect(LIGHTING_QUALITIES.filter(q=>LIGHTING_PRESETS[q].cinematic)).toEqual(['ultra']);
    expect(LIGHTING_PRESETS.ultra.glow).toBe('off');
    expect(LIGHTING_PRESETS.ultra.ambientOcclusionScale).toBeLessThan(1);
  });

  it('labels every tier and flags ultra as the expensive one',()=>{
    for(const q of LIGHTING_QUALITIES){const p=lightingPreset(q);expect(p.label.length).toBeGreaterThan(0);expect(p.description.length).toBeGreaterThan(0);}
    expect(LIGHTING_PRESETS.ultra.description).not.toBe(LIGHTING_PRESETS.high.description);
  });

  it('validates tier strings',()=>{
    for(const q of LIGHTING_QUALITIES)expect(isLightingQuality(q)).toBe(true);
    expect(isLightingQuality('epic')).toBe(false);
    expect(isLightingQuality(undefined)).toBe(false);
    expect(isLightingQuality(3)).toBe(false);
  });
});
