/** Paleta distinta para trechos do dia (move e parada alternam cores). */
export const TIMELINE_COLORS = [
  '#2563eb',
  '#7c3aed',
  '#059669',
  '#d97706',
  '#db2777',
  '#0891b2',
  '#4f46e5',
  '#65a30d',
  '#ea580c',
  '#0d9488',
] as const;

export function timelineColorForIndex(index: number): string {
  return TIMELINE_COLORS[index % TIMELINE_COLORS.length];
}
