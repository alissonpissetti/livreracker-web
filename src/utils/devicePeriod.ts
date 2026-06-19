function formatPeriodDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDevicePeriodRange(
  startIso: string,
  endIso: string,
): string {
  return `${formatPeriodDate(startIso)} — ${formatPeriodDate(endIso)}`;
}

export function formatDaysRemaining(days: number): string {
  if (days <= 0) {
    return 'Período encerrado';
  }
  if (days === 1) {
    return '1 dia restante';
  }
  return `${days} dias restantes`;
}
