import type { DeviceLocation } from '../types';
import { haversineMeters } from './geo';
import { isValidReading } from './locationOutliers';
import { formatRecordedTime, recordedAtMs } from './recordedTime';
import { formatDuration } from './routeStats';
import { timelineColorForIndex } from './timelineColors';

/** Raio máximo (m) para considerar pontos no mesmo local parado. */
export const TIMELINE_STOP_RADIUS_M = 180;
const STOP_RADIUS_M = TIMELINE_STOP_RADIUS_M;
/** Tempo mínimo parado para registrar evento de parada. */
const MIN_STOP_DURATION_MS = 5 * 60 * 1000;
/** Lacuna entre leituras que inicia novo trecho. */
const GAP_SPLIT_MS = 15 * 60 * 1000;
/** Deslocamento mínimo para considerar um trecho de movimento. */
const MIN_MOVE_DISTANCE_M = 80;

export type TimelineSegmentKind = 'stop' | 'move';

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
};

export type DailyTimeline = {
  segments: TimelineSegment[];
  dayStartAt: string | null;
  dayEndAt: string | null;
};

type IndexedPoint = {
  point: DeviceLocation;
  index: number;
};

function hasCoords(point: DeviceLocation): boolean {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
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

function maxDistanceFromAnchor(anchor: IndexedPoint, slice: IndexedPoint[]): number {
  let max = 0;
  for (const item of slice) {
    max = Math.max(
      max,
      haversineMeters(
        anchor.point.latitude,
        anchor.point.longitude,
        item.point.latitude,
        item.point.longitude,
      ),
    );
  }
  return max;
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

function detectStopEnd(indexed: IndexedPoint[], start: number): number {
  if (start >= indexed.length) {
    return start;
  }

  const anchor = indexed[start];
  let end = start;

  while (end + 1 < indexed.length) {
    const next = end + 1;
    if (msBetween(indexed[end], indexed[next]) > GAP_SPLIT_MS) {
      break;
    }

    const candidate = indexed.slice(start, next + 1);
    if (maxDistanceFromAnchor(anchor, candidate) > STOP_RADIUS_M) {
      break;
    }

    end = next;
  }

  return end;
}

function isStopSegment(indexed: IndexedPoint[], start: number, end: number): boolean {
  if (end <= start) {
    return false;
  }
  if (msBetween(indexed[start], indexed[end]) < MIN_STOP_DURATION_MS) {
    return false;
  }
  const anchor = indexed[start];
  return maxDistanceFromAnchor(anchor, indexed.slice(start, end + 1)) <= STOP_RADIUS_M;
}

function detectMoveEnd(indexed: IndexedPoint[], start: number): number {
  let end = start;

  while (end + 1 < indexed.length) {
    const next = end + 1;
    if (msBetween(indexed[end], indexed[next]) > GAP_SPLIT_MS) {
      break;
    }

    const stopStart = next;
    const stopEnd = detectStopEnd(indexed, stopStart);
    if (stopEnd > stopStart && isStopSegment(indexed, stopStart, stopEnd)) {
      break;
    }

    end = next;
  }

  return end;
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

function stopsAreAtSamePlace(a: TimelineSegment, b: TimelineSegment): boolean {
  return (
    haversineMeters(a.centroidLat, a.centroidLng, b.centroidLat, b.centroidLng) <=
    STOP_RADIUS_M
  );
}

function isInsignificantMove(segment: TimelineSegment): boolean {
  return segment.kind === 'move' && segment.distanceM < MIN_MOVE_DISTANCE_M;
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

export function buildDailyTimeline(locations: DeviceLocation[]): DailyTimeline {
  const indexed = toIndexedPoints(locations);

  if (indexed.length === 0) {
    return { segments: [], dayStartAt: null, dayEndAt: null };
  }

  const segments: TimelineSegment[] = [];
  let colorIndex = 0;
  let cursor = 0;

  while (cursor < indexed.length) {
    const stopEnd = detectStopEnd(indexed, cursor);
    if (isStopSegment(indexed, cursor, stopEnd)) {
      segments.push(
        createSegment('stop', colorIndex, indexed.slice(cursor, stopEnd + 1)),
      );
      colorIndex += 1;
      cursor = stopEnd + 1;
      continue;
    }

    const moveEnd = detectMoveEnd(indexed, cursor);
    const moveSlice = indexed.slice(cursor, moveEnd + 1);
    const moveDistance = pathDistanceM(moveSlice);

    if (moveSlice.length >= 2 && moveDistance >= MIN_MOVE_DISTANCE_M) {
      segments.push(createSegment('move', colorIndex, moveSlice));
      colorIndex += 1;
      cursor = moveEnd + 1;
      continue;
    }

    if (moveSlice.length >= 2) {
      segments.push(createSegment('move', colorIndex, moveSlice));
      colorIndex += 1;
      cursor = moveEnd + 1;
      continue;
    }

    cursor += 1;
  }

  return {
    segments: mergeAdjacentStopsAtSamePlace(extendStopsUntilNextMovement(segments)),
    dayStartAt: indexed[0].point.recorded_at,
    dayEndAt: indexed[indexed.length - 1].point.recorded_at,
  };
}

export function formatTimelineClock(iso: string): string {
  return formatRecordedTime(iso);
}

export function formatTimelineTimeRange(segment: TimelineSegment): string {
  const start = formatTimelineClock(segment.startAt);
  const end = formatTimelineClock(segment.endAt);
  if (start === end) {
    return start;
  }
  return `${start} → ${end}`;
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
  return locations
    .slice(segment.startIndex, segment.endIndex + 1)
    .filter(
      (point) =>
        Number.isFinite(point.latitude) && Number.isFinite(point.longitude),
    );
}
