export type BindAction = 'forward' | 'back' | 'left' | 'right' | 'sprint' | 'jump' | 'crouch' | 'prone' | 'walk';

// Canonical commands shared by the controller, prediction, and room host.
export const ACTION_CODES: Record<BindAction, string> = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  sprint: 'ShiftLeft',
  jump: 'Space',
  crouch: 'ControlLeft',
  prone: 'KeyZ',
  walk: 'AltLeft',
};

export const DEFAULT_BINDS: Record<BindAction, string> = {
  ...ACTION_CODES,
  crouch: 'KeyC',
  walk: 'ControlLeft',
};

export const BIND_LABELS: Record<BindAction, string> = {
  forward: '前进',
  back: '后退',
  left: '左移',
  right: '右移',
  sprint: '疾跑',
  jump: '跳跃',
  crouch: '蹲起',
  prone: '趴下',
  walk: '静步',
};

const KEY = 'crazyshoot.binds';
export function loadBinds(): Record<BindAction, string> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_BINDS };
    const saved = JSON.parse(raw) as Partial<Record<BindAction,string>> & {version?:number};
    const binds = { ...DEFAULT_BINDS };
    for(const action of Object.keys(binds) as BindAction[]){
      if(typeof saved[action]==='string')binds[action]=saved[action];
    }
    if(saved.version!==2&&saved.crouch==='ControlLeft'&&saved.walk==='AltLeft'&&
      !Object.entries(binds).some(([action,code])=>action!=='walk'&&action!=='crouch'&&(code==='KeyC'||code==='ControlLeft'))){
      binds.crouch=DEFAULT_BINDS.crouch;
      binds.walk=DEFAULT_BINDS.walk;
    }
    // The abandoned v3 experiment (walk=Alt) must not stick to anyone who
    // happened to save settings while it was live; the default is Ctrl again.
    if(saved.version===3&&binds.walk==='AltLeft'&&binds.crouch==='KeyC')binds.walk=DEFAULT_BINDS.walk;
    return binds;
  } catch {
    return { ...DEFAULT_BINDS };
  }
}
export function saveBinds(binds: Record<BindAction, string>) {
  localStorage.setItem(KEY, JSON.stringify({ ...binds, version: 2 }));
}
