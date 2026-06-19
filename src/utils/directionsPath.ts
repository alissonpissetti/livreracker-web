import { anchorPathToSnappedWaypoints, snapToRoads } from './roadsSnap';
import { haversineMeters } from './geo';

export type LatLng = { lat: number; lng: number };

export type RoadPathResult = {
  path: LatLng[];
  usedFallback: boolean;
  warning?: string;
};

export type RouteProvider = {
  computeThrough: (waypoints: LatLng[]) => Promise<LatLng[]>;
  snapWaypoints: (waypoints: LatLng[]) => Promise<LatLng[]>;
};

type RouteClass = typeof google.maps.routes.Route;

const ROUTE_TIMEOUT_MS = 20_000;
/** Limite prático de waypoints na Routes API. */
const MAX_ROUTE_WAYPOINTS = 25;
/** Distância máxima (m) para estender rota até o marcador GPS real. */
const GPS_ANCHOR_MAX_GAP_M = 250;

export function isValidLatLng(
  point: LatLng | null | undefined,
): point is LatLng {
  return (
    point != null &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng)
  );
}

export function filterValidLatLng(points: LatLng[]): LatLng[] {
  return points.filter(isValidLatLng);
}

export function ensurePathReaches(path: LatLng[], target: LatLng, maxGapM = 35): LatLng[] {
  if (path.length === 0) {
    return [{ ...target }];
  }

  const result = [...path];
  const last = result[result.length - 1];
  const gapM = haversineMeters(last.lat, last.lng, target.lat, target.lng);

  if (gapM <= maxGapM) {
    result[result.length - 1] = { ...target };
    return result;
  }

  result.push({ ...target });
  return result;
}

function decimateWaypoints(points: LatLng[], maxPoints: number): LatLng[] {
  if (points.length <= maxPoints) {
    return points.map((point) => ({ ...point }));
  }

  const sampled: LatLng[] = [];
  for (let i = 0; i < maxPoints; i++) {
    const index = Math.round((i * (points.length - 1)) / (maxPoints - 1));
    sampled.push(points[index]);
  }
  return sampled;
}

function pathFromRoute(route: google.maps.routes.Route): LatLng[] {
  const path: LatLng[] = [];

  for (const polyline of route.createPolylines()) {
    const latLngs = polyline.getPath();
    if (!latLngs) continue;

    for (let i = 0; i < latLngs.getLength(); i++) {
      const latLng = latLngs.getAt(i);
      if (!latLng) continue;
      path.push({ lat: latLng.lat(), lng: latLng.lng() });
    }
  }

  return path;
}

function warningForRouteError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);

  if (/PERMISSION_DENIED|REQUEST_DENIED|403|FORBIDDEN|API key/i.test(message)) {
    return (
      'Google recusou a Routes API (403). Habilite a Routes API no Google Cloud e ' +
      'libere os referrers https://livretracker.com/* e http://localhost:5173/*.'
    );
  }

  if (/Roads API|roads\.googleapis/i.test(message)) {
    return (
      'Google recusou a Roads API. Habilite a Roads API no Google Cloud na mesma chave do Maps ' +
      '(referrers https://livretracker.com/* e http://localhost:5173/*).'
    );
  }

  if (/OVER_QUERY_LIMIT|RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return 'Limite de consultas de rotas atingido. Aguarde alguns minutos e tente de novo.';
  }

  if (/ZERO_RESULTS|NOT_FOUND|NO_ROUTE|NO_PATH/i.test(message)) {
    return 'Não foi possível calcular rota pelas ruas para estes pontos.';
  }

  if (/timeout|demorou demais/i.test(message)) {
    return 'A API de rotas demorou demais para responder.';
  }

  return message || 'Falha ao calcular rota pelas ruas.';
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      window.setTimeout(() => {
        reject(new Error('API de rotas demorou demais (timeout).'));
      }, ms);
    }),
  ]);
}

