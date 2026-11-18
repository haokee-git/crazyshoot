export type MotionState='idle'|'walk'|'sprint'|'ads'|'reload'|'mantle'|'ladder'|'blocked';
export interface MantleState {from:[number,number,number];to:[number,number,number];elapsed:number;duration:number;edge:[number,number,number];}
export interface MovementSnapshot {mantle:MantleState|null;climbing:boolean;ladderId:string|null;platformId:string|null;}
export function copyMantle(m:MantleState|null):MantleState|null{return m?{...m,from:[...m.from],to:[...m.to],edge:[...m.edge]}:null;}
