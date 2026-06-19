import type { DeviceLocation } from '../types';
import { haversineMeters } from './geo';

function isValidReading(location: DeviceLocation): boolean {
  return location.is_valid !== false;
}

export type LatLng = { lat: number; lng: number };

/** Máx. distância entre leituras anterior/próxima para considerar o mesmo trecho. */
const MAX_BRIDGE_M = 550;
const MIN_LATERAL_OFFSET_M = 50;
const MIN_DETOUR_RATIO = 1.2;
const MIN_ANCHOR_SEGMENT_M = 70;
const MAX_ANCHOR_SEGMENT_M = 500;
const MIN_TAIL_LATERAL_M = 45;
const MIN_TAIL_AHEAD_M = 12;
const MAX_ANCHOR_LOOKBACK = 12;
const MIN_LEG_M = 25;

type CoordinatePoint = Pick<DeviceLocation, 'latitude' | 'longitude'>;

function toLatLng(point: CoordinatePoint): LatLng {
  return { lat: point.latitude, lng: point.longitude };
}

function metersPerDegree(lat: number): { lat: number; lng: number } {
  return {
    lat: 110_540,
    lng: 111_320 * Math.cos((lat * Math.PI) / 180),
  };
}

/** Distância perpendicular (m) do ponto ao segmento start→end. */
export function perpendicularDistanceToSegmentM(
  point: LatLng,
  start: LatLng,
  end: LatLng,
): number {
  const midLat = (start.lat + end.lat + point.lat) / 3;
  const scale = metersPerDegree(midLat);

  const ex = (end.lng - start.lng) * scale.lng;
  const ey = (end.lat - start.lat) * scale.lat;
  const px = (point.lng - start.lng) * scale.lng;
  const py = (point.lat - start.lat) * scale.lat;

  const segLen = Math.hypot(ex, ey);
  if (segLen < 1) {
    return Math.hypot(px, py);
  }

  return Math.abs(ex * py - ey * px) / segLen;
}

/** Projeta o ponto sobre o segmento start→end (trecho reto entre leituras). */
export function projectOntoSegment(point: LatLng, start: LatLng, end: LatLng): LatLng {
  const midLat = (start.lat + end.lat + point.lat) / 3;
  const scale = metersPerDegree(midLat);

  const ex = (end.lng - start.lng) * scale.lng;
  const ey = (end.lat - start.lat) * scale.lat;
  const px = (point.lng - start.lng) * scale.lng;
  const py = (point.lat - start.lat) * scale.lat;

  const segLen2 = ex * ex + ey * ey;
  if (segLen2 < 1) {
    return { ...start };
  }

  const t = Math.max(0, Math.min(1, (px * ex + py * ey) / segLen2));
  return {
    lat: start.lat + (t * (end.lat - start.lat)),
    lng: start.lng + (t * (end.lng - start.lng)),
  };
}

/**
 * Leitura lateral: anterior e próximo seguem reto, mas o ponto atual
 * “desvia” para o lado (erro típico de torre/GPS em cruzamento).
 */
export function isLateralDetourReading(
  prev: Pick<DeviceLocation, 'latitude' | 'longitude'>,
  curr: Pick<DeviceLocation, 'latitude' | 'longitude'>,
  next: Pick<DeviceLocation, 'latitude' | 'longitude'>,
): boolean {
  const dPrevNext = haversineMeters(
    prev.latitude,
    prev.longitude,
    next.latitude,
    next.longitude,
  );
  const dPrevCurr = haversineMeters(
    prev.latitude,
    prev.longitude,
    curr.latitude,
    curr.longitude,
  );
  const dCurrNext = haversineMeters(
    curr.latitude,
    curr.longitude,
    next.latitude,
    next.longitude,
  );

  if (dPrevNext > MAX_BRIDGE_M || dPrevNext < 8) {
    return false;
  }
  if (dPrevCurr < MIN_LEG_M || dCurrNext < MIN_LEG_M) {
    return false;
  }

  const detourRatio = (dPrevCurr + dCurrNext) / dPrevNext;
  if (detourRatio < MIN_DETOUR_RATIO) {
    return false;
  }

  const lateral = perpendicularDistanceToSegmentM(
    toLatLng(curr),
    toLatLng(prev),
    toLatLng(next),
  );
  if (lateral < MIN_LATERAL_OFFSET_M) {
    return false;
  }

  return Math.max(dPrevCurr, dCurrNext) >= dPrevNext * 0.45;
}

function isAheadOnTravelVector(
  anchorPrev: CoordinatePoint,
  anchorCurr: CoordinatePoint,
  suspect: CoordinatePoint,
): boolean {
  const midLat = (anchorPrev.latitude + anchorCurr.latitude + suspect.latitude) / 3;
  const scale = metersPerDegree(midLat);
  const ex = (anchorCurr.longitude - anchorPrev.longitude) * scale.lng;
  const ey = (anchorCurr.latitude - anchorPrev.latitude) * scale.lat;
  const sx = (suspect.longitude - anchorCurr.longitude) * scale.lng;
  const sy = (suspect.latitude - anchorCurr.latitude) * scale.lat;
  const forward = ex * sx + ey * sy;
  const segLen = Math.hypot(ex, ey);
  if (segLen < 1) {
    return false;
  }
  return forward / segLen >= MIN_TAIL_AHEAD_M;
}

