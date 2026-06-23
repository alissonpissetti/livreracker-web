import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DeviceIconPicker } from './DeviceIconPicker';
import {
  DEFAULT_DEVICE_ICON,
  type DeviceIcon,
  isDeviceIcon,
} from '../constants/deviceIcons';
import type { AccountDevice } from '../types';

export type DeviceAlertSettings = {
  alert_battery_low_enabled: boolean;
  alert_battery_full_enabled: boolean;
};

type DeviceSettingsPanelProps = {
  device: AccountDevice;
  hasAlertPhone: boolean;
  busy?: boolean;
  onSaveProfile: (label: string, icon: DeviceIcon) => Promise<void>;
  onSaveAlerts: (alerts: DeviceAlertSettings) => Promise<void>;
};

export function DeviceSettingsPanel({
  device,
  hasAlertPhone,
  busy = false,
  onSaveProfile,
  onSaveAlerts,
}: DeviceSettingsPanelProps) {
  const icon = isDeviceIcon(device.icon) ? device.icon : DEFAULT_DEVICE_ICON;
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(device.label ?? '');
  const [selectedIcon, setSelectedIcon] = useState<DeviceIcon>(icon);
  const [alertBatteryLow, setAlertBatteryLow] = useState(
    device.alert_battery_low_enabled ?? false,
  );
  const [alertBatteryFull, setAlertBatteryFull] = useState(
    device.alert_battery_full_enabled ?? false,
  );
  const [saving, setSaving] = useState(false);
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [localError, setLocalError] = useState('');
  const [alertsError, setAlertsError] = useState('');

  useEffect(() => {
    setLabel(device.label ?? '');
    setSelectedIcon(isDeviceIcon(device.icon) ? device.icon : DEFAULT_DEVICE_ICON);
    setAlertBatteryLow(device.alert_battery_low_enabled ?? false);
    setAlertBatteryFull(device.alert_battery_full_enabled ?? false);
  }, [
    device.label,
    device.icon,
    device.alert_battery_low_enabled,
    device.alert_battery_full_enabled,
  ]);

  const trimmedLabel = label.trim();
  const profileDirty =
    trimmedLabel !== (device.label ?? '').trim() ||
    selectedIcon !== (isDeviceIcon(device.icon) ? device.icon : DEFAULT_DEVICE_ICON);
  const alertsDirty =
    alertBatteryLow !== (device.alert_battery_low_enabled ?? false) ||
    alertBatteryFull !== (device.alert_battery_full_enabled ?? false);
  const wantsAlerts = alertBatteryLow || alertBatteryFull;

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

  async function handleSaveAlerts() {
    if (wantsAlerts && !hasAlertPhone) {
      setAlertsError('Cadastre um celular em Meus dados antes de ativar alertas.');
      return;
    }

    setSavingAlerts(true);
    setAlertsError('');
    try {
      await onSaveAlerts({
        alert_battery_low_enabled: alertBatteryLow,
        alert_battery_full_enabled: alertBatteryFull,
      });
    } catch (err) {
      setAlertsError(err instanceof Error ? err.message : 'Falha ao salvar alertas');
    } finally {
      setSavingAlerts(false);
    }
  }

  return (
    <section className="device-settings-panel card" aria-label="Configurações do dispositivo">
      <button
        type="button"
        className="device-settings-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>
          <strong>Configurações</strong>
          <small className="muted">Nome, ícone e alertas por SMS</small>
        </span>
        <span className="device-settings-chevron" aria-hidden="true">
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open ? (
        <div className="device-settings-body">
          <div className="device-settings-grid">
            <label>
              Nome amigável
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
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
          </div>

          {localError ? <p className="error-text">{localError}</p> : null}

          <div className="card-actions">
            <button
              className="btn btn-secondary"
              type="button"
              disabled={!profileDirty || busy || saving}
              onClick={() => void handleSaveProfile()}
            >
              {saving ? 'Salvando...' : 'Salvar nome e ícone'}
            </button>
          </div>

          <div className="device-settings-divider" />

          <section className="device-alerts-section" aria-labelledby="device-alerts-title">
            <header className="device-alerts-header">
              <h3 className="section-subtitle" id="device-alerts-title">
                Alertas por SMS
              </h3>
              <p className="muted device-alerts-lead">
                Avisos no celular cadastrado em{' '}
                <Link to="/conta">Meus dados</Link> quando a bateria atingir limites
                críticos.
              </p>
            </header>

            {!hasAlertPhone ? (
              <p className="device-alerts-warning">
                Cadastre um celular em <Link to="/conta">Meus dados</Link> para ativar os
                alertas.
              </p>
            ) : null}

            <div className="device-alerts-options">
              <label
                className={`device-alert-option${alertBatteryLow ? ' device-alert-option-active' : ''}`}
              >
                <input
                  type="checkbox"
                  className="device-alert-checkbox"
                  checked={alertBatteryLow}
                  onChange={(event) => setAlertBatteryLow(event.target.checked)}
                  disabled={busy || savingAlerts || !hasAlertPhone}
                />
                <span className="device-alert-icon device-alert-icon-low" aria-hidden="true">
                  🔋
                </span>
                <span className="device-alert-copy">
                  <strong>Bateria baixa</strong>
                  <small>Avisar quando a carga ficar abaixo de 20%</small>
                </span>
              </label>

              <label
                className={`device-alert-option${alertBatteryFull ? ' device-alert-option-active' : ''}`}
              >
                <input
                  type="checkbox"
                  className="device-alert-checkbox"
                  checked={alertBatteryFull}
                  onChange={(event) => setAlertBatteryFull(event.target.checked)}
                  disabled={busy || savingAlerts || !hasAlertPhone}
                />
                <span className="device-alert-icon device-alert-icon-full" aria-hidden="true">
                  ⚡
                </span>
                <span className="device-alert-copy">
                  <strong>Bateria cheia</strong>
                  <small>Avisar quando a carga atingir 100%</small>
                </span>
              </label>
            </div>

            {alertsError ? <p className="error-text">{alertsError}</p> : null}

            <div className="device-alerts-actions">
              <button
                className="btn btn-secondary"
                type="button"
                disabled={
                  !alertsDirty || busy || savingAlerts || (wantsAlerts && !hasAlertPhone)
                }
                onClick={() => void handleSaveAlerts()}
              >
                {savingAlerts ? 'Salvando...' : 'Salvar alertas'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
