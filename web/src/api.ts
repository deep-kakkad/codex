import { exitDemo, isDemo } from './demo/mode';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Signing in or up leaves the demo and talks to the real server.
const SIGN_IN = /^\/api\/(candidate\/)?auth\/(login|signup)$/;

/** In the demo, answers come from data kept in this tab; nothing reaches the server. */
async function demo<T>(method: string, url: string, body?: unknown): Promise<T> {
  const { handle } = await import('./demo/fakeApi');
  return (await handle(method, url, body)) as T;
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  if (isDemo()) {
    if (!SIGN_IN.test(url)) return demo<T>(method, url, body);
    exitDemo();
  }
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown = {}) => request<T>('POST', url, body),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
  async upload<T>(url: string, blob: Blob): Promise<T> {
    if (isDemo()) return demo<T>('POST', url);
    let res: Response;
    try {
      res = await fetch(url, { method: 'POST', headers: { 'Content-Type': blob.type || 'audio/webm' }, body: blob });
    } catch {
      throw new ApiError(0, 'Upload failed. Check your connection and try again.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
    return data as T;
  },
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}
