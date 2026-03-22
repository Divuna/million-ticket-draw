/**
 * OneMil lightweight production monitoring — structured console logs only (no new tables).
 * Parse logs in Vercel / browser devtools / log drains via JSON `event` field.
 */

export const MONITORING_VERSION = '1';

const SOURCE = 'onemil_web';

/** Rolling window for ticket purchase abuse signal (client-side hint only). */
const TICKET_ABUSE_WINDOW_MS = 60_000;
/** Log a warning if this many buy_ticket attempts occur within the window for one user. */
const TICKET_ABUSE_WARN_THRESHOLD = 12;

const STORAGE_KEY = 'onemil_ticket_attempt_ts';

export type MonitoringLevel = 'debug' | 'info' | 'warn' | 'error';

export type MonitoringPayload = {
  ts: string;
  source: string;
  v: string;
  level: MonitoringLevel;
  event: string;
  user_id?: string | null;
  action?: string;
  /** Extra fields — keep PII-free (no emails, card data, full JWT). */
  [key: string]: unknown;
};

function nowIso(): string {
  return new Date().toISOString();
}

/** Single-line JSON for grep / log platforms. */
export function logMonitoringEvent(
  level: MonitoringLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const payload: MonitoringPayload = {
    ts: nowIso(),
    source: SOURCE,
    v: MONITORING_VERSION,
    level,
    event,
    ...fields,
  };
  const line = JSON.stringify(payload);
  switch (level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'debug':
      if (import.meta.env.DEV) console.debug(line);
      break;
    default:
      console.log(line);
  }
}

export function safeErrorMessage(err: unknown, maxLen = 500): string {
  if (err == null) return 'unknown_error';
  if (typeof err === 'string') return err.slice(0, maxLen);
  if (err instanceof Error) return (err.message || err.name || 'Error').slice(0, maxLen);
  try {
    return JSON.stringify(err).slice(0, maxLen);
  } catch {
    return 'unserializable_error';
  }
}

/** Supabase PostgREST / RPC failure (HTTP layer). */
export function logRpcHttpFailure(params: {
  userId?: string | null;
  operation: string;
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
}): void {
  logMonitoringEvent('warn', 'rpc_http_error', {
    user_id: params.userId ?? null,
    action: params.operation,
    message: params.message,
    code: params.code,
    details: params.details,
    hint: params.hint,
  });
}

/** buy_ticket_atomic returned success: false or logical error string. */
export function logTicketPurchaseRejected(params: {
  userId: string;
  contestId: string;
  errorCode: string;
}): void {
  logMonitoringEvent('warn', 'ticket_purchase_rejected', {
    user_id: params.userId,
    action: 'buy_ticket_atomic',
    contest_id: params.contestId,
    error_code: params.errorCode,
  });
}

export function logTicketPurchaseSuccess(params: {
  userId: string;
  contestId: string;
  ticketNumber?: number;
}): void {
  logMonitoringEvent('info', 'ticket_purchase_success', {
    user_id: params.userId,
    action: 'buy_ticket_atomic',
    contest_id: params.contestId,
    ticket_number: params.ticketNumber,
  });
}

export function logTicketPurchaseException(params: {
  userId: string;
  contestId: string;
  error: unknown;
}): void {
  logMonitoringEvent('error', 'ticket_purchase_exception', {
    user_id: params.userId,
    action: 'buy_ticket_atomic',
    contest_id: params.contestId,
    message: safeErrorMessage(params.error),
  });
}

/** Stripe checkout edge function failures from the browser. */
export function logStripeCheckoutClientFailure(params: {
  userId: string;
  priceInCzk?: number;
  error: unknown;
  phase: 'invoke' | 'response' | 'redirect';
}): void {
  logMonitoringEvent('error', 'stripe_checkout_client_error', {
    user_id: params.userId,
    action: 'create_stripe_checkout',
    phase: params.phase,
    price_czk: params.priceInCzk,
    message: safeErrorMessage(params.error),
  });
}

function readTicketAttemptMap(): Record<string, number[]> {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number[]>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeTicketAttemptMap(map: Record<string, number[]>): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

/**
 * Call immediately before each buy_ticket_atomic RPC.
 * Emits abuse_signal_ticket_burst when attempts exceed threshold in the rolling window.
 */
export function recordTicketPurchaseAttemptForAbuseCheck(userId: string): void {
  const t = Date.now();
  const map = readTicketAttemptMap();
  const prev = (map[userId] ?? []).filter((x) => t - x < TICKET_ABUSE_WINDOW_MS);
  prev.push(t);
  map[userId] = prev;
  writeTicketAttemptMap(map);

  if (prev.length >= TICKET_ABUSE_WARN_THRESHOLD) {
    logMonitoringEvent('warn', 'abuse_signal_ticket_burst', {
      user_id: userId,
      action: 'buy_ticket_atomic',
      window_ms: TICKET_ABUSE_WINDOW_MS,
      attempt_count: prev.length,
      threshold: TICKET_ABUSE_WARN_THRESHOLD,
      note: 'High frequency of ticket purchase attempts from this browser session',
    });
  }
}

function pathForLog(fullUrl: string, baseUrl: string): string {
  try {
    const u = new URL(fullUrl);
    const b = new URL(baseUrl);
    if (u.origin !== b.origin) return '(external)';
    let p = u.pathname;
    if (p.includes('/rpc/')) {
      const m = p.match(/\/rpc\/([^/?]+)/);
      return m ? `/rpc/${m[1]}` : p;
    }
    return p.length > 120 ? `${p.slice(0, 117)}...` : p;
  } catch {
    return '(unparsed_url)';
  }
}

/**
 * Wrap fetch for Supabase client: log failed REST/RPC HTTP responses and network errors.
 * Does not read or log request bodies.
 */
export function createMonitoredFetch(supabaseUrl: string): typeof fetch {
  const bound = fetch.bind(globalThis);
  const base = supabaseUrl.replace(/\/$/, '');

  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let urlStr = '';
    try {
      urlStr =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : (input as Request).url;
    } catch {
      urlStr = '';
    }

    const isOurs = urlStr.startsWith(base);
    const method = (init?.method ?? 'GET').toUpperCase();
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;

    try {
      const res = await bound(input, init);
      if (isOurs && !res.ok) {
        const ms =
          typeof performance !== 'undefined' ? Math.round(performance.now() - t0) : undefined;
        const path = pathForLog(urlStr, base);
        const event =
          path.includes('/rpc/') || urlStr.includes('/rpc/')
            ? 'supabase_rpc_http_error'
            : 'supabase_api_http_error';
        logMonitoringEvent(res.status >= 500 ? 'error' : 'warn', event, {
          action: 'supabase_fetch',
          path,
          method,
          http_status: res.status,
          duration_ms: ms,
        });
      }
      return res;
    } catch (err) {
      if (isOurs) {
        logMonitoringEvent('error', 'supabase_network_error', {
          action: 'supabase_fetch',
          path: pathForLog(urlStr, base),
          method,
          message: safeErrorMessage(err),
        });
      }
      throw err;
    }
  };
}
