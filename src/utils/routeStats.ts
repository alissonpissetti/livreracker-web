import type { DeviceLocation } from '../types';
import { haversineMeters } from './geo';
import { recordedAtMs } from './recordedTime';

export type RouteStats = {
  pointCount: number;
  totalDistanceM: number;
  durationSec: number;
  averageSpeedKmh: number;
  startAt: string;
  endAt: string;
};

export function computeRouteStats(points: DeviceLocation[]): RouteStats | null {
  if (points.length < 2) {
    return null;
  }

  let totalDistanceM = 0;
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1];
    const current = points[index];
    totalDistanceM += haversineMeters(
      prev.latitude,
      prev.longitude,
      current.latitude,
      current.longitude,
    );
  }

  const startMs = recordedAtMs(points[0].recorded_at);
  const endMs = recordedAtMs(points[points.length - 1].recorded_at);
  const durationSec = Math.max((endMs - startMs) / 1000, 1);

  const averageSpeedKmh = (totalDistanceM / durationSec) * 3.6;

  return {
    pointCount: points.length,
    totalDistanceM,
    durationSec,
    averageSpeedKmh,
    startAt: points[0].recorded_at,
    endAt: points[points.length - 1].recorded_at,
  };
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

export function formatAverageSpeed(kmh: number): string {
  return `${kmh.toFixed(1)} km/h`;
}
