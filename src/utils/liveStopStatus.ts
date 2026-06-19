import type { DeviceLocation } from '../types';
import type { TimelineSegment } from './dailyTimeline';
import { haversineMeters } from './geo';
import { isValidReading } from './locationOutliers';
import { recordedAtMs } from './recordedTime';
import { timelineColorForIndex } from './timelineColors';

/** Alinhado com STOP_SPEED_KNOTS no firmware ESP32. */
const STOP_SPEED_KNOTS = 2;
/** Alinhado com STOP_RADIUS da timeline. */
const STOP_RADIUS_M = 180;
/** REPORT_INTERVAL_STOPPED_SEC (30 min) + margem para rede e detecção. */
const MAX_SILENCE_MS = 45 * 60 * 1000;
/** Intervalo entre heartbeats parados no firmware (30 min) + margem. */
const STOPPED_HEARTBEAT_GAP_MS = 35 * 60 * 1000;
/** Tempo mínimo parado para exibir na interface. */
const MIN_STOP_DURATION_MS = 5 * 60 * 1000;

export type LiveStopStatus = {
  sinceAt: string;
  lastReadingAt: string;
  durationSec: number;
  centroidLat: number;
  centroidLng: number;
  pointCount: number;
};

function hasCoords(point: DeviceLocation): boolean {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

function readingTimeMs(point: DeviceLocation): number {
  if (point.received_at) {
    return new Date(point.received_at).getTime();
  }
  return recordedAtMs(point.recorded_at);
}

function isStationaryRelativeToAnchor(
  point: DeviceLocation,
  anchor: DeviceLocation,
): boolean {
  const speed = point.speed_knots;
  if (speed != null && Number.isFinite(speed) && speed > STOP_SPEED_KNOTS) {
    return false;
  }

  return (
    haversineMeters(
      anchor.latitude,
      anchor.longitude,
      point.latitude,
      point.longitude,
    ) <= STOP_RADIUS_M
  );
}

function centroidOf(points: DeviceLocation[]): { lat: number; lng: number } {
  if (points.length === 0) {
    return { lat: 0, lng: 0 };
  }

  let lat = 0;
  let lng = 0;
  for (const point of points) {
    lat += point.latitude;
    lng += point.longitude;
  }

  return {
    lat: lat / points.length,
    lng: lng / points.length,
  };
}

function getValidPoints(locations: DeviceLocation[]): DeviceLocation[] {
  return locations.filter((point) => hasCoords(point) && isValidReading(point));
}

function isStillStopped(points: DeviceLocation[], nowMs: number): boolean {
  if (points.length === 0) {
    return false;
  }

  const last = points[points.length - 1];
  const silenceMs = nowMs - readingTimeMs(last);
  if (silenceMs > MAX_SILENCE_MS) {
    return false;
  }

  return isStationaryRelativeToAnchor(last, last);
}

/**
 * Infere parada em andamento no modo ao vivo quando o firmware ainda não enviou
 * o próximo heartbeat (intervalo de 30 min em repouso).
 */
export function inferLiveStopStatus(
  locations: DeviceLocation[],
  nowMs: number = Date.now(),
): LiveStopStatus | null {
  const points = getValidPoints(locations);
  if (!isStillStopped(points, nowMs)) {
    return null;
  }

  const last = points[points.length - 1];
  const anchor = last;
  let startIndex = points.length - 1;

  for (let index = points.length - 2; index >= 0; index -= 1) {
    const gapMs = readingTimeMs(points[index + 1]) - readingTimeMs(points[index]);
    if (gapMs > STOPPED_HEARTBEAT_GAP_MS) {
      break;
    }
    if (!isStationaryRelativeToAnchor(points[index], anchor)) {
      break;
    }
    startIndex = index;
  }

  const cluster = points.slice(startIndex);
  const since = cluster[0];
  const sinceMs = readingTimeMs(since);
  const durationMs = Math.max(nowMs - sinceMs, 0);
  const clusterSize = cluster.length;

  if (durationMs < MIN_STOP_DURATION_MS && clusterSize < 2) {
    return null;
  }

  const center = centroidOf(cluster);

  return {
    sinceAt: since.recorded_at,
    lastReadingAt: last.recorded_at,
    durationSec: durationMs / 1000,
    centroidLat: center.lat,
    centroidLng: center.lng,
    pointCount: clusterSize,
  };
}

/**
 * Usa o último trecho de parada da linha do tempo (mesma lógica do card abaixo)
 * e só recorre à inferência pontual quando ainda não há parada montada no dia.
 */
export function resolveLiveStopStatus(
  locations: DeviceLocation[],
  segments: TimelineSegment[],
  nowMs: number = Date.now(),
): LiveStopStatus | null {
  const points = getValidPoints(locations);
  if (!isStillStopped(points, nowMs)) {
    return null;
  }

  const last = points[points.length - 1];
  const lastSegment =
    segments.length > 0 ? segments[segments.length - 1] : null;

  if (lastSegment?.kind === 'stop') {
    const nearStop =
      haversineMeters(
        last.latitude,
        last.longitude,
        lastSegment.centroidLat,
        lastSegment.centroidLng,
      ) <= STOP_RADIUS_M;

    if (nearStop) {
      return {
        sinceAt: lastSegment.startAt,
        lastReadingAt: last.recorded_at,
        durationSec: Math.max(
          (nowMs - recordedAtMs(lastSegment.startAt)) / 1000,
          0,
        ),
        centroidLat: lastSegment.centroidLat,
        centroidLng: lastSegment.centroidLng,
        pointCount: lastSegment.pointCount,
      };
    }
  }

  return inferLiveStopStatus(locations, nowMs);
}

/** Estende o último trecho de parada até agora na linha do tempo ao vivo. */
export function applyLiveStopExtension(
  segments: TimelineSegment[],
  status: LiveStopStatus | null,
  nowMs: number = Date.now(),
): TimelineSegment[] {
  if (!status) {
    return segments;
  }

  const endAt = new Date(nowMs).toISOString();

  const durationSec = (startAt: string) =>
    Math.max((nowMs - recordedAtMs(startAt)) / 1000, 0);

  if (segments.length > 0 && segments[segments.length - 1].kind === 'stop') {
    const last = segments[segments.length - 1];
    return [
      ...segments.slice(0, -1),
      {
        ...last,
        endAt,
        durationSec: durationSec(last.startAt),
      },
    ];
  }

  const colorIndex = segments.length;
  return [
    ...segments,
    {
      id: 'live-inferred-stop',
      kind: 'stop',
      color: timelineColorForIndex(colorIndex),
      colorIndex,
      startAt: status.sinceAt,
      endAt,
      startIndex: -1,
      endIndex: -1,
      pointCount: status.pointCount,
      centroidLat: status.centroidLat,
      centroidLng: status.centroidLng,
      distanceM: 0,
      durationSec: durationSec(status.sinceAt),
    },
  ];
}
