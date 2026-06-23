import type { DeviceLocation } from '../types';
import { haversineMeters } from './geo';
import { isValidReading } from './locationOutliers';
import { formatRecordedTime, formatRecordedDateTime, recordedAtMs, recordedDayRangeIso } from './recordedTime';
import { formatDuration } from './routeStats';
import { timelineColorForIndex } from './timelineColors';

/** Raio máximo (m) para considerar pontos no mesmo local parado. */
export const TIMELINE_STOP_RADIUS_M = 180;
const STOP_RADIUS_M = TIMELINE_STOP_RADIUS_M;
/** Distância mínima entre áreas para considerar saída de um local. */
const DEPARTURE_DISTANCE_M = STOP_RADIUS_M;
/** Tempo mínimo entre leituras para crer em saída real (não jitter). */
const MIN_DEPARTURE_GAP_MS = 2 * 60 * 1000;
/** Tempo mínimo parado para registrar evento de parada. */
const MIN_STOP_DURATION_MS = 5 * 60 * 1000;
/** Lacuna entre leituras que inicia novo trecho. */
const GAP_SPLIT_MS = 90 * 60 * 1000;
/** Deslocamento mínimo para inferir trajeto entre clusters. */
const INFERRED_MOVE_MIN_DISTANCE_M = DEPARTURE_DISTANCE_M;
const INFERRED_MOVE_MIN_GAP_MS = MIN_DEPARTURE_GAP_MS;
/** Micro-deslocamento entre paradas no mesmo local (curto no tempo). */
const INSIGNIFICANT_MOVE_DISTANCE_M = DEPARTURE_DISTANCE_M;
const INSIGNIFICANT_MOVE_MAX_MS = 8 * 60 * 1000;
/** Funde deslocamentos consecutivos só dentro da mesma viagem. */
const MERGE_MOVES_MAX_GAP_MS = 20 * 60 * 1000;
/** Pré-collapse alinhado ao mapa (~3× ciclo de 30 s). */
const TIMELINE_COLLAPSE_RADIUS_M = 40;
const TIMELINE_COLLAPSE_MAX_GAP_SEC = 90;

export type TimelineSegmentKind = 'stop' | 'move';
export type TrailingStopUntil = 'now' | 'day_end';

export type TimelineSegment = {
  id: string;
  kind: TimelineSegmentKind;
  color: string;
  colorIndex: number;
  startAt: string;
  endAt: string;
  startIndex: number;
  endIndex: number;
  pointCount: number;
  centroidLat: number;
  centroidLng: number;
  distanceM: number;
  durationSec: number;
  /** Parada estendida além da última leitura (ao vivo ou fim do dia). */
  trailingUntil?: TrailingStopUntil;
  /** Dia sem leituras: inferência de permanência no último local conhecido. */
  allDayStationary?: boolean;
  /** Fallback de dia atual sem leituras (última posição ainda vigente). */
  allDayStationaryToday?: boolean;
  /** Parada ao vivo começou antes do dia civil atual (ex.: última leitura há dias). */
  stationarySinceBeforeToday?: boolean;
  /** Parada iniciada no local em que o dia anterior terminou. */
  leadingFromPreviousDay?: boolean;
  /** Deslocamento inferido entre leituras (lacuna sem pontos no meio). */
  inferredGapMove?: boolean;
};

export type DailyTimeline = {
  segments: TimelineSegment[];
  dayStartAt: string | null;
  dayEndAt: string | null;
  /** Pontos usados para índices dos trechos (após collapse). Use no mapa. */
  timelinePoints: DeviceLocation[];
};

export type BuildDailyTimelineOptions = {
  dateValue?: string;
  previousDayLastPoint?: DeviceLocation | null;
};

function pointsAreNear(
  a: Pick<DeviceLocation, 'latitude' | 'longitude'>,
  b: Pick<DeviceLocation, 'latitude' | 'longitude'>,
  radiusM = STOP_RADIUS_M,
): boolean {
  return haversineMeters(a.latitude, a.longitude, b.latitude, b.longitude) <= radiusM;
}

/** Espalhamento máximo (centroide) para considerar permanência no mesmo local. */
const STATIONARY_SPREAD_M = 220;

function spreadFromCentroid(slice: IndexedPoint[]): number {
  if (slice.length === 0) {
    return 0;
  }
  const center = centroidOf(slice);
  let maxSpread = 0;
  for (const item of slice) {
    maxSpread = Math.max(
      maxSpread,
      haversineMeters(
        center.lat,
        center.lng,
        item.point.latitude,
        item.point.longitude,
      ),
    );
  }
  return maxSpread;
}

