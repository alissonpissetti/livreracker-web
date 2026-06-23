import { Link } from 'react-router-dom';
import { DeviceBatteryBadge } from './DeviceBatteryBadge';
import { DeviceIconGlyph } from './DeviceIcon';
import {
  DEFAULT_DEVICE_ICON,
  isDeviceIcon,
} from '../constants/deviceIcons';
import type { AccountDevice } from '../types';
import {
  formatDaysRemaining,
  formatDevicePeriodRange,
} from '../utils/devicePeriod';
import {
  getDevicePowerStatus,
  isPowerStatusStale,
} from '../utils/devicePowerStatus';

type AccountDeviceCardProps = {
  device: AccountDevice;
  busy: boolean;
  imeiValue: string;
  onImeiChange: (value: string) => void;
  onActivate?: () => void;
};

function deviceStatusLabel(device: AccountDevice) {
  if (device.awaiting_activation) return 'Aguardando identificador';
  if (device.is_active) return 'Ativo';
  if (device.status === 'past_due') return 'Assinatura vencida';
  return device.status;
}

function deviceStatusClass(device: AccountDevice) {
  if (device.awaiting_activation) return 'badge badge-warning';
  if (device.is_active) return 'badge badge-success';
  return 'badge badge-muted';
}

export function AccountDeviceCard({
  device,
  busy,
  imeiValue,
  onImeiChange,
  onActivate,
}: AccountDeviceCardProps) {
  const icon = isDeviceIcon(device.icon) ? device.icon : DEFAULT_DEVICE_ICON;
  const title = device.label?.trim() || 'Rastreador';
  const powerStatus = getDevicePowerStatus(device);
  const powerStatusStale = isPowerStatusStale(powerStatus);

  return (
    <article className="card device-card-compact">
      <div className="device-card-compact-head">
        <div className="device-icon-badge device-icon-badge-sm" aria-hidden="true">
          <DeviceIconGlyph icon={icon} size={22} />
        </div>
        <div className="device-card-compact-copy">
          <div className="device-card-compact-title-row">
            <h3>{title}</h3>
            <span className={deviceStatusClass(device)}>
              {deviceStatusLabel(device)}
            </span>
          </div>
          <p className="muted device-card-compact-id">
            {device.device_id
              ? `ID ${device.device_id}`
              : 'Sem identificador vinculado'}
          </p>
          <p className="device-card-compact-period">
            <span>{device.period_label}</span>
            <span aria-hidden="true"> · </span>
            <span
              className={
                device.days_remaining <= 30 ? 'device-period-remaining-warning' : ''
              }
            >
              {formatDaysRemaining(device.days_remaining)}
            </span>
          </p>
          <p className="muted device-card-compact-range">
            {formatDevicePeriodRange(
              device.current_period_start,
              device.current_period_end,
            )}
          </p>
          {!device.awaiting_activation ? (
            <div className="device-card-compact-power">
              <DeviceBatteryBadge
                percent={powerStatus?.percent}
                recordedAt={powerStatus?.recordedAt}
                usbConnected={powerStatus?.usbConnected}
                batteryCharging={powerStatus?.batteryCharging}
                stale={powerStatusStale}
                compact
              />
            </div>
          ) : null}
        </div>
      </div>

      {device.awaiting_activation ? (
        <div className="device-card-compact-activate">
          <label className="imei-field">
            Identificador
            <input
              placeholder="868123456789012"
              value={imeiValue}
              onChange={(event) => onImeiChange(event.target.value)}
              disabled={busy}
            />
          </label>
          <button
            className="btn btn-primary btn-sm"
            type="button"
            disabled={busy}
            onClick={onActivate}
          >
            Ativar
          </button>
        </div>
      ) : null}

      <div className="device-card-compact-actions">
        {!device.awaiting_activation ? (
          <Link
            className="btn btn-primary btn-sm"
            to={`/conta/rastreadores/${device.id}`}
          >
            Abrir dispositivo
          </Link>
        ) : null}
        <Link
          className="btn btn-secondary btn-sm"
          to={`/conta/rastreadores/${device.id}/renovar`}
        >
          Renovar
        </Link>
      </div>
    </article>
  );
}
