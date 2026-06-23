export function formatMapSpeed(speedKnots?: number): string {
  if (speedKnots == null) return '—';
  return `${(speedKnots * 1.852).toFixed(1)} km/h`;
}

export function formatMapBattery(batteryPercent?: number): string {
  if (batteryPercent == null) return '—';
  return `${batteryPercent}%`;
}

export function formatMapPowerStatus(
  batteryPercent?: number,
  usbConnected?: boolean,
  batteryCharging?: boolean,
): string {
  if (batteryCharging) {
    return batteryPercent != null ? `Carregando (${batteryPercent}%)` : 'Carregando';
  }
  if (usbConnected) {
    return batteryPercent != null ? `USB (${batteryPercent}%)` : 'USB conectado';
  }
  return formatMapBattery(batteryPercent);
}

import { formatRecordedTime } from './recordedTime';

export function formatMapTime(iso: string): string {
  return formatRecordedTime(iso);
}

export type ReadingMarkerRole = 'default' | 'prev' | 'current' | 'next' | 'outlier';

type MarkerStyle = {
  background: string;
  border: string;
  size: number;
  borderWidth: number;
};

function markerStyle(role: ReadingMarkerRole): MarkerStyle {
  switch (role) {
    case 'prev':
      return { background: '#22c55e', border: '#ffffff', size: 14, borderWidth: 2 };
    case 'current':
      return { background: '#facc15', border: '#ffffff', size: 22, borderWidth: 3 };
    case 'next':
      return { background: '#f97316', border: '#ffffff', size: 14, borderWidth: 2 };
    case 'outlier':
      return { background: '#94a3b8', border: '#ef4444', size: 10, borderWidth: 2 };
    default:
      return { background: '#64748b', border: '#0f172a', size: 8, borderWidth: 1 };
  }
}

export function createReadingMarkerElement(role: ReadingMarkerRole): HTMLDivElement {
  const element = document.createElement('div');
  applyReadingMarkerRole(element, role);
  return element;
}

export function applyReadingMarkerRole(
  element: HTMLDivElement,
  role: ReadingMarkerRole,
): void {
  const style = markerStyle(role);
  element.style.width = `${style.size}px`;
  element.style.height = `${style.size}px`;
  element.style.borderRadius = '999px';
  element.style.background = style.background;
  element.style.border = `${style.borderWidth}px solid ${style.border}`;
  element.style.boxSizing = 'border-box';
  element.style.pointerEvents = 'auto';
  if (role === 'outlier') {
    element.style.outline = '2px dashed #ef4444';
    element.style.outlineOffset = '1px';
  } else {
    element.style.outline = '';
    element.style.outlineOffset = '';
  }
}

export function createStopMarkerElement(
  color: string,
  options?: { prominent?: boolean; label?: string },
): HTMLDivElement {
  const wrap = document.createElement('div');
  wrap.style.display = 'flex';
  wrap.style.flexDirection = 'column';
  wrap.style.alignItems = 'center';
  wrap.style.pointerEvents = 'auto';

  const dot = document.createElement('div');
  const size = options?.prominent ? 24 : 16;
  dot.style.width = `${size}px`;
  dot.style.height = `${size}px`;
  dot.style.borderRadius = '999px';
  dot.style.background = color;
  dot.style.border = `${options?.prominent ? 3 : 2}px solid #ffffff`;
  dot.style.boxSizing = 'border-box';
  wrap.appendChild(dot);

  if (options?.label) {
    const label = document.createElement('div');
    label.textContent = options.label;
    label.style.marginTop = '2px';
    label.style.fontSize = '11px';
    label.style.fontWeight = '700';
    label.style.color = '#0f172a';
    label.style.textShadow = '0 0 2px #ffffff';
    wrap.appendChild(label);
  }

  return wrap;
}

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
    case 'outlier':
      return {
        path: SymbolPath.CIRCLE,
        fillColor: '#94a3b8',
        fillOpacity: 0.7,
        strokeColor: '#ef4444',
        strokeWeight: 2,
        scale: 5,
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
  excludedFromRoute?: boolean,
): ReadingMarkerRole {
  if (index === activeIndex) return 'current';
  if (index === activeIndex - 1) return 'prev';
  if (index === activeIndex + 1) return 'next';
  if (excludedFromRoute) return 'outlier';
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
    case 'outlier':
      return 2;
    default:
      return 1;
  }
}
