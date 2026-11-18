import {it,expect} from 'vitest';
import {opticFov} from '../src/game/weapons/optics';
it('maintains true magnification including a distinct 8x view',()=>{
 const base=Math.tan(opticFov(1)*Math.PI/360);
 for(const zoom of [1,2,3,4,6,8])expect(base/Math.tan(opticFov(zoom)*Math.PI/360)).toBeCloseTo(zoom,10);
 expect(opticFov(8)).toBeLessThan(opticFov(6)-2);
});
