import { ACTION_CODES, loadBinds, type BindAction } from './keybinds';

export function mappedKeyDown(keys:Set<string>,aliases:Map<string,string>,code:string){
  if(aliases.has(code))return keys.has(aliases.get(code)!)||
    (code==='AltLeft'&&aliases.get(code)==='ControlLeft'&&keys.has('ControlRight')&&![...aliases.values()].includes('ControlRight'));
  if([...aliases.values()].includes(code))return false;
  if(code==='KeyC'||code==='ControlRight')return false;
  if(code==='ShiftRight'&&aliases.get('ShiftLeft')!=='ShiftLeft')return false;
  return keys.has(code);
}
export function canonicalKeyCodes(keys:Set<string>,aliases:Map<string,string>){
  const bound=new Set(aliases.values()),result=[...keys].filter(k=>!aliases.has(k)&&!bound.has(k)&&k!=='KeyC'&&k!=='ControlRight'&&!(k==='ShiftRight'&&aliases.get('ShiftLeft')!=='ShiftLeft'));
  for(const [code,value] of aliases)if(keys.has(value))result.push(code);
  if(aliases.get('AltLeft')==='ControlLeft'&&keys.has('ControlRight')&&!bound.has('ControlRight'))result.push('AltLeft');
  return [...new Set(result)];
}

export class Input {
  readonly keys = new Set<string>();
  private readonly pressedKeys=new Set<string>();
  private leftPressed=false;
  private rightPressed=false;
  readonly mouse = { dx: 0, dy: 0, left: false, right: false };
  pointerLocked = false;
  private readonly canvas: HTMLCanvasElement;
  private readonly aliases = new Map<string, string>();
  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (this.pointerLocked && (['Tab', 'Space', 'AltLeft', 'ControlRight', 'ArrowUp', 'ArrowDown'].includes(e.code)||
      [...this.aliases.values()].includes(e.code))) e.preventDefault();
    if ((e.target as HTMLElement)?.closest('input,textarea,select')) return;
    if(!e.repeat)this.pressedKeys.add(e.code);
    this.keys.add(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };
  private readonly onMouseMove = (e: MouseEvent) => {
    if (!this.pointerLocked) return;
    this.mouse.dx += e.movementX;
    this.mouse.dy += e.movementY;
  };
  private readonly onMouseDown = (e: MouseEvent) => {
    if (!this.pointerLocked || e.target !== this.canvas) return;
    if (e.button === 0) {this.mouse.left=true;this.leftPressed=true;}
    if (e.button === 2) {this.mouse.right = true;this.rightPressed=true;}
  };
  private readonly onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouse.left = false;
    if (e.button === 2) this.mouse.right = false;
  };
  private readonly onContext = (e: Event) => e.preventDefault();
  private readonly onLockChange = () => {
    const el = document.pointerLockElement || (document as any).webkitPointerLockElement;
    this.pointerLocked = el === this.canvas;
  };
  lock = () => {
    if (this.pointerLocked) return;
    try {
      const c = this.canvas as HTMLCanvasElement & { webkitRequestPointerLock?: () => Promise<void> | void };
      const req = (c.requestPointerLock ? c.requestPointerLock() : c.webkitRequestPointerLock?.()) as unknown as Promise<void> | undefined;
      req?.catch?.(() => {});
    } catch { /* Safari refuses outside a user gesture */ }
  };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.reloadBindings();
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mousedown', this.onMouseDown);
    window.addEventListener('mouseup', this.onMouseUp);
    window.addEventListener('contextmenu', this.onContext);
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('webkitpointerlockchange', this.onLockChange);
    canvas.addEventListener('click', this.lock);
  }

  reloadBindings(){
    this.clear();
    const binds = loadBinds();
    const defaults = ACTION_CODES;
    for (const action of Object.keys(defaults) as BindAction[]) this.aliases.set(defaults[action], binds[action]);
  }

  down(code:string){return mappedKeyDown(this.keys,this.aliases,code);}
  consumePresses(){
    const codes=canonicalKeyCodes(this.pressedKeys,this.aliases);
    const left=this.leftPressed,right=this.rightPressed;
    this.pressedKeys.clear();this.leftPressed=false;this.rightPressed=false;
    return {codes,left,right};
  }
  clearFirePress(){this.leftPressed=false;}
  canonicalKeys(){return canonicalKeyCodes(this.keys,this.aliases);}
  consumeLook() {
    const d = { x: this.mouse.dx, y: this.mouse.dy };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    return d;
  }
  clear() {
    this.keys.clear();this.pressedKeys.clear();this.leftPressed=false;this.rightPressed=false;
    this.mouse.left = false;
    this.mouse.right = false;
    this.mouse.dx = 0;
    this.mouse.dy = 0;
  }
  release() {
    this.clear();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock?.();
    else (document as any).webkitExitPointerLock?.();
  }
  dispose() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('mousedown', this.onMouseDown);
    window.removeEventListener('mouseup', this.onMouseUp);
    window.removeEventListener('contextmenu', this.onContext);
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('webkitpointerlockchange', this.onLockChange);
    this.canvas.removeEventListener('click', this.lock);
  }
}
