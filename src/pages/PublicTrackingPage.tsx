import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { getPublicTracking } from '../api/client';
import { DeviceBatteryBadge } from '../components/DeviceBatteryBadge';
import { DeviceIconGlyph } from '../components/DeviceIcon';
import { TrackingMap } from '../components/TrackingMap';
import { DEFAULT_DEVICE_ICON, isDeviceIcon } from '../constants/deviceIcons';
import type { DeviceLocation } from '../types';
import { applyLocationQuality } from '../utils/locationOutliers';
import { formatRecordedDateTime, recordedAtMs } from '../utils/recordedTime';

const LIVE_POLL_MS = 8_000;

function mergeLocations(
  current: DeviceLocation[],
  incoming: DeviceLocation[],
): DeviceLocation[] {
  if (incoming.length === 0) {
    return current;
  }

  const existing = new Set(current.map((point) => point.id));
  const merged = [...current];

  for (const point of incoming) {
    if (!existing.has(point.id)) {
      merged.push(point);
    }
  }

  merged.sort((a, b) => recordedAtMs(a.recorded_at) - recordedAtMs(b.recorded_at));
  return merged;
}

export function PublicTrackingPage() {
  const { token = '' } = useParams();
  const [recipientName, setRecipientName] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('Rastreador');
  const [deviceIcon, setDeviceIcon] = useState(DEFAULT_DEVICE_ICON);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [locations, setLocations] = useState<DeviceLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const lastReceivedRef = useRef<string | null>(null);

  const qualityLocations = useMemo(
    () => applyLocationQuality(locations),
    [locations],
  );

  const latestBatteryReading = useMemo(() => {
    for (let index = qualityLocations.length - 1; index >= 0; index -= 1) {
      const point = qualityLocations[index];
      if (point.battery_percent != null && Number.isFinite(point.battery_percent)) {
        return {
          percent: point.battery_percent,
          recordedAt: point.recorded_at,
        };
      }
    }
    return null;
  }, [qualityLocations]);

  useEffect(() => {
    let cancelled = false;

    async function loadInitial() {
      setLoading(true);
      setError('');
      setLocations([]);
      lastReceivedRef.current = null;

      try {
        const data = await getPublicTracking(token, { limit: 300 });
        if (cancelled) {
          return;
        }
        setRecipientName(data.recipient_name);
        setDeviceLabel(data.device_label);
        setDeviceIcon(isDeviceIcon(data.device_icon) ? data.device_icon : DEFAULT_DEVICE_ICON);
        setExpiresAt(data.expires_at);
        setLocations(data.locations);
        lastReceivedRef.current = data.locations.at(-1)?.received_at ?? null;
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Link indisponível');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (token) {
      void loadInitial();
    }

    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!token || loading || error) {
      return;
    }

    let cancelled = false;

    async function poll() {
      try {
        const since = lastReceivedRef.current
          ? new Date(new Date(lastReceivedRef.current).getTime() + 1).toISOString()
          : undefined;
        const data = await getPublicTracking(token, { since, limit: 100 });
        if (cancelled || data.locations.length === 0) {
          return;
        }
        setLocations((current) => {
          const merged = mergeLocations(current, data.locations);
          const last = merged.at(-1);
          lastReceivedRef.current = last?.received_at ?? lastReceivedRef.current;
          return merged;
        });
      } catch {
        // Falha silenciosa no polling.
      }
    }

    const timer = window.setInterval(poll, LIVE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [error, loading, token]);

  return (
    <div className="container page public-tracking-page">
      <div className="page-head tracking-page-head">
        <div>
          <p className="muted tracking-back">Rastreio compartilhado · ao vivo</p>
          <div className="tracking-title-row">
            <div className="device-icon-badge" aria-hidden="true">
              <DeviceIconGlyph icon={deviceIcon} size={28} />
            </div>
            <div className="tracking-title-copy">
              <div className="tracking-title-line">
                <h1>{deviceLabel}</h1>
                {!loading && latestBatteryReading ? (
                  <DeviceBatteryBadge
                    percent={latestBatteryReading.percent}
                    recordedAt={latestBatteryReading.recordedAt}
                  />
                ) : null}
              </div>
              <p className="muted">
                {recipientName
                  ? `Olá, ${recipientName} — acompanhe em tempo real`
                  : 'Acompanhe em tempo real'}
              </p>
            </div>
          </div>
        </div>
        {!loading && !error ? (
          <span className="tracking-live-badge" aria-live="polite">
            LIVE
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="card tracking-share-empty">
          <p className="error-text">{error}</p>
          <p className="muted">Peça um novo link para quem compartilhou o rastreio com você.</p>
        </div>
      ) : null}

      {!error && expiresAt ? (
        <p className="muted tracking-map-status">
          Link válido até {formatRecordedDateTime(expiresAt)}
        </p>
      ) : null}

      {!error ? (
        <TrackingMap
          points={qualityLocations}
          ready={!loading}
          resetKey={token}
          live
          showFullDayRoute={false}
          segments={[]}
          selectedSegmentId={null}
        />
      ) : null}
    </div>
  );
}
