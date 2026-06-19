import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DeviceIconGlyph } from './DeviceIcon';
import { DeviceIconPicker } from './DeviceIconPicker';
import {
  DEFAULT_DEVICE_ICON,
  type DeviceIcon,
  isDeviceIcon,
} from '../constants/deviceIcons';
import type { AccountDevice } from '../types';
import {
  formatDaysRemaining,
  formatDevicePeriodRange,
} from '../utils/devicePeriod';

type AccountDeviceCardProps = {
  device: AccountDevice;
  busy: boolean;
  imeiValue: string;
  onImeiChange: (value: string) => void;
  onActivate?: () => void;
  onSaveProfile: (label: string, icon: DeviceIcon) => Promise<void>;
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
  onSaveProfile,
}: AccountDeviceCardProps) {
  const icon = isDeviceIcon(device.icon) ? device.icon : DEFAULT_DEVICE_ICON;
  const [label, setLabel] = useState(device.label ?? '');
  const [selectedIcon, setSelectedIcon] = useState<DeviceIcon>(icon);
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    setLabel(device.label ?? '');
    setSelectedIcon(isDeviceIcon(device.icon) ? device.icon : DEFAULT_DEVICE_ICON);
  }, [device.label, device.icon]);

  const trimmedLabel = label.trim();
  const profileDirty =
    trimmedLabel !== (device.label ?? '').trim() ||
    selectedIcon !== (isDeviceIcon(device.icon) ? device.icon : DEFAULT_DEVICE_ICON);

  async function handleSaveProfile() {
    if (!trimmedLabel) {
      setLocalError('Informe um nome para o rastreador');
      return;
    }

    setSaving(true);
    setLocalError('');
    try {
      await onSaveProfile(trimmedLabel, selectedIcon);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Falha ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="card subscription-card device-card">
      <div className="device-card-head">
        <div className="device-icon-badge" aria-hidden="true">
          <DeviceIconGlyph icon={selectedIcon} size={28} />
        </div>
        <div className="device-card-title">
          <h2>{trimmedLabel || device.label || 'Rastreador'}</h2>
          <p className="muted">
            {device.device_id
              ? `Identificador: ${device.device_id}`
              : 'Ainda sem identificador vinculado'}
          </p>
        </div>
        <span className={deviceStatusClass(device)}>
          {deviceStatusLabel(device)}
        </span>
      </div>

      <section className="device-period-card" aria-label="Período do plano">
        <div className="device-period-head">
          <span className="device-period-title">Período do plano</span>
          <span className="device-period-badge">{device.period_label}</span>
        </div>
        <p className="device-period-range">
          {formatDevicePeriodRange(
            device.current_period_start,
            device.current_period_end,
          )}
        </p>
        <p
          className={`device-period-remaining${
            device.days_remaining <= 30 ? ' device-period-remaining-warning' : ''
          }`}
        >
          {formatDaysRemaining(device.days_remaining)}
        </p>
        {device.awaiting_activation ? (
          <p className="device-period-note muted">
            O período de {device.period_label} já está reservado para este
            equipamento. Ative o identificador quando receber a unidade.
          </p>
        ) : null}
      </section>

      <div className="device-profile-form">
        <label>
          Nome amigável
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex: Carro da empresa"
            maxLength={120}
            disabled={busy || saving}
          />
        </label>

        <div>
          <span className="field-label">Tipo / ícone</span>
          <DeviceIconPicker
            value={selectedIcon}
            onChange={setSelectedIcon}
            disabled={busy || saving}
          />
        </div>

        {localError ? <p className="error-text">{localError}</p> : null}

        <div className="card-actions">
          <button
            className="btn btn-secondary"
            type="button"
            disabled={!profileDirty || busy || saving}
            onClick={handleSaveProfile}
          >
            {saving ? 'Salvando...' : 'Salvar nome e ícone'}
          </button>
        </div>
      </div>

      {device.awaiting_activation ? (
        <div className="inline-form">
          <label className="imei-field">
            Identificador do equipamento
            <input
              placeholder="868123456789012"
              value={imeiValue}
              onChange={(e) => onImeiChange(e.target.value)}
              disabled={busy}
            />
          </label>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy}
            onClick={onActivate}
          >
            Ativar equipamento
          </button>
        </div>
      ) : null}

      <div className="card-actions">
        {!device.awaiting_activation ? (
          <Link
            className="btn btn-secondary"
            to={`/conta/rastreadores/${device.id}`}
          >
            Ver rastreios
          </Link>
        ) : null}
        <Link
          className={`btn btn-primary${device.awaiting_activation ? '' : ''}`}
          to={`/conta/rastreadores/${device.id}/renovar`}
        >
          Renovar plano
        </Link>
      </div>
    </article>
  );
}
