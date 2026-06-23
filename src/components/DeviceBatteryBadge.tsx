import { formatInstantDateTime } from '../utils/recordedTime';

export type DeviceBatteryBadgeProps = {
  percent?: number | null;
  recordedAt?: string;
  usbConnected?: boolean;
  batteryCharging?: boolean;
  stale?: boolean;
  compact?: boolean;
};

function batteryLevel(percent: number): 'high' | 'medium' | 'low' {
  if (percent >= 50) {
    return 'high';
  }
  if (percent >= 20) {
    return 'medium';
  }
  return 'low';
}

function buildPowerLabel(
  percent: number | null | undefined,
  usbConnected?: boolean,
  batteryCharging?: boolean,
): string {
  if (batteryCharging) {
    return percent != null ? `Carregando · ${percent}%` : 'Carregando';
  }
  if (usbConnected) {
    return percent != null ? `USB · ${percent}%` : 'USB conectado';
  }
  if (percent != null) {
    return `${percent}%`;
  }
  return 'Sem leitura';
}

export function DeviceBatteryBadge({
  percent,
  recordedAt,
  usbConnected,
  batteryCharging,
  stale = false,
  compact = false,
}: DeviceBatteryBadgeProps) {
  const hasPercent = percent != null && Number.isFinite(percent);
  const level = hasPercent ? batteryLevel(percent) : 'medium';
  const fillWidth = hasPercent ? Math.max(0, Math.min(100, percent)) : 0;
  const label = buildPowerLabel(percent, usbConnected, batteryCharging);
  const timeLabel = recordedAt ? formatInstantDateTime(recordedAt) : null;

  const title = timeLabel
    ? `${label} · leitura de ${timeLabel}${stale ? ' (desatualizada)' : ''}`
    : label;

  return (
    <span
      className={`tracking-battery tracking-battery-${level}${
        batteryCharging ? ' tracking-battery-charging' : ''
      }${usbConnected ? ' tracking-battery-usb' : ''}${
        stale ? ' tracking-battery-stale' : ''
      }${compact ? ' tracking-battery-compact' : ''}`}
      title={title}
    >
      <svg
        className="tracking-battery-icon"
        viewBox="0 0 24 14"
        aria-hidden="true"
        focusable="false"
      >
        <rect
          x="1"
          y="2"
          width="19"
          height="10"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <rect x="20.5" y="5" width="2.5" height="4" rx="0.8" fill="currentColor" />
        {hasPercent ? (
          <rect
            x="3"
            y="4"
            width={(15 * fillWidth) / 100}
            height="6"
            rx="1"
            fill="currentColor"
          />
        ) : null}
      </svg>
      <span className="tracking-battery-copy">
        <span className="tracking-battery-value">{label}</span>
        {!compact && timeLabel ? (
          <span className="tracking-battery-meta">
            {timeLabel}
            {stale ? ' · desatualizado' : ''}
          </span>
        ) : !compact && stale ? (
          <span className="tracking-battery-meta">desatualizado</span>
        ) : null}
      </span>
    </span>
  );
}
