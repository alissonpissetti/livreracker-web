import { useEffect, useMemo, useRef, useState } from 'react';
import type { DeviceLocation } from '../types';
import type { TimelineSegment } from '../utils/dailyTimeline';
import { segmentPathPoints, stopDurationSec } from '../utils/dailyTimeline';
import {
  createRouteProvider,
  ensurePathReaches,
  filterValidLatLng,
  resolveDisplayPath,
  ROAD_PATH_MAX_ANCHOR_M,
  type LatLng,
  type RouteProvider,
} from '../utils/directionsPath';
import { getGoogleMapId, loadGoogleMaps } from '../utils/googleMaps';
import { haversineMeters } from '../utils/geo';
import { isValidReading, validRoutePoints, effectiveCoordinate } from '../utils/locationOutliers';
import {
  collapseStationaryPoints,
  filterPointsOutsideStopSegments,
  isPairInsideStopSegment,
  isLocatedPoint,
  liveZoomPoints,
} from '../utils/liveMapPoints';
import { formatDuration } from '../utils/routeStats';
import { recordedAtMs } from '../utils/recordedTime';
import { filterStationaryRoutingPoints, prepareDeviceRoutingPoints } from '../utils/routingWaypoints';
import {
  createReadingMarkerElement,
  createStopMarkerElement,
  applyReadingMarkerRole,
  markerRoleForIndex,
  markerZIndex,
} from '../utils/mapPointInfo';
import { TrackingPointPanel } from './TrackingPointPanel';

type MarkerEntry = {
  marker: google.maps.marker.AdvancedMarkerElement;
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
const LIVE_ROUTE_LIGHT = '#fca5a5';
const LIVE_ROUTE_DARK = '#991b1b';
const MAX_LIVE_ROUTE_POINTS = 20;
const GPS_ANCHOR_MAX_GAP_M = ROAD_PATH_MAX_ANCHOR_M;

function isValidLocation(point: DeviceLocation): boolean {
  return isLocatedPoint(point);
}

function toLatLng(point: DeviceLocation): LatLng {
  const coordinate = effectiveCoordinate(point);
  return { lat: coordinate.lat, lng: coordinate.lng };
}

function pointsToPath(points: DeviceLocation[]): LatLng[] {
  return points.filter(isValidLocation).map(toLatLng);
}

function lastMoveSegment(segments: TimelineSegment[]): TimelineSegment | null {
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    if (segments[index].kind === 'move') {
      return segments[index];
    }
  }
  return null;
}

function appendUniquePoints(
  base: DeviceLocation[],
  extra: DeviceLocation[],
): DeviceLocation[] {
  if (extra.length === 0) {
    return base;
  }

  const seen = new Set(base.map((point) => point.id));
  const merged = [...base];
  for (const point of extra) {
    if (!seen.has(point.id)) {
      merged.push(point);
      seen.add(point.id);
    }
  }
  return merged;
}

function prependUniquePoints(
  prefix: DeviceLocation[],
  base: DeviceLocation[],
): DeviceLocation[] {
  if (prefix.length === 0) {
    return base;
  }

  const seen = new Set(base.map((point) => point.id));
  const merged: DeviceLocation[] = [];
  for (const point of prefix) {
    if (!seen.has(point.id)) {
      merged.push(point);
      seen.add(point.id);
    }
  }
  for (const point of base) {
    if (!seen.has(point.id)) {
      merged.push(point);
      seen.add(point.id);
    }
  }
  return merged.length > 0 ? merged : base;
}

function segmentDisplayPoints(
  currentPoints: DeviceLocation[],
  segment: TimelineSegment,
  extraTail: DeviceLocation[] = [],
): DeviceLocation[] {
  return appendUniquePoints(segmentPathPoints(currentPoints, segment), extraTail);
}

function stopAnchorLatLng(
  stop: TimelineSegment,
  currentPoints: DeviceLocation[],
): LatLng {
  const stopPoints = segmentPathPoints(currentPoints, stop);
  const lastStopReading = stopPoints.at(-1);
  if (lastStopReading) {
    return toLatLng(lastStopReading);
  }
  return { lat: stop.centroidLat, lng: stop.centroidLng };
}