/** Trecho contínuo ≥ MIN_STOP_DURATION no mesmo local. */
function findStationaryRange(
  indexed: IndexedPoint[],
  start: number,
): { from: number; to: number } | null {
  if (start >= indexed.length) {
    return null;
  }

  let end = start;
  const slice: IndexedPoint[] = [indexed[start]];

  for (let index = start + 1; index < indexed.length; index += 1) {
    const gapMs = msBetween(indexed[index - 1], indexed[index]);
    if (gapMs > GAP_SPLIT_MS) {
      break;
    }

    const candidate = [...slice, indexed[index]];
    if (spreadFromCentroid(candidate) <= STATIONARY_SPREAD_M) {
      slice.push(indexed[index]);
      end = index;
      continue;
    }
    break;
  }

  if (end <= start) {
    return null;
  }

  const durationMs = msBetween(indexed[start], indexed[end]);
  if (durationMs < MIN_STOP_DURATION_MS) {
    return null;
  }

  return { from: start, to: end };
}

type MotionPart = {
  kind: TimelineSegmentKind;
  slice: IndexedPoint[];
};

/** Alterna paradas (tempo no mesmo local) e deslocamentos entre elas. */
function partitionByMotion(indexed: IndexedPoint[]): MotionPart[] {
  const parts: MotionPart[] = [];
  let cursor = 0;

  while (cursor < indexed.length) {
    const stationary = findStationaryRange(indexed, cursor);

    if (stationary) {
      if (stationary.from > cursor) {
        const moveSlice = indexed.slice(cursor, stationary.from);
        if (moveSlice.length > 0) {
          parts.push({ kind: 'move', slice: moveSlice });
        }
      }

      parts.push({
        kind: 'stop',
        slice: indexed.slice(stationary.from, stationary.to + 1),
      });
      cursor = stationary.to + 1;
      continue;
    }

    let nextStopAt = -1;
    for (let probe = cursor + 1; probe < indexed.length; probe += 1) {
      const candidate = findStationaryRange(indexed, probe);
      if (candidate) {
        nextStopAt = candidate.from;
        break;
      }
    }

    if (nextStopAt >= 0) {
      const moveSlice = indexed.slice(cursor, nextStopAt);
      if (moveSlice.length > 0) {
        parts.push({ kind: 'move', slice: moveSlice });
      }
      cursor = nextStopAt;
      continue;
    }

    const tail = indexed.slice(cursor);
    if (tail.length > 0) {
      parts.push({ kind: 'move', slice: tail });
    }
    break;
  }

  return parts;
}

function createInferredMoveSegment(
  from: IndexedPoint,
  to: IndexedPoint,
  colorIndex: number,
): TimelineSegment {
  const distanceM = haversineMeters(
    from.point.latitude,
    from.point.longitude,
    to.point.latitude,
    to.point.longitude,
  );
  const durationSec = Math.max(msBetween(from, to) / 1000, 0);

  return {
    id: `move-inferred-${from.index}-${to.index}`,
    kind: 'move',
    color: timelineColorForIndex(colorIndex),
    colorIndex,
    startAt: from.point.recorded_at,
    endAt: to.point.recorded_at,
    startIndex: from.index,
    endIndex: to.index,
    pointCount: 2,
    centroidLat: (from.point.latitude + to.point.latitude) / 2,
    centroidLng: (from.point.longitude + to.point.longitude) / 2,
    distanceM,
    durationSec,
    inferredGapMove: true,
  };
}

function segmentsFromMotionParts(parts: MotionPart[]): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  let colorIndex = 0;

  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const part = parts[partIndex];
    const previousPart = partIndex > 0 ? parts[partIndex - 1] : null;

    if (previousPart) {
      const from = previousPart.slice[previousPart.slice.length - 1];
      const to = part.slice[0];
      const distanceM = haversineMeters(
        from.point.latitude,
        from.point.longitude,
        to.point.latitude,
        to.point.longitude,
      );
      const gapMs = msBetween(from, to);

      if (
        distanceM >= INFERRED_MOVE_MIN_DISTANCE_M &&
        gapMs >= INFERRED_MOVE_MIN_GAP_MS
      ) {
        segments.push(createInferredMoveSegment(from, to, colorIndex));
        colorIndex += 1;
      }
    }

    if (part.kind === 'stop') {
      if (part.slice.length < 2) {
        continue;
      }
      const durationMs = msBetween(part.slice[0], part.slice[part.slice.length - 1]);
      if (durationMs < MIN_STOP_DURATION_MS) {
        continue;
      }
    } else if (part.slice.length < 2) {
      continue;
    }

    segments.push(createSegment(part.kind, colorIndex, part.slice));
    colorIndex += 1;
  }

  return segments;
}

