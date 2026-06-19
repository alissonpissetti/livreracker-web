import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeviceLocation } from '../types';
import type { TimelineSegment } from '../utils/dailyTimeline';
import { segmentPoints } from '../utils/dailyTimeline';
import {
  createRouteProvider,
  resolveDisplayPath,
  type LatLng,
  type RouteProvider,
} from '../utils/directionsPath';
import { getGoogleMapId, loadGoogleMaps } from '../utils/googleMaps';
import { isValidReading, lastValidPointIndex, validRoutePoints, effectiveCoordinate } from '../utils/locationOutliers';
import {
  markerRoleForIndex,
  markerZIndex,
  readingMarkerIcon,
} from '../utils/mapPointInfo';
import { TrackingPointPanel } from './TrackingPointPanel';

type MarkerEntry = {
  marker: google.maps.Marker;
  validIndex: number;
};

type TrackingMapProps = {
  points: DeviceLocation[];
  ready?: boolean;
  resetKey?: string;
  live?: boolean;
  /** Histórico: exibe todos os trechos coloridos do dia. */
  showFullDayRoute?: boolean;
  segments?: TimelineSegment[];
  selectedSegmentId?: string | null;
  pointExplorerOpen?: boolean;
  validPointIndex?: number | null;
  onValidPointSelect?: (index: number) => void;
  onPointExplorerClose?: () => void;
  onPointPrevious?: () => void;
  onPointNext?: () => void;
};

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const LIVE_ZOOM = 16;

function isValidLocation(point: DeviceLocation): boolean {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude);
}

function toLatLng(point: DeviceLocation): LatLng {
  const coordinate = effectiveCoordinate(point);
  return { lat: coordinate.lat, lng: coordinate.lng };
}

function pointsToPath(points: DeviceLocation[]): LatLng[] {
  return points.filter(isValidLocation).map(toLatLng);
}

function fitMapToPoints(map: google.maps.Map, path: LatLng[]): void {
  if (path.length === 0) {
    return;
  }
  if (path.length === 1) {
    map.setCenter(path[0]);
    map.setZoom(LIVE_ZOOM);
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  path.forEach((point) => bounds.extend(point));
  map.fitBounds(bounds, 48);
}

function createStopIcon(color: string): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
    scale: 8,
  };
}

