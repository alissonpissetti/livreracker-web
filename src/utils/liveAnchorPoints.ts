import type { DeviceLocation } from '../types';
import { recordedAtMs, recordedDayRangeIso } from './recordedTime';

function sortByRecordedAt(points: DeviceLocation[]): DeviceLocation[] {
  return [...points].sort(
    (a, b) => recordedAtMs(a.recorded_at) - recordedAtMs(b.recorded_at),
  );
}

/** Filtra leituras pelo dia civil (Brasil) do recorded_at corrigido. */
export function filterLocationsForDay(
  locations: DeviceLocation[],
  dateValue: string,
): DeviceLocation[] {
  const { from, to } = recordedDayRangeIso(dateValue);
  const startMs = new Date(from).getTime();
  const endMs = new Date(to).getTime();

  return sortByRecordedAt(locations).filter((point) => {
    const recordedMs = recordedAtMs(point.recorded_at);
    return recordedMs >= startMs && recordedMs <= endMs;
  });
}

/**
 * Pontos do dia selecionado no mapa (histórico). Se o dia não tiver leituras,
 * exibe a última posição conhecida do equipamento.
 */
export function buildHistoryMapPoints(
  dayPoints: DeviceLocation[],
  lastKnown?: DeviceLocation | null,
): DeviceLocation[] {
  if (dayPoints.length > 0) {
    return dayPoints;
  }

  return lastKnown ? [lastKnown] : [];
}

/**
 * Pontos exibidos no mapa ao vivo: inclui o dia atual e, se necessário, o último
 * ponto anterior para manter continuidade entre períodos/dias.
 */
export function buildLiveMapPoints(
  locations: DeviceLocation[],
  dayStartIso: string,
): DeviceLocation[] {
  const sorted = sortByRecordedAt(locations);
  if (sorted.length === 0) {
    return [];
  }

  const dayStartMs = new Date(dayStartIso).getTime();
  const todayPoints = sorted.filter(
    (point) => recordedAtMs(point.recorded_at) >= dayStartMs,
  );

  if (todayPoints.length > 0) {
    const anchor = sorted
      .filter((point) => recordedAtMs(point.recorded_at) < dayStartMs)
      .at(-1);

    if (anchor && anchor.id !== todayPoints[0]?.id) {
      return [anchor, ...todayPoints];
    }

    return todayPoints;
  }

  return sorted.slice(-1);
}