/** Desvio no fim do trajeto: ponto sai lateralmente da continuação da via. */
function isTrailingCorridorOutlier(
  anchorPrev: CoordinatePoint,
  anchorCurr: CoordinatePoint,
  suspect: CoordinatePoint,
): boolean {
  const lateral = perpendicularDistanceToSegmentM(
    toLatLng(suspect),
    toLatLng(anchorPrev),
    toLatLng(anchorCurr),
  );
  if (lateral < MIN_TAIL_LATERAL_M) {
    return false;
  }

  const dAnchorCurr = haversineMeters(
    anchorPrev.latitude,
    anchorPrev.longitude,
    anchorCurr.latitude,
    anchorCurr.longitude,
  );
  const dCurrSuspect = haversineMeters(
    anchorCurr.latitude,
    anchorCurr.longitude,
    suspect.latitude,
    suspect.longitude,
  );
  const dAnchorSuspect = haversineMeters(
    anchorPrev.latitude,
    anchorPrev.longitude,
    suspect.latitude,
    suspect.longitude,
  );

  if (dCurrSuspect < MIN_LEG_M) {
    return false;
  }
  if (!isAheadOnTravelVector(anchorPrev, anchorCurr, suspect)) {
    return false;
  }

  const detourRatio =
    (dAnchorCurr + dCurrSuspect) / Math.max(dAnchorSuspect, 1);

  return detourRatio >= 1.12 || lateral >= MIN_LATERAL_OFFSET_M;
}

function findAnchorBefore(
  points: CoordinatePoint[],
  beforeIndex: number,
  invalidIndices: Set<number>,
): { prevIndex: number; currIndex: number } | null {
  const start = Math.max(1, beforeIndex - MAX_ANCHOR_LOOKBACK);
  for (let currIndex = beforeIndex; currIndex >= start; currIndex -= 1) {
    if (invalidIndices.has(currIndex)) {
      continue;
    }
    const prevIndex = currIndex - 1;
    if (invalidIndices.has(prevIndex)) {
      continue;
    }
    const distanceM = haversineMeters(
      points[prevIndex].latitude,
      points[prevIndex].longitude,
      points[currIndex].latitude,
      points[currIndex].longitude,
    );
    if (distanceM >= MIN_ANCHOR_SEGMENT_M && distanceM <= MAX_ANCHOR_SEGMENT_M) {
      return { prevIndex, currIndex };
    }
  }
  return null;
}

/** Índices finais que desviam da via (ex.: zig-zag para estacionamento lateral). */
export function findTrailingCorridorOutlierIndices(
  points: CoordinatePoint[],
  existingInvalid: Set<number> = new Set(),
): Set<number> {
  const invalid = new Set<number>();
  if (points.length < 4) {
    return invalid;
  }

  const blocked = new Set([...existingInvalid, ...invalid]);
  let scanIndex = points.length - 1;

  while (scanIndex >= 2) {
    if (blocked.has(scanIndex)) {
      scanIndex -= 1;
      continue;
    }

    const anchor = findAnchorBefore(points, scanIndex - 1, blocked);
    if (!anchor || scanIndex <= anchor.currIndex) {
      break;
    }

    const suspect = points[scanIndex];
    if (
      !isTrailingCorridorOutlier(
        points[anchor.prevIndex],
        points[anchor.currIndex],
        suspect,
      )
    ) {
      break;
    }

    invalid.add(scanIndex);
    blocked.add(scanIndex);
    scanIndex -= 1;
  }

  return invalid;
}

export function effectiveCoordinate(
  location: DeviceLocation,
): { lat: number; lng: number } {
  if (
    location.corridor_corrected &&
    Number.isFinite(location.corrected_latitude) &&
    Number.isFinite(location.corrected_longitude)
  ) {
    return {
      lat: location.corrected_latitude as number,
      lng: location.corrected_longitude as number,
    };
  }
  return { lat: location.latitude, lng: location.longitude };
}

/** Corrige posições laterais projetando-as sobre a linha anterior → próximo. */
export function applyCorridorCorrections(locations: DeviceLocation[]): DeviceLocation[] {
  if (locations.length < 3) {
    return locations;
  }

  const corrected = locations.map((location) => ({ ...location }));

  for (let index = 1; index < corrected.length - 1; index += 1) {
    const prev = corrected[index - 1];
    const curr = corrected[index];
    const next = corrected[index + 1];

    if (
      !isValidReading(prev) ||
      !isValidReading(curr) ||
      !isValidReading(next)
    ) {
      continue;
    }

    if (!isLateralDetourReading(prev, curr, next)) {
      continue;
    }

    const projected = projectOntoSegment(toLatLng(curr), toLatLng(prev), toLatLng(next));
    corrected[index] = {
      ...curr,
      corrected_latitude: projected.lat,
      corrected_longitude: projected.lng,
      corridor_corrected: true,
    };
  }

  return corrected;
}
