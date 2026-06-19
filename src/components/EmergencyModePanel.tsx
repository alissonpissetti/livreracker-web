import { useEffect, useRef, useState } from 'react';
import {
  activateDeviceEmergency,
  deactivateDeviceEmergency,
  getDeviceLocations,
} from '../api/client';
import type { AccountDevice } from '../types';

type EmergencyModePanelProps = {
  deviceSlotId: string;
  device: AccountDevice;
  disabled?: boolean;
  onDeviceChange: (device: AccountDevice) => void;
};

function formatCountdown(totalSec: number): string {
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function EmergencyModePanel({
  deviceSlotId,
  device,
  disabled = false,
  onDeviceChange,
}: EmergencyModePanelProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remainingSec, setRemainingSec] = useState(0);

  const isActive = device.emergency_active && !!device.emergency_until;

  useEffect(() => {
    if (!isActive || !device.emergency_until) {
      setRemainingSec(0);
      return;
    }

    function tick() {
      const ms = new Date(device.emergency_until!).getTime() - Date.now();
      setRemainingSec(Math.max(0, Math.ceil(ms / 1000)));
    }

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [device.emergency_until, isActive]);

  useEffect(() => {
    if (isActive && remainingSec === 0) {
      void refreshDeviceState();
    }
  }, [isActive, remainingSec]);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshDeviceState();
    }, 10_000);

    return () => window.clearInterval(timer);
  }, [deviceSlotId, isActive]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  async function refreshDeviceState() {
    try {
      const today = new Date();
      const dateValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const from = new Date(`${dateValue}T00:00:00`).toISOString();
      const to = new Date(`${dateValue}T23:59:59.999`).toISOString();
      const data = await getDeviceLocations(deviceSlotId, { from, to, limit: 1 });
      onDeviceChange(data.device);
    } catch {
      // Falha silenciosa no refresh do estado de emergência.
    }
  }

  async function handleActivate() {
    setLoading(true);
    setError('');
    try {
      const updated = await activateDeviceEmergency(deviceSlotId);
      onDeviceChange(updated);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao ativar emergência');
    } finally {
      setLoading(false);
    }
  }

  async function handleDeactivate() {
    setLoading(true);
    setError('');
    try {
      const updated = await deactivateDeviceEmergency(deviceSlotId);
      onDeviceChange(updated);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao encerrar emergência');
    } finally {
      setLoading(false);
    }
  }

  if (isActive) {
    return (
      <div className="emergency-mode-compact" ref={rootRef}>
        <div className="emergency-mode-active">
          <span className="emergency-mode-badge" aria-live="polite">
            EMERGÊNCIA
          </span>
          <span className="emergency-countdown" aria-label="Tempo restante">
            {formatCountdown(remainingSec)}
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            disabled={loading || disabled}
            onClick={() => void handleDeactivate()}
          >
            {loading ? 'Encerrando…' : 'Encerrar'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="emergency-mode-compact" ref={rootRef}>
      <button
        type="button"
        className={`emergency-mode-trigger${open ? ' emergency-mode-trigger-open' : ''}`}
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        Emergência
      </button>

      {open ? (
        <div className="emergency-mode-popover card" role="dialog" aria-label="Modo emergência">
          <p className="muted emergency-mode-popover-intro">
            Ativa rastreamento a cada <strong>10 segundos</strong> por{' '}
            <strong>30 minutos</strong>. Consome mais bateria e dados celulares.
          </p>
          {error ? <p className="error-text">{error}</p> : null}
          <div className="emergency-mode-actions">
            <button
              type="button"
              className="btn btn-primary btn-small"
              disabled={loading || disabled}
              onClick={() => void handleActivate()}
            >
              {loading ? 'Ativando…' : 'Ativar por 30 min'}
            </button>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => setOpen(false)}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
