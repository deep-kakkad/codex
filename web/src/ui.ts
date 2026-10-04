import { useSyncExternalStore } from 'react';

/** Which interface the recruiter app shows: UI 1 (the earlier design) or UI 2 (the current one). */
export type UiVersion = 'v1' | 'v2';

const KEY = 'proofwork-ui';
const listeners = new Set<() => void>();

function stored(): UiVersion {
  try {
    return localStorage.getItem(KEY) === 'v1' ? 'v1' : 'v2';
  } catch {
    return 'v2';
  }
}

let current: UiVersion = stored();

/** Puts the choice on <html data-ui>, which the stylesheet uses to pick each version's styles. */
export function applyUi(version: UiVersion = current) {
  document.documentElement.dataset.ui = version;
}

/** `persist: false` switches for now without changing the saved choice (the demo tour does this). */
export function setUi(version: UiVersion, persist = true) {
  current = version;
  try {
    if (persist) localStorage.setItem(KEY, version);
  } catch {
    // Private windows can refuse storage; the choice still holds for this visit.
  }
  applyUi(version);
  for (const listener of listeners) listener();
}

export function useUi(): UiVersion {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => 'v2',
  );
}