async function computeRouteThroughRoutes(
  Route: RouteClass,
  waypoints: LatLng[],
  rawWaypoints: LatLng[],
): Promise<LatLng[]> {
  if (waypoints.length < 2) {
    return waypoints;
  }

  const request: google.maps.routes.ComputeRoutesRequest = {
    origin: waypoints[0],
    destination: waypoints[waypoints.length - 1],
    travelMode: 'DRIVING',
    fields: ['path'],
  };

  if (waypoints.length > 2) {
    request.intermediates = waypoints.slice(1, -1).map((point) => ({
      location: point,
    }));
  }

  const { routes } = await withTimeout(Route.computeRoutes(request), ROUTE_TIMEOUT_MS);
  const route = routes?.[0];
  if (!route) {
    throw new Error('NO_ROUTE');
  }

  let path = pathFromRoute(route);
  if (path.length < 2) {
    throw new Error('NO_PATH');
  }

  path = anchorPathToSnappedWaypoints(path, rawWaypoints, waypoints);
  return path;
}

export function createRouteProvider(
  Route: RouteClass,
  apiKey: string,
): RouteProvider {
  return {
    async snapWaypoints(waypoints) {
      try {
        return await snapToRoads(apiKey, waypoints);
      } catch {
        return waypoints.map((point) => ({ ...point }));
      }
    },
    async computeThrough(waypoints) {
      const rawWaypoints = waypoints.map((point) => ({ ...point }));
      let snappedWaypoints = rawWaypoints;
      try {
        snappedWaypoints = await snapToRoads(apiKey, rawWaypoints);
      } catch {
        snappedWaypoints = rawWaypoints;
      }
      return computeRouteThroughRoutes(Route, snappedWaypoints, rawWaypoints);
    },
  };
}

export async function buildRoadPath(
  provider: RouteProvider,
  points: LatLng[],
): Promise<RoadPathResult> {
  const validPoints = filterValidLatLng(points);
  if (validPoints.length < 2) {
    return { path: validPoints, usedFallback: false };
  }

  const waypoints = decimateWaypoints(validPoints, MAX_ROUTE_WAYPOINTS);
  const simplified = waypoints.length < validPoints.length;

  try {
    const path = filterValidLatLng(await provider.computeThrough(waypoints));
    if (path.length < 2) {
      throw new Error('NO_PATH');
    }

    return {
      path,
      usedFallback: false,
      warning: simplified
        ? `Rota pelas ruas com ${waypoints.length} pontos principais (${validPoints.length} leituras no dia).`
        : undefined,
    };
  } catch (err) {
    const message = warningForRouteError(err);
    return {
      path: [],
      usedFallback: true,
      warning: message.includes('recusou') || message.includes('403')
        ? message
        : `${message} Não foi possível desenhar a rota pelas ruas.`,
    };
  }
}

export async function buildActiveRoadPath(
  provider: RouteProvider,
  points: LatLng[],
): Promise<LatLng[]> {
  const validPoints = filterValidLatLng(points);
  if (validPoints.length < 2) {
    return [];
  }

  try {
    const path = filterValidLatLng(await provider.computeThrough(validPoints));
    return path.length >= 2 ? path : [];
  } catch {
    return [];
  }
}

/** Rota pelas ruas quando possível; senão linha GPS entre os pontos. */
export async function resolveDisplayPath(
  provider: RouteProvider,
  points: LatLng[],
): Promise<{ path: LatLng[]; usedRoads: boolean; warning?: string }> {
  const validPoints = filterValidLatLng(points);
  if (validPoints.length < 2) {
    return { path: validPoints, usedRoads: false };
  }

  const result = await buildRoadPath(provider, validPoints);
  if (result.path.length >= 2) {
    const lastTarget = validPoints[validPoints.length - 1];
    return {
      path: ensurePathReaches(result.path, lastTarget, GPS_ANCHOR_MAX_GAP_M),
      usedRoads: true,
      warning: result.warning,
    };
  }

  return {
    path: validPoints,
    usedRoads: false,
    warning:
      result.warning ??
      'Traçado aproximado em linha reta — não foi possível calcular rota pelas ruas.',
  };
}
