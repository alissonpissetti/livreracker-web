import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeviceLocation } from '../types';
import { buildActiveRoadPath, buildRoadPath, createRouteProvider } from '../utils/directionsPath';
import type { LatLng, RouteProvider } from '../utils/directionsPath';
import { getGoogleMapId, loadGoogleMaps } from '../utils/googleMaps';
import {
  applyReadingMarkerRole,
  createReadingMarkerElement,
  markerRoleForIndex,
  markerZIndex,
} from '../utils/mapPointInfo';
import { TrackingPointPanel } from './TrackingPointPanel';

type TrackingMapProps = {
  points: DeviceLocation[];
  ready?: boolean;
  resetKey?: string;
  live?: boolean;
};

type MarkerEntry = {
  marker: google.maps.marker.AdvancedMarkerElement;
  content: HTMLDivElement;
};

type LatLngLiteral = { lat: number; lng: number };

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const PANEL_WIDTH = 300;
const LIVE_ZOOM = 16;

function mapPadding(panelOpen: boolean): google.maps.Padding {
  return {
    top: 56,
    right: panelOpen ? PANEL_WIDTH + 24 : 48,
    bottom: 48,
    left: 48,
  };
}

function toLatLng(point: DeviceLocation): LatLngLiteral {
  return { lat: point.latitude, lng: point.longitude };
}

function boundsNeedZoom(bounds: google.maps.LatLngBounds): boolean {
  const ne = bounds.getNorthEast();
  const sw = bounds.getSouthWest();
  return ne.lat() === sw.lat() && ne.lng() === sw.lng();
}

function focusMapOnSegment(
  map: google.maps.Map,
  segment: LatLngLiteral[],
  padding: google.maps.Padding,
): void {
  if (segment.length === 0) {
    return;
  }

  if (segment.length === 1) {
    map.setCenter(segment[0]);
    map.setZoom(LIVE_ZOOM);
    return;
  }

  const bounds = new google.maps.LatLngBounds();
  segment.forEach((point) => bounds.extend(point));

  if (boundsNeedZoom(bounds)) {
    map.setCenter(segment[segment.length - 1]);
    map.setZoom(LIVE_ZOOM);
    return;
  }

  map.fitBounds(bounds, padding);
}

