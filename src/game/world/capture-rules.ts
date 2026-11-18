/**
 * Single capture predicate shared by the 60 Hz authority (progress), HUD and
 * network snapshots both read the same resulting CapState. A footprint is
 * intersected with the circle; a floorY point is validated by verticalTolerance.
 */
export interface CaptureShape {
  id: string;
  x: number;
  z: number;
  r: number;
  floorY?: number;
  verticalTolerance?: number;
  footprint?: { x0: number; z0: number; x1: number; z1: number };
}

export function capturePointAllows(cap: CaptureShape, x: number, z: number, y: number, surfaceY: number): boolean {
  const dx = x - cap.x, dz = z - cap.z;
  if (dx * dx + dz * dz > cap.r * cap.r) return false;
  if (cap.footprint && (x < cap.footprint.x0 || x > cap.footprint.x1 || z < cap.footprint.z0 || z > cap.footprint.z1)) return false;
  if (cap.floorY !== undefined) return Math.abs(y - cap.floorY) <= (cap.verticalTolerance ?? 2.5);
  return Math.abs(y - surfaceY) <= 1.2;
}
