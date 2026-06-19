import type { DeviceLocation } from '../types';
import { applyCorridorCorrections, effectiveCoordinate } from './locationCorridor';
import {
  findInvalidLocationIndices,
  type LocationQualityPoint,
} from './locationQuality';

function toQualityPoint(location: DeviceLocation): LocationQualityPoint {
  return {
    id: location.id,
    latitude: location.latitude,
    longitude: location.longitude,
    recorded_at: location.recorded_at,
    speed_knots: location.speed_knots,
    location_source: location.location_source,
  };
}

export { applyCorridorCorrections, effectiveCoordinate } from './locationCorridor';

/** Recalcula is_valid e corrige desvios laterais (GPS fora do eixo da via). */
export function applyLocationQuality(locations: DeviceLocation[]): DeviceLocation[] {
  if (locations.length === 0) {
    return locations;
  }

  const invalidIndices = findInvalidLocationIndices(
    locations.map(toQualityPoint),
  );

  const withValidity = locations.map((location, index) => ({
    ...location,
    is_valid: !invalidIndices.has(index),
  }));

  return applyCorridorCorrections(withValidity);
}

export function isValidReading(location: DeviceLocation): boolean {
  return location.is_valid !== false;
}

export function splitLocations(locations: DeviceLocation[]): {
  valid: DeviceLocation[];
  invalid: DeviceLocation[];
} {
  const valid: DeviceLocation[] = [];
  const invalid: DeviceLocation[] = [];

  for (const location of locations) {
    if (isValidReading(location)) {
      valid.push(location);
    } else {
      invalid.push(location);
    }
  }

  return { valid, invalid };
}

export function validRoutePoints(points: DeviceLocation[]): DeviceLocation[] {
  return points.filter(isValidReading);
}

/** Índice da última leitura válida (para modo ao vivo). */
export function lastValidPointIndex(points: DeviceLocation[]): number {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    if (isValidReading(points[index])) {
      return index;
    }
  }
  return Math.max(0, points.length - 1);
}

/** Par válido anterior → atual para desenhar trecho pelas ruas. */
export function getValidRouteSegment(
  points: DeviceLocation[],
  index: number,
): [DeviceLocation, DeviceLocation] | null {
  if (!isValidReading(points[index])) {
    return null;
  }

  let prevIndex = index - 1;
  while (prevIndex >= 0 && !isValidReading(points[prevIndex])) {
    prevIndex -= 1;
  }

  if (prevIndex < 0) {
    return null;
  }

  return [points[prevIndex], points[index]];
}

/** Posição encaixada no mapa (marker) ou coordenada bruta. */
export function mapPositionForPoint(
  markers: Array<{ marker: google.maps.marker.AdvancedMarkerElement } | null>,
  index: number,
  point: DeviceLocation,
): { lat: number; lng: number } {
  const marker = markers[index]?.marker;
  const position = marker?.position;
  if (position && typeof position === 'object' && 'lat' in position) {
    const lat = typeof position.lat === 'function' ? position.lat() : position.lat;
    const lng = typeof position.lng === 'function' ? position.lng() : position.lng;
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return { lat: lat as number, lng: lng as number };
    }
  }
  return effectiveCoordinate(point);
}
