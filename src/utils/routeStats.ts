import type { DeviceLocation } from '../types';

export type RouteStats = {
  pointCount: number;
  totalDistanceM: number;
  durationSec: number;
  averageSpeedKmh: number;
  startAt: string;
  endAt: string;
};

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const earthRadius = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

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

  const startMs = new Date(points[0].recorded_at).getTime();
  const endMs = new Date(points[points.length - 1].recorded_at).getTime();
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