/** Estende parada até o início do próximo deslocamento (ex.: sem leituras enquanto parado). */
function extendStopsUntilNextMovement(segments: TimelineSegment[]): TimelineSegment[] {
  return segments.map((segment, index) => {
    if (segment.kind !== 'stop') {
      return segment;
    }

    const next = segments[index + 1];
    if (!next || next.kind !== 'move') {
      return segment;
    }

    if (next.inferredGapMove || next.distanceM >= DEPARTURE_DISTANCE_M) {
      return segment;
    }

    const departureMs = recordedAtMs(next.startAt);
    const lastReadingMs = recordedAtMs(segment.endAt);
    if (departureMs <= lastReadingMs) {
      return segment;
    }

    return {
      ...segment,
      endAt: next.startAt,
      durationSec: Math.max((departureMs - recordedAtMs(segment.startAt)) / 1000, 0),
    };
  });
}

function extendFirstStopFromPreviousDay(
  segments: TimelineSegment[],
  indexed: IndexedPoint[],
  options: BuildDailyTimelineOptions,
): TimelineSegment[] {
  if (segments.length === 0 || segments[0].kind !== 'stop' || !options.dateValue) {
    return segments;
  }

  const firstClusterPoint = indexed[0]?.point;
  const previousDayLastPoint = options.previousDayLastPoint;
  const continuesFromYesterday =
    previousDayLastPoint != null &&
    firstClusterPoint != null &&
    pointsAreNear(previousDayLastPoint, firstClusterPoint);

  if (!continuesFromYesterday && !previousDayLastPoint) {
    return segments;
  }

  if (
    previousDayLastPoint &&
    firstClusterPoint &&
    !pointsAreNear(previousDayLastPoint, firstClusterPoint)
  ) {
    return segments;
  }

  const { startAt } = dayBoundsRecordedAt(options.dateValue);
  const first = segments[0];

  return [
    {
      ...first,
      startAt,
      durationSec: Math.max(
        (recordedAtMs(first.endAt) - recordedAtMs(startAt)) / 1000,
        0,
      ),
      leadingFromPreviousDay: true,
    },
    ...segments.slice(1),
  ];
}

type IndexedPoint = {
  point: DeviceLocation;
  index: number;
};

