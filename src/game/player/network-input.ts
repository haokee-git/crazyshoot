import type { PlayerInput } from './controller';

/** Host-side input for a remote guest. */
export class NetworkInput implements PlayerInput {
  worldMove:{x:number;z:number}|null=null;
  readonly keys = new Set<string>();
  look = { x: 0, y: 0 };

  down(code: string) {
    return this.keys.has(code);
  }

  consumeLook() {
    const d = this.look;
    this.look = { x: 0, y: 0 };
    return d;
  }

  setKeys(keys: string[]) {
    this.worldMove=null;this.keys.clear();
    for (const k of keys) this.keys.add(k);
  }

  clear() {
    this.worldMove=null;this.keys.clear();
    this.look = { x: 0, y: 0 };
  }
}
