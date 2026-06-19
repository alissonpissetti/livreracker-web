import { haversineMeters } from './geo';
import { findTrailingCorridorOutlierIndices } from './locationCorridor';

/** Teto absoluto de velocidade plausível entre leituras (km/h). */
export const MAX_IMPLIED_SPEED_KMH = 140;

const MIN_SEGMENT_SECONDS = 3;
const DEFAULT_MEDIAN_SPEED_KMH = 35;
const ADAPTIVE_SPEED_FACTOR = 3.5;
const ADAPTIVE_SPEED_MARGIN_KMH = 25;
const MIN_ADAPTIVE_CAP_KMH = 55;
const MIN_JUMP_DISTANCE_M = 80;
const LONG_GAP_SECONDS = 300;
const MIN_SPIKE_LEG_M = 350;
const MAX_SPIKE_BRIDGE_M = 120;

export type LocationQualityPoint = {
  id: string;
  latitude: number;
  longitude: number;
  recorded_at: string;
  speed_knots?: number | null;
  location_source?: string | null;
};

function segmentSeconds(from: LocationQualityPoint, to: LocationQualityPoint): number {
  const ms =
    new Date(to.recorded_at).getTime() - new Date(from.recorded_at).getTime();
  return Math.max(ms / 1000, MIN_SEGMENT_SECONDS);
}

export function impliedSpeedKmh(
  from: LocationQualityPoint,
  to: LocationQualityPoint,
): number {
  const distanceM = haversineMeters(
    from.latitude,
    from.longitude,
    to.latitude,
    to.longitude,
  );
  return (distanceM / segmentSeconds(from, to)) * 3.6;
}

function reportedSpeedKmh(point: LocationQualityPoint): number | null {
  if (point.speed_knots == null || !Number.isFinite(point.speed_knots)) {
    return null;
  }
  return point.speed_knots * 1.852;
}

function median(values: number[]): number {
  if (values.length === 0) {
    return DEFAULT_MEDIAN_SPEED_KMH;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function computeAdaptiveSpeedCap(recentSpeedsKmh: number[]): number {
  const plausible = recentSpeedsKmh.filter(
    (speed) => speed > 0.3 && speed <= MAX_IMPLIED_SPEED_KMH,
  );
  const med = median(plausible);
  return Math.min(
    MAX_IMPLIED_SPEED_KMH,
    Math.max(
      MIN_ADAPTIVE_CAP_KMH,
      med * ADAPTIVE_SPEED_FACTOR + ADAPTIVE_SPEED_MARGIN_KMH,
    ),
  );
}

function isImpossibleSegment(
  prev: LocationQualityPoint,
  curr: LocationQualityPoint,
  speedCapKmh: number,
): boolean {
  const distanceM = haversineMeters(
    prev.latitude,
    prev.longitude,
    curr.latitude,
    curr.longitude,
  );
  const dtSec = segmentSeconds(prev, curr);
  const implied = impliedSpeedKmh(prev, curr);
  const reportedPrev = reportedSpeedKmh(prev);
  const reportedCurr = reportedSpeedKmh(curr);

  if (reportedCurr != null && reportedCurr > MAX_IMPLIED_SPEED_KMH) {
    return true;
  }

  if (distanceM < 15) {
    return false;
  }

  if (dtSec >= LONG_GAP_SECONDS) {
    return implied > MAX_IMPLIED_SPEED_KMH && distanceM > 1_000;
  }

  if (implied > MAX_IMPLIED_SPEED_KMH) {
    return true;
  }

  if (distanceM >= MIN_JUMP_DISTANCE_M && implied > speedCapKmh) {
    return true;
  }

  const reportedMax = Math.max(reportedPrev ?? 0, reportedCurr ?? 0);
  if (
    reportedMax < 25 &&
    implied > Math.min(MAX_IMPLIED_SPEED_KMH, speedCapKmh * 0.85) &&
    distanceM >= 250
  ) {
    return true;
  }

  if (dtSec <= 15 && distanceM >= 400 && implied > 72) {
    return true;
  }

  if (distanceM >= 2_000 && implied > speedCapKmh) {
    return true;
  }

  return false;
}

function isSpikeOutlier(
  prev: LocationQualityPoint,
  curr: LocationQualityPoint,
  next: LocationQualityPoint,
  speedCapKmh: number,
): boolean {
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
  const dPrevNext = haversineMeters(
    prev.latitude,
    prev.longitude,
    next.latitude,
    next.longitude,
  );

  if (dPrevCurr < MIN_SPIKE_LEG_M || dCurrNext < MIN_SPIKE_LEG_M) {
    return false;
  }

  if (dPrevNext > MAX_SPIKE_BRIDGE_M) {
    return false;
  }

  return (
    isImpossibleSegment(prev, curr, speedCapKmh) &&
    isImpossibleSegment(curr, next, speedCapKmh)
  );
}

function findLastValidIndex(
  index: number,
  invalidIndices: Set<number>,
): number | null {
  for (let candidate = index - 1; candidate >= 0; candidate -= 1) {
    if (!invalidIndices.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

function recentSegmentSpeeds(
  points: LocationQualityPoint[],
  invalidIndices: Set<number>,
  fromIndex: number,
  maxSegments = 12,
): number[] {
  const speeds: number[] = [];
  let cursor: number | null = fromIndex;

  while (cursor != null && speeds.length < maxSegments) {
    const previousIndex = findLastValidIndex(cursor, invalidIndices);
    if (previousIndex == null) {
      break;
    }
    speeds.push(impliedSpeedKmh(points[previousIndex], points[cursor]));
    cursor = previousIndex;
  }

  return speeds;
}

function globalPlausibleSpeeds(points: LocationQualityPoint[]): number[] {
  const speeds: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const implied = impliedSpeedKmh(points[index - 1], points[index]);
    if (implied > 0.3 && implied <= MAX_IMPLIED_SPEED_KMH) {
      speeds.push(implied);
    }
  }
  return speeds;
}

export function findInvalidLocationIndices(
  points: LocationQualityPoint[],
): Set<number> {
  const invalidIndices = new Set<number>();
  const fallbackCap = computeAdaptiveSpeedCap(globalPlausibleSpeeds(points));

  for (let index = 0; index < points.length; index += 1) {
    const curr = points[index];
    const prevIndex = findLastValidIndex(index, invalidIndices);
    const prev = prevIndex != null ? points[prevIndex] : null;
    const next = index < points.length - 1 ? points[index + 1] : null;

    const recentSpeeds = prevIndex != null
      ? recentSegmentSpeeds(points, invalidIndices, prevIndex)
      : [];
    const speedCap = computeAdaptiveSpeedCap(
      recentSpeeds.length > 0 ? recentSpeeds : [fallbackCap],
    );

    if (prev && next && isSpikeOutlier(prev, curr, next, speedCap)) {
      invalidIndices.add(index);
      continue;
    }

    if (prev && isImpossibleSegment(prev, curr, speedCap)) {
      invalidIndices.add(index);
    }
  }

  for (const index of findTrailingCorridorOutlierIndices(points, invalidIndices)) {
    invalidIndices.add(index);
  }

  return invalidIndices;
}