function hasCoords(point: DeviceLocation): boolean {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

/** Primeira leitura consecutiva no local onde o equipamento ainda está parado. */
export function findStationaryAnchor(
  locations: DeviceLocation[],
  radiusM = STOP_RADIUS_M,
): DeviceLocation | null {
  const valid = locations.filter(
    (point) => isValidReading(point) && hasCoords(point),
  );
  if (valid.length === 0) {
    return null;
  }

  const latest = valid[valid.length - 1];
  let anchor = latest;

  for (let index = valid.length - 2; index >= 0; index -= 1) {
    const candidate = valid[index];
    if (pointsAreNear(candidate, latest, radiusM)) {
      anchor = candidate;
      continue;
    }
    break;
  }

  return anchor;
}

export function resolveTodayAnchoredStationarySegment(
  selectedDayLocations: DeviceLocation[],
  recentLocations: DeviceLocation[],
  options: {
    dateValue: string;
    todayValue: string;
    nowMs?: number;
    previousDayLastPoint?: DeviceLocation | null;
  },
): TimelineSegment | null {
  if (options.dateValue !== options.todayValue) {
    return null;
  }

  const anchor = findStationaryAnchor(recentLocations);
  if (!anchor) {
    return null;
  }

  const todayValid = selectedDayLocations.filter(
    (point) => isValidReading(point) && hasCoords(point),
  );
  const allTodayNearAnchor =
    todayValid.length === 0 ||
    todayValid.every((point) => pointsAreNear(point, anchor));

  if (!allTodayNearAnchor) {
    return null;
  }

  const timeline = buildDailyTimeline(selectedDayLocations, {
    dateValue: options.dateValue,
    previousDayLastPoint: options.previousDayLastPoint,
  });
  if (timeline.segments.some((segment) => segment.kind === 'move')) {
    return null;
  }

  const dayStartMs = recordedAtMs(recordedDayRangeIso(options.dateValue).from);
  const anchorMs = recordedAtMs(anchor.recorded_at);

  if (todayValid.length === 0) {
    return buildAllDayStationarySegment(anchor, options.dateValue, {
      isToday: true,
      nowMs: options.nowMs,
    });
  }

  const firstTodayMs = recordedAtMs(todayValid[0].recorded_at);
  if (anchorMs < dayStartMs || anchorMs < firstTodayMs) {
    return buildAllDayStationarySegment(anchor, options.dateValue, {
      isToday: true,
      nowMs: options.nowMs,
    });
  }

  return null;
}

function toIndexedPoints(locations: DeviceLocation[]): IndexedPoint[] {
  return locations
    .map((point, index) => ({ point, index }))
    .filter(({ point }) => isValidReading(point) && hasCoords(point));
}

function msBetween(a: IndexedPoint, b: IndexedPoint): number {
  return recordedAtMs(b.point.recorded_at) - recordedAtMs(a.point.recorded_at);
}

function centroidOf(slice: IndexedPoint[]): { lat: number; lng: number } {
  const total = slice.reduce(
    (acc, item) => ({
      lat: acc.lat + item.point.latitude,
      lng: acc.lng + item.point.longitude,
    }),
    { lat: 0, lng: 0 },
  );
  return {
    lat: total.lat / slice.length,
    lng: total.lng / slice.length,
  };
}

function pathDistanceM(slice: IndexedPoint[]): number {
  let total = 0;
  for (let index = 1; index < slice.length; index += 1) {
    const prev = slice[index - 1].point;
    const current = slice[index].point;
    total += haversineMeters(
      prev.latitude,
      prev.longitude,
      current.latitude,
      current.longitude,
    );
  }
  return total;
}

function createSegment(
  kind: TimelineSegmentKind,
  colorIndex: number,
  slice: IndexedPoint[],
): TimelineSegment {
  const first = slice[0];
  const last = slice[slice.length - 1];
  const center = centroidOf(slice);
  const durationSec = Math.max(msBetween(first, last) / 1000, 0);

  return {
    id: `${kind}-${first.index}-${last.index}`,
    kind,
    color: timelineColorForIndex(colorIndex),
    colorIndex,
    startAt: first.point.recorded_at,
    endAt: last.point.recorded_at,
    startIndex: first.index,
    endIndex: last.index,
    pointCount: slice.length,
    centroidLat: center.lat,
    centroidLng: center.lng,
    distanceM: kind === 'move' ? pathDistanceM(slice) : 0,
    durationSec,
  };
}

function stopsAreAtSamePlace(a: TimelineSegment, b: TimelineSegment): boolean {
  return (
    haversineMeters(a.centroidLat, a.centroidLng, b.centroidLat, b.centroidLng) <=
    STOP_RADIUS_M
  );
}

function isInsignificantMove(segment: TimelineSegment): boolean {
  if (segment.kind !== 'move') {
    return false;
  }

  const durationMs = segment.durationSec * 1000;
  return (
    segment.distanceM < INSIGNIFICANT_MOVE_DISTANCE_M &&
    durationMs <= INSIGNIFICANT_MOVE_MAX_MS
  );
}

function mergeMoveSegments(segments: TimelineSegment[]): TimelineSegment {
  const first = segments[0];
  const last = segments[segments.length - 1];
  const pointCount = segments.reduce((total, segment) => total + segment.pointCount, 0);
  const distanceM = segments.reduce((total, segment) => total + segment.distanceM, 0);
  const durationSec = Math.max(
    (recordedAtMs(last.endAt) - recordedAtMs(first.startAt)) / 1000,
    0,
  );

  return {
    id: `move-${first.startIndex}-${last.endIndex}`,
    kind: 'move',
    color: first.color,
    colorIndex: first.colorIndex,
    startAt: first.startAt,
    endAt: last.endAt,
    startIndex: first.startIndex,
    endIndex: last.endIndex,
    pointCount,
    centroidLat: (first.centroidLat + last.centroidLat) / 2,
    centroidLng: (first.centroidLng + last.centroidLng) / 2,
    distanceM,
    durationSec,
    inferredGapMove: segments.some((segment) => segment.inferredGapMove),
  };
}

function mergeConsecutiveMoves(segments: TimelineSegment[]): TimelineSegment[] {
  if (segments.length < 2) {
    return segments;
  }

  const merged: TimelineSegment[] = [];
  let index = 0;

  while (index < segments.length) {
    const current = segments[index];
    if (current.kind !== 'move') {
      merged.push(current);
      index += 1;
      continue;
    }

    const group: TimelineSegment[] = [current];
    index += 1;

    while (index < segments.length && segments[index].kind === 'move') {
      const previousInGroup = group[group.length - 1];
      const candidate = segments[index];
      const gapMs =
        recordedAtMs(candidate.startAt) - recordedAtMs(previousInGroup.endAt);

      if (gapMs > MERGE_MOVES_MAX_GAP_MS) {
        break;
      }

      group.push(candidate);
      index += 1;
    }

    merged.push(group.length === 1 ? group[0] : mergeMoveSegments(group));
  }

  return merged;
}

function mergeInsignificantMoveBetweenStops(
  segments: TimelineSegment[],
): TimelineSegment[] {
  const merged: TimelineSegment[] = [];
  let index = 0;

  while (index < segments.length) {
    if (
      index + 2 < segments.length &&
      segments[index].kind === 'stop' &&
      segments[index + 1].kind === 'move' &&
      segments[index + 2].kind === 'stop' &&
      isInsignificantMove(segments[index + 1]) &&
      stopsAreAtSamePlace(segments[index], segments[index + 2])
    ) {
      merged.push(mergeStopSegments([segments[index], segments[index + 2]]));
      index += 3;
      continue;
    }

    merged.push(segments[index]);
    index += 1;
  }

  return merged;
}

function dropNoiseSegments(segments: TimelineSegment[]): TimelineSegment[] {
  return segments.filter((segment) => {
    if (segment.allDayStationary || segment.allDayStationaryToday) {
      return true;
    }

    if (segment.kind === 'stop') {
      return !(
        segment.pointCount <= 1 &&
        segment.durationSec < 60 &&
        !segment.leadingFromPreviousDay &&
        !segment.trailingUntil
      );
    }

    return !isInsignificantMove(segment);
  });
}

function insertInferredStopsBetweenTrips(
  segments: TimelineSegment[],
  indexed: IndexedPoint[],
): TimelineSegment[] {
  const MIN_GAP_MS = 15 * 60 * 1000;
  const result: TimelineSegment[] = [];

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    result.push(segment);

    const next = segments[index + 1];
    if (segment.kind !== 'move' || next?.kind !== 'move') {
      continue;
    }

    const gapMs = recordedAtMs(next.startAt) - recordedAtMs(segment.endAt);
    if (gapMs < MIN_GAP_MS) {
      continue;
    }

    const endPoint = indexed[segment.endIndex]?.point;
    if (!endPoint) {
      continue;
    }

    result.push({
      id: `stop-gap-${segment.id}-${next.id}`,
      kind: 'stop',
      color: timelineColorForIndex(segment.colorIndex),
      colorIndex: segment.colorIndex,
      startAt: segment.endAt,
      endAt: next.startAt,
      startIndex: segment.endIndex,
      endIndex: segment.endIndex,
      pointCount: 1,
      centroidLat: endPoint.latitude,
      centroidLng: endPoint.longitude,
      distanceM: 0,
      durationSec: Math.max(gapMs / 1000, 0),
    });
  }

  return result;
}

