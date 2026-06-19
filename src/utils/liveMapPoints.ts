import type { DeviceLocation } from '../types';
import { haversineMeters } from './geo';

/** Mesmo raio usado na timeline para paradas no mesmo local. */
export const LIVE_STATIONARY_COLLAPSE_RADIUS_M = 120;

export function isLocatedPoint(point: DeviceLocation): boolean {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

/** Mantém só a leitura mais recente de cada trecho parado no mesmo lugar. */
export function collapseStationaryPoints(
  points: DeviceLocation[],
  radiusM = LIVE_STATIONARY_COLLAPSE_RADIUS_M,
): DeviceLocation[] {
  const located = points.filter(isLocatedPoint);
  if (located.length <= 1) {
    return located;
  }

  const collapsed: DeviceLocation[] = [located[0]];

  for (let index = 1; index < located.length; index += 1) {
    const anchor = collapsed[collapsed.length - 1];
    const current = located[index];
    const distance = haversineMeters(
      anchor.latitude,
      anchor.longitude,
      current.latitude,
      current.longitude,
    );

    if (distance <= radiusM) {
      collapsed[collapsed.length - 1] = current;
    } else {
      collapsed.push(current);
    }
  }

  return collapsed;
}
