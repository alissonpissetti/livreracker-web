/**
 * O ESP32 envia horário local (Brasil) com sufixo Z (UTC).
 * Somamos 3 h na exibição e nos cálculos de timeline para alinhar ao horário real.
 */
export const RECORDED_AT_OFFSET_MS = 3 * 60 * 60 * 1000;

const DISPLAY_TIME_ZONE = 'America/Sao_Paulo';

export function parseRecordedAt(iso: string): Date {
  return new Date(new Date(iso).getTime() + RECORDED_AT_OFFSET_MS);
}

export function recordedAtMs(iso: string): number {
  return parseRecordedAt(iso).getTime();
}

export function formatRecordedDateTime(iso: string): string {
  return parseRecordedAt(iso).toLocaleString('pt-BR', {
    timeZone: DISPLAY_TIME_ZONE,
  });
}

/** Timestamps UTC reais (API/servidor) → horário de Brasília, sem offset do ESP32. */
export function formatInstantDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: DISPLAY_TIME_ZONE,
  });
}

export function formatRecordedTime(iso: string): string {
  return parseRecordedAt(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: DISPLAY_TIME_ZONE,
  });
}

/** Início/fim do dia civil (Brasil) para filtrar leituras pelo recorded_at corrigido. */
export function recordedDayRangeIso(dateValue: string): { from: string; to: string } {
  const [year, month, day] = dateValue.split('-').map(Number);
  const startUtc = Date.UTC(year, month - 1, day, 3, 0, 0, 0);
  const endUtc = Date.UTC(year, month - 1, day + 1, 2, 59, 59, 999);
  return {
    from: new Date(startUtc).toISOString(),
    to: new Date(endUtc).toISOString(),
  };
}
