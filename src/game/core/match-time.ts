import { MAPS } from '../../maps';

/** Custom match-time limits (minutes, inclusive). */
export const MIN_MATCH_MINUTES = 1;
export const MAX_MATCH_MINUTES = 60;
export const MIN_MATCH_SECONDS = MIN_MATCH_MINUTES * 60;
export const MAX_MATCH_SECONDS = MAX_MATCH_MINUTES * 60;
/** Fallback duration for maps without an explicit extension (10 minutes). */
export const DEFAULT_MATCH_SECONDS = 600;

/**
 * Per-map default match duration: the map's `extensions.matchSeconds` when
 * configured (e.g. Pharaoh 20 min), otherwise the historical 7 min baseline.
 * Traditional maps are 10 min, Pharaoh's large map 20 min. This is the
 * "default follows the map" value; hosts may override it per room.
 */
export function matchSecondsForMap(mapId: string): number {
  const map = MAPS.find((entry) => entry.id === mapId) as
    | ((typeof MAPS)[number] & { extensions?: Record<string, unknown> })
    | undefined;
  const configured = Number(map?.extensions?.matchSeconds);
  return Number.isFinite(configured) && configured >= 30 ? configured : DEFAULT_MATCH_SECONDS;
}

/** Whole minutes for the UI. */
export function matchMinutes(seconds: number): number {
  return Math.max(MIN_MATCH_MINUTES, Math.min(MAX_MATCH_MINUTES, Math.round((Number(seconds) || 0) / 60)));
}

/**
 * Clamp a duration to the custom-time range and snap it to whole minutes.
 * Missing/invalid input falls back to the map default (so older rooms keep the
 * exact previous behavior).
 */
export function clampMatchSeconds(value: unknown, fallbackMapId = 'docks'): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return matchSecondsForMap(fallbackMapId);
  const rounded = Math.round(n / 60) * 60;
  return Math.max(MIN_MATCH_SECONDS, Math.min(MAX_MATCH_SECONDS, rounded));
}
