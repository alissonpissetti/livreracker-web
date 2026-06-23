import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  getAccountDevice,
  getDeviceLocations,
  updateDevice,
  updateDeviceAlerts,
} from '../api/client';
import { DeviceBatteryBadge } from '../components/DeviceBatteryBadge';
import { DeviceIconGlyph } from '../components/DeviceIcon';
import { DeviceSettingsPanel } from '../components/DeviceSettingsPanel';
import type { DeviceAlertSettings } from '../components/DeviceSettingsPanel';
import { TrackingMap } from '../components/TrackingMap';
import { DailyTimeline } from '../components/DailyTimeline';
import { LiveStopBanner } from '../components/LiveStopBanner';
import { RegisteredPointsPanel } from '../components/RegisteredPointsPanel';
import { ShareTrackingPanel } from '../components/ShareTrackingPanel';
import { EmergencyModePanel } from '../components/EmergencyModePanel';
import { useAuth } from '../context/AuthContext';
import { DEFAULT_DEVICE_ICON, isDeviceIcon, type DeviceIcon } from '../constants/deviceIcons';
import type { AccountDevice, DeviceLocation } from '../types';
import { splitLocations, applyLocationQuality } from '../utils/locationOutliers';
import {
  buildAllDayStationarySegment,
  buildDailyTimeline,
  findStationaryAnchor,
  resolveTodayAnchoredStationarySegment,
  resolveTrailingStopExtension,
} from '../utils/dailyTimeline';
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
import {
  buildHistoryMapPoints,
  buildLiveMapPoints,
  filterLocationsForDay,
} from '../utils/liveAnchorPoints';
import { collapseNearbyPoints } from '../utils/liveMapPoints';
import { formatMapPowerStatus } from '../utils/mapPointInfo';
import {
  getDevicePowerStatus,
  isPowerStatusStale,
} from '../utils/devicePowerStatus';
import {
  formatRecordedDateTime,
  recordedAtMs,
  recordedDayRangeIso,
} from '../utils/recordedTime';

const LIVE_POLL_MS = 8_000;
const LIVE_POLL_EMERGENCY_MS = 5_000;


function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

