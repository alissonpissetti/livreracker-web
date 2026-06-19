import type { DeviceLocation } from '../types';
import { formatRecordedDateTime } from '../utils/recordedTime';

type RegisteredPointsPanelProps = {
  validLocations: DeviceLocation[];
  invalidLocations: DeviceLocation[];
  formatSpeed: (speedKnots?: number) => string;
  formatBattery: (batteryPercent?: number) => string;
  selectedIndex?: number | null;
  onSelectPoint?: (index: number) => void;
};

export function RegisteredPointsPanel({
  validLocations,
  invalidLocations,
  formatSpeed,
  formatBattery,
  selectedIndex = null,
  onSelectPoint,
}: RegisteredPointsPanelProps) {
  return (
    <div className="tracking-points-panel">
      <div className="section-head tracking-points-panel-head">
        <span className="muted">
          {validLocations.length} válidas
          {invalidLocations.length > 0 ? ` · ${invalidLocations.length} inválidas` : ''}
        </span>
      </div>

      {validLocations.length > 0 ? (
        <div className="table-card card">
          <p className="muted tracking-points-hint">
            Clique em uma leitura para analisar o trecho até ela no mapa.
          </p>
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
              {validLocations.map((point, index) => (
                <tr
                  key={point.id}
                  className={
                    onSelectPoint
                      ? `tracking-point-row${selectedIndex === index ? ' tracking-point-row-selected' : ''}`
                      : undefined
                  }
                  onClick={onSelectPoint ? () => onSelectPoint(index) : undefined}
                  tabIndex={onSelectPoint ? 0 : undefined}
                  onKeyDown={
                    onSelectPoint
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onSelectPoint(index);
                          }
                        }
                      : undefined
                  }
                >
                  <td>{index + 1}</td>
                  <td>{formatRecordedDateTime(point.recorded_at)}</td>
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
          <p>Nenhum rastreio válido encontrado neste dia.</p>
        </div>
      )}

      {invalidLocations.length > 0 ? (
        <div className="table-card card tracking-invalid-table">
          <div className="section-head">
            <h3>Leituras inválidas (auditoria)</h3>
            <span className="muted">{invalidLocations.length} descartadas pelo sistema</span>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Horário</th>
                <th>Latitude</th>
                <th>Longitude</th>
                <th>Fonte</th>
              </tr>
            </thead>
            <tbody>
              {invalidLocations.map((point) => (
                <tr key={point.id} className="tracking-row-outlier">
                  <td>{formatRecordedDateTime(point.recorded_at)}</td>
                  <td>{point.latitude.toFixed(6)}</td>
                  <td>{point.longitude.toFixed(6)}</td>
                  <td>{point.location_source?.toUpperCase() ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