function simplifyTimelineSegments(segments: TimelineSegment[]): TimelineSegment[] {
  return dropNoiseSegments(
    mergeInsignificantMoveBetweenStops(
      mergeConsecutiveMoves(mergeAdjacentStopsAtSamePlace(segments)),
    ),
  );
}

function finalizeTimelineSegments(
  segments: TimelineSegment[],
  indexed: IndexedPoint[],
): TimelineSegment[] {
  return insertInferredStopsBetweenTrips(
    simplifyTimelineSegments(extendStopsUntilNextMovement(segments)),
    indexed,
  );
}

/** Funde leituras duplicadas antes de montar timeline/mapa (índices alinhados). */
export function collapsePointsForTimeline(locations: DeviceLocation[]): DeviceLocation[] {
  const valid = locations.filter(
    (point) => isValidReading(point) && hasCoords(point),
  );
  if (valid.length <= 1) {
    return valid;
  }

  const collapsed: DeviceLocation[] = [valid[0]];

  for (let index = 1; index < valid.length; index += 1) {
    const anchor = collapsed[collapsed.length - 1];
    const current = valid[index];
    const distanceM = haversineMeters(
      anchor.latitude,
      anchor.longitude,
      current.latitude,
      current.longitude,
    );
    const gapSec =
      (recordedAtMs(current.recorded_at) - recordedAtMs(anchor.recorded_at)) /
      1000;

    if (
      distanceM <= TIMELINE_COLLAPSE_RADIUS_M &&
      gapSec <= TIMELINE_COLLAPSE_MAX_GAP_SEC
    ) {
      collapsed[collapsed.length - 1] = current;
      continue;
    }

    collapsed.push(current);
  }

  return collapsed;
}

