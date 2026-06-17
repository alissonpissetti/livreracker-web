import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getDeviceLocations } from '../api/client';
import { DeviceIconGlyph } from '../components/DeviceIcon';
import { TrackingMap } from '../components/TrackingMap';
import { DEFAULT_DEVICE_ICON, isDeviceIcon } from '../constants/deviceIcons';
import type { AccountDevice, DeviceLocation } from '../types';

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
  const [selectedDate, setSelectedDate] = useState(toDateInputValue(new Date()));
  const [device, setDevice] = useState<AccountDevice | null>(null);
  const [locations, setLocations] = useState<DeviceLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const range = useMemo(() => dayRangeIso(selectedDate), [selectedDate]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      setLocations([]);
      setDevice(null);
      try {
        const data = await getDeviceLocations(deviceId, {
          from: range.from,
          to: range.to,
          limit: 500,
        });
        if (cancelled) return;
        setDevice(data.device);
        setLocations(data.locations);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Erro ao carregar rastreios');
          setDevice(null);
          setLocations([]);
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
        <label className="tracking-date-filter">
          Dia
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          />
        </label>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <TrackingMap points={locations} ready={!loading} />

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
