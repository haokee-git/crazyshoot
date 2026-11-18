import { chromium } from 'playwright';
import { BATTLEFIELDS } from '../../../src/maps/battlefield-design';
import { browserExecutable } from './browser';

const base = process.env.CRAZYSHOOT_BASE_URL ?? 'http://127.0.0.1:5174';
const browser = await chromium.launch({ headless: true, executablePath: browserExecutable() });
const rows = [];
const errors: string[] = [];
try {
  for (const [map, { pits }] of Object.entries(BATTLEFIELDS)) {
    const page = await browser.newPage({ viewport: { width: 720, height: 480 } });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${base}/game.html?map=${map}&bots=0&lite=1&prep=999`);
    await page.waitForTimeout(700);await page.locator('.lobby-solo').click();
    await page.waitForFunction(() => (window as any).__game?.activated, null, { timeout: 60000 });
    const ramps = pits.flatMap(pit => (pit.id === 'docks-drydock' ? [pit.ramp, 'south'] : [pit.ramp]).map(side => {
      const x = side === 'west' ? pit.x0 : side === 'east' ? pit.x1 : (pit.x0 + pit.x1) / 2;
      const z = side === 'north' ? pit.z0 : side === 'south' ? pit.z1 : (pit.z0 + pit.z1) / 2;
      return { id: pit.id + ':' + side, x, z, dx: Number(side === 'east') - Number(side === 'west'),
        dz: Number(side === 'south') - Number(side === 'north'), length: pit.length, width: pit.width };
    }));
    if (map === 'broken_bridge') ramps.push({ id: 'bridge-deck', x: 130, z: 126, dx: 0, dz: 1, length: 48, width: 10 });
    const results = await page.evaluate(ramps => {
      const game = (window as any).__game;
      cancelAnimationFrame(game.raf);
      game.controller.position.set(-1000, 0, -1000);
      const vehicles: any[] = [...new Map<string, any>(game.vehicles.map((v: any) => [v.kind, v])).values()];
      const results = [];
      for (const ramp of ramps) for (const vehicle of vehicles) {
        game.vehicles = [vehicle];
        const skew = ramp.id === 'bridge-deck' ? .035 : .07;
        for (const up of [true, false]) for (const reverse of [false, true]) for (const angle of [0, skew, -skew]) {
          const { x, z, dx, dz, length } = ramp;
          const start = up ? -4.5 : length + 3, finish = up ? length + 3 : -4.5;
          const sign = up ? 1 : -1;
          const yaw = Math.atan2(dx * sign, dz * sign) + (reverse ? Math.PI : 0) + angle;
          const offset = Math.sin(angle) * Math.abs(finish - start) * .5 * sign;
          vehicle.x = x + dx * start - dz * offset;
          vehicle.z = z + dz * start + dx * offset;
          vehicle.yaw = yaw; vehicle.speed = 0; vehicle.steering = 0;
          vehicle.health = vehicle.maxHealth; vehicle.destroyed = false;
          vehicle.model.position.set(vehicle.x, game.arena.navigationHeight(vehicle.x, vehicle.z) + Math.sign(angle) * .9, vehicle.z);
          vehicle.model.rotation.set(0, yaw, 0);
          let along = start, stall = 0, peakStall = 0, ticks = 0, restarted = false;
          while (ticks++ < 1200 && (finish - along) * sign > .01 && !vehicle.destroyed) {
            game.driveVehicle(vehicle, reverse ? -1 : 1, 0, 0, 1 / 60);
            const next = (vehicle.x - x) * dx + (vehicle.z - z) * dz;
            stall = Math.abs(next - along) < .0001 ? stall + 1 : 0;
            peakStall = Math.max(peakStall, stall);
            along = next;
            if (angle && !restarted && (along - length * .5) * sign > 0) {
              restarted = true;
              vehicle.speed = 0;
              for (let rest = 0; rest < 30; rest++) game.driveVehicle(vehicle, 0, 0, 0, 1 / 60);
            }
            if (stall > 120) break;
          }
          results.push({ ramp: ramp.id, kind: vehicle.kind, up, reverse, angle, along, finish, peakStall,
            pass: (finish - along) * sign <= .01 && vehicle.health === vehicle.maxHealth && peakStall < 15 });
        }
      }
      return results;
    }, ramps);
    rows.push(...results);
    await page.close();
  }
} finally {
  await browser.close();
}
const failures = rows.filter(row => !row.pass);
console.log(JSON.stringify({ total: rows.length, passed: rows.length - failures.length, failures, errors }, null, 2));
if (failures.length || errors.length) process.exitCode = 1;
