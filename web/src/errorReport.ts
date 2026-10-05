/**
 * Sends crashes in people's browsers to the error log in the admin console.
 * A few per page view at most, each message once.
 */
const MAX_REPORTS = 5;
const sent = new Set<string>();

function report(message: string, stack?: string) {
  if (sent.size >= MAX_REPORTS || sent.has(message)) return;
  sent.add(message);
  void fetch('/api/client-errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: message.slice(0, 2000), stack: stack?.slice(0, 8000), path: location.pathname }),
    keepalive: true,
  }).catch(() => undefined);
}

export function reportBrowserErrors() {
  window.addEventListener('error', (event) => {
    // Failed scripts or images show up here with no message; they aren't app crashes.
    if (!event.message) return;
    report(event.message, event.error instanceof Error ? event.error.stack : undefined);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    report(
      reason instanceof Error ? reason.message : String(reason),
      reason instanceof Error ? reason.stack : undefined,
    );
  });
}
