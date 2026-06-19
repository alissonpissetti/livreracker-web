import type { LatLng } from './directionsPath';

export function showRouteLine(
  line: google.maps.Polyline,
  map: google.maps.Map,
  path: LatLng[],
  color: string,
  weight = 7,
): boolean {
  if (path.length < 2) {
    line.setPath([]);
    line.setMap(null);
    return false;
  }

  line.setPath(path);
  line.setOptions({
    geodesic: true,
    strokeColor: color,
    strokeOpacity: 0.95,
    strokeWeight: weight,
    zIndex: 1000,
  });
  line.setMap(map);
  return true;
}

export function hideRouteLine(line: google.maps.Polyline | null): void {
  if (!line) {
    return;
  }
  line.setPath([]);
  line.setMap(null);
}

export function createRouteLine(
  map: google.maps.Map,
  path: LatLng[],
  color: string,
  weight = 7,
  opacity = 0.95,
): google.maps.Polyline | null {
  if (path.length < 2) {
    return null;
  }

  return new google.maps.Polyline({
    map,
    path,
    geodesic: true,
    strokeColor: color,
    strokeOpacity: opacity,
    strokeWeight: weight,
    zIndex: 1000,
  });
}
