import { anchorPathToSnappedWaypoints, snapInterpolatedRoadPath, snapToRoads } from './roadsSnap';
import { haversineMeters } from './geo';
import { prepareRoadRoutingPoints } from './routingWaypoints';

export type LatLng = { lat: number; lng: number };

export type RoadPathResult = {
  path: LatLng[];
  usedFallback: boolean;
  warning?: string;
};

export type RouteProvider = {
  computeThrough: (waypoints: LatLng[]) => Promise<LatLng[]>;
  computeSegment: (from: LatLng, to: LatLng) => Promise<LatLng[]>;
  snapWaypoints: (waypoints: LatLng[]) => Promise<LatLng[]>;
};

type RouteClass = typeof google.maps.routes.Route;

const ROUTE_TIMEOUT_MS = 20_000;
/** Limite prático de waypoints na Routes API. */
const MAX_ROUTE_WAYPOINTS = 25;
/** Distância máxima (m) para estender rota até o marcador GPS real. */
export const ROAD_PATH_MAX_ANCHOR_M = 45;
/** Acima disso, liga dois pontos em linha reta em vez de pedir rota (evita voltas enormes). */
const CHAIN_MAX_SEGMENT_M = 2_500;
/** Abaixo disso, só conecta os pontos sem chamar a API. */
const CHAIN_MIN_SEGMENT_M = 10;
/** Distância (m) para considerar vértices duplicados ao encadear trechos. */
const CHAIN_MERGE_TOLERANCE_M = 8;
/** Proporção máxima comprimento da rota / linha reta antes de descartar o trecho. */
const MAX_ROUTE_DETOUR_RATIO_SHORT = 1.85;
const MAX_ROUTE_DETOUR_RATIO_LONG = 2.6;
const SHORT_SEGMENT_DIRECT_M = 180;

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

function pathLengthMeters(path: LatLng[]): number {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) {
    total += haversineMeters(
      path[index - 1].lat,
      path[index - 1].lng,
      path[index].lat,
      path[index].lng,
    );
  }
  return total;
}