/** Deslocamento + leituras da parada seguinte (a linha do tempo separa os dois). */
function moveSegmentDisplayPoints(
  currentPoints: DeviceLocation[],
  segment: TimelineSegment,
  segmentIndex: number,
  segments: TimelineSegment[],
  extraTail: DeviceLocation[] = [],
): DeviceLocation[] {
  let display = segmentDisplayPoints(currentPoints, segment, extraTail);

  const previous = segments[segmentIndex - 1];
  if (previous) {
    const bridgePoint = segmentPathPoints(currentPoints, previous).at(-1);
    if (bridgePoint) {
      display = prependUniquePoints([bridgePoint], display);
    }
  }

  const next = segments[segmentIndex + 1];
  if (next?.kind === 'stop') {
    display = appendUniquePoints(display, segmentPathPoints(currentPoints, next));
  }
  return display;
}

function readPolylinePath(line: google.maps.Polyline): LatLng[] {
  const path = line.getPath();
  if (!path) {
    return [];
  }

  const result: LatLng[] = [];
  for (let index = 0; index < path.getLength(); index += 1) {
    const point = path.getAt(index);
    if (point) {
      result.push({ lat: point.lat(), lng: point.lng() });
    }
  }
  return result;
}

function writePolylinePath(line: google.maps.Polyline, path: LatLng[]): void {
  if (path.length < 2) {
    return;
  }
  line.setPath(path);
}

function boundaryReadingsBetweenMoves(
  points: DeviceLocation[],
  moveB: TimelineSegment,
): { from: LatLng; to: LatLng } | null {
  const fromReading = points[moveB.startIndex - 1];
  const toReading = points[moveB.startIndex];
  if (!fromReading || !toReading || !isValidLocation(fromReading) || !isValidLocation(toReading)) {
    return null;
  }
  return {
    from: toLatLng(fromReading),
    to: toLatLng(toReading),
  };
}

function buildSegmentRouteInput(displayPoints: DeviceLocation[]): {
  gpsFallback: LatLng[];
  roadPath: LatLng[];
  anchor?: LatLng;
} {
  const gpsFallback = pointsToPath(displayPoints);
  const validPoints = displayPoints.filter(isValidReading);
  const roadSource = validPoints.length >= 2 ? validPoints : displayPoints;
  return {
    gpsFallback,
    roadPath: pointsToPath(roadSource),
    anchor: gpsFallback.at(-1),
  };
}

function tailPathPoints(
  points: DeviceLocation[],
  segments: TimelineSegment[],
): DeviceLocation[] {
  if (segments.length === 0) {
    return points.filter(isValidLocation);
  }

  const maxEnd = Math.max(...segments.map((segment) => segment.endIndex));
  return points.slice(maxEnd + 1).filter(isValidLocation);
}

function liveRouteSourcePoints(
  points: DeviceLocation[],
  segments: TimelineSegment[] = [],
): DeviceLocation[] {
  const movingPoints = filterPointsOutsideStopSegments(points, segments);
  return collapseStationaryPoints(
    filterStationaryRoutingPoints(movingPoints.filter(isValidLocation)),
  );
}

function liveRoutePoints(
  points: DeviceLocation[],
  segments: TimelineSegment[] = [],
): DeviceLocation[] {
  const located = liveRouteSourcePoints(points, segments);
  if (located.length <= MAX_LIVE_ROUTE_POINTS) {
    return located;
  }
  return located.slice(-MAX_LIVE_ROUTE_POINTS);
}

