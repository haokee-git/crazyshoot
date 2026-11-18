import * as THREE from 'three';
import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { PrematchOverlay } from '../ui/prematch/PrematchOverlay';
import { DEFAULT_LOADOUT, OPTICS, THROWABLES, getWeapon, type LoadoutSelection } from '../content/weapons/catalog';
import './prematch.css';

type SceneMode = 'menu' | 'explore';

function initScene(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);
  renderer.domElement.className = 'scene-canvas';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#080c0f');
  scene.fog = new THREE.FogExp2('#080c0f', 0.018);

  const menuCam = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 180);
  menuCam.position.set(26, 14, 42);
  menuCam.lookAt(0, 2, 0);
  const fpCam = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 180);
  fpCam.position.set(0, 1.7, 24);
  fpCam.rotation.order = 'YXZ';

  scene.add(new THREE.HemisphereLight(0x9db8b4, 0x101519, 1.6));
  const sun = new THREE.DirectionalLight(0xffe0bb, 2.1);
  sun.position.set(20, 28, 18);
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x3d8fb5, 1.2);
  rim.position.set(-24, 12, -18);
  scene.add(rim);

  const mat = (color: number) => new THREE.MeshLambertMaterial({ color, flatShading: true });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), mat(0x262e2f));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const yard = new THREE.Mesh(new THREE.PlaneGeometry(110, 60), mat(0x303839));
  yard.rotation.x = -Math.PI / 2;
  yard.position.set(-5, 0.01, 2);
  scene.add(yard);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(70, 150), new THREE.MeshLambertMaterial({ color: 0x12313b }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(45, 0.02, -20);
  scene.add(water);

  const dock = new THREE.Mesh(new THREE.BoxGeometry(6, 2.4, 70), mat(0x363f40));
  dock.position.set(22, 1.2, -12);
  scene.add(dock);

  const warehouseMat = mat(0x4e5755);
  const warehouse = new THREE.Mesh(new THREE.BoxGeometry(34, 10, 24), warehouseMat);
  warehouse.position.set(-22, 5, -14);
  scene.add(warehouse);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(37, 0.8, 27), mat(0x3b4443));
  roof.position.set(-22, 10.4, -14);
  scene.add(roof);

  const containerColors = [0x744a32, 0x3e6466, 0x565d3f, 0x63503b, 0x4a5e61];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      const c = new THREE.Mesh(
        new THREE.BoxGeometry(6, 2.6, 2.5),
        mat(containerColors[(row * 3 + col) % containerColors.length]),
      );
      c.position.set(-28 + col * 7.2, 1.31, 8 + row * 6.5);
      scene.add(c);
    }
  }

  const crateMat = mat(0x514936);
  for (let i = 0; i < 8; i++) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 2.2), crateMat);
    c.position.set(6 + (i % 4) * 3.2, 0.9, 4 + Math.floor(i / 4) * 5);
    scene.add(c);
  }

  const craneMat = new THREE.MeshLambertMaterial({ color: 0x7c592f });
  for (const z of [-22, -34]) {
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.2, 24, 1.2), craneMat);
    mast.position.set(34, 12, z);
    scene.add(mast);
    const boom = new THREE.Mesh(new THREE.BoxGeometry(34, 1.1, 1.1), craneMat);
    boom.position.set(20, 23, z);
    scene.add(boom);
  }

  const lightMat = new THREE.MeshBasicMaterial({ color: 0xffb454 });
  for (let i = 0; i < 5; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 6), lightMat);
    l.position.set(-24 + i * 12, 0.6, 28);
    scene.add(l);
  }

  const keys = new Set<string>();
  let mode: SceneMode = 'menu';
  let yaw = 0;
  let pitch = 0;
  let raf = 0;
  const clock = new THREE.Clock();

  const requestLook = () => {
    if (mode !== 'explore') return;
    renderer.domElement.requestPointerLock?.();
  };

  const onMouseMove = (e: MouseEvent) => {
    if (mode !== 'explore' || document.pointerLockElement !== renderer.domElement) return;
    yaw -= e.movementX * 0.0022;
    pitch -= e.movementY * 0.0022;
    pitch = Math.max(-1.2, Math.min(1.2, pitch));
    fpCam.rotation.set(pitch, yaw, 0);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    keys.add(e.code);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    keys.delete(e.code);
  };

  renderer.domElement.addEventListener('click', requestLook);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    menuCam.aspect = w / h;
    fpCam.aspect = w / h;
    menuCam.updateProjectionMatrix();
    fpCam.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);

  const loop = () => {
    const dt = Math.min(0.05, clock.getDelta());
    if (mode === 'menu') {
      const t = performance.now() * 0.00006;
      menuCam.position.set(Math.cos(t) * 42, 14 + Math.sin(t * 0.7) * 2, 26 + Math.sin(t) * 20);
      menuCam.lookAt(-2, 3, 0);
      renderer.render(scene, menuCam);
    } else {
      const speed = keys.has('ShiftLeft') || keys.has('ShiftRight') ? 10 : 5.5;
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const move = new THREE.Vector3();
      if (keys.has('KeyW')) move.add(forward);
      if (keys.has('KeyS')) move.sub(forward);
      if (keys.has('KeyD')) move.add(right);
      if (keys.has('KeyA')) move.sub(right);
      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed * dt);
        fpCam.position.add(move);
        fpCam.position.x = Math.max(-70, Math.min(70, fpCam.position.x));
        fpCam.position.z = Math.max(-70, Math.min(70, fpCam.position.z));
      }
      fpCam.position.y = 1.7;
      fpCam.rotation.set(pitch, yaw, 0);
      renderer.render(scene, fpCam);
    }
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    setMode(next: SceneMode) {
      mode = next;
      if (next === 'menu') {
        if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
      } else {
        yaw = 0;
        pitch = 0;
        fpCam.position.set(0, 1.7, 24);
        fpCam.rotation.set(0, 0, 0);
      }
    },
    resetSpawn() {
      fpCam.position.set(0, 1.7, 24);
      yaw = 0;
      pitch = 0;
      fpCam.rotation.set(0, 0, 0);
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      container.removeChild(renderer.domElement);
    },
  };
}

