import { formatRecordedDateTime } from '../utils/recordedTime';

type DeviceBatteryBadgeProps = {
  percent: number;
  recordedAt?: string;
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

export function DeviceBatteryBadge({ percent, recordedAt }: DeviceBatteryBadgeProps) {
  const level = batteryLevel(percent);
  const fillWidth = Math.max(0, Math.min(100, percent));

  const title = recordedAt
    ? `Bateria ${percent}% · leitura de ${formatRecordedDateTime(recordedAt)}`
    : `Bateria ${percent}%`;

  return (
    <span className={`tracking-battery tracking-battery-${level}`} title={title}>
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
        <rect
          x="3"
          y="4"
          width={(15 * fillWidth) / 100}
          height="6"
          rx="1"
          fill="currentColor"
        />
      </svg>
      <span className="tracking-battery-value">{percent}%</span>
    </span>
  );
}