export function TrackingMap({
  points,
  ready = true,
  resetKey = 'default',
  live = false,
}: TrackingMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const routeProviderRef = useRef<RouteProvider | null>(null);
  const activeRouteRequestRef = useRef(0);
  const panelOpenRef = useRef(true);
  const prevPointsLengthRef = useRef(0);
  const pointsRef = useRef(points);
  const liveRef = useRef(live);
  const syncLiveViewRef = useRef<() => void>(() => {});
  const overlaysRef = useRef<{
    routeLine: google.maps.Polyline | null;
    activeRouteLine: google.maps.Polyline | null;
    markers: MarkerEntry[];
  }>({ routeLine: null, activeRouteLine: null, markers: [] });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);
  const [routeWarning, setRouteWarning] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);

  panelOpenRef.current = panelOpen;
  pointsRef.current = points;
  liveRef.current = live;

  const goPrevious = useCallback(() => {
    if (live) return;
    setActiveIndex((current) => Math.max(0, current - 1));
  }, [live]);

  const goNext = useCallback(() => {
    if (live) return;
    setActiveIndex((current) => Math.min(points.length - 1, current + 1));
  }, [live, points.length]);

  const updateMarkerStyles = useCallback((selectedIndex: number) => {
    overlaysRef.current.markers.forEach((entry, index) => {
      const role = markerRoleForIndex(index, selectedIndex, overlaysRef.current.markers.length);
      applyReadingMarkerRole(entry.content, role);
      entry.marker.zIndex = markerZIndex(role);
    });
  }, []);

  const updateActiveRoute = useCallback(async (index: number) => {
    const map = mapRef.current;
    const provider = routeProviderRef.current;
    const line = overlaysRef.current.activeRouteLine;
    const currentPoints = pointsRef.current;
    if (!map || !line || currentPoints.length === 0) {
      return;
    }

    const start = Math.max(0, index - 1);
    const end = index;
    const slice: LatLng[] = currentPoints
      .slice(start, end + 1)
      .map(toLatLng);

    line.setPath(slice);
    line.setMap(slice.length > 0 ? map : null);

    if (!provider || slice.length < 2) {
      return;
    }

    const requestId = ++activeRouteRequestRef.current;
    const path = await buildActiveRoadPath(provider, slice);
    if (requestId !== activeRouteRequestRef.current) {
      return;
    }

    line.setPath(path);
    line.setMap(map);
  }, []);

  const focusReading = useCallback(
    (index: number) => {
      const map = mapRef.current;
      const currentPoints = pointsRef.current;
      const point = currentPoints[index];
      if (!map || !point) {
        return;
      }

      updateMarkerStyles(index);
      void updateActiveRoute(index);

      const padding = mapPadding(panelOpenRef.current);
      const prev = index > 0 ? currentPoints[index - 1] : null;
      const next = index < currentPoints.length - 1 ? currentPoints[index + 1] : null;
      const focusPath = [prev, point, next]
        .filter((item): item is DeviceLocation => item != null)
        .map(toLatLng);

      focusMapOnSegment(map, focusPath, padding);
    },
    [updateActiveRoute, updateMarkerStyles],
  );

  const syncLiveView = useCallback(() => {
    if (!liveRef.current || !mapRef.current) {
      return;
    }

    const currentPoints = pointsRef.current;
    if (currentPoints.length === 0) {
      return;
    }

    const lastIndex = currentPoints.length - 1;
    setActiveIndex(lastIndex);
    focusReading(lastIndex);
  }, [focusReading]);

  syncLiveViewRef.current = syncLiveView;

  useEffect(() => {
    setPanelOpen(true);
    prevPointsLengthRef.current = 0;
    if (!live) {
      setActiveIndex(0);
    }
  }, [resetKey, live]);

  useEffect(() => {
    if (!live || !mapReady || loading || points.length === 0) {
      return;
    }
    syncLiveView();
  }, [live, loading, mapReady, panelOpen, points.length, points.at(-1)?.id, syncLiveView]);

  useEffect(() => {
    if (live || !mapReady || loading || points.length === 0) {
      return;
    }
    focusReading(activeIndex);
  }, [activeIndex, focusReading, live, loading, mapReady, panelOpen, points.length]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrevious();
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goNext, goPrevious]);

  useEffect(() => {
    const container = containerRef.current;

    function clearOverlays() {
      overlaysRef.current.markers.forEach((entry) => {
        entry.marker.map = null;
      });
      overlaysRef.current.routeLine?.setMap(null);
      overlaysRef.current.activeRouteLine?.setMap(null);
      overlaysRef.current = { routeLine: null, activeRouteLine: null, markers: [] };
    }

    function resetMapInstance() {
      clearOverlays();
      mapRef.current = null;
      routeProviderRef.current = null;
      activeRouteRequestRef.current += 1;
      if (container) {
        container.replaceChildren();
      }
    }

    function destroyMap() {
      resetMapInstance();
      setMapReady(false);
    }

    if (!ready || !container || points.length === 0) {
      destroyMap();
      setLoading(false);
      setError('');
      setUsedFallback(false);
      setRouteWarning('');
      return;
    }

    let cancelled = false;

    setLoading(true);
    setMapReady(false);
    setError('');
    setUsedFallback(false);
    setRouteWarning('');

    loadGoogleMaps(MAPS_KEY)
      .then(
        async ({ Map, Polyline, LatLngBounds, AdvancedMarkerElement, Route }) => {
          if (cancelled || !containerRef.current) return;

          const currentPoints = pointsRef.current;
          if (currentPoints.length === 0) return;

          const currentGpsPath = currentPoints.map(toLatLng);
          const isLive = liveRef.current;

          routeProviderRef.current = createRouteProvider(Route);

          let routePath = currentGpsPath;
          let usedFallback = false;
          let warning: string | undefined;

          if (isLive) {
            usedFallback = true;
          } else {
            const routeResult = await buildRoadPath(routeProviderRef.current, currentGpsPath);
            routePath = routeResult.path;
            usedFallback = routeResult.usedFallback;
            warning = routeResult.warning;
          }

          if (cancelled || !containerRef.current) return;

          setUsedFallback(usedFallback);
          setRouteWarning(
            warning && !warning.includes('recusou') ? warning : '',
          );
          setError(
            warning && warning.includes('recusou') ? warning : '',
          );

          resetMapInstance();

          const lastPoint = currentGpsPath[currentGpsPath.length - 1];
          mapRef.current = new Map(containerRef.current, {
            mapId: getGoogleMapId(),
            center: lastPoint,
            zoom: LIVE_ZOOM,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: true,
          });

          const map = mapRef.current;
          const lastIndex = currentPoints.length - 1;
          const liveSegment = currentGpsPath.slice(Math.max(0, lastIndex - 1), lastIndex + 1);

          overlaysRef.current.routeLine = new Polyline({
            path: routePath,
            geodesic: true,
            strokeColor: '#38bdf8',
            strokeOpacity: isLive ? 0.35 : 0.45,
            strokeWeight: isLive ? 3 : 4,
            map,
            zIndex: 1,
          });

          overlaysRef.current.activeRouteLine = new Polyline({
            path: liveSegment,
            geodesic: true,
            strokeColor: '#facc15',
            strokeOpacity: 1,
            strokeWeight: 7,
            map,
            zIndex: 2,
          });

          overlaysRef.current.markers = currentPoints.map((point, index) => {
            const content = createReadingMarkerElement('default');
            const marker = new AdvancedMarkerElement({
              map,
              position: toLatLng(point),
              content,
              zIndex: 1,
              title: `Leitura #${index + 1}`,
            });

            marker.addListener('click', () => {
              if (!liveRef.current) {
                setActiveIndex(index);
              }
            });

            return { marker, content };
          });

          prevPointsLengthRef.current = currentPoints.length;

          if (isLive) {
            setActiveIndex(lastIndex);
            updateMarkerStyles(lastIndex);
            focusMapOnSegment(map, liveSegment, mapPadding(panelOpenRef.current));
            void updateActiveRoute(lastIndex);
          } else {
            const bounds = new LatLngBounds();
            routePath.forEach((position) => bounds.extend(position));
            map.fitBounds(bounds, 48);
            setActiveIndex(0);
            updateMarkerStyles(0);
          }

          if (!cancelled) {
            setMapReady(true);
          }
        },
      )
      .catch((err: Error) => {
        if (!cancelled) {
          setError(err.message);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          if (liveRef.current) {
            window.setTimeout(() => syncLiveViewRef.current(), 0);
          }
        }
      });

    return () => {
      cancelled = true;
      destroyMap();
    };
  }, [live, ready, resetKey, updateActiveRoute, updateMarkerStyles]);

  useEffect(() => {
    if (!live || !mapReady || loading || points.length === 0) {
      return;
    }

    const prevLength = prevPointsLengthRef.current;
    if (points.length <= prevLength) {
      return;
    }

    appendMapPoints(prevLength);
    prevPointsLengthRef.current = points.length;
    syncLiveView();
  }, [live, loading, mapReady, points, syncLiveView]);

  useEffect(() => {
    if (live || !mapReady || loading || points.length === 0) {
      return;
    }

    const prevLength = prevPointsLengthRef.current;
    if (points.length <= prevLength) {
      return;
    }

    appendMapPoints(prevLength);
    prevPointsLengthRef.current = points.length;
  }, [live, loading, mapReady, points]);

  function appendMapPoints(fromIndex: number): void {
    const map = mapRef.current;
    const routeLine = overlaysRef.current.routeLine;
    if (!map || !routeLine) {
      return;
    }

    const AdvancedMarkerElement = google.maps.marker.AdvancedMarkerElement;
    const routePath = routeLine
      .getPath()
      .getArray()
      .map((position) => ({ lat: position.lat(), lng: position.lng() }));

    for (let index = fromIndex; index < points.length; index += 1) {
      const point = points[index];
      routePath.push(toLatLng(point));

      const content = createReadingMarkerElement('default');
      const marker = new AdvancedMarkerElement({
        map,
        position: toLatLng(point),
        content,
        zIndex: 1,
        title: `Leitura #${index + 1}`,
      });

      marker.addListener('click', () => {
        if (!liveRef.current) {
          setActiveIndex(index);
        }
      });

      overlaysRef.current.markers.push({ marker, content });
    }

    routeLine.setPath(routePath);
  }

  if (!MAPS_KEY) {
    return (
      <div className="tracking-map-empty card">
        <p>
          Configure <code>VITE_GOOGLE_MAPS_API_KEY</code> no <code>.env</code> da
          raiz e reinicie o Vite.
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
        <p className="muted tracking-map-status">Traçando rota pelas ruas…</p>
      ) : live ? (
        <p className="muted tracking-map-status">
          Modo ao vivo — último trecho entre as duas leituras mais recentes.
        </p>
      ) : (
        <p className="muted tracking-map-status">
          Rota completa — clique nos pontos ou use o painel. Setas do teclado também funcionam.
        </p>
      )}
      {routeWarning && !error ? (
        <p className="muted tracking-map-status">{routeWarning}</p>
      ) : null}
      {usedFallback && !routeWarning && !error && !live ? (
        <p className="muted tracking-map-status">
          Parte da rota foi desenhada em linha reta entre leituras.
        </p>
      ) : null}
      {error ? <p className="error-text">{error}</p> : null}

      <div className="tracking-map-stage">
        <div ref={containerRef} className="tracking-map" aria-label="Mapa de rastreio" />

        {!loading ? (
          <button
            type="button"
            className="tracking-panel-toggle"
            onClick={() => setPanelOpen((open) => !open)}
          >
            {panelOpen ? 'Ocultar detalhes' : 'Ver detalhes'}
          </button>
        ) : null}

        {!loading && panelOpen ? (
          <TrackingPointPanel
            points={points}
            activeIndex={activeIndex}
            onPrevious={goPrevious}
            onNext={goNext}
            onClose={() => setPanelOpen(false)}
          />
        ) : null}
      </div>
    </div>
  );
}
