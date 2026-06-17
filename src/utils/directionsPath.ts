export type LatLng = { lat: number; lng: number };

export type RoadPathResult = {
  path: LatLng[];
  segments: LatLng[][];
  usedFallback: boolean;
  warning?: string;
};

const MIN_SEGMENT_METERS = 12;

function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadius = 6_371_000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(h));
}

function pathFromDirectionsResult(result: google.maps.DirectionsResult): LatLng[] {
  const route = result.routes[0];
  if (!route) return [];

  const path: LatLng[] = [];
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      for (const latLng of step.path) {
        path.push({ lat: latLng.lat(), lng: latLng.lng() });
      }
    }
  }
  return path;
}

function warningForStatus(status: string): string {
  switch (status) {
    case 'REQUEST_DENIED':
      return (
        'Google recusou a Directions API nesta chave. Na chave do Google Cloud, ' +
        'libere a Directions API nas restrições de API e inclua http://localhost:5173/* ' +
        'nos referrers HTTP.'
      );
    case 'OVER_QUERY_LIMIT':
      return 'Limite de consultas da Directions API atingido. Aguarde alguns minutos e tente de novo.';
    case 'ZERO_RESULTS':
      return 'Não foi possível calcular rota para um trecho (ZERO_RESULTS).';
    default:
      return `Directions API retornou ${status}.`;
  }
}

function requestDirectionsSegment(
  directionsService: google.maps.DirectionsService,
  from: LatLng,
  to: LatLng,
): Promise<LatLng[]> {
  return new Promise((resolve, reject) => {
    directionsService.route(
      {
        origin: from,
        destination: to,
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          resolve(pathFromDirectionsResult(result));
          return;
        }

        reject(new Error(warningForStatus(status)));
      },
    );
  });
}

function appendSegment(merged: LatLng[], segment: LatLng[]) {
  if (segment.length === 0) return;
  if (merged.length > 0) {
    merged.push(...segment.slice(1));
    return;
  }
  merged.push(...segment);
}

export function mergeActiveSegments(
  segments: LatLng[][],
  activeIndex: number,
): LatLng[] {
  if (segments.length === 0) return [];

  const startSeg = activeIndex > 0 ? activeIndex - 1 : 0;
  const endSeg = Math.min(segments.length - 1, activeIndex);
  const merged: LatLng[] = [];

  for (let i = startSeg; i <= endSeg; i++) {
    appendSegment(merged, segments[i]);
  }

  return merged;
}

export async function buildRoadPath(
  directionsService: google.maps.DirectionsService,
  points: LatLng[],
): Promise<RoadPathResult> {
  if (points.length < 2) {
    return { path: points, segments: [], usedFallback: false };
  }

  const merged: LatLng[] = [];
  const segments: LatLng[][] = [];
  let usedFallback = false;
  let warning: string | undefined;

  for (let i = 0; i < points.length - 1; i++) {
    const from = points[i];
    const to = points[i + 1];
    const distance = haversineMeters(from, to);
    let segment: LatLng[];

    if (distance < MIN_SEGMENT_METERS) {
      segment = [from, to];
    } else {
      try {
        segment = await requestDirectionsSegment(directionsService, from, to);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : warningForStatus('UNKNOWN_ERROR');

        if (message.includes('recusou a Directions API')) {
          return {
            path: points,
            segments: [],
            usedFallback: true,
            warning: message,
          };
        }

        usedFallback = true;
        warning ??= 'Alguns trechos foram ligados em linha reta entre leituras próximas.';
        segment = [from, to];
      }
    }

    segments.push(segment);
    appendSegment(merged, segment);
  }

  if (merged.length < 2) {
    return { path: points, segments, usedFallback: true, warning };
  }

  return { path: merged, segments, usedFallback, warning };
}
