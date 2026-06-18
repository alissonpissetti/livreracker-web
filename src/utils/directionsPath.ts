export type LatLng = { lat: number; lng: number };

export type RoadPathResult = {
  path: LatLng[];
  usedFallback: boolean;
  warning?: string;
};

export type RouteProvider = {
  computeThrough: (waypoints: LatLng[]) => Promise<LatLng[]>;
};

type RouteClass = typeof google.maps.routes.Route;

const ROUTE_TIMEOUT_MS = 20_000;
/** Limite prático de waypoints na Routes API. */
const MAX_ROUTE_WAYPOINTS = 25;

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

  const path = pathFromRoute(route);
  if (path.length < 2) {
    throw new Error('NO_PATH');
  }

  return path;
}

export function createRouteProvider(Route: RouteClass): RouteProvider {
  return {
    computeThrough(waypoints) {
      return computeRouteThroughRoutes(Route, waypoints);
    },
  };
}

export async function buildRoadPath(
  provider: RouteProvider,
  points: LatLng[],
): Promise<RoadPathResult> {
  if (points.length < 2) {
    return { path: points, usedFallback: false };
  }

  const waypoints = decimateWaypoints(points, MAX_ROUTE_WAYPOINTS);
  const simplified = waypoints.length < points.length;

  try {
    const path = await provider.computeThrough(waypoints);

    return {
      path,
      usedFallback: false,
      warning: simplified
        ? `Rota pelas ruas com ${waypoints.length} pontos principais (${points.length} leituras no dia).`
        : undefined,
    };
  } catch (err) {
    const message = warningForRouteError(err);
    return {
      path: points,
      usedFallback: true,
      warning: message.includes('recusou') || message.includes('403')
        ? message
        : `${message} Exibindo linha reta entre leituras.`,
    };
  }
}

export async function buildActiveRoadPath(
  provider: RouteProvider,
  points: LatLng[],
): Promise<LatLng[]> {
  if (points.length < 2) {
    return points;
  }

  if (haversineMeters(points[0], points[points.length - 1]) < 12) {
    return points;
  }

  try {
    return await provider.computeThrough(points);
  } catch {
    return points;
  }
}
