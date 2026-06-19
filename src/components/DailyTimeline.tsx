import { useEffect, useState } from 'react';
import type { TimelineSegment } from '../utils/dailyTimeline';
import {
  formatTimelineSegmentSummary,
  formatTimelineSegmentTitle,
  formatTimelineTimeRange,
  stopDurationSec,
} from '../utils/dailyTimeline';
import { formatDuration } from '../utils/routeStats';
import { getCachedPlaceLabel, resolvePlaceLabel } from '../utils/placeLabel';
import { loadGoogleMaps } from '../utils/googleMaps';

type DailyTimelineProps = {
  segments: TimelineSegment[];
  selectedSegmentId: string | null;
  onSelectSegment: (segmentId: string) => void;
  embedded?: boolean;
};

function ReadingsBadge({ count }: { count: number }) {
  return (
    <span
      className="tracking-timeline-readings"
      title={`${count} leitura${count > 1 ? 's' : ''} registrada${count > 1 ? 's' : ''}`}
      aria-label={`${count} leituras registradas`}
    >
      <svg
        className="tracking-timeline-readings-icon"
        viewBox="0 0 16 16"
        aria-hidden="true"
        focusable="false"
      >
        <circle cx="4" cy="4" r="1.6" fill="currentColor" />
        <circle cx="8" cy="4" r="1.6" fill="currentColor" />
        <circle cx="12" cy="4" r="1.6" fill="currentColor" />
        <circle cx="4" cy="8" r="1.6" fill="currentColor" />
        <circle cx="8" cy="8" r="1.6" fill="currentColor" />
        <circle cx="12" cy="8" r="1.6" fill="currentColor" />
        <circle cx="8" cy="12" r="1.6" fill="currentColor" />
      </svg>
      <span className="tracking-timeline-readings-count">{count}</span>
    </span>
  );
}

function SegmentCard({
  segment,
  selected,
  placeLabel,
  onSelect,
}: {
  segment: TimelineSegment;
  selected: boolean;
  placeLabel?: string;
  onSelect: () => void;
}) {
  const isStop = segment.kind === 'stop';
  const durationLabel = formatDuration(
    isStop ? stopDurationSec(segment) : segment.durationSec,
  );

  return (
    <button
      type="button"
      className={`tracking-timeline-item tracking-timeline-item-${segment.kind}${
        selected ? ' tracking-timeline-item-selected' : ''
      }`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <span
        className={`tracking-timeline-color${isStop ? ' tracking-timeline-color-stop' : ''}`}
        style={{ backgroundColor: segment.color }}
        aria-hidden="true"
      >
        {isStop ? (
          <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path
              fill="currentColor"
              d="M8 1.5a4 4 0 0 0-4 4c0 2.8 4 8.5 4 8.5s4-5.7 4-8.5a4 4 0 0 0-4-4Zm0 5.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z"
            />
          </svg>
        ) : null}
      </span>

      <div className="tracking-timeline-item-body">
        <div className="tracking-timeline-item-head">
          <strong>{formatTimelineSegmentTitle(segment)}</strong>
          <span className="tracking-timeline-time">{formatTimelineTimeRange(segment)}</span>
        </div>

        {isStop ? (
          <>
            <p className="tracking-timeline-stop-duration">
              Parado por {durationLabel}
            </p>
            <p className="tracking-timeline-summary tracking-timeline-stop-location">
              {formatTimelineSegmentSummary(segment, placeLabel)}
            </p>
          </>
        ) : (
          <p className="tracking-timeline-summary">
            {formatTimelineSegmentSummary(segment, placeLabel)}
          </p>
        )}
      </div>

      <ReadingsBadge count={segment.pointCount} />
    </button>
  );
}

export function DailyTimeline({
  segments,
  selectedSegmentId,
  onSelectSegment,
  embedded = false,
}: DailyTimelineProps) {
  const [placeLabels, setPlaceLabels] = useState<Record<string, string>>({});

  useEffect(() => {
    if (segments.length === 0) {
      return;
    }

    const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '';
    if (!mapsKey) {
      return;
    }

    let cancelled = false;

    void loadGoogleMaps(mapsKey).then(async () => {
      for (const segment of segments) {
        if (segment.kind !== 'stop' || cancelled) {
          continue;
        }

        const cached = getCachedPlaceLabel(segment.centroidLat, segment.centroidLng);
        if (cached) {
          setPlaceLabels((current) => ({
            ...current,
            [segment.id]: cached,
          }));
          continue;
        }

        const label = await resolvePlaceLabel(segment.centroidLat, segment.centroidLng);
        if (cancelled || !label) {
          continue;
        }

        setPlaceLabels((current) => ({
          ...current,
          [segment.id]: label,
        }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [segments]);

  if (segments.length === 0) {
    return (
      <div className={embedded ? 'tracking-timeline-embedded' : 'tracking-timeline card'}>
        {!embedded ? (
          <div className="section-head">
            <h2>Linha do tempo</h2>
          </div>
        ) : null}
        <p className="muted tracking-timeline-empty">
          Ainda não há trechos suficientes para montar a linha do tempo deste dia.
        </p>
      </div>
    );
  }

  const content = (
    <>
      {!embedded ? (
        <div className="section-head">
          <h2>Linha do tempo</h2>
          <span className="muted">{segments.length} trecho{segments.length > 1 ? 's' : ''}</span>
        </div>
      ) : (
        <p className="muted tracking-timeline-intro">
          {segments.length} trecho{segments.length > 1 ? 's' : ''} · paradas e deslocamentos do dia
        </p>
      )}
      {!embedded ? (
        <p className="muted tracking-timeline-intro">
          Paradas e deslocamentos agrupados por horário. Cada trecho selecionado aparece no mapa.
        </p>
      ) : null}

      <div className="tracking-timeline-list">
        {segments.map((segment) => (
          <SegmentCard
            key={segment.id}
            segment={segment}
            selected={selectedSegmentId === segment.id}
            placeLabel={placeLabels[segment.id]}
            onSelect={() => onSelectSegment(segment.id)}
          />
        ))}
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className="tracking-timeline-embedded" aria-label="Linha do tempo do dia">
        {content}
      </div>
    );
  }

  return (
    <section className="tracking-timeline card" aria-label="Linha do tempo do dia">
      {content}
    </section>
  );
}
