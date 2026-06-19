import { useEffect, useMemo, useState } from 'react';
import type { LiveStopStatus } from '../utils/liveStopStatus';
import { formatRecordedTime, recordedAtMs } from '../utils/recordedTime';
import { formatDuration } from '../utils/routeStats';

type LiveStopBannerProps = {
  status: LiveStopStatus | null;
  active?: boolean;
};

export function LiveStopBanner({ status, active = true }: LiveStopBannerProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!active || !status) {
      return;
    }

    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 30_000);

    return () => {
      window.clearInterval(timer);
    };
  }, [active, status]);

  const durationSec = useMemo(() => {
    if (!status) {
      return 0;
    }
    return Math.max((nowMs - recordedAtMs(status.sinceAt)) / 1000, 0);
  }, [nowMs, status]);

  if (!active || !status) {
    return null;
  }

  const sinceLabel = formatRecordedTime(status.sinceAt);
  const durationLabel = formatDuration(durationSec);

  return (
    <div className="tracking-live-stop-banner" role="status" aria-live="polite">
      <span className="tracking-live-stop-banner-icon" aria-hidden="true">
        <svg viewBox="0 0 16 16" focusable="false">
          <path
            fill="currentColor"
            d="M8 1.5a4 4 0 0 0-4 4c0 2.8 4 8.5 4 8.5s4-5.7 4-8.5a4 4 0 0 0-4-4Zm0 5.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
          />
        </svg>
      </span>
      <div className="tracking-live-stop-banner-copy">
        <strong>Parado desde {sinceLabel}</strong>
        <span className="muted">
          há {durationLabel}
          {status.pointCount > 1
            ? ` · ${status.pointCount} leituras no local`
            : ' · aguardando próximo sinal (até 30 min)'}
        </span>
      </div>
    </div>
  );
}
