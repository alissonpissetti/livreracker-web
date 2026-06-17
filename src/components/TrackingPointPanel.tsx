import type { DeviceLocation } from '../types';
import {
  formatMapBattery,
  formatMapSpeed,
  formatMapTime,
} from '../utils/mapPointInfo';

type TrackingPointPanelProps = {
  points: DeviceLocation[];
  activeIndex: number;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
};

function StepCard({
  label,
  point,
  index,
  variant,
  onClick,
}: {
  label: string;
  point?: DeviceLocation;
  index?: number;
  variant: 'prev' | 'current' | 'next' | 'empty';
  onClick?: () => void;
}) {
  const clickable = Boolean(onClick && point);

  return (
    <button
      type="button"
      className={`tracking-step-card tracking-step-card-${variant}`}
      disabled={!clickable}
      onClick={onClick}
    >
      <span className="tracking-step-label">{label}</span>
      {point && index != null ? (
        <>
          <strong>#{index + 1}</strong>
          <span>{formatMapTime(point.recorded_at)}</span>
        </>
      ) : (
        <span className="muted">—</span>
      )}
    </button>
  );
}

export function TrackingPointPanel({
  points,
  activeIndex,
  onPrevious,
  onNext,
  onClose,
}: TrackingPointPanelProps) {
  const current = points[activeIndex];
  const prev = activeIndex > 0 ? points[activeIndex - 1] : undefined;
  const next =
    activeIndex < points.length - 1 ? points[activeIndex + 1] : undefined;
  const progress = ((activeIndex + 1) / points.length) * 100;

  if (!current) return null;

  return (
    <aside className="tracking-point-panel" aria-label="Navegação entre leituras">
      <div className="tracking-point-panel-head">
        <div>
          <p className="tracking-point-panel-title">Leitura {activeIndex + 1} de {points.length}</p>
          <p className="muted tracking-point-panel-sub">
            Amarelo grosso = trecho pelas ruas · Marcadores: verde, amarelo e laranja
          </p>
        </div>
        <button
          type="button"
          className="tracking-point-panel-close"
          onClick={onClose}
          aria-label="Ocultar painel"
        >
          ×
        </button>
      </div>

      <div className="tracking-step-flow" aria-hidden="true">
        <StepCard
          label="Veio de"
          point={prev}
          index={activeIndex > 0 ? activeIndex - 1 : undefined}
          variant={prev ? 'prev' : 'empty'}
          onClick={prev ? onPrevious : undefined}
        />
        <span className="tracking-step-arrow">→</span>
        <StepCard
          label="Agora"
          point={current}
          index={activeIndex}
          variant="current"
        />
        <span className="tracking-step-arrow">→</span>
        <StepCard
          label="Vai para"
          point={next}
          index={activeIndex < points.length - 1 ? activeIndex + 1 : undefined}
          variant={next ? 'next' : 'empty'}
          onClick={next ? onNext : undefined}
        />
      </div>

      <div className="tracking-point-panel-progress" aria-hidden="true">
        <div className="tracking-point-panel-progress-bar">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>

      <dl className="tracking-point-panel-details">
        <div>
          <dt>Data/hora</dt>
          <dd>{new Date(current.recorded_at).toLocaleString('pt-BR')}</dd>
        </div>
        <div>
          <dt>Velocidade</dt>
          <dd>{formatMapSpeed(current.speed_knots)}</dd>
        </div>
        <div>
          <dt>Bateria</dt>
          <dd>{formatMapBattery(current.battery_percent)}</dd>
        </div>
      </dl>

      <div className="tracking-point-panel-actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={activeIndex <= 0}
          onClick={onPrevious}
        >
          ← Anterior
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={activeIndex >= points.length - 1}
          onClick={onNext}
        >
          Próximo →
        </button>
      </div>
    </aside>
  );
}
