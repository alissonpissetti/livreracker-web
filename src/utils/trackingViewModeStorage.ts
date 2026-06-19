export type TrackingViewMode = 'live' | 'history';

const KEY_PREFIX = 'livre-tracker:tracking-view-mode:';

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

export function readTrackingViewMode(userId?: string | null): TrackingViewMode | null {
  if (!userId) {
    return null;
  }

  try {
    const value = localStorage.getItem(storageKey(userId));
    if (value === 'live' || value === 'history') {
      return value;
    }
  } catch {
    // localStorage indisponível (modo privado, quota, etc.)
  }

  return null;
}

export function writeTrackingViewMode(userId: string | undefined | null, mode: TrackingViewMode): void {
  if (!userId) {
    return;
  }

  try {
    localStorage.setItem(storageKey(userId), mode);
  } catch {
    // Falha silenciosa ao persistir preferência.
  }
}