function weightedCentroid(
  segments: TimelineSegment[],
): { lat: number; lng: number } {
  let lat = 0;
  let lng = 0;
  let points = 0;

  for (const segment of segments) {
    lat += segment.centroidLat * segment.pointCount;
    lng += segment.centroidLng * segment.pointCount;
    points += segment.pointCount;
  }

  if (points === 0) {
    return { lat: segments[0].centroidLat, lng: segments[0].centroidLng };
  }

  return { lat: lat / points, lng: lng / points };
}

function mergeStopSegments(segments: TimelineSegment[]): TimelineSegment {
  const first = segments[0];
  const last = segments[segments.length - 1];
  const center = weightedCentroid(segments);
  const pointCount = segments.reduce((total, segment) => total + segment.pointCount, 0);
  const durationSec = Math.max(
    (recordedAtMs(last.endAt) - recordedAtMs(first.startAt)) / 1000,
    0,
  );

  return {
    id: `stop-${first.startIndex}-${last.endIndex}`,
    kind: 'stop',
    color: first.color,
    colorIndex: first.colorIndex,
    startAt: first.startAt,
    endAt: last.endAt,
    startIndex: first.startIndex,
    endIndex: last.endIndex,
    pointCount,
    centroidLat: center.lat,
    centroidLng: center.lng,
    distanceM: 0,
    durationSec,
  };
}

/** Une paradas no mesmo local separadas por micro-deslocamentos (ruído LBS/GPS). */
function mergeAdjacentStopsAtSamePlace(segments: TimelineSegment[]): TimelineSegment[] {
  if (segments.length < 2) {
    return segments;
  }

  const merged: TimelineSegment[] = [];
  let index = 0;

  while (index < segments.length) {
    const current = segments[index];
    if (current.kind !== 'stop') {
      merged.push(current);
      index += 1;
      continue;
    }

    const group: TimelineSegment[] = [current];
    index += 1;

    while (index < segments.length) {
      const next = segments[index];

      if (next.kind === 'stop' && stopsAreAtSamePlace(group[0], next)) {
        group.push(next);
        index += 1;
        continue;
      }

      if (
        next.kind === 'move' &&
        isInsignificantMove(next) &&
        index + 1 < segments.length &&
        segments[index + 1].kind === 'stop' &&
        stopsAreAtSamePlace(group[0], segments[index + 1])
      ) {
        group.push(next, segments[index + 1]);
        index += 2;
        continue;
      }

      break;
    }

    merged.push(group.length === 1 ? group[0] : mergeStopSegments(group));
  }

  return merged;
}

function lastValidLocationIndex(locations: DeviceLocation[]): number {
  for (let index = locations.length - 1; index >= 0; index -= 1) {
    const point = locations[index];
    if (isValidReading(point) && hasCoords(point)) {
      return index;
    }
  }
  return -1;
}

/** Última leitura válida ainda é a parada final do dia (sem deslocamento depois). */
export function shouldExtendTrailingStop(
  segments: TimelineSegment[],
  locations: DeviceLocation[],
): boolean {
  if (segments.length === 0) {
    return false;
  }

  const lastSegment = segments[segments.length - 1];
  if (lastSegment.kind !== 'stop') {
    return false;
  }

  const lastIndex = lastValidLocationIndex(locations);
  if (lastIndex < 0) {
    return false;
  }

  if (
    lastSegment.startIndex >= 0 &&
    lastSegment.endIndex >= 0 &&
    lastIndex >= lastSegment.startIndex &&
    lastIndex <= lastSegment.endIndex
  ) {
    return true;
  }

  const lastPoint = locations[lastIndex];
  return (
    haversineMeters(
      lastPoint.latitude,
      lastPoint.longitude,
      lastSegment.centroidLat,
      lastSegment.centroidLng,
    ) <= STOP_RADIUS_M
  );
}

