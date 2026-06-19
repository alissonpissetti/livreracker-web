import type { DeviceLocation } from '../types';
import { haversineMeters } from './geo';

type LatLng = { lat: number; lng: number };

function filterValidLatLng(points: LatLng[]): LatLng[] {
  return points.filter(
    (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng),
  );
}

const DRIFT_LOOP_PERIMETER_MIN_M = 200;
const DRIFT_LOOP_RATIO = 1.95;
const DRIFT_CLUSTER_SPAN_M = 420;
const TIGHT_CLUSTER_RADIUS_M = 210;
const STATIONARY_SPEED_KNOTS = 2.5;
const STATIONARY_COLLAPSE_M = 200;

function centroid(points: LatLng[]): LatLng {
  const total = points.reduce(
    (acc, point) => ({ lat: acc.lat + point.lat, lng: acc.lng + point.lng }),
    { lat: 0, lng: 0 },
  );
  return {
    lat: total.lat / points.length,
    lng: total.lng / points.length,
  };
}

function maxPairwiseSpan(points: LatLng[]): number {
  let maxSpan = 0;
  for (let left = 0; left < points.length; left += 1) {
    for (let right = left + 1; right < points.length; right += 1) {
      maxSpan = Math.max(
        maxSpan,
        haversineMeters(
          points[left].lat,
          points[left].lng,
          points[right].lat,
          points[right].lng,
        ),
      );
    }
  }
  return maxSpan;
}

function collapseTightCluster(points: LatLng[]): LatLng[] {
  if (points.length < 3) {
    return points;
  }

  const center = centroid(points);
  let maxFromCenter = 0;
  for (const point of points) {
    maxFromCenter = Math.max(
      maxFromCenter,
      haversineMeters(center.lat, center.lng, point.lat, point.lng),
    );
  }

  if (maxFromCenter <= TIGHT_CLUSTER_RADIUS_M) {
    return [points[points.length - 1]];
  }

  return points;
}

/** Remove padrão de “volta na quadra” causado por drift de GPS parado. */
export function simplifyDriftLoopWaypoints(points: LatLng[]): LatLng[] {
  const valid = filterValidLatLng(points).map((point) => ({ ...point }));
  if (valid.length < 3) {
    return valid;
  }

  const clustered = collapseTightCluster(valid);
  if (clustered.length < 3) {
    return clustered;
  }

  const first = clustered[0];
  const last = clustered[clustered.length - 1];
  const directEnds = haversineMeters(first.lat, first.lng, last.lat, last.lng);

  let perimeter = 0;
  for (let index = 0; index < clustered.length - 1; index += 1) {
    perimeter += haversineMeters(
      clustered[index].lat,
      clustered[index].lng,
      clustered[index + 1].lat,
      clustered[index + 1].lng,
    );
  }

  const span = maxPairwiseSpan(clustered);
  const looksLikeBlockDrift =
    span < DRIFT_CLUSTER_SPAN_M &&
    perimeter > DRIFT_LOOP_PERIMETER_MIN_M &&
    perimeter > Math.max(directEnds, 30) * DRIFT_LOOP_RATIO;

  if (looksLikeBlockDrift) {
    if (directEnds > 35) {
      return [first, last];
    }
    return [last];
  }

  return clustered;
}

/** Junta leituras lentas no mesmo lugar antes de pedir rota pelas ruas. */
export function filterStationaryRoutingPoints(points: DeviceLocation[]): DeviceLocation[] {
  if (points.length < 2) {
    return points;
  }

  const filtered: DeviceLocation[] = [points[0]];

  for (let index = 1; index < points.length; index += 1) {
    const previous = filtered[filtered.length - 1];
    const current = points[index];
    const bothSlow =
      (previous.speed_knots ?? 99) < STATIONARY_SPEED_KNOTS &&
      (current.speed_knots ?? 99) < STATIONARY_SPEED_KNOTS;
    const distance = haversineMeters(
      previous.latitude,
      previous.longitude,
      current.latitude,
      current.longitude,
    );

    if (bothSlow && distance < STATIONARY_COLLAPSE_M) {
      filtered[filtered.length - 1] = current;
      continue;
    }

    filtered.push(current);
  }

  return filtered;
}

export function prepareRoadRoutingPoints(points: LatLng[]): LatLng[] {
  return simplifyDriftLoopWaypoints(points);
}

export type { LatLng as RoutingLatLng };

export function prepareDeviceRoutingPoints(points: DeviceLocation[]): DeviceLocation[] {
  return filterStationaryRoutingPoints(points);
}
