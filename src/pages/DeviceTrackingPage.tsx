import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getDeviceLocations } from '../api/client';
import { DeviceBatteryBadge } from '../components/DeviceBatteryBadge';
import { DeviceIconGlyph } from '../components/DeviceIcon';
import { TrackingMap } from '../components/TrackingMap';
import { DailyTimeline } from '../components/DailyTimeline';
import { LiveStopBanner } from '../components/LiveStopBanner';
import { RegisteredPointsPanel } from '../components/RegisteredPointsPanel';
import { ShareTrackingPanel } from '../components/ShareTrackingPanel';
import { EmergencyModePanel } from '../components/EmergencyModePanel';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_DEVICE_ICON, isDeviceIcon } from '../constants/deviceIcons';
import type { AccountDevice, DeviceLocation } from '../types';
import { splitLocations, applyLocationQuality } from '../utils/locationOutliers';
import { buildDailyTimeline } from '../utils/dailyTimeline';
import {
  applyLiveStopExtension,
  resolveLiveStopStatus,
} from '../utils/liveStopStatus';
import {
  readTrackingViewMode,
  writeTrackingViewMode,
  type TrackingViewMode,
} from '../utils/trackingViewModeStorage';
import {
  computeRouteStats,
  formatAverageSpeed,
  formatDistance,
  formatDuration,
} from '../utils/routeStats';
import { formatRecordedDateTime, recordedAtMs } from '../utils/recordedTime';

const LIVE_POLL_MS = 8_000;
const LIVE_POLL_EMERGENCY_MS = 5_000;


function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dayRangeIso(dateValue: string): { from: string; to: string } {
  const start = new Date(`${dateValue}T00:00:00`);
  const end = new Date(`${dateValue}T23:59:59.999`);
  return {
    from: start.toISOString(),
    to: end.toISOString(),
  };
}

function mergeLocations(
  current: DeviceLocation[],
  incoming: DeviceLocation[],
): DeviceLocation[] {
  if (incoming.length === 0) {
    return current;
  }

  const existing = new Set(current.map((point) => point.id));
  const merged = [...current];

  for (const point of incoming) {
    if (!existing.has(point.id)) {
      merged.push(point);
    }
  }

  merged.sort((a, b) => recordedAtMs(a.recorded_at) - recordedAtMs(b.recorded_at));

  return merged;
}

function formatSpeed(speedKnots?: number): string {
  if (speedKnots == null) return '—';
  const kmh = speedKnots * 1.852;
  return `${kmh.toFixed(1)} km/h`;
}

function formatBattery(batteryPercent?: number): string {
  if (batteryPercent == null) return '—';
  return `${batteryPercent}%`;
}