/** Estende o último trecho de parada até um horário de término (agora ou fim do dia). */
export function extendLastStopSegment(
  segments: TimelineSegment[],
  endAtIso: string,
  trailingUntil: TrailingStopUntil,
): TimelineSegment[] {
  if (segments.length === 0 || segments[segments.length - 1].kind !== 'stop') {
    return segments;
  }

  const last = segments[segments.length - 1];
  const durationSec = Math.max(
    (recordedAtMs(endAtIso) - recordedAtMs(last.startAt)) / 1000,
    0,
  );

  return [
    ...segments.slice(0, -1),
    {
      ...last,
      endAt: endAtIso,
      durationSec,
      trailingUntil,
    },
  ];
}

export function resolveTrailingStopExtension(
  segments: TimelineSegment[],
  locations: DeviceLocation[],
  options: {
    selectedDate: string;
    todayValue: string;
    nowMs?: number;
  },
): TimelineSegment[] {
  if (!shouldExtendTrailingStop(segments, locations)) {
    return segments;
  }

  const nowMs = options.nowMs ?? Date.now();
  const { to: dayEndIso } = recordedDayRangeIso(options.selectedDate);
  const dayEndMs = new Date(dayEndIso).getTime();
  const isToday = options.selectedDate === options.todayValue;
  const endMs = isToday ? Math.min(nowMs, dayEndMs) : dayEndMs;
  const trailingUntil: TrailingStopUntil = isToday ? 'now' : 'day_end';

  return extendLastStopSegment(
    segments,
    new Date(endMs).toISOString(),
    trailingUntil,
  );
}

function dayBoundsRecordedAt(dateValue: string): { startAt: string; endAt: string } {
  return {
    startAt: `${dateValue}T00:00:00.000Z`,
    endAt: `${dateValue}T23:59:59.999Z`,
  };
}

/** Dia sem leituras: item sintético no último local conhecido. */
export function buildAllDayStationarySegment(
  lastKnown: DeviceLocation,
  dateValue: string,
  options: { isToday?: boolean; nowMs?: number } = {},
): TimelineSegment {
  const isToday = options.isToday ?? false;
  const nowMs = options.nowMs ?? Date.now();

  if (isToday) {
    const startAt = lastKnown.recorded_at;
    const endAt = new Date(nowMs).toISOString();
    const durationSec = Math.max(
      (recordedAtMs(endAt) - recordedAtMs(startAt)) / 1000,
      0,
    );
    const dayStartMs = recordedAtMs(recordedDayRangeIso(dateValue).from);
    const stationarySinceBeforeToday = recordedAtMs(startAt) < dayStartMs;

    return {
      id: `all-day-stationary-${dateValue}`,
      kind: 'stop',
      color: timelineColorForIndex(0),
      colorIndex: 0,
      startAt,
      endAt,
      startIndex: -1,
      endIndex: -1,
      pointCount: 1,
      centroidLat: lastKnown.latitude,
      centroidLng: lastKnown.longitude,
      distanceM: 0,
      durationSec,
      allDayStationary: true,
      allDayStationaryToday: true,
      stationarySinceBeforeToday,
      trailingUntil: 'now',
    };
  }

  const { startAt, endAt } = dayBoundsRecordedAt(dateValue);
  const durationSec = Math.max(
    (recordedAtMs(endAt) - recordedAtMs(startAt)) / 1000,
    0,
  );

  return {
    id: `all-day-stationary-${dateValue}`,
    kind: 'stop',
    color: timelineColorForIndex(0),
    colorIndex: 0,
    startAt,
    endAt,
    startIndex: -1,
    endIndex: -1,
    pointCount: 1,
    centroidLat: lastKnown.latitude,
    centroidLng: lastKnown.longitude,
    distanceM: 0,
    durationSec,
    allDayStationary: true,
  };
}

export function buildDailyTimeline(
  locations: DeviceLocation[],
  options: BuildDailyTimelineOptions = {},
): DailyTimeline {
  const collapsed = collapsePointsForTimeline(locations);
  const indexed = toIndexedPoints(collapsed);

  if (indexed.length === 0) {
    return { segments: [], dayStartAt: null, dayEndAt: null, timelinePoints: [] };
  }

  const clusters = partitionByMotion(indexed);
  const rawSegments = segmentsFromMotionParts(clusters);
  const segments = extendFirstStopFromPreviousDay(
    finalizeTimelineSegments(rawSegments, indexed),
    indexed,
    options,
  );

  return {
    segments,
    dayStartAt: indexed[0].point.recorded_at,
    dayEndAt: indexed[indexed.length - 1].point.recorded_at,
    timelinePoints: collapsed,
  };
}

export function formatTimelineClock(iso: string): string {
  return formatRecordedTime(iso);
}

