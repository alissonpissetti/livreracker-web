export function formatMapSpeed(speedKnots?: number): string {
  if (speedKnots == null) return '—';
  return `${(speedKnots * 1.852).toFixed(1)} km/h`;
}

export function formatMapBattery(batteryPercent?: number): string {
  if (batteryPercent == null) return '—';
  return `${batteryPercent}%`;
}

export function formatMapTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export type ReadingMarkerRole = 'default' | 'prev' | 'current' | 'next';

export function readingMarkerIcon(
  SymbolPath: typeof google.maps.SymbolPath,
  role: ReadingMarkerRole,
): google.maps.Symbol {
  switch (role) {
    case 'prev':
      return {
        path: SymbolPath.CIRCLE,
        fillColor: '#22c55e',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: 7,
      };
    case 'current':
      return {
        path: SymbolPath.CIRCLE,
        fillColor: '#facc15',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 3,
        scale: 11,
      };
    case 'next':
      return {
        path: SymbolPath.CIRCLE,
        fillColor: '#f97316',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: 7,
      };
    default:
      return {
        path: SymbolPath.CIRCLE,
        fillColor: '#64748b',
        fillOpacity: 0.85,
        strokeColor: '#0f172a',
        strokeWeight: 1,
        scale: 4,
      };
  }
}

export function markerRoleForIndex(
  index: number,
  activeIndex: number,
  total: number,
): ReadingMarkerRole {
  if (index === activeIndex) return 'current';
  if (index === activeIndex - 1) return 'prev';
  if (index === activeIndex + 1) return 'next';
  if (total <= 3) return 'default';
  return 'default';
}

export function markerZIndex(role: ReadingMarkerRole): number {
  switch (role) {
    case 'current':
      return 6;
    case 'prev':
    case 'next':
      return 4;
    default:
      return 1;
  }
}
