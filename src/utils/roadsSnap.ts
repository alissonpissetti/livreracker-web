import type { LatLng } from './directionsPath';
import { haversineMeters } from './geo';

const ROADS_SNAP_BATCH = 100;

type SnapResponse = {
  snappedPoints?: {
    location: { latitude: number; longitude: number };
    originalIndex?: number;
  }[];
  error?: { message?: string };
};

/** Encaixa coordenadas GPS na via mais próxima (Google Roads API). */
export async function snapToRoads(
  apiKey: string,
  points: LatLng[],
): Promise<LatLng[]> {
  if (points.length === 0 || !apiKey) {
    return points.map((point) => ({ ...point }));
  }

  const snapped: LatLng[] = points.map((point) => ({ ...point }));

  for (let offset = 0; offset < points.length; offset += ROADS_SNAP_BATCH) {
    const batch = points.slice(offset, offset + ROADS_SNAP_BATCH);
    const pathParam = batch.map((point) => `${point.lat},${point.lng}`).join('|');
    const url =
      `https://roads.googleapis.com/v1/snapToRoads?interpolate=false&path=${encodeURIComponent(pathParam)}` +
      `&key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url);
    const data = (await response.json()) as SnapResponse;

    if (!response.ok) {
      const message = data.error?.message ?? `Roads API ${response.status}`;
      throw new Error(message);
    }

    for (const entry of data.snappedPoints ?? []) {
      const index = entry.originalIndex;
      if (index == null || index < 0 || index >= batch.length) {
        continue;
      }
      snapped[offset + index] = {
        lat: entry.location.latitude,
        lng: entry.location.longitude,
      };
    }
  }

  return snapped;
}

/** Traçado pela via entre pontos consecutivos (fallback leve da Roads API). */
export async function snapInterpolatedRoadPath(
  apiKey: string,
  points: LatLng[],
): Promise<LatLng[]> {
  if (points.length < 2 || !apiKey) {
    return points.map((point) => ({ ...point }));
  }

  const pathParam = points.map((point) => `${point.lat},${point.lng}`).join('|');
  const url =
    `https://roads.googleapis.com/v1/snapToRoads?interpolate=true&path=${encodeURIComponent(pathParam)}` +
    `&key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(url);
  const data = (await response.json()) as SnapResponse;

  if (!response.ok) {
    const message = data.error?.message ?? `Roads API ${response.status}`;
    throw new Error(message);
  }

  const path: LatLng[] = (data.snappedPoints ?? []).map((entry) => ({
    lat: entry.location.latitude,
    lng: entry.location.longitude,
  }));

  return path.length >= 2 ? path : points.map((point) => ({ ...point }));
}

/** Garante que o path da rota começa/termina nas vias encaixadas das leituras. */
export function anchorPathToSnappedWaypoints(
  path: LatLng[],
  rawWaypoints: LatLng[],
  snappedWaypoints: LatLng[],
): LatLng[] {
  if (path.length === 0 || snappedWaypoints.length === 0) {
    return path;
  }

  const result = [...path];
  const firstSnap = snappedWaypoints[0];
  const lastSnap = snappedWaypoints[snappedWaypoints.length - 1];
  const firstRaw = rawWaypoints[0];
  const lastRaw = rawWaypoints[rawWaypoints.length - 1];

  if (firstSnap && firstRaw && haversineMeters(firstRaw.lat, firstRaw.lng, firstSnap.lat, firstSnap.lng) < 120) {
    result[0] = { ...firstSnap };
  }

  if (lastSnap && lastRaw && haversineMeters(lastRaw.lat, lastRaw.lng, lastSnap.lat, lastSnap.lng) < 120) {
    result[result.length - 1] = { ...lastSnap };
  }

  return result;
}