function liveValidRoutePoints(
  points: DeviceLocation[],
  segments: TimelineSegment[] = [],
): DeviceLocation[] {
  return liveRoutePoints(points, segments).filter(isValidReading);
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

function formatStopMarkerLabel(durationSec: number): string {
  const totalMinutes = Math.round(durationSec / 60);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h${minutes}` : `${hours}h`;
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
  const liveBackgroundLineRef = useRef<google.maps.Polyline | null>(null);
  const backgroundLinesRef = useRef<google.maps.Polyline[]>([]);
  const stopMarkersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const drawTokenRef = useRef(0);

  const [loading, setLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState('');
  const [routeNote, setRouteNote] = useState('');

  const segmentsKey = segments.map((segment) => segment.id).join('|');
  const validPoints = useMemo(() => validRoutePoints(points), [points]);
  const activeValidIndex =
    pointExplorerOpen &&
    validPointIndex != null &&
    validPointIndex >= 0 &&
    validPointIndex < validPoints.length
      ? validPointIndex
      : null;

  function placeTimelineStopMarkers(
    map: google.maps.Map,
    timelineSegments: TimelineSegment[],
    highlightedSegmentId?: string | null,
  ): void {
    for (const segment of timelineSegments) {
      if (segment.kind !== 'stop') {
        continue;
      }

      const durationSec = stopDurationSec(segment);
      const prominent =
        segment.id === highlightedSegmentId || durationSec >= 30 * 60;
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: segment.centroidLat, lng: segment.centroidLng },
        content: createStopMarkerElement(segment.color, {
          prominent,
          label: prominent ? formatStopMarkerLabel(durationSec) : undefined,
        }),
        title: `Parada · ${formatDuration(durationSec)}`,
        zIndex: prominent ? 600 : 500,
      });
      stopMarkersRef.current.push(marker);
    }
  }

  function updateMarkerStyles(activeIndex: number | null): void {
    const validEntries = markersRef.current.filter((entry) => entry.validIndex >= 0);
    const total = validEntries.length;
    for (const entry of markersRef.current) {
      const content = entry.marker.content;
      if (!(content instanceof HTMLDivElement)) {
        continue;
      }

      if (entry.validIndex < 0) {
        applyReadingMarkerRole(content, 'outlier');
        entry.marker.zIndex = markerZIndex('outlier');
        continue;
      }

      const role =
        activeIndex == null
          ? 'default'
          : markerRoleForIndex(entry.validIndex, activeIndex, total);
      applyReadingMarkerRole(content, role);
      entry.marker.zIndex = markerZIndex(role);
    }
  }

  function clearBackgroundLayers(clearLiveBackground = true): void {
    if (clearLiveBackground) {
      liveBackgroundLineRef.current?.setPath([]);
    }
    backgroundLinesRef.current.forEach((line) => line.setMap(null));
    backgroundLinesRef.current = [];
    stopMarkersRef.current.forEach((marker) => {
      marker.map = null;
    });
    stopMarkersRef.current = [];
  }

  function clearDynamicLayers(clearLiveBackground = true): void {
    clearBackgroundLayers(clearLiveBackground);
    routeLineRef.current?.setPath([]);
  }

  function syncMarkers(map: google.maps.Map, isLive: boolean): void {
    markersRef.current.forEach((entry) => {
      entry.marker.map = null;
    });
    markersRef.current = [];

    const markerSource = isLive
      ? collapseStationaryPoints(points)
      : points;

    let validIndex = 0;
    for (const point of markerSource) {
      if (!isValidLocation(point)) {
        continue;
      }

      const markerRole = isValidReading(point) ? 'default' : 'outlier';
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: toLatLng(point),
        content: createReadingMarkerElement(markerRole),
        zIndex: markerZIndex(markerRole),
      });
      if (isValidReading(point)) {
        const capturedIndex = validIndex;
        marker.addListener('gmp-click', () => {
          if (!live) {
            onValidPointSelectRef.current?.(capturedIndex);
          }
        });
        markersRef.current.push({ marker, validIndex: capturedIndex });
        validIndex += 1;
      } else {
        markersRef.current.push({ marker, validIndex: -1 });
      }
    }
  }

  function setLiveBackgroundPath(
    map: google.maps.Map,
    path: LatLng[],
    options?: { geodesic?: boolean },
  ): void {
    if (path.length < 2) {
      liveBackgroundLineRef.current?.setPath([]);
      return;
    }

    const geodesic = options?.geodesic ?? false;

    if (!liveBackgroundLineRef.current) {
      liveBackgroundLineRef.current = new google.maps.Polyline({
        map,
        path,
        geodesic,
        strokeColor: LIVE_ROUTE_LIGHT,
        strokeOpacity: 0.95,
        strokeWeight: 6,
        zIndex: 10,
      });
      return;
    }

    liveBackgroundLineRef.current.setOptions({
      geodesic,
      strokeColor: LIVE_ROUTE_LIGHT,
      strokeOpacity: 0.95,
      strokeWeight: 6,
      zIndex: 10,
    });
    liveBackgroundLineRef.current.setPath(path);
    liveBackgroundLineRef.current.setMap(map);
  }

  async function drawRoadPath(
    provider: RouteProvider,
    path: LatLng[],
    anchor?: LatLng,
  ): Promise<{ path: LatLng[]; warning?: string }> {
    if (path.length < 2) {
      return { path };
    }

    const resolved = await resolveDisplayPath(provider, path);
    const target = anchor ?? path[path.length - 1];
    return {
      path: ensurePathReaches(resolved.path, target, GPS_ANCHOR_MAX_GAP_M),
      warning: resolved.warning,
    };
  }

  async function extendLineToStop(
    provider: RouteProvider | null,
    line: google.maps.Polyline,
    stop: TimelineSegment,
    currentPoints: DeviceLocation[],
    token: number,
  ): Promise<string | undefined> {
    if (!provider) {
      return undefined;
    }

    const path = line.getPath();
    if (!path || path.getLength() < 1) {
      return undefined;
    }

    const last = path.getAt(path.getLength() - 1);
    if (!last) {
      return undefined;
    }

    const from = { lat: last.lat(), lng: last.lng() };
    const target = stopAnchorLatLng(stop, currentPoints);
    const gap = haversineMeters(from.lat, from.lng, target.lat, target.lng);
    if (gap <= 20) {
      const merged: LatLng[] = [];
      for (let index = 0; index < path.getLength() - 1; index += 1) {
        const point = path.getAt(index);
        if (point) {
          merged.push({ lat: point.lat(), lng: point.lng() });
        }
      }
      merged.push(target);
      line.setPath(merged);
      return undefined;
    }

    const resolved = await drawRoadPath(provider, [from, target], target);
    if (token !== drawTokenRef.current || resolved.path.length < 2) {
      return resolved.warning;
    }

    const merged: LatLng[] = [];
    for (let index = 0; index < path.getLength() - 1; index += 1) {
      const point = path.getAt(index);
      if (point) {
        merged.push({ lat: point.lat(), lng: point.lng() });
      }
    }
    merged.push(...resolved.path.slice(1));
    line.setPath(merged);
    return resolved.warning;
  }

  async function applySegmentRoadLine(
    provider: RouteProvider | null,
    line: google.maps.Polyline,
    displayPoints: DeviceLocation[],
    token: number,
  ): Promise<{ path: LatLng[]; warning?: string }> {
    const routingPoints = prepareDeviceRoutingPoints(displayPoints);
    const { gpsFallback, roadPath, anchor } = buildSegmentRouteInput(routingPoints);
    if (gpsFallback.length < 2) {
      return { path: gpsFallback };
    }

    line.setPath(gpsFallback);

    if (!provider || roadPath.length < 2) {
      return { path: gpsFallback };
    }

    const resolved = await drawRoadPath(provider, roadPath, anchor);
    if (token !== drawTokenRef.current) {
      return { path: gpsFallback };
    }

    if (resolved.path.length >= 2) {
      line.setOptions({ geodesic: false });
      line.setPath(resolved.path);
      return { path: resolved.path, warning: resolved.warning };
    }

    return { path: gpsFallback, warning: resolved.warning };
  }

  async function stitchAdjacentMoveSegments(
    provider: RouteProvider | null,
    currentPoints: DeviceLocation[],
    currentSegments: TimelineSegment[],
    segmentLines: Map<string, google.maps.Polyline>,
    token: number,
  ): Promise<string | undefined> {
    const moveSegments = currentSegments.filter((segment) => segment.kind === 'move');
    let warning: string | undefined;

    for (let index = 0; index < moveSegments.length - 1; index += 1) {
      const moveA = moveSegments[index];
      const moveB = moveSegments[index + 1];
      const gapMs =
        recordedAtMs(moveB.startAt) - recordedAtMs(moveA.endAt);
      if (gapMs > 20 * 60 * 1000) {
        continue;
      }
      const lineA = segmentLines.get(moveA.id);
      const lineB = segmentLines.get(moveB.id);
      if (!lineA || !lineB) {
        continue;
      }

      const pathA = readPolylinePath(lineA);
      const pathB = readPolylinePath(lineB);
      if (pathA.length < 1 || pathB.length < 1) {
        continue;
      }

      const boundary = boundaryReadingsBetweenMoves(currentPoints, moveB);
      if (!boundary) {
        continue;
      }

      const endA = pathA[pathA.length - 1];
      const startB = pathB[0];
      const renderGap = haversineMeters(endA.lat, endA.lng, startB.lat, startB.lng);
      const gpsGap = haversineMeters(
        boundary.from.lat,
        boundary.from.lng,
        boundary.to.lat,
        boundary.to.lng,
      );

      if (renderGap <= 10) {
        const joint = boundary.to;
        pathA[pathA.length - 1] = joint;
        pathB[0] = joint;
        writePolylinePath(lineA, pathA);
        writePolylinePath(lineB, pathB);
        continue;
      }

      let bridge: LatLng[] = [];
      if (provider) {
        const routed = filterValidLatLng(
          await provider.computeSegment(endA, startB),
        );
        if (token !== drawTokenRef.current) {
          return warning;
        }
        if (routed.length >= 2) {
          bridge = routed;
        }
      }

      if (bridge.length >= 2) {
        const extendedA = [...pathA.slice(0, -1), ...bridge];
        const extendedB = [bridge[bridge.length - 1], ...pathB.slice(1)];
        writePolylinePath(lineA, extendedA);
        writePolylinePath(lineB, extendedB);
        continue;
      }

      if (gpsGap <= 150) {
        const joint = boundary.to;
        const extendedA = [...pathA.slice(0, -1), boundary.from, joint];
        const extendedB = [joint, ...pathB.slice(1)];
        writePolylinePath(lineA, extendedA);
        writePolylinePath(lineB, extendedB);
        continue;
      }

      warning =
        warning ??
        'Alguns trechos do dia não puderam ser ligados automaticamente no mapa.';
    }

    return warning;
  }

  async function finalizeHistoryLastReading(
    provider: RouteProvider | null,
    currentPoints: DeviceLocation[],
    currentSegments: TimelineSegment[],
    lastMove: TimelineSegment | null,
    tailPoints: DeviceLocation[],
    segmentLines: Map<string, google.maps.Polyline>,
    token: number,
  ): Promise<string | undefined> {
    if (!provider || !lastMove) {
      return undefined;
    }

    const line = segmentLines.get(lastMove.id);
    if (!line) {
      return undefined;
    }

    const moveIndex = currentSegments.findIndex((segment) => segment.id === lastMove.id);
    const displayPoints = moveSegmentDisplayPoints(
      currentPoints,
      lastMove,
      moveIndex,
      currentSegments,
      tailPoints,
    );
    const lastReading = displayPoints.filter(isValidLocation).at(-1);
    if (!lastReading || displayPoints.length < 2) {
      return undefined;
    }

    const validRoute = displayPoints.filter(isValidReading);
    let roadPath = pointsToPath(validRoute);
    let lastReadingLatLng = toLatLng(lastReading);

    const nextStop = currentSegments[moveIndex + 1];
    if (nextStop?.kind === 'stop') {
      lastReadingLatLng = stopAnchorLatLng(nextStop, currentPoints);
    }

    if (roadPath.length < 2) {
      roadPath = pointsToPath(displayPoints.filter(isValidLocation).slice(-2));
    }

    if (roadPath.length < 2) {
      return undefined;
    }

    const resolved = await drawRoadPath(provider, roadPath, lastReadingLatLng);
    if (token !== drawTokenRef.current || resolved.path.length < 2) {
      return resolved.warning;
    }

    line.setPath(resolved.path);

    if (nextStop?.kind === 'stop') {
      return extendLineToStop(provider, line, nextStop, currentPoints, token);
    }

    return resolved.warning;
  }

  function setMainRoute(
    map: google.maps.Map,
    path: LatLng[],
    color: string,
    options?: { geodesic?: boolean },
  ): void {
    const line = routeLineRef.current;
    if (!line || path.length < 2) {
      return;
    }
    line.setPath(path);
    line.setOptions({
      geodesic: options?.geodesic ?? false,
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
      const displayPath = ensurePathReaches(
        resolved.path,
        path[path.length - 1],
        GPS_ANCHOR_MAX_GAP_M,
      );
      setMainRoute(map, displayPath, '#dc2626');
      fitMapToPoints(map, displayPath);
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
    const tailPoints = tailPathPoints(currentPoints, currentSegments);
    const lastMove = lastMoveSegment(currentSegments);
    const segmentLines = new Map<string, google.maps.Polyline>();
    let focusPath: LatLng[] = [];
    let routeWarning: string | undefined;

    placeTimelineStopMarkers(map, currentSegments, focusSegmentId);

    for (let segmentIndex = 0; segmentIndex < currentSegments.length; segmentIndex += 1) {
      const segment = currentSegments[segmentIndex];
      if (segment.kind === 'stop') {
        continue;
      }

      const extraTail = segment.id === lastMove?.id ? tailPoints : [];
      const displayPoints = moveSegmentDisplayPoints(
        currentPoints,
        segment,
        segmentIndex,
        currentSegments,
        extraTail,
      );
      const { gpsFallback } = buildSegmentRouteInput(displayPoints);
      if (gpsFallback.length < 2) {
        continue;
      }

      const isFocused = segment.id === focusSegmentId;
      const line = new google.maps.Polyline({
        map,
        path: gpsFallback,
        geodesic: true,
        strokeColor: segment.color,
        strokeOpacity: 1,
        strokeWeight: isFocused ? 9 : 6,
        zIndex: isFocused ? 1000 : 10,
      });
      backgroundLinesRef.current.push(line);
      segmentLines.set(segment.id, line);

      if (isFocused) {
        focusPath = gpsFallback;
      }

      const resolved = await applySegmentRoadLine(provider, line, displayPoints, token);
      if (token !== drawTokenRef.current) {
        return;
      }

      const nextStop = currentSegments[segmentIndex + 1];
      if (nextStop?.kind === 'stop') {
        const stopWarning = await extendLineToStop(
          provider,
          line,
          nextStop,
          currentPoints,
          token,
        );
        if (!routeWarning && stopWarning) {
          routeWarning = stopWarning;
        }
      }

      if (isFocused && resolved.path.length >= 2) {
        focusPath = [];
        const path = line.getPath();
        if (path) {
          for (let index = 0; index < path.getLength(); index += 1) {
            const point = path.getAt(index);
            if (point) {
              focusPath.push({ lat: point.lat(), lng: point.lng() });
            }
          }
        }
      }
      if (!routeWarning && resolved.warning) {
        routeWarning = resolved.warning;
      }
    }

    const stitchWarning = await stitchAdjacentMoveSegments(
      provider,
      currentPoints,
      currentSegments,
      segmentLines,
      token,
    );
    if (token !== drawTokenRef.current) {
      return;
    }
    if (!routeWarning && stitchWarning) {
      routeWarning = stitchWarning;
    }

    const finalizeWarning = await finalizeHistoryLastReading(
      provider,
      currentPoints,
      currentSegments,
      lastMove,
      tailPoints,
      segmentLines,
      token,
    );
    if (token !== drawTokenRef.current) {
      return;
    }

    if (!routeWarning && finalizeWarning) {
      routeWarning = finalizeWarning;
    }

    if (lastMove && focusSegmentId === lastMove.id) {
      const lastLine = segmentLines.get(lastMove.id);
      const lastPath = lastLine?.getPath();
      if (lastPath && lastPath.getLength() >= 2) {
        focusPath = [];
        for (let index = 0; index < lastPath.getLength(); index += 1) {
          const point = lastPath.getAt(index);
          if (point) {
            focusPath.push({ lat: point.lat(), lng: point.lng() });
          }
        }
      }
    }

    if (routeWarning) {
      setRouteNote(routeWarning);
    }

    if (focusSegment?.kind === 'stop') {
      const stopIndex = currentSegments.findIndex((segment) => segment.id === focusSegment.id);
      const prevMove = stopIndex > 0 ? currentSegments[stopIndex - 1] : null;
      const prevLine = prevMove?.kind === 'move' ? segmentLines.get(prevMove.id) : null;
      const prevPath = prevLine?.getPath();
      if (prevPath && prevPath.getLength() >= 2) {
        const boundsPath: LatLng[] = [];
        for (let index = 0; index < prevPath.getLength(); index += 1) {
          const point = prevPath.getAt(index);
          if (point) {
            boundsPath.push({ lat: point.lat(), lng: point.lng() });
          }
        }
        boundsPath.push(stopAnchorLatLng(focusSegment, currentPoints));
        fitMapToPoints(map, boundsPath);
      } else {
        fitMapToPoints(map, [{ lat: focusSegment.centroidLat, lng: focusSegment.centroidLng }]);
      }
    } else if (focusPath.length >= 2) {
      fitMapToPoints(map, focusPath);
    } else {
      fitMapToPoints(map, pointsToPath(validRoutePoints(currentPoints)));
    }
  }

  async function drawLiveRoute(
    map: google.maps.Map,
    provider: RouteProvider | null,
    currentPoints: DeviceLocation[],
    currentSegments: TimelineSegment[],
    highlightedSegmentId: string | null,
    token: number,
  ): Promise<void> {
    updateMarkerStyles(null);
    setRouteNote('');

    clearBackgroundLayers(true);
    placeTimelineStopMarkers(map, currentSegments, highlightedSegmentId);

    const routePoints = liveRoutePoints(currentPoints, currentSegments);
    const validRoute = liveValidRoutePoints(currentPoints, currentSegments);
    const fullGpsPath = pointsToPath(routePoints);
    const validPath = pointsToPath(validRoute);
    const lastReading = routePoints.at(-1);
    const lastReadingLatLng = lastReading ? toLatLng(lastReading) : undefined;

    const lastValidPair = validRoute.length >= 2 ? validRoute.slice(-2) : [];
    const lastValidPath = pointsToPath(lastValidPair);
    const stationaryPair =
      lastValidPair.length === 2 &&
      isPairInsideStopSegment(lastValidPair[0], lastValidPair[1], currentSegments);

    liveBackgroundLineRef.current?.setPath([]);
    routeLineRef.current?.setPath([]);

    const zoomPath = pointsToPath(liveZoomPoints(currentPoints));
    if (zoomPath.length >= 2) {
      fitMapToPoints(map, zoomPath);
    } else if (zoomPath.length === 1) {
      map.setCenter(zoomPath[0]);
      map.setZoom(LIVE_ZOOM);
    }

    if (!provider) {
      if (fullGpsPath.length >= 2) {
        setLiveBackgroundPath(map, fullGpsPath, { geodesic: true });
      }
      if (lastValidPath.length >= 2) {
        setMainRoute(map, lastValidPath, LIVE_ROUTE_DARK, { geodesic: true });
      }
      return;
    }

    if (fullGpsPath.length >= 2) {
      setLiveBackgroundPath(map, fullGpsPath, { geodesic: true });
    }

    if (!stationaryPair && lastValidPath.length >= 2) {
      const resolved = await drawRoadPath(
        provider,
        lastValidPath,
        lastReadingLatLng ?? lastValidPath[lastValidPath.length - 1],
      );
      if (token !== drawTokenRef.current) {
        return;
      }
      if (resolved.path.length >= 2) {
        setMainRoute(map, resolved.path, LIVE_ROUTE_DARK);
      }
    } else if (lastReadingLatLng && validPath.length >= 2) {
      const anchorPath = validPath.slice(-2);
      if (anchorPath.length >= 2) {
        const anchorGap = haversineMeters(
          anchorPath[0].lat,
          anchorPath[0].lng,
          lastReadingLatLng.lat,
          lastReadingLatLng.lng,
        );
        if (anchorGap > 40) {
          const resolved = await drawRoadPath(
            provider,
            [anchorPath[0], lastReadingLatLng],
            lastReadingLatLng,
          );
          if (token === drawTokenRef.current && resolved.path.length >= 2) {
            setMainRoute(map, resolved.path, LIVE_ROUTE_DARK);
          }
        }
      }
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
    setRouteNote('');

    if (isLive) {
      clearBackgroundLayers(false);
      const stopHighlight =
        segmentId ??
        [...currentSegments].reverse().find((segment) => segment.kind === 'stop')?.id ??
        null;
      await drawLiveRoute(
        map,
        provider,
        currentPoints,
        currentSegments,
        stopHighlight,
        token,
      );
      return;
    }

    clearDynamicLayers(true);

    if (activeValidIndex != null) {
      await drawPointExplorer(map, provider, validPoints, activeValidIndex);
      return;
    }

    updateMarkerStyles(null);

    if (showFullDayRoute) {
      await drawFullDayRoute(map, provider, currentPoints, currentSegments, segmentId);
      return;
    }

    const selected = currentSegments.find((segment) => segment.id === segmentId);

    for (let segmentIndex = 0; segmentIndex < currentSegments.length; segmentIndex += 1) {
      const segment = currentSegments[segmentIndex];
      if (segment.kind === 'stop') {
        const durationSec = stopDurationSec(segment);
        const prominent = durationSec >= 30 * 60;
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: segment.centroidLat, lng: segment.centroidLng },
          content: createStopMarkerElement(segment.color, {
            prominent,
            label: prominent ? formatStopMarkerLabel(durationSec) : undefined,
          }),
          title: `Parada · ${formatDuration(durationSec)}`,
          zIndex: 5,
        });
        stopMarkersRef.current.push(marker);
        continue;
      }

      const isSelected = segment.id === segmentId;
      if (isSelected) {
        continue;
      }

      const displayPoints = moveSegmentDisplayPoints(
        currentPoints,
        segment,
        segmentIndex,
        currentSegments,
      );
      const { gpsFallback } = buildSegmentRouteInput(displayPoints);
      if (gpsFallback.length < 2) {
        continue;
      }

      const line = new google.maps.Polyline({
        map,
        path: gpsFallback,
        geodesic: true,
        strokeColor: segment.color,
        strokeOpacity: 0.3,
        strokeWeight: 4,
        zIndex: 1,
      });
      backgroundLinesRef.current.push(line);

      if (provider) {
        await applySegmentRoadLine(provider, line, displayPoints, token);
        if (token !== drawTokenRef.current) {
          return;
        }
      }
    }

    if (!selected) {
      fitMapToPoints(map, pointsToPath(validRoutePoints(currentPoints)));
      return;
    }

    if (selected.kind === 'stop') {
      fitMapToPoints(map, [{ lat: selected.centroidLat, lng: selected.centroidLng }]);
      return;
    }

    const selectedIndex = currentSegments.findIndex((segment) => segment.id === selected.id);
    const lastMove = lastMoveSegment(currentSegments);
    const extraTail =
      selected.id === lastMove?.id ? tailPathPoints(currentPoints, currentSegments) : [];
    const displayPoints =
      selected.kind === 'move'
        ? moveSegmentDisplayPoints(
            currentPoints,
            selected,
            selectedIndex,
            currentSegments,
            extraTail,
          )
        : segmentDisplayPoints(currentPoints, selected, extraTail);
    const mainPath = pointsToPath(displayPoints);
    if (mainPath.length < 2) {
      fitMapToPoints(map, pointsToPath(currentPoints));
      return;
    }

    setMainRoute(map, mainPath, selected.color);
    fitMapToPoints(map, mainPath);

    if (!provider || token !== drawTokenRef.current) {
      return;
    }

    const { roadPath, anchor } = buildSegmentRouteInput(displayPoints);
    const routeAnchor =
      currentSegments[selectedIndex + 1]?.kind === 'stop'
        ? stopAnchorLatLng(currentSegments[selectedIndex + 1], currentPoints)
        : anchor;
    if (roadPath.length < 2) {
      return;
    }

    const resolved = await drawRoadPath(provider, roadPath, routeAnchor);
    if (token !== drawTokenRef.current) {
      return;
    }
    if (resolved.path.length >= 2) {
      setMainRoute(map, resolved.path, selected.color);
      fitMapToPoints(map, resolved.path);
    }
    if (resolved.warning || resolved.path.length < 2) {
      setRouteNote(
        resolved.warning ??
          'Não foi possível traçar a rota pelas ruas — verifique Routes/Directions API no Google Cloud.',
      );
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
      .then(async ({ Map, Polyline, Route, DirectionsService }) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        markersRef.current.forEach((entry) => {
          entry.marker.map = null;
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
        providerRef.current = createRouteProvider(
          Route,
          MAPS_KEY,
          new DirectionsService(),
        );
        syncMarkers(map, live);

        routeLineRef.current = new Polyline({
          map,
          path: [],
          geodesic: false,
          strokeColor: LIVE_ROUTE_DARK,
          strokeOpacity: 1,
          strokeWeight: 8,
          zIndex: 1000,
        });

        liveBackgroundLineRef.current = new google.maps.Polyline({
          map,
          path: [],
          geodesic: false,
          strokeColor: LIVE_ROUTE_LIGHT,
          strokeOpacity: 0.95,
          strokeWeight: 6,
          zIndex: 10,
        });

        if (live) {
          const seedPath = pointsToPath(liveZoomPoints(points));
          if (seedPath.length >= 2) {
            fitMapToPoints(map, seedPath);
          } else if (seedPath.length === 1) {
            map.setCenter(seedPath[0]);
            map.setZoom(LIVE_ZOOM);
          }
        } else {
          fitMapToPoints(map, pointsToPath(validRoutePoints(points)));
        }

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
        entry.marker.map = null;
      });
      markersRef.current = [];
      backgroundLinesRef.current.forEach((line) => line.setMap(null));
      backgroundLinesRef.current = [];
      stopMarkersRef.current.forEach((marker) => {
        marker.map = null;
      });
      stopMarkersRef.current = [];
      liveBackgroundLineRef.current?.setMap(null);
      liveBackgroundLineRef.current = null;
      routeLineRef.current?.setMap(null);
      routeLineRef.current = null;
      mapRef.current = null;
      providerRef.current = null;
      setMapReady(false);
    };
  }, [ready, resetKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!mapReady || !map || points.length === 0) {
      return;
    }
    syncMarkers(map, live);
  }, [mapReady, points, live]);

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
        <p>
          {live
            ? 'Ainda não há nenhuma posição registrada para este equipamento.'
            : 'Nenhum ponto de rastreio para o período selecionado.'}
        </p>
      </div>
    );
  }

  return (
    <div className="tracking-map-wrap">
      {loading ? (
        <p className="muted tracking-map-status">Carregando mapa…</p>
      ) : live ? (
        <p className="muted tracking-map-status">
          Ao vivo — paradas marcadas no mapa; trilha só em deslocamentos; último trecho pelas
          ruas em vermelho escuro.
        </p>
      ) : showFullDayRoute ? (
        <p className="muted tracking-map-status">
          Histórico — trechos do dia ligados em sequência; cores diferentes por horário.
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