export function formatTimelineTimeRange(segment: TimelineSegment): string {
  const start = formatTimelineClock(segment.startAt);
  if (segment.allDayStationaryToday) {
    const startLabel = segment.stationarySinceBeforeToday
      ? formatRecordedDateTime(segment.startAt)
      : start;
    return `${startLabel} → agora`;
  }
  if (segment.allDayStationary) {
    return 'Dia inteiro';
  }
  if (segment.leadingFromPreviousDay) {
    return `início do dia → ${formatTimelineClock(segment.endAt)}`;
  }
  if (segment.trailingUntil === 'now') {
    return `${start} → agora`;
  }
  if (segment.trailingUntil === 'day_end') {
    return `${start} → fim do dia`;
  }
  const end = formatTimelineClock(segment.endAt);
  if (start === end) {
    return start;
  }
  return `${start} → ${end}`;
}

export function formatStopDurationLabel(segment: TimelineSegment): string {
  if (segment.allDayStationaryToday) {
    if (segment.stationarySinceBeforeToday) {
      return 'Está neste local desde a última leitura';
    }
    return 'Está neste local até o momento';
  }
  if (segment.allDayStationary) {
    return 'Permaneceu todo o dia neste local';
  }
  if (segment.leadingFromPreviousDay) {
    return 'No local desde o dia anterior';
  }
  if (segment.trailingUntil === 'now') {
    return 'Parado até agora';
  }
  if (segment.trailingUntil === 'day_end') {
    return 'Permaneceu neste local até o fim do dia';
  }
  return `Parado por ${formatDuration(stopDurationSec(segment))}`;
}

export function stopDurationSec(segment: TimelineSegment): number {
  return Math.max(
    (recordedAtMs(segment.endAt) - recordedAtMs(segment.startAt)) / 1000,
    0,
  );
}

export function formatCoordinatesLabel(lat: number, lng: number): string {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function formatStopLocationLabel(
  segment: TimelineSegment,
  placeLabel?: string,
): string {
  if (placeLabel?.trim()) {
    return placeLabel.trim();
  }
  return `coordenadas ${formatCoordinatesLabel(segment.centroidLat, segment.centroidLng)}`;
}

export function formatMoveSegmentStats(segment: TimelineSegment): string {
  const distance =
    segment.distanceM >= 1000
      ? `${(segment.distanceM / 1000).toFixed(1).replace('.', ',')} km`
      : `${Math.round(segment.distanceM)} m`;
  return `${distance} · ${formatDuration(segment.durationSec)}`;
}

export function formatTimelineSegmentSummary(
  segment: TimelineSegment,
  placeLabel?: string,
): string {
  if (segment.kind === 'stop') {
    return formatStopLocationLabel(segment, placeLabel);
  }

  if (segment.inferredGapMove) {
    return `${formatMoveSegmentStats(segment)} · trajeto inferido entre leituras`;
  }

  return formatMoveSegmentStats(segment);
}

export function formatTimelineSegmentTitle(segment: TimelineSegment): string {
  if (segment.kind === 'stop') {
    return 'Parada';
  }
  return 'Deslocamento';
}

export function segmentPoints(
  locations: DeviceLocation[],
  segment: TimelineSegment,
): DeviceLocation[] {
  return locations
    .slice(segment.startIndex, segment.endIndex + 1)
    .filter(isValidReading);
}

/** Pontos do trecho para desenho no mapa (inclui leituras descartadas da rota). */
export function segmentPathPoints(
  locations: DeviceLocation[],
  segment: TimelineSegment,
): DeviceLocation[] {
  const hasLatLng = (point: DeviceLocation) =>
    Number.isFinite(point.latitude) && Number.isFinite(point.longitude);

  if (segment.startIndex >= 0 && segment.endIndex >= 0) {
    const startMs = recordedAtMs(segment.startAt);
    const endMs = recordedAtMs(segment.endAt);

    const inTimeRange = locations.filter((point) => {
      if (!hasLatLng(point)) {
        return false;
      }
      const ms = recordedAtMs(point.recorded_at);
      return ms >= startMs - 500 && ms <= endMs + 500;
    });

    if (inTimeRange.length >= 2) {
      return inTimeRange;
    }

    const byIndex = locations
      .slice(segment.startIndex, segment.endIndex + 1)
      .filter(hasLatLng);

    if (byIndex.length >= 2) {
      return byIndex;
    }

    return inTimeRange.length > 0 ? inTimeRange : byIndex;
  }

  return locations.filter(hasLatLng);
}
