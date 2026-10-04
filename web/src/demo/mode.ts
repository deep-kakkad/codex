import { useSyncExternalStore } from 'react';

/**
 * The static demo runs entirely in this browser tab: every API call is
 * answered from pre-written data, so it costs nothing and stores nothing.
 */
const KEY = 'proofwork-demo';
export const DEMO_STATE_KEY = 'proofwork-demo-state';
/** The invite token of the candidate demo: /c/demo. */
export const DEMO_TOKEN = 'demo';
/** A finished, reviewed candidate to show after the candidate demo. */
export const DEMO_SAMPLE_CANDIDATE = '890e6891-eeaa-485c-8031-3e4cb1b79767';
/** The sample assessment the recruiter tour walks through, and its second finished candidate. */
export const DEMO_ASSESSMENT = '72abe972-402f-4f90-bafa-7efc59f8cd46';
export const DEMO_SECOND_CANDIDATE = '2adb54d8-9f89-40b2-bc30-4cec38ac7198';

const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

let current = read();
// Changes each time the demo starts or ends, so cached demo data is dropped.
let epoch = 0;

export function isDemo() {
  return current;
}

export function demoEpoch() {
  return epoch;
}

function set(on: boolean) {
  try {
    if (on) sessionStorage.setItem(KEY, '1');
    else {
      sessionStorage.removeItem(KEY);
      sessionStorage.removeItem(DEMO_STATE_KEY);
    }
  } catch {
    // Without storage the demo still works for this page view.
  }
  current = on;
  epoch += 1;
  for (const listener of listeners) listener();
}

/** Starts a fresh demo: earlier demo changes in this tab are discarded. */
export function enterDemo() {
  try {
    sessionStorage.removeItem(DEMO_STATE_KEY);
  } catch {
    // Ignore: the state simply starts fresh in memory.
  }
  set(true);
}

export function exitDemo() {
  set(false);
}

export function useDemo() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => false,
  );
}
