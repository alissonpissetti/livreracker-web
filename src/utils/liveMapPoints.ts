import type { DeviceLocation } from '../types';
import type { TimelineSegment } from './dailyTimeline';
import { haversineMeters } from './geo';

/** Mesmo raio usado na timeline para paradas no mesmo local. */
export const LIVE_STATIONARY_COLLAPSE_RADIUS_M = 180;

/** Quantos pares consecutivos (origem → destino) entram no enquadramento ao vivo. */
export const LIVE_ZOOM_POINT_PAIRS = 4;

/** Remove leituras que pertencem a trechos de parada da linha do tempo. */
export function filterPointsOutsideStopSegments(
  points: DeviceLocation[],
  segments: TimelineSegment[],
): DeviceLocation[] {
  const excluded = new Set<number>();

  for (const segment of segments) {
    if (segment.kind !== 'stop' || segment.startIndex < 0 || segment.endIndex < 0) {
      continue;
    }
    for (let index = segment.startIndex; index <= segment.endIndex; index += 1) {
      excluded.add(index);
    }
  }

  if (excluded.size === 0) {
    return points;
  }

  const kept = points.filter((_, index) => !excluded.has(index));
  if (kept.length >= 1) {
    return kept;
  }

  return points.slice(-1);
}

export function isPairInsideStopSegment(
  from: DeviceLocation,
  to: DeviceLocation,
  segments: TimelineSegment[],
  radiusM = LIVE_STATIONARY_COLLAPSE_RADIUS_M,
): boolean {
  for (const segment of segments) {
    if (segment.kind !== 'stop') {
      continue;
    }

    const nearFrom = haversineMeters(
      from.latitude,
      from.longitude,
      segment.centroidLat,
      segment.centroidLng,
    ) <= radiusM;
    const nearTo = haversineMeters(
      to.latitude,
      to.longitude,
      segment.centroidLat,
      segment.centroidLng,
    ) <= radiusM;

    if (nearFrom && nearTo) {
      return true;
    }
  }

  return false;
}

export function liveZoomPoints(points: DeviceLocation[]): DeviceLocation[] {
  const collapsed = collapseStationaryPoints(points.filter(isLocatedPoint));
  const maxPoints = LIVE_ZOOM_POINT_PAIRS * 2;
  if (collapsed.length <= maxPoints) {
    return collapsed;
  }
  return collapsed.slice(-maxPoints);
}

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
