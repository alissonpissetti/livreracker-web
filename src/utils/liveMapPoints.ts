import type { DeviceLocation } from '../types';
import type { TimelineSegment } from './dailyTimeline';
import { haversineMeters } from './geo';
import { recordedAtMs } from './recordedTime';

/** Raio para considerar duas leituras no mesmo lugar (alinhado ao STOP_DISTANCE_M do firmware). */
export const COLLAPSE_NEARBY_RADIUS_M = 40;

/** Intervalo máximo entre leituras para fundir no mesmo ponto (~3× o ciclo de 30 s). */
export const COLLAPSE_NEARBY_MAX_GAP_SEC = 90;

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

export type CollapseNearbyOptions = {
  radiusM?: number;
  maxGapSec?: number;
};

function gapSecondsBetween(
  anchor: DeviceLocation,
  current: DeviceLocation,
): number {
  return Math.abs(recordedAtMs(current.recorded_at) - recordedAtMs(anchor.recorded_at)) / 1000;
}

function isNearbyInSpaceAndTime(
  anchor: DeviceLocation,
  current: DeviceLocation,
  radiusM: number,
  maxGapSec: number,
): boolean {
  const distance = haversineMeters(
    anchor.latitude,
    anchor.longitude,
    current.latitude,
    current.longitude,
  );

  if (distance > radiusM) {
    return false;
  }

  return gapSecondsBetween(anchor, current) <= maxGapSec;
}

/** Funde leituras consecutivas no mesmo lugar e horário próximo (mantém a mais recente). */
export function collapseNearbyPoints(
  points: DeviceLocation[],
  options: CollapseNearbyOptions = {},
): DeviceLocation[] {
  const radiusM = options.radiusM ?? COLLAPSE_NEARBY_RADIUS_M;
  const maxGapSec = options.maxGapSec ?? COLLAPSE_NEARBY_MAX_GAP_SEC;
  const located = points.filter(isLocatedPoint);
  if (located.length <= 1) {
    return located;
  }

  const collapsed: DeviceLocation[] = [located[0]];

  for (let index = 1; index < located.length; index += 1) {
    const anchor = collapsed[collapsed.length - 1];
    const current = located[index];

    if (isNearbyInSpaceAndTime(anchor, current, radiusM, maxGapSec)) {
      collapsed[collapsed.length - 1] = current;
    } else {
      collapsed.push(current);
    }
  }

  return collapsed;
}

/** Mantém só a leitura mais recente de cada trecho parado no mesmo lugar. */
export function collapseStationaryPoints(
  points: DeviceLocation[],
  radiusM = LIVE_STATIONARY_COLLAPSE_RADIUS_M,
): DeviceLocation[] {
  return collapseNearbyPoints(points, {
    radiusM,
    maxGapSec: Number.POSITIVE_INFINITY,
  });
}