function App() {
  const sceneRoot = useRef<HTMLDivElement | null>(null);
  const sceneApi = useRef<ReturnType<typeof initScene> | null>(null);
  const [open, setOpen] = useState(true);
  const [seconds, setSeconds] = useState(20);
  const [phase, setPhase] = useState<'prep' | 'live'>('prep');
  const [selection, setSelection] = useState<LoadoutSelection>(DEFAULT_LOADOUT);
  const [banner, setBanner] = useState(false);

  useEffect(() => {
    if (!sceneRoot.current) return;
    const api = initScene(sceneRoot.current);
    sceneApi.current = api;
    return () => api.dispose();
  }, []);

  useEffect(() => {
    sceneApi.current?.setMode(open ? 'menu' : 'explore');
  }, [open]);

  useEffect(() => {
    if (phase !== 'prep') return;
    const id = window.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          window.clearInterval(id);
          setOpen(false);
          setPhase('live');
          setBanner(true);
          sceneApi.current?.resetSpawn();
          window.setTimeout(() => setBanner(false), 2400);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && open) {
        e.preventDefault();
        setOpen(false);
      } else if (e.code === 'KeyX' && open) {
        e.preventDefault();
        setOpen(false);
      } else if (e.code === 'Tab' && !open && phase === 'prep') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, phase]);

  const weapon = getWeapon(selection.weaponId)!;
  const optic = OPTICS.find((o) => o.id === selection.opticId)!;
  const throwNames = selection.throwables.map((id) => THROWABLES.find((t) => t.id === id)?.name).join(' + ');

  return (
    <>
      <div id="scene" ref={sceneRoot} />
      <PrematchOverlay
        open={open && phase === 'prep'}
        seconds={seconds}
        selection={selection}
        onChange={setSelection}
        onClose={() => setOpen(false)}
      />
      {!open && (
        <div class="hud">
          <div class="hud-top">
            <div class="hud-brand">CRAZYSHOOT <span>// PRE-MATCH</span></div>
            <div class="hud-map">船坞 <b>DRYDOCK</b></div>
            <div class="hud-timer">
              {phase === 'live' ? <b>LIVE</b> : <>整备中 <b>00:{String(seconds).padStart(2, '0')}</b></>}
            </div>
          </div>
          <div class="hud-crosshair"><i /><i /></div>
          <div class="hud-status">
            <div class="status-chip">UNARMED</div>
            <div class="status-main">{phase === 'live' ? '战斗开始 · 已传送回出生点' : '整备阶段 · 全图自由移动'}</div>
            <div class="status-sub">{phase === 'live' ? '装备已锁定' : 'TAB 打开装备页 · ESC 关闭'}</div>
          </div>
          <div class="hud-bottom">
            <div><kbd>W A S D</kbd> 移动 <kbd>Shift</kbd> 疾跑 <kbd>TAB</kbd> 装备</div>
            <div>未持武器 / 不能开火 · ADS · 投掷 · 上车</div>
            <div class="hud-loadout">{weapon.name} · {optic.short} · {throwNames}</div>
          </div>
          {banner && <div class="live-banner"><small>DEPLOYMENT COMPLETE</small><b>战斗开始</b><span>已传送回出生点</span></div>}
        </div>
      )}
    </>
  );
}

render(<App />, document.getElementById('app')!);