export function TrackingMap({
  points,
  ready = true,
  resetKey = 'default',
  live = false,
  showFullDayRoute = false,
  segments = [],
  selectedSegmentId = null,
  pointExplorerOpen = false,
  validPointIndex = null,
  onValidPointSelect,
  onPointExplorerClose,
  onPointPrevious,
  onPointNext,
}: TrackingMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const providerRef = useRef<RouteProvider | null>(null);
  const markersRef = useRef<MarkerEntry[]>([]);
  const onValidPointSelectRef = useRef(onValidPointSelect);
  onValidPointSelectRef.current = onValidPointSelect;
  const routeLineRef = useRef<google.maps.Polyline | null>(null);
  const backgroundLinesRef = useRef<google.maps.Polyline[]>([]);
  const stopMarkersRef = useRef<google.maps.Marker[]>([]);
  const drawTokenRef = useRef(0);

  const [loading, setLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState('');
  const [routeNote, setRouteNote] = useState('');

  const pointsKey = `${points.length}:${points.at(-1)?.id ?? 'none'}`;
  const segmentsKey = segments.map((segment) => segment.id).join('|');
  const validPoints = useMemo(() => validRoutePoints(points), [points]);
  const activeValidIndex =
    pointExplorerOpen &&
    validPointIndex != null &&
    validPointIndex >= 0 &&
    validPointIndex < validPoints.length
      ? validPointIndex
      : null;

  function updateMarkerStyles(activeIndex: number | null): void {
    const total = markersRef.current.length;
    for (const entry of markersRef.current) {
      const role =
        activeIndex == null
          ? 'default'
          : markerRoleForIndex(entry.validIndex, activeIndex, total);
      entry.marker.setIcon(readingMarkerIcon(google.maps.SymbolPath, role));
      entry.marker.setZIndex(markerZIndex(role));
    }
  }

  function clearDynamicLayers(): void {
    backgroundLinesRef.current.forEach((line) => line.setMap(null));
    backgroundLinesRef.current = [];
    stopMarkersRef.current.forEach((marker) => {
      marker.setMap(null);
    });
    stopMarkersRef.current = [];
    routeLineRef.current?.setPath([]);
  }

  function setMainRoute(map: google.maps.Map, path: LatLng[], color: string): void {
    const line = routeLineRef.current;
    if (!line || path.length < 2) {
      return;
    }
    line.setPath(path);
    line.setOptions({
      geodesic: true,
      strokeColor: color,
      strokeOpacity: 1,
      strokeWeight: 8,
      zIndex: 1000,
    });
    line.setMap(map);
  }

  async function drawPointExplorer(
    map: google.maps.Map,
    provider: RouteProvider | null,
    routePoints: DeviceLocation[],
    activeIndex: number,
  ): Promise<void> {
    const token = ++drawTokenRef.current;
    clearDynamicLayers();
    updateMarkerStyles(activeIndex);
    setRouteNote('');

    const current = routePoints[activeIndex];
    if (!current || !isValidLocation(current)) {
      return;
    }

    const previous = activeIndex > 0 ? routePoints[activeIndex - 1] : null;
    if (!previous || !isValidLocation(previous)) {
      fitMapToPoints(map, [toLatLng(current)]);
      return;
    }

    const path = [toLatLng(previous), toLatLng(current)];
    setMainRoute(map, path, '#dc2626');
    fitMapToPoints(map, path);

    if (!provider || token !== drawTokenRef.current) {
      return;
    }

    const resolved = await resolveDisplayPath(provider, path);
    if (token !== drawTokenRef.current) {
      return;
    }
    if (resolved.path.length >= 2) {
      setMainRoute(map, resolved.path, '#dc2626');
      fitMapToPoints(map, resolved.path);
    }
    if (resolved.warning) {
      setRouteNote(resolved.warning);
    }
  }

  async function drawFullDayRoute(
    map: google.maps.Map,
    provider: RouteProvider | null,
    currentPoints: DeviceLocation[],
    currentSegments: TimelineSegment[],
    focusSegmentId: string | null,
  ): Promise<void> {
    const token = ++drawTokenRef.current;
    clearDynamicLayers();
    updateMarkerStyles(null);
    setRouteNote('');

    const focusSegment = currentSegments.find((segment) => segment.id === focusSegmentId);
    let focusPath: LatLng[] = [];

    for (const segment of currentSegments) {
      if (segment.kind === 'stop') {
        const marker = new google.maps.Marker({
          map,
          position: { lat: segment.centroidLat, lng: segment.centroidLng },
          icon: createStopIcon(segment.color),
          zIndex: segment.id === focusSegmentId ? 6 : 5,
        });
        stopMarkersRef.current.push(marker);
        continue;
      }

      const path = pointsToPath(segmentPoints(currentPoints, segment));
      if (path.length < 2) {
        continue;
      }

      const isFocused = segment.id === focusSegmentId;
      if (isFocused) {
        focusPath = path;
      }

      const line = new google.maps.Polyline({
        map,
        path,
        geodesic: true,
        strokeColor: segment.color,
        strokeOpacity: 1,
        strokeWeight: isFocused ? 9 : 6,
        zIndex: isFocused ? 1000 : 10,
      });
      backgroundLinesRef.current.push(line);

      if (!provider || token !== drawTokenRef.current) {
        continue;
      }

      void resolveDisplayPath(provider, path).then((resolved) => {
        if (token !== drawTokenRef.current || resolved.path.length < 2) {
          return;
        }
        line.setPath(resolved.path);
        if (isFocused) {
          focusPath = resolved.path;
          fitMapToPoints(map, focusPath);
        }
      });
    }

    if (focusSegment?.kind === 'stop') {
      fitMapToPoints(map, [{ lat: focusSegment.centroidLat, lng: focusSegment.centroidLng }]);
    } else if (focusPath.length >= 2) {
      fitMapToPoints(map, focusPath);
    } else {
      fitMapToPoints(map, pointsToPath(validRoutePoints(currentPoints)));
    }
  }

  async function drawScene(
    map: google.maps.Map,
    provider: RouteProvider | null,
    currentPoints: DeviceLocation[],
    currentSegments: TimelineSegment[],
    segmentId: string | null,
    isLive: boolean,
  ): Promise<void> {
    const token = ++drawTokenRef.current;
    clearDynamicLayers();
    setRouteNote('');

    if (!isLive && activeValidIndex != null) {
      await drawPointExplorer(map, provider, validPoints, activeValidIndex);
      return;
    }

    updateMarkerStyles(null);

    if (showFullDayRoute) {
      await drawFullDayRoute(map, provider, currentPoints, currentSegments, segmentId);
      return;
    }

    if (isLive) {
      const lastIndex = lastValidPointIndex(currentPoints);
      let prev: DeviceLocation | null = null;
      for (let index = lastIndex - 1; index >= 0; index -= 1) {
        if (isValidReading(currentPoints[index]) && isValidLocation(currentPoints[index])) {
          prev = currentPoints[index];
          break;
        }
      }
      const current = currentPoints[lastIndex];
      if (!prev || !current || !isValidLocation(current)) {
        fitMapToPoints(map, pointsToPath(currentPoints));
        return;
      }

      const path = [toLatLng(prev), toLatLng(current)];
      setMainRoute(map, path, '#dc2626');
      fitMapToPoints(map, path);

      if (!provider || token !== drawTokenRef.current) {
        return;
      }

      const resolved = await resolveDisplayPath(provider, path);
      if (token !== drawTokenRef.current) {
        return;
      }
      if (resolved.path.length >= 2) {
        setMainRoute(map, resolved.path, '#dc2626');
        fitMapToPoints(map, resolved.path);
      }
      if (resolved.warning) {
        setRouteNote(resolved.warning);
      }
      return;
    }

    const selected = currentSegments.find((segment) => segment.id === segmentId);

    for (const segment of currentSegments) {
      if (segment.kind === 'stop') {
        const marker = new google.maps.Marker({
          map,
          position: { lat: segment.centroidLat, lng: segment.centroidLng },
          icon: createStopIcon(segment.color),
          zIndex: 5,
        });
        stopMarkersRef.current.push(marker);
        continue;
      }

      const path = pointsToPath(segmentPoints(currentPoints, segment));
      if (path.length < 2) {
        continue;
      }

      const isSelected = segment.id === segmentId;
      if (isSelected) {
        continue;
      }

      const line = new google.maps.Polyline({
        map,
        path,
        geodesic: true,
        strokeColor: segment.color,
        strokeOpacity: 0.3,
        strokeWeight: 4,
        zIndex: 1,
      });
      backgroundLinesRef.current.push(line);
    }

    if (!selected) {
      fitMapToPoints(map, pointsToPath(validRoutePoints(currentPoints)));
      return;
    }

    if (selected.kind === 'stop') {
      fitMapToPoints(map, [{ lat: selected.centroidLat, lng: selected.centroidLng }]);
      return;
    }

    const mainPath = pointsToPath(segmentPoints(currentPoints, selected));
    if (mainPath.length < 2) {
      fitMapToPoints(map, pointsToPath(currentPoints));
      return;
    }

    setMainRoute(map, mainPath, selected.color);
    fitMapToPoints(map, mainPath);

    if (!provider || token !== drawTokenRef.current) {
      return;
    }

    const resolved = await resolveDisplayPath(provider, mainPath);
    if (token !== drawTokenRef.current) {
      return;
    }
    if (resolved.path.length >= 2) {
      setMainRoute(map, resolved.path, selected.color);
      fitMapToPoints(map, resolved.path);
    }
    if (resolved.warning) {
      setRouteNote(resolved.warning);
    }
  }

  useEffect(() => {
    const container = containerRef.current;
    if (!ready || !container || points.length === 0) {
      setMapReady(false);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setMapReady(false);
    setError('');

    void loadGoogleMaps(MAPS_KEY)
      .then(async ({ Map, Polyline, Route }) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        markersRef.current.forEach((entry) => {
          entry.marker.setMap(null);
        });
        markersRef.current = [];
        routeLineRef.current?.setMap(null);
        routeLineRef.current = null;
        mapRef.current = null;

        const seed = pointsToPath(points).at(-1);
        if (!seed) {
          return;
        }

        const map = new Map(containerRef.current, {
          mapId: getGoogleMapId(),
          center: seed,
          zoom: LIVE_ZOOM,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
        });

        mapRef.current = map;
        providerRef.current = createRouteProvider(Route, MAPS_KEY);

        let validIndex = 0;
        for (const point of points) {
          if (!isValidLocation(point) || !isValidReading(point)) {
            continue;
          }
          const marker = new google.maps.Marker({
            map,
            position: toLatLng(point),
            icon: readingMarkerIcon(google.maps.SymbolPath, 'default'),
            zIndex: markerZIndex('default'),
          });
          const capturedIndex = validIndex;
          marker.addListener('click', () => {
            if (!live) {
              onValidPointSelectRef.current?.(capturedIndex);
            }
          });
          markersRef.current.push({ marker, validIndex: capturedIndex });
          validIndex += 1;
        }

        routeLineRef.current = new Polyline({
          map,
          path: [],
          geodesic: true,
          strokeColor: '#dc2626',
          strokeOpacity: 1,
          strokeWeight: 8,
          zIndex: 1000,
        });

        fitMapToPoints(map, pointsToPath(validRoutePoints(points)));

        if (!cancelled) {
          setMapReady(true);
        }
      })
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      drawTokenRef.current += 1;
      markersRef.current.forEach((entry) => {
        entry.marker.setMap(null);
      });
      markersRef.current = [];
      backgroundLinesRef.current.forEach((line) => line.setMap(null));
      backgroundLinesRef.current = [];
      stopMarkersRef.current.forEach((marker) => {
        marker.setMap(null);
      });
      stopMarkersRef.current = [];
      routeLineRef.current?.setMap(null);
      routeLineRef.current = null;
      mapRef.current = null;
      providerRef.current = null;
      setMapReady(false);
    };
  }, [ready, resetKey, pointsKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map) {
      return;
    }
    void drawScene(map, providerRef.current, points, segments, selectedSegmentId, live);
  }, [
    activeValidIndex,
    live,
    mapReady,
    points,
    segments,
    segmentsKey,
    selectedSegmentId,
    showFullDayRoute,
    validPoints,
  ]);

  if (!MAPS_KEY) {
    return (
      <div className="tracking-map-empty card">
        <p>
          Configure <code>VITE_GOOGLE_MAPS_API_KEY</code> no <code>.env</code> e reinicie o Vite.
        </p>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="tracking-map-wrap">
        <p className="muted tracking-map-status">Carregando rastreios do dia…</p>
        <div className="tracking-map tracking-map-pending" aria-hidden="true" />
      </div>
    );
  }

  if (points.length === 0) {
    return (
      <div className="tracking-map-empty card">
        <p>Nenhum ponto de rastreio para o período selecionado.</p>
      </div>
    );
  }

  return (
    <div className="tracking-map-wrap">
      {loading ? (
        <p className="muted tracking-map-status">Carregando mapa…</p>
      ) : live ? (
        <p className="muted tracking-map-status">Ao vivo — último trecho até o ponto atual.</p>
      ) : showFullDayRoute ? (
        <p className="muted tracking-map-status">
          Rota completa do dia — clique nos trechos da linha do tempo para focar no mapa.
        </p>
      ) : pointExplorerOpen && activeValidIndex != null ? (
        <p className="muted tracking-map-status">
          Modo ponto a ponto — trecho vermelho entre a leitura anterior e a atual.
        </p>
      ) : (
        <p className="muted tracking-map-status">
          Clique nos trechos da linha do tempo para ver a rota no mapa.
        </p>
      )}
      {routeNote ? <p className="muted tracking-map-status">{routeNote}</p> : null}
      {error ? <p className="error-text">{error}</p> : null}

      <div className="tracking-map-stage">
        {!live && validPoints.length > 0 && onValidPointSelect ? (
          <button
            type="button"
            className="tracking-panel-toggle"
            onClick={() => {
              if (pointExplorerOpen) {
                onPointExplorerClose?.();
                return;
              }
              onValidPointSelect(0);
            }}
          >
            {pointExplorerOpen ? 'Fechar pontos' : 'Ponto a ponto'}
          </button>
        ) : null}

        {pointExplorerOpen &&
        activeValidIndex != null &&
        onPointPrevious &&
        onPointNext &&
        onPointExplorerClose ? (
          <TrackingPointPanel
            points={validPoints}
            activeIndex={activeValidIndex}
            corridorCorrected={Boolean(validPoints[activeValidIndex]?.corridor_corrected)}
            onPrevious={onPointPrevious}
            onNext={onPointNext}
            onClose={onPointExplorerClose}
          />
        ) : null}

        <div ref={containerRef} className="tracking-map" aria-label="Mapa de rastreio" />
      </div>
    </div>
  );
}
