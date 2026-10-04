import { useSyncExternalStore } from 'react';

/**
 * Which guided tour is running and on which step. It lives in this tab only,
 * so a reload carries on where the visitor was.
 */
export type TourId = 'recruiter' | 'candidate';
export interface TourState {
  id: TourId;
  step: number;
}

const KEY = 'proofwork-tour';
const listeners = new Set<() => void>();

function read(): TourState | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as TourState | null;
    return saved && (saved.id === 'recruiter' || saved.id === 'candidate') ? saved : null;
  } catch {
    return null;
  }
}

let current = read();

function set(next: TourState | null) {
  current = next;
  try {
    if (next) sessionStorage.setItem(KEY, JSON.stringify(next));
    else sessionStorage.removeItem(KEY);
  } catch {
    // Without storage the tour still runs; it just won't survive a reload.
  }
  for (const listener of listeners) listener();
}

export function startTour(id: TourId, step = 0) {
  set({ id, step });
}

export function goToStep(step: number) {
  if (current) set({ ...current, step });
}

/** Ends the tour; the demo stays open to explore. */
export function endTour() {
  set(null);
}

export function tourState() {
  return current;
}

export function useTour(): TourState | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => null,
  );
}

/** True while the candidate walkthrough runs: the candidate pages show still frames, not live timers. */
export function useCandidatePreview() {
  return useTour()?.id === 'candidate';
}