export function DeviceTrackingPage() {
  const { deviceId = '' } = useParams();
  const { user } = useAuth();
  const todayValue = toDateInputValue(new Date());
  const [selectedDate, setSelectedDate] = useState(todayValue);
  const [viewMode, setViewModeState] = useState<TrackingViewMode>('live');
  const lastStoredUserIdRef = useRef<string | null>(null);
  const [device, setDevice] = useState<AccountDevice | null>(null);
  const [locations, setLocations] = useState<DeviceLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
  const [pointExplorerOpen, setPointExplorerOpen] = useState(false);
  const [validPointIndex, setValidPointIndex] = useState<number | null>(null);
  const lastReceivedRef = useRef<string | null>(null);
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());

  const setViewMode = useCallback(
    (mode: TrackingViewMode, persist = true) => {
      setViewModeState(mode);
      if (persist) {
        writeTrackingViewMode(user?.id, mode);
      }
    },
    [user?.id],
  );

  useEffect(() => {
    if (user?.id === lastStoredUserIdRef.current) {
      return;
    }

    lastStoredUserIdRef.current = user?.id ?? null;

    if (!user?.id) {
      setViewModeState('live');
      return;
    }

    const stored = readTrackingViewMode(user.id);
    if (stored) {
      setViewModeState(stored);
    }
  }, [user?.id]);

  const range = useMemo(() => dayRangeIso(selectedDate), [selectedDate]);
  const isSelectedToday = selectedDate === todayValue;
  const canUseLive = isSelectedToday && Boolean(device?.device_id);

  const qualityLocations = useMemo(
    () => applyLocationQuality(locations),
    [locations],
  );

  const { valid: validLocations, invalid: invalidLocations } = useMemo(
    () => splitLocations(qualityLocations),
    [qualityLocations],
  );
  const routeStats = useMemo(
    () => computeRouteStats(validLocations),
    [validLocations],
  );
  const dailyTimeline = useMemo(
    () => buildDailyTimeline(qualityLocations),
    [qualityLocations],
  );
  const liveStopStatus = useMemo(
    () =>
      viewMode === 'live' && isSelectedToday
        ? resolveLiveStopStatus(
            validLocations,
            dailyTimeline.segments,
            liveNowMs,
          )
        : null,
    [viewMode, isSelectedToday, validLocations, dailyTimeline.segments, liveNowMs],
  );
  const displayTimelineSegments = useMemo(
    () =>
      viewMode === 'live'
        ? applyLiveStopExtension(dailyTimeline.segments, liveStopStatus, liveNowMs)
        : dailyTimeline.segments,
    [viewMode, dailyTimeline.segments, liveStopStatus, liveNowMs],
  );
  const latestBatteryReading = useMemo(() => {
    for (let index = qualityLocations.length - 1; index >= 0; index -= 1) {
      const point = qualityLocations[index];
      if (
        point.battery_percent != null &&
        Number.isFinite(point.battery_percent)
      ) {
        return {
          percent: point.battery_percent,
          recordedAt: point.recorded_at,
        };
      }
    }
    return null;
  }, [qualityLocations]);
  const mapLive = viewMode === 'live' && isSelectedToday;
  const defaultSegmentId = useMemo(() => {
    const firstMove = displayTimelineSegments.find((segment) => segment.kind === 'move');
    return firstMove?.id ?? displayTimelineSegments[0]?.id ?? null;
  }, [displayTimelineSegments]);
  const activeSegmentId = useMemo(() => {
    if (displayTimelineSegments.length === 0) {
      return null;
    }

    if (
      selectedSegmentId &&
      displayTimelineSegments.some((segment) => segment.id === selectedSegmentId)
    ) {
      return selectedSegmentId;
    }

    return defaultSegmentId;
  }, [displayTimelineSegments, defaultSegmentId, selectedSegmentId]);

  useEffect(() => {
    setSelectedSegmentId(null);
    setPointExplorerOpen(false);
    setValidPointIndex(null);
  }, [selectedDate]);

  function handleSelectSegment(segmentId: string) {
    setSelectedSegmentId(segmentId);
    setPointExplorerOpen(false);
    setValidPointIndex(null);
  }

  function handleValidPointSelect(index: number) {
    setValidPointIndex(index);
    setPointExplorerOpen(true);
  }

  function handlePointExplorerClose() {
    setPointExplorerOpen(false);
    setValidPointIndex(null);
  }

  function handlePointPrevious() {
    setValidPointIndex((current) => Math.max(0, (current ?? 0) - 1));
  }

  function handlePointNext() {
    setValidPointIndex((current) =>
      Math.min(validLocations.length - 1, (current ?? 0) + 1),
    );
  }

  useEffect(() => {
    if (selectedDate !== todayValue) {
      setViewModeState('history');
    }
  }, [selectedDate, todayValue]);

  function switchToLive() {
    setViewMode('live');
    setSelectedDate(todayValue);
    setPointExplorerOpen(false);
    setValidPointIndex(null);
  }

  function switchToHistory() {
    setViewMode('history');
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      setLocations([]);
      setDevice(null);
      lastReceivedRef.current = null;

      try {
        const data = await getDeviceLocations(deviceId, {
          from: range.from,
          to: range.to,
          full: true,
        });
        if (cancelled) return;
        setDevice(data.device);
        setLocations(data.locations);
        const last = data.locations.at(-1);
        lastReceivedRef.current = last?.received_at ?? null;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar rastreios');
          setDevice(null);
          setLocations([]);
          lastReceivedRef.current = null;
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (deviceId) {
      load();
    }

    return () => {
      cancelled = true;
    };
  }, [deviceId, range.from, range.to, selectedDate]);

  useEffect(() => {
    if (!deviceId || viewMode !== 'live' || !canUseLive || loading) {
      return;
    }

    let cancelled = false;

    async function pollLatest() {
      try {
        if (!lastReceivedRef.current) {
          return;
        }

        const data = await getDeviceLocations(deviceId, {
          since: lastReceivedRef.current,
          to: range.to,
          limit: 100,
        });

        if (cancelled || data.locations.length === 0) {
          return;
        }

        setDevice(data.device);
        setLocations((current) => {
          const merged = mergeLocations(current, data.locations);
          const last = merged.at(-1);
          lastReceivedRef.current = last?.received_at ?? lastReceivedRef.current;
          return merged;
        });
      } catch {
        // Falha silenciosa no polling para não atrapalhar a visualização.
      }
    }

    const pollInterval = device?.emergency_active ? LIVE_POLL_EMERGENCY_MS : LIVE_POLL_MS;
    const timer = window.setInterval(pollLatest, pollInterval);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [canUseLive, deviceId, viewMode, loading, range.from, range.to, device?.emergency_active]);

  useEffect(() => {
    if (!canUseLive || viewMode !== 'live') {
      return;
    }

    const timer = window.setInterval(() => {
      setLiveNowMs(Date.now());
    }, 30_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [canUseLive, viewMode]);

  const icon = device && isDeviceIcon(device.icon) ? device.icon : DEFAULT_DEVICE_ICON;
  const title = device?.label ?? 'Rastreador';

  return (
    <div className="container page">
      <div className="page-head tracking-page-head">
        <div className="tracking-page-intro">
          <Link className="tracking-back" to="/conta">
            <span className="tracking-back-icon" aria-hidden="true">
              ←
            </span>
            Voltar para minha conta
          </Link>

          <div className="tracking-hero">
            <div className="tracking-hero-icon" aria-hidden="true">
              <DeviceIconGlyph icon={icon} size={30} />
            </div>
            <div className="tracking-hero-copy">
              <div className="tracking-hero-title">
                <h1>{title}</h1>
                {!loading && latestBatteryReading ? (
                  <DeviceBatteryBadge
                    percent={latestBatteryReading.percent}
                    recordedAt={latestBatteryReading.recordedAt}
                  />
                ) : null}
              </div>
              <div className="tracking-hero-meta">
                {device?.device_id ? (
                  <span className="tracking-identifier">
                    Identificador {device.device_id}
                  </span>
                ) : null}
                {mapLive ? (
                  <span className="tracking-status tracking-status-live">
                    <span className="tracking-status-dot" aria-hidden="true" />
                    Acompanhamento ao vivo
                  </span>
                ) : (
                  <span className="tracking-status">Histórico de posições</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="tracking-live-controls">
          <div
            className="tracking-view-mode"
            role="tablist"
            aria-label="Modo de visualização"
          >
            <button
              type="button"
              role="tab"
              id="tracking-mode-live"
              aria-selected={viewMode === 'live'}
              aria-controls="tracking-map-panel"
              className={`tracking-view-mode-btn${
                viewMode === 'live' ? ' tracking-view-mode-btn-active' : ''
              }`}
              onClick={switchToLive}
            >
              Ao vivo
            </button>
            <button
              type="button"
              role="tab"
              id="tracking-mode-history"
              aria-selected={viewMode === 'history'}
              aria-controls="tracking-map-panel"
              className={`tracking-view-mode-btn${
                viewMode === 'history' ? ' tracking-view-mode-btn-active' : ''
              }`}
              onClick={switchToHistory}
            >
              Histórico
            </button>
          </div>

          {viewMode === 'live' && canUseLive ? (
            <span className="tracking-live-badge" aria-live="polite">
              LIVE
            </span>
          ) : null}

          {viewMode === 'history' ? (
            <label className="tracking-date-filter">
              Dia
              <input
                type="date"
                value={selectedDate}
                max={todayValue}
                onChange={(event) => setSelectedDate(event.target.value)}
              />
            </label>
          ) : null}

          {viewMode === 'live' && device?.device_id && !loading ? (
            <EmergencyModePanel
              deviceSlotId={deviceId}
              device={device}
              disabled={!device.is_active}
              onDeviceChange={setDevice}
            />
          ) : null}

          {device?.device_id && !loading ? (
            <ShareTrackingPanel deviceSlotId={deviceId} disabled={!device.is_active} />
          ) : null}
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {isSelectedToday && !loading ? (
        <LiveStopBanner status={liveStopStatus} active={canUseLive} />
      ) : null}

      {!loading && viewMode === 'history' && routeStats ? (
        <section className="tracking-route-stats card" aria-label="Resumo do trajeto">
          <div className="tracking-route-stats-grid">
            <div>
              <span className="tracking-route-stat-label">Distância total</span>
              <strong>{formatDistance(routeStats.totalDistanceM)}</strong>
            </div>
            <div>
              <span className="tracking-route-stat-label">Velocidade média</span>
              <strong>{formatAverageSpeed(routeStats.averageSpeedKmh)}</strong>
            </div>
            <div>
              <span className="tracking-route-stat-label">Duração</span>
              <strong>{formatDuration(routeStats.durationSec)}</strong>
            </div>
            <div>
              <span className="tracking-route-stat-label">Pontos na rota</span>
              <strong>{routeStats.pointCount}</strong>
            </div>
          </div>
          {invalidLocations.length > 0 ? (
            <p className="muted tracking-route-stats-range">
              {invalidLocations.length} leitura
              {invalidLocations.length > 1 ? 's' : ''} descartada
              {invalidLocations.length > 1 ? 's' : ''} por distância/velocidade
              impossível (listadas na aba Pontos registrados).
            </p>
          ) : null}
          <p className="muted tracking-route-stats-range">
            {formatRecordedDateTime(routeStats.startAt)} →{' '}
            {formatRecordedDateTime(routeStats.endAt)}
          </p>
        </section>
      ) : null}

      {!loading && viewMode === 'history' && validLocations.length < 2 ? (
        <p className="muted tracking-map-status">
          São necessários pelo menos 2 pontos para exibir a rota completa e calcular distância.
        </p>
      ) : null}

      <div id="tracking-map-panel">
        <TrackingMap
        points={qualityLocations}
        ready={!loading}
        resetKey={selectedDate}
        live={mapLive}
        showFullDayRoute={viewMode === 'history'}
        segments={displayTimelineSegments}
        selectedSegmentId={activeSegmentId}
        pointExplorerOpen={pointExplorerOpen}
        validPointIndex={validPointIndex}
        onValidPointSelect={handleValidPointSelect}
        onPointExplorerClose={handlePointExplorerClose}
        onPointPrevious={handlePointPrevious}
        onPointNext={handlePointNext}
        />
      </div>

      {!loading && displayTimelineSegments.length > 0 ? (
        <section className="tracking-detail-tabs card" aria-label="Linha do tempo do dia">
          <div className="tracking-tab-panels">
            <div className="tracking-tab-panel">
              <DailyTimeline
                embedded
                segments={displayTimelineSegments}
                selectedSegmentId={activeSegmentId}
                onSelectSegment={handleSelectSegment}
              />
            </div>
          </div>
        </section>
      ) : null}

      {viewMode === 'history' && !loading ? (
        <section className="tracking-detail-tabs card" aria-label="Pontos registrados">
          <div className="tracking-tab-panels">
            <div className="tracking-tab-panel">
              <RegisteredPointsPanel
                validLocations={validLocations}
                invalidLocations={invalidLocations}
                formatSpeed={formatSpeed}
                formatBattery={formatBattery}
                selectedIndex={pointExplorerOpen ? validPointIndex : null}
                onSelectPoint={handleValidPointSelect}
              />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
