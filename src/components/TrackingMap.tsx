import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DeviceLocation } from '../types';
import { buildRoadPath, mergeActiveSegments } from '../utils/directionsPath';
import type { LatLng } from '../utils/directionsPath';
import { loadGoogleMaps } from '../utils/googleMaps';
import {
  markerRoleForIndex,
  markerZIndex,
  readingMarkerIcon,
} from '../utils/mapPointInfo';
import { TrackingPointPanel } from './TrackingPointPanel';

type TrackingMapProps = {
  points: DeviceLocation[];
  ready?: boolean;
};

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
const PANEL_WIDTH = 300;

function pointsSignature(points: DeviceLocation[]): string {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${points.length}:${first.id}:${last.id}:${first.recorded_at}:${last.recorded_at}`;
}

export function TrackingMap({ points, ready = true }: TrackingMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const symbolPathRef = useRef<typeof google.maps.SymbolPath | null>(null);
  const panelOpenRef = useRef(true);
  const roadSegmentsRef = useRef<LatLng[][]>([]);
  const overlaysRef = useRef<{
    routeLine: google.maps.Polyline | null;
    activeRouteLine: google.maps.Polyline | null;
    markers: google.maps.Marker[];
  }>({ routeLine: null, activeRouteLine: null, markers: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [usedFallback, setUsedFallback] = useState(false);
  const [routeWarning, setRouteWarning] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);
  const signature = useMemo(() => pointsSignature(points), [points]);

  panelOpenRef.current = panelOpen;

  const goPrevious = useCallback(() => {
    setActiveIndex((current) => Math.max(0, current - 1));
  }, []);

  const goNext = useCallback(() => {
    setActiveIndex((current) => Math.min(points.length - 1, current + 1));
  }, [points.length]);

  const updateMarkerStyles = useCallback((selectedIndex: number) => {
    const SymbolPath = symbolPathRef.current;
    if (!SymbolPath) return;

    overlaysRef.current.markers.forEach((marker, index) => {
      const role = markerRoleForIndex(index, selectedIndex, overlaysRef.current.markers.length);
      marker.setIcon(readingMarkerIcon(SymbolPath, role));
      marker.setZIndex(markerZIndex(role));
    });
  }, []);

  const updateActiveRoute = useCallback((index: number) => {
    const map = mapRef.current;
    if (!map) return;

    const activePath = mergeActiveSegments(roadSegmentsRef.current, index);

    if (overlaysRef.current.activeRouteLine) {
      overlaysRef.current.activeRouteLine.setPath(activePath);
      overlaysRef.current.activeRouteLine.setMap(activePath.length > 0 ? map : null);
    }
  }, []);

  const focusReading = useCallback(
    (index: number) => {
      const map = mapRef.current;
      const point = points[index];
      if (!map || !point) return;

      const prev = index > 0 ? points[index - 1] : null;
      const next = index < points.length - 1 ? points[index + 1] : null;
      const focusPath = [prev, point, next]
        .filter((item): item is DeviceLocation => item != null)
        .map((item) => ({ lat: item.latitude, lng: item.longitude }));

      updateMarkerStyles(index);
      updateActiveRoute(index);

      const padding = {
        top: 56,
        right: panelOpenRef.current ? PANEL_WIDTH + 24 : 48,
        bottom: 48,
        left: 48,
      };

      if (focusPath.length >= 2) {
        const bounds = new google.maps.LatLngBounds();
        focusPath.forEach((position) => bounds.extend(position));
        map.fitBounds(bounds, padding);
      } else {
        map.panTo({ lat: point.latitude, lng: point.longitude });
        if ((map.getZoom() ?? 0) < 15) {
          map.setZoom(15);
        }
      }
    },
    [points, updateActiveRoute, updateMarkerStyles],
  );

  useEffect(() => {
    setActiveIndex(0);
    setPanelOpen(true);
  }, [signature]);

  useEffect(() => {
    if (!mapReady || loading || points.length === 0) return;
    focusReading(activeIndex);
  }, [activeIndex, focusReading, loading, mapReady, panelOpen, points.length]);

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
      overlaysRef.current.markers.forEach((marker) => marker.setMap(null));
      overlaysRef.current.routeLine?.setMap(null);
      overlaysRef.current.activeRouteLine?.setMap(null);
      overlaysRef.current = { routeLine: null, activeRouteLine: null, markers: [] };
      roadSegmentsRef.current = [];
    }

    function destroyMap() {
      clearOverlays();
      mapRef.current = null;
      symbolPathRef.current = null;
      setMapReady(false);
      if (container) {
        container.replaceChildren();
      }
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

    const gpsPath = points.map((point) => ({
      lat: point.latitude,
      lng: point.longitude,
    }));

    loadGoogleMaps(MAPS_KEY)
      .then(
        async ({ Map, Polyline, LatLngBounds, Marker, DirectionsService, SymbolPath }) => {
          if (cancelled || !containerRef.current) return;

          symbolPathRef.current = SymbolPath;

          const directionsService = new DirectionsService();
          const routeResult = await buildRoadPath(directionsService, gpsPath);

          if (cancelled || !containerRef.current) return;

          setUsedFallback(routeResult.usedFallback);
          setRouteWarning(
            routeResult.warning && !routeResult.warning.includes('recusou')
              ? routeResult.warning
              : '',
          );
          setError(
            routeResult.warning && routeResult.warning.includes('recusou')
              ? routeResult.warning
              : '',
          );

          clearOverlays();

          if (!mapRef.current) {
            mapRef.current = new Map(containerRef.current, {
              center: routeResult.path[0],
              zoom: 13,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: true,
            });
          }

          const map = mapRef.current;

          roadSegmentsRef.current = routeResult.segments;

          overlaysRef.current.routeLine = new Polyline({
            path: routeResult.path,
            geodesic: true,
            strokeColor: '#38bdf8',
            strokeOpacity: 0.45,
            strokeWeight: 4,
            map,
            zIndex: 1,
          });

          overlaysRef.current.activeRouteLine = new Polyline({
            path: mergeActiveSegments(routeResult.segments, 0),
            geodesic: true,
            strokeColor: '#facc15',
            strokeOpacity: 1,
            strokeWeight: 7,
            map,
            zIndex: 2,
          });

          const markers: google.maps.Marker[] = points.map((point, index) => {
            const marker = new Marker({
              map,
              position: { lat: point.latitude, lng: point.longitude },
              icon: readingMarkerIcon(SymbolPath, 'default'),
              zIndex: 1,
              title: `Leitura #${index + 1}`,
            });

            marker.addListener('click', () => {
              setActiveIndex(index);
            });

            return marker;
          });

          overlaysRef.current.markers = markers;

          const bounds = new LatLngBounds();
          routeResult.path.forEach((position) => bounds.extend(position));
          map.fitBounds(bounds, 48);

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
        }
      });

    return () => {
      cancelled = true;
      clearOverlays();
    };
  }, [ready, signature]);

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
      ) : (
        <p className="muted tracking-map-status">
          Clique em um ponto no mapa ou use o painel no canto. Setas do teclado também
          funcionam.
        </p>
      )}
      {routeWarning && !error ? (
        <p className="muted tracking-map-status">{routeWarning}</p>
      ) : null}
      {usedFallback && !routeWarning && !error ? (
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
