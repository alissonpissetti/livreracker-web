export type LatLng = { lat: number; lng: number };

export type RoadPathResult = {
  path: LatLng[];
  usedFallback: boolean;
  warning?: string;
};

export type RouteProvider = {
  computeThrough: (waypoints: LatLng[]) => Promise<LatLng[]>;
  getMode: () => 'routes' | 'directions';
};

type RouteClass = typeof google.maps.routes.Route;

const ROUTE_TIMEOUT_MS = 20_000;
/** Limite prático de waypoints (Routes e Directions). */
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

function isRoutesForbidden(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /403|FORBIDDEN|PERMISSION_DENIED|not authorized|API key/i.test(message);
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

function warningForRouteError(err: unknown, mode: 'routes' | 'directions'): string {
  const message = err instanceof Error ? err.message : String(err);

  if (/PERMISSION_DENIED|REQUEST_DENIED|DIRECTIONS_DENIED|403|FORBIDDEN|API key/i.test(message)) {
    if (mode === 'routes') {
      return (
        'Google recusou a Routes API (403). Habilite a Routes API no Google Cloud ou ' +
        'a Directions API como alternativa, e libere os referrers https://livretracker.com/* ' +
        'e http://localhost:5173/*.'
      );
    }
    return (
      'Google recusou a Directions API nesta chave. Habilite Directions API ou Routes API ' +
      'no Google Cloud e libere os referrers do site.'
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

function computeRouteThroughDirections(
  directionsService: google.maps.DirectionsService,
  waypoints: LatLng[],
): Promise<LatLng[]> {
  return new Promise((resolve, reject) => {
    if (waypoints.length < 2) {
      resolve(waypoints);
      return;
    }

    let settled = false;
    const timer = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error('Directions API demorou demais (timeout).'));
    }, ROUTE_TIMEOUT_MS);

    const request: google.maps.DirectionsRequest = {
      origin: waypoints[0],
      destination: waypoints[waypoints.length - 1],
      travelMode: google.maps.TravelMode.DRIVING,
    };

    if (waypoints.length > 2) {
      request.waypoints = waypoints.slice(1, -1).map((point) => ({
        location: point,
        stopover: true,
      }));
      request.optimizeWaypoints = false;
    }

    directionsService.route(request, (result, status) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);

      if (status === google.maps.DirectionsStatus.OK && result) {
        const path = pathFromDirectionsResult(result);
        if (path.length >= 2) {
          resolve(path);
          return;
        }
      }

      if (status === google.maps.DirectionsStatus.REQUEST_DENIED) {
        reject(new Error('DIRECTIONS_DENIED'));
        return;
      }

      reject(new Error(`Directions API retornou ${status}`));
    });
  });
}

export function createRouteProvider(
  Route: RouteClass,
  DirectionsService: typeof google.maps.DirectionsService,
): RouteProvider {
  const directionsService = new DirectionsService();
  let mode: 'routes' | 'directions' = 'routes';

  return {
    getMode: () => mode,
    async computeThrough(waypoints: LatLng[]) {
      if (mode === 'directions') {
        return computeRouteThroughDirections(directionsService, waypoints);
      }

      try {
        return await computeRouteThroughRoutes(Route, waypoints);
      } catch (err) {
        if (!isRoutesForbidden(err)) {
          throw err;
        }
        mode = 'directions';
        return computeRouteThroughDirections(directionsService, waypoints);
      }
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
    const usingDirections = provider.getMode() === 'directions';

    return {
      path,
      usedFallback: false,
      warning: simplified
        ? `Rota pelas ruas com ${waypoints.length} pontos principais (${points.length} leituras no dia).`
        : usingDirections
          ? 'Routes API bloqueada (403) — usando Directions API. Habilite Routes API no Google Cloud.'
          : undefined,
    };
  } catch (err) {
    const message = warningForRouteError(err, provider.getMode());
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