function isReasonableRoute(from: LatLng, to: LatLng, path: LatLng[]): boolean {
  const direct = haversineMeters(from.lat, from.lng, to.lat, to.lng);
  if (direct < 25) {
    return path.length >= 2;
  }

  const routeLength = pathLengthMeters(path);
  const maxRatio =
    direct < SHORT_SEGMENT_DIRECT_M
      ? MAX_ROUTE_DETOUR_RATIO_SHORT
      : MAX_ROUTE_DETOUR_RATIO_LONG;
  return routeLength / direct <= maxRatio;
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

function appendChainedSegment(merged: LatLng[], segment: LatLng[]): void {
  if (segment.length === 0) {
    return;
  }

  if (merged.length === 0) {
    merged.push(...segment.map((point) => ({ ...point })));
    return;
  }

  const last = merged[merged.length - 1];
  const first = segment[0];
  const gap = haversineMeters(last.lat, last.lng, first.lat, first.lng);
  if (gap <= CHAIN_MERGE_TOLERANCE_M) {
    merged.push(...segment.slice(1).map((point) => ({ ...point })));
    return;
  }

  merged.push(...segment.map((point) => ({ ...point })));
}

/**
 * Calcula rota pelas ruas encadeando apenas pares consecutivos de pontos.
 * Evita falsas voltas em quadras quando a Routes API recebe muitos intermediates.
 */
export async function buildChainedRoadPath(
  provider: RouteProvider,
  points: LatLng[],
  options?: { maxSegmentM?: number; minSegmentM?: number },
): Promise<RoadPathResult> {
  const validPoints = prepareRoadRoutingPoints(filterValidLatLng(points));
  if (validPoints.length < 2) {
    return { path: validPoints, usedFallback: false };
  }

  const maxSegmentM = options?.maxSegmentM ?? CHAIN_MAX_SEGMENT_M;
  const minSegmentM = options?.minSegmentM ?? CHAIN_MIN_SEGMENT_M;
  const merged: LatLng[] = [];
  let routedSegments = 0;
  let skippedSegments = 0;
  let warning: string | undefined;

  for (let index = 0; index < validPoints.length - 1; index += 1) {
    const from = validPoints[index];
    const to = validPoints[index + 1];
    const gap = haversineMeters(from.lat, from.lng, to.lat, to.lng);

    if (gap <= minSegmentM) {
      if (merged.length === 0) {
        merged.push({ ...from });
      }
      if (gap > 1.5) {
        merged.push({ ...to });
      }
      continue;
    }

    if (gap > maxSegmentM) {
      skippedSegments += 1;
      warning =
        warning ??
        'Trechos muito longos sem leituras intermediárias foram omitidos do mapa.';
      continue;
    }

    try {
      const segment = filterValidLatLng(await provider.computeSegment(from, to));
      if (segment.length >= 2) {
        appendChainedSegment(merged, segment);
        routedSegments += 1;
      } else {
        skippedSegments += 1;
      }
    } catch {
      skippedSegments += 1;
      warning = warning ?? 'Alguns trechos não puderam ser calculados pelas ruas.';
    }
  }

  if (merged.length < 2) {
    return {
      path: [],
      usedFallback: true,
      warning: warning ?? 'Não foi possível desenhar a rota pelas ruas.',
    };
  }

  return {
    path: merged,
    usedFallback: routedSegments === 0,
    warning:
      warning ??
      (skippedSegments > 0
        ? 'Parte do trajeto foi omitida por falta de leituras intermediárias.'
        : undefined),
  };
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
  async function computeSegmentPath(from: LatLng, to: LatLng): Promise<LatLng[]> {
    try {
      const routed = filterValidLatLng(
        await computeRouteThroughRoutes(Route, [from, to], [from, to]),
      );
      if (routed.length >= 2 && isReasonableRoute(from, to, routed)) {
        return routed;
      }
    } catch {
      // tenta fallback abaixo
    }

    try {
      const snapped = filterValidLatLng(await snapInterpolatedRoadPath(apiKey, [from, to]));
      if (snapped.length >= 2 && isReasonableRoute(from, to, snapped)) {
        return snapped;
      }
    } catch {
      // sem traçado para este trecho
    }

    return [];
  }

  return {
    async snapWaypoints(waypoints) {
      try {
        return await snapToRoads(apiKey, waypoints);
      } catch {
        return waypoints.map((point) => ({ ...point }));
      }
    },
    computeSegment: computeSegmentPath,
    async computeThrough(waypoints) {
      const rawWaypoints = waypoints.map((point) => ({ ...point }));
      if (waypoints.length === 2) {
        return computeSegmentPath(rawWaypoints[0], rawWaypoints[1]);
      }

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

  const routingPoints = prepareRoadRoutingPoints(validPoints);
  if (routingPoints.length < 2) {
    return { path: [], usedFallback: true, warning: 'Trajeto parado — sem rota para desenhar.' };
  }

  const waypoints = decimateWaypoints(routingPoints, MAX_ROUTE_WAYPOINTS);
  const simplified = waypoints.length < validPoints.length;

  if (waypoints.length === 2) {
    try {
      const path = filterValidLatLng(
        await provider.computeSegment(waypoints[0], waypoints[1]),
      );
      if (path.length < 2) {
        throw new Error('NO_PATH');
      }

      return {
        path,
        usedFallback: false,
        warning: simplified
          ? `Rota pelas ruas com 2 pontos principais (${validPoints.length} leituras no dia).`
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

  const chained = await buildChainedRoadPath(provider, waypoints);
  if (chained.path.length >= 2) {
    return {
      ...chained,
      warning:
        chained.warning ??
        (simplified
          ? `Rota pelas ruas com ${waypoints.length} pontos principais (${validPoints.length} leituras no dia).`
          : undefined),
    };
  }

  const message = chained.warning ?? 'Não foi possível desenhar a rota pelas ruas.';
  return {
    path: [],
    usedFallback: true,
    warning: message,
  };
}

export async function buildActiveRoadPath(
  provider: RouteProvider,
  points: LatLng[],
): Promise<LatLng[]> {
  const validPoints = filterValidLatLng(points);
  if (validPoints.length < 2) {
    return [];
  }

  if (validPoints.length === 2) {
    const path = filterValidLatLng(
      await provider.computeSegment(validPoints[0], validPoints[1]),
    );
    return path.length >= 2 ? path : [];
  }

  const chained = await buildChainedRoadPath(provider, validPoints);
  return chained.path.length >= 2 ? chained.path : [];
}

/** Rota pelas ruas quando possível; senão linha GPS entre os pontos. */
export async function resolveDisplayPath(
  provider: RouteProvider,
  points: LatLng[],
  maxAnchorGapM = ROAD_PATH_MAX_ANCHOR_M,
): Promise<{ path: LatLng[]; usedRoads: boolean; warning?: string }> {
  const validPoints = filterValidLatLng(points);
  if (validPoints.length < 2) {
    return { path: validPoints, usedRoads: false };
  }

  const result = await buildRoadPath(provider, validPoints);
  if (result.path.length >= 2) {
    const lastTarget = validPoints[validPoints.length - 1];
    return {
      path: ensurePathReaches(result.path, lastTarget, maxAnchorGapM),
      usedRoads: true,
      warning: result.warning,
    };
  }

  return {
    path: [],
    usedRoads: false,
    warning:
      result.warning ??
      'Não foi possível calcular rota pelas ruas para estes pontos.',
  };
}
