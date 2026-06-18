import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getDeviceLocations } from '../api/client';
import { DeviceIconGlyph } from '../components/DeviceIcon';
import { TrackingMap } from '../components/TrackingMap';
import { DEFAULT_DEVICE_ICON, isDeviceIcon } from '../constants/deviceIcons';
import type { AccountDevice, DeviceLocation } from '../types';
import {
  computeRouteStats,
  formatAverageSpeed,
  formatDistance,
  formatDuration,
} from '../utils/routeStats';

const LIVE_POLL_MS = 8_000;

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

  merged.sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime(),
  );

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
  const todayValue = toDateInputValue(new Date());
  const [selectedDate, setSelectedDate] = useState(todayValue);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [fullRouteView, setFullRouteView] = useState(false);
  const [device, setDevice] = useState<AccountDevice | null>(null);
  const [locations, setLocations] = useState<DeviceLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const lastReceivedRef = useRef<string | null>(null);

  const range = useMemo(() => dayRangeIso(selectedDate), [selectedDate]);
  const isSelectedToday = selectedDate === todayValue;
  const canUseLive = isSelectedToday && Boolean(device?.device_id);

  const routeStats = useMemo(() => computeRouteStats(locations), [locations]);
  const mapLive = liveEnabled && !fullRouteView && isSelectedToday;

  useEffect(() => {
    if (fullRouteView) {
      return;
    }
    if (isSelectedToday) {
      setLiveEnabled(true);
    } else {
      setLiveEnabled(false);
    }
  }, [fullRouteView, isSelectedToday]);

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
          limit: 500,
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
    if (!deviceId || !liveEnabled || !canUseLive || loading) {
      return;
    }

    let cancelled = false;

    async function pollLatest() {
      try {
        const from = lastReceivedRef.current
          ? new Date(new Date(lastReceivedRef.current).getTime() + 1).toISOString()
          : range.from;

        const data = await getDeviceLocations(deviceId, {
          from,
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

    const timer = window.setInterval(pollLatest, LIVE_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [canUseLive, deviceId, liveEnabled, loading, range.from, range.to]);

  const icon = device && isDeviceIcon(device.icon) ? device.icon : DEFAULT_DEVICE_ICON;
  const title = device?.label ?? 'Rastreador';

  return (
    <div className="container page">
      <div className="page-head tracking-page-head">
        <div>
          <Link className="muted tracking-back" to="/conta">
            ← Voltar para minha conta
          </Link>
          <div className="tracking-title-row">
            <div className="device-icon-badge" aria-hidden="true">
              <DeviceIconGlyph icon={icon} size={28} />
            </div>
            <div>
              <h1>{title}</h1>
              <p className="muted">
                {device?.device_id
                  ? `IMEI ${device.device_id} · histórico de posições`
                  : 'Histórico de posições'}
              </p>
            </div>
          </div>
        </div>

        <div className="tracking-live-controls">
          <label className="tracking-live-toggle">
            <input
              type="checkbox"
              checked={fullRouteView}
              onChange={(event) => setFullRouteView(event.target.checked)}
              disabled={locations.length < 2 && !loading}
            />
            Rota completa
          </label>
          {canUseLive ? (
            <label className="tracking-live-toggle">
              <input
                type="checkbox"
                checked={liveEnabled}
                onChange={(event) => setLiveEnabled(event.target.checked)}
                disabled={fullRouteView}
              />
              Ao vivo
            </label>
          ) : null}
          {liveEnabled && canUseLive && !fullRouteView ? (
            <span className="tracking-live-badge" aria-live="polite">
              LIVE
            </span>
          ) : null}
          <label className="tracking-date-filter">
            Dia
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      {!loading && fullRouteView && routeStats ? (
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
              <span className="tracking-route-stat-label">Pontos</span>
              <strong>{routeStats.pointCount}</strong>
            </div>
          </div>
          <p className="muted tracking-route-stats-range">
            {new Date(routeStats.startAt).toLocaleString('pt-BR')} →{' '}
            {new Date(routeStats.endAt).toLocaleString('pt-BR')}
          </p>
        </section>
      ) : null}

      {!loading && fullRouteView && locations.length < 2 ? (
        <p className="muted tracking-map-status">
          São necessários pelo menos 2 pontos para exibir a rota completa e calcular distância.
        </p>
      ) : null}

      <TrackingMap
        points={locations}
        ready={!loading}
        resetKey={`${selectedDate}:${fullRouteView ? 'full' : 'segment'}`}
        live={mapLive}
      />

      {!loading ? (
        <section className="account-section">
          <div className="section-head">
            <h2>Pontos registrados</h2>
            <span className="muted">{locations.length} posições</span>
          </div>

          {locations.length > 0 ? (
            <div className="table-card card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Horário</th>
                    <th>Latitude</th>
                    <th>Longitude</th>
                    <th>Velocidade</th>
                    <th>Bateria</th>
                    <th>Fonte</th>
                  </tr>
                </thead>
                <tbody>
                  {locations.map((point, index) => (
                    <tr key={point.id}>
                      <td>{index + 1}</td>
                      <td>
                        {new Date(point.recorded_at).toLocaleString('pt-BR')}
                      </td>
                      <td>{point.latitude.toFixed(6)}</td>
                      <td>{point.longitude.toFixed(6)}</td>
                      <td>{formatSpeed(point.speed_knots)}</td>
                      <td>{formatBattery(point.battery_percent)}</td>
                      <td>{point.location_source?.toUpperCase() ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card empty-state">
              <p>Nenhum rastreio encontrado neste dia.</p>
              <p className="muted">
                Troque a data no filtro acima. Se usou dados mock, os pontos de
                exemplo ficam entre 10 e 16/06/2026.
              </p>
            </div>
          )}
        </section>
      ) : (
        <p className="muted">Carregando pontos do dia…</p>
      )}
    </div>
  );
}