function formatPowerStatus(point: Pick<DeviceLocation, 'battery_percent' | 'usb_connected' | 'battery_charging'>): string {
  return formatMapPowerStatus(
    point.battery_percent,
    point.usb_connected,
    point.battery_charging,
  );
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
  const [recentLocations, setRecentLocations] = useState<DeviceLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [settingsMessage, setSettingsMessage] = useState('');
  const [settingsBusy, setSettingsBusy] = useState(false);
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

  const range = useMemo(() => recordedDayRangeIso(selectedDate), [selectedDate]);
  const isSelectedToday = selectedDate === todayValue;
  const canUseLive = isSelectedToday && Boolean(device?.device_id);
  const mapLive = viewMode === 'live' && isSelectedToday;

  const qualityDayLocations = useMemo(
    () => collapseNearbyPoints(applyLocationQuality(locations)),
    [locations],
  );

  const qualityRecentLocations = useMemo(
    () => collapseNearbyPoints(applyLocationQuality(recentLocations)),
    [recentLocations],
  );

  const qualityMapLocations = useMemo(
    () =>
      collapseNearbyPoints(
        applyLocationQuality(mergeLocations(locations, recentLocations)),
      ),
    [locations, recentLocations],
  );

  const selectedDayLocations = useMemo(
    () => filterLocationsForDay(qualityDayLocations, selectedDate),
    [qualityDayLocations, selectedDate],
  );

  const lastKnownLocation = useMemo(
    () => qualityRecentLocations.at(-1) ?? null,
    [qualityRecentLocations],
  );

  const stationaryAnchor = useMemo(
    () => findStationaryAnchor(qualityRecentLocations),
    [qualityRecentLocations],
  );

  const showingLastKnownOutsideDay = useMemo(
    () =>
      viewMode === 'history' &&
      selectedDayLocations.length === 0 &&
      lastKnownLocation != null,
    [viewMode, selectedDayLocations.length, lastKnownLocation],
  );

  const timelineLocations = selectedDayLocations;

  const previousDayLastPoint = useMemo(() => {
    const dayStartMs = new Date(recordedDayRangeIso(selectedDate).from).getTime();
    const beforeDay = qualityRecentLocations.filter(
      (point) => recordedAtMs(point.recorded_at) < dayStartMs,
    );
    return beforeDay.at(-1) ?? null;
  }, [qualityRecentLocations, selectedDate]);

  const dailyTimeline = useMemo(
    () =>
      buildDailyTimeline(timelineLocations, {
        dateValue: selectedDate,
        previousDayLastPoint,
      }),
    [timelineLocations, selectedDate, previousDayLastPoint],
  );

  const mapDisplayLocations = useMemo(() => {
    if (mapLive) {
      return buildLiveMapPoints(qualityMapLocations, range.from);
    }
    const historyPoints =
      dailyTimeline.timelinePoints.length > 0
        ? dailyTimeline.timelinePoints
        : selectedDayLocations;
    return buildHistoryMapPoints(historyPoints, lastKnownLocation);
  }, [
    mapLive,
    qualityMapLocations,
    range.from,
    dailyTimeline.timelinePoints,
    selectedDayLocations,
    lastKnownLocation,
  ]);
  const { valid: validLocations, invalid: invalidLocations } = useMemo(
    () => splitLocations(timelineLocations),
    [timelineLocations],
  );
  const routeStats = useMemo(
    () => computeRouteStats(validLocations),
    [validLocations],
  );
  const timelineValidLocations = useMemo(
    () => selectedDayLocations.filter((point) => point.is_valid !== false),
    [selectedDayLocations],
  );

  const anchoredTodaySegment = useMemo(
    () =>
      isSelectedToday
        ? resolveTodayAnchoredStationarySegment(
            selectedDayLocations,
            qualityRecentLocations,
            {
              dateValue: selectedDate,
              todayValue,
              nowMs: liveNowMs,
              previousDayLastPoint,
            },
          )
        : null,
    [
      isSelectedToday,
      selectedDayLocations,
      qualityRecentLocations,
      selectedDate,
      todayValue,
      liveNowMs,
      previousDayLastPoint,
    ],
  );

  const liveStopStatus = useMemo(
    () =>
      viewMode === 'live' && isSelectedToday
        ? resolveLiveStopStatus(
            mapDisplayLocations.filter((point) => point.is_valid !== false),
            dailyTimeline.segments,
            liveNowMs,
          )
        : null,
    [
      viewMode,
      isSelectedToday,
      mapDisplayLocations,
      dailyTimeline.segments,
      liveNowMs,
    ],
  );
  const displayTimelineSegments = useMemo(() => {
    if (anchoredTodaySegment) {
      return [anchoredTodaySegment];
    }

    if (showingLastKnownOutsideDay && (stationaryAnchor ?? lastKnownLocation)) {
      return [
        buildAllDayStationarySegment(
          stationaryAnchor ?? lastKnownLocation!,
          selectedDate,
          {
            isToday: isSelectedToday,
            nowMs: liveNowMs,
          },
        ),
      ];
    }

    const withTrailing = resolveTrailingStopExtension(
      dailyTimeline.segments,
      timelineValidLocations,
      {
        selectedDate,
        todayValue,
        nowMs: liveNowMs,
      },
    );

    if (viewMode === 'live' && isSelectedToday) {
      return applyLiveStopExtension(withTrailing, liveStopStatus, liveNowMs);
    }

    return withTrailing;
  }, [
    anchoredTodaySegment,
    showingLastKnownOutsideDay,
    stationaryAnchor,
    lastKnownLocation,
    selectedDate,
    isSelectedToday,
    liveNowMs,
    dailyTimeline.segments,
    timelineValidLocations,
    todayValue,
    liveNowMs,
    viewMode,
    isSelectedToday,
    liveStopStatus,
  ]);
  const powerStatus = useMemo(() => getDevicePowerStatus(device), [device]);

  const powerStatusStale = useMemo(
    () => isPowerStatusStale(powerStatus, liveNowMs),
    [powerStatus, liveNowMs],
  );

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
      setRecentLocations([]);
      setDevice(null);
      lastReceivedRef.current = null;

      try {
        const [dayData, recentData] = await Promise.all([
          getDeviceLocations(deviceId, {
            from: range.from,
            to: range.to,
            full: true,
          }),
          getDeviceLocations(deviceId, { limit: 100 }),
        ]);
        if (cancelled) return;

        setDevice(dayData.device);
        setLocations(dayData.locations);
        setRecentLocations(recentData.locations);
        const latestReceived =
          recentData.locations[0]?.received_at ??
          dayData.locations.at(-1)?.received_at ??
          null;
        lastReceivedRef.current = latestReceived;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar rastreios');
          setDevice(null);
          setLocations([]);
          setRecentLocations([]);
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
    if (!deviceId || !isSelectedToday || loading) {
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

        if (cancelled) {
          return;
        }

        setDevice(data.device);

        if (data.locations.length === 0) {
          return;
        }

        setRecentLocations((current) => mergeLocations(current, data.locations));

        setLocations((current) => {
          const merged = mergeLocations(current, data.locations);
          const last = merged.at(-1);
          lastReceivedRef.current = last?.received_at ?? lastReceivedRef.current;
          return filterLocationsForDay(merged, selectedDate);
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
  }, [
    deviceId,
    isSelectedToday,
    loading,
    range.from,
    range.to,
    selectedDate,
    device?.emergency_active,
  ]);

  useEffect(() => {
    if (!deviceId || loading) {
      return;
    }

    let cancelled = false;

    async function refreshDevicePower() {
      try {
        const updated = await getAccountDevice(deviceId);
        if (!cancelled) {
          setDevice(updated);
        }
      } catch {
        // Falha silenciosa — badge de energia é auxiliar.
      }
    }

    void refreshDevicePower();
    const pollInterval = device?.emergency_active ? LIVE_POLL_EMERGENCY_MS : LIVE_POLL_MS;
    const timer = window.setInterval(refreshDevicePower, pollInterval);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [deviceId, loading, device?.emergency_active]);

  useEffect(() => {
    if (!isSelectedToday) {
      return;
    }

    const timer = window.setInterval(() => {
      setLiveNowMs(Date.now());
    }, 30_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isSelectedToday]);

  const icon = device && isDeviceIcon(device.icon) ? device.icon : DEFAULT_DEVICE_ICON;
  const title = device?.label ?? 'Rastreador';
  const hasAlertPhone = Boolean(user?.phone?.trim());

  async function onSaveDeviceProfile(label: string, iconValue: DeviceIcon) {
    if (!deviceId) return;
    setSettingsBusy(true);
    setSettingsMessage('');
    setError('');
    try {
      const updated = await updateDevice(deviceId, { label, icon: iconValue });
      setDevice(updated);
      setSettingsMessage('Nome e ícone atualizados.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar rastreador');
      throw err;
    } finally {
      setSettingsBusy(false);
    }
  }

  async function onSaveDeviceAlerts(alerts: DeviceAlertSettings) {
    if (!deviceId) return;
    setSettingsBusy(true);
    setSettingsMessage('');
    setError('');
    try {
      const updated = await updateDeviceAlerts(deviceId, alerts);
      setDevice(updated);
      setSettingsMessage('Alertas atualizados.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar alertas');
      throw err;
    } finally {
      setSettingsBusy(false);
    }
  }

  return (
    <div className="container page">
      <header className="tracking-page-header card" aria-label="Rastreamento do dispositivo">
        <Link className="tracking-back" to="/conta">
          <span className="tracking-back-icon" aria-hidden="true">
            ←
          </span>
          Voltar para minha conta
        </Link>

        <div className="tracking-page-header-body">
          <div className="tracking-hero">
            <div className="tracking-hero-icon" aria-hidden="true">
              <DeviceIconGlyph icon={icon} size={30} />
            </div>
            <div className="tracking-hero-copy">
              <h1>{title}</h1>
              {device?.device_id ? (
                <p className="tracking-hero-imei">IMEI {device.device_id}</p>
              ) : null}
              <div className="tracking-hero-chips">
                {!loading ? (
                  <DeviceBatteryBadge
                    percent={powerStatus?.percent}
                    recordedAt={powerStatus?.recordedAt}
                    usbConnected={powerStatus?.usbConnected}
                    batteryCharging={powerStatus?.batteryCharging}
                    stale={powerStatusStale}
                    compact
                  />
                ) : null}
                {mapLive && canUseLive ? (
                  <span className="tracking-status tracking-status-live">
                    <span className="tracking-status-dot" aria-hidden="true" />
                    Ao vivo
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="tracking-header-toolbar">
            <div className="tracking-header-toolbar-primary">
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

              {viewMode === 'history' ? (
                <label className="tracking-date-filter tracking-date-filter-inline">
                  <span className="tracking-date-filter-label">Dia</span>
                  <input
                    type="date"
                    value={selectedDate}
                    max={todayValue}
                    onChange={(event) => setSelectedDate(event.target.value)}
                  />
                </label>
              ) : null}
            </div>

            {device?.device_id && !loading ? (
              <div className="tracking-header-actions">
                {viewMode === 'live' ? (
                  <EmergencyModePanel
                    deviceSlotId={deviceId}
                    device={device}
                    disabled={!device.is_active}
                    onDeviceChange={setDevice}
                  />
                ) : null}
                <ShareTrackingPanel
                  deviceSlotId={deviceId}
                  disabled={!device.is_active}
                />
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}
      {settingsMessage ? <p className="success-text">{settingsMessage}</p> : null}

      {!loading && device ? (
        <DeviceSettingsPanel
          device={device}
          hasAlertPhone={hasAlertPhone}
          busy={settingsBusy}
          onSaveProfile={onSaveDeviceProfile}
          onSaveAlerts={onSaveDeviceAlerts}
        />
      ) : null}

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

      {!loading && viewMode === 'history' && validLocations.length < 2 && !showingLastKnownOutsideDay ? (
        <p className="muted tracking-map-status">
          São necessários pelo menos 2 pontos para exibir a rota completa e calcular distância.
        </p>
      ) : null}

      <div id="tracking-map-panel">
        <TrackingMap
        points={mapDisplayLocations}
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
                formatBattery={formatPowerStatus}
                selectedIndex={pointExplorerOpen ? validPointIndex : null}
                onSelectPoint={handleValidPointSelect}
                allDayStationaryFallback={
                  showingLastKnownOutsideDay && lastKnownLocation
                    ? {
                        lastReadingAt: lastKnownLocation.recorded_at,
                        point: lastKnownLocation,
                        isToday: isSelectedToday,
                      }
                    : null
                }
              />
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
