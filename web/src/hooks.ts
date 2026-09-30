import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from './api';

export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));

  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      setData(await api.get<T>(url));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { data, setData, error, loading, reload };
}

/** Ticks once a second; returns ms remaining until `deadline` in server time. */
export function useCountdown(deadline: number | null, clockOffset: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [deadline]);
  if (deadline === null) return null;
  return Math.max(0, deadline - (now + clockOffset));
}

export function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function formatClock(ms: number) {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDate(ts: number | null) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function formatMinutes(sec: number) {
  const minutes = sec / 60;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} min`;
}
