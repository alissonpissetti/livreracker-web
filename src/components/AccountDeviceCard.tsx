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

type AccountDeviceCardProps = {
  device: AccountDevice;
  busy: boolean;
  imeiValue: string;
  onImeiChange: (value: string) => void;
  onActivate?: () => void;
  onRenew?: () => void;
  onSaveProfile: (label: string, icon: DeviceIcon) => Promise<void>;
};

function deviceStatusLabel(device: AccountDevice) {
  if (device.awaiting_activation) return 'Aguardando IMEI';
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
  onRenew,
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
              ? `IMEI: ${device.device_id}`
              : 'Ainda sem IMEI vinculado'}
          </p>
        </div>
        <span className={deviceStatusClass(device)}>
          {deviceStatusLabel(device)}
        </span>
      </div>

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
            IMEI do equipamento
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
      ) : (
        <>
          <dl className="meta-grid">
            <div>
              <dt>Válido até</dt>
              <dd>
                {new Date(device.current_period_end).toLocaleString('pt-BR')}
              </dd>
            </div>
            <div>
              <dt>Pedido</dt>
              <dd>{device.order_id?.slice(0, 8) ?? '—'}</dd>
            </div>
          </dl>
          {onRenew ? (
            <div className="card-actions">
              <Link
                className="btn btn-secondary"
                to={`/conta/rastreadores/${device.id}`}
              >
                Ver rastreios
              </Link>
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={onRenew}
              >
                Renovar +30 dias
              </button>
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}
