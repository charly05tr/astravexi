import type { SyncGateway } from '../../core/ports';
import { SyncAuthError, SyncRateLimitError, SyncUnavailableError, SyncValidationError } from '../../core/sync/errors';
import type { PullQuery, PullResponse, PushRequest, PushResponse } from '../../core/sync/model';

export interface HttpSyncGatewayOptions {
  /** Base URL of the API, no trailing slash. */
  baseUrl: string;
  /** Per-request timeout. Defaults to 15 s. */
  timeoutMs?: number;
  /** Injected in tests. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 15_000;

/** A short, user-presentable message from a DRF 400 body (`{detail}` or `{field: [msg]}`), or the fallback. */
function validationMessage(body: unknown, fallback: string): string {
  if (typeof body !== 'object' || body === null) return fallback;
  const record = body as Record<string, unknown>;
  if (typeof record.detail === 'string') return record.detail;
  for (const value of Object.values(record)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === 'string') return first;
  }
  return fallback;
}

function retryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

/**
 * The HTTP adapter of the backend API. Every request has a timeout (AbortController). HTTP failures become typed
 * errors: 400 -> SyncValidationError, 401 -> SyncAuthError, 429 -> SyncRateLimitError, anything else
 * (network, timeout, 5xx) -> SyncUnavailableError. The token travels only in the Authorization header and is
 * never logged, put in a URL, or included in an error message.
 */
export function createHttpSyncGateway(options: HttpSyncGatewayOptions): SyncGateway {
  const base = options.baseUrl.replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function request<T>(path: string, init: { method: 'GET' | 'POST'; token?: string; body?: unknown }): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method: init.method,
        headers: {
          Accept: 'application/json',
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(init.token ? { Authorization: `Device ${init.token}` } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        signal: controller.signal,
        credentials: 'omit',
        cache: 'no-store',
      });
    } catch {
      // Abort (timeout) and network failure look the same to the caller: retry later.
      throw new SyncUnavailableError(
        controller.signal.aborted ? 'The server took too long to answer.' : 'The server could not be reached.',
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.status === 401) throw new SyncAuthError();
    if (response.status === 429) throw new SyncRateLimitError(retryAfterMs(response.headers.get('Retry-After')));
    if (response.status === 400) {
      const body: unknown = await response.json().catch(() => null);
      throw new SyncValidationError(validationMessage(body, 'The server rejected the request.'));
    }
    if (!response.ok) throw new SyncUnavailableError(`The server answered with an error (${response.status}).`);
    try {
      return (await response.json()) as T;
    } catch {
      throw new SyncUnavailableError('The server sent an unreadable answer.');
    }
  }

  return {
    async enroll({ code, name }) {
      const res = await request<{ device_id: string; token: string }>('/api/devices/enroll/', {
        method: 'POST',
        body: { code, name },
      });
      if (typeof res?.device_id !== 'string' || typeof res.token !== 'string') {
        throw new SyncUnavailableError('The server sent an unexpected enrollment answer.');
      }
      return { deviceId: res.device_id, token: res.token };
    },
    push: (token, body: PushRequest) => request<PushResponse>('/api/sync/push/', { method: 'POST', token, body }),
    pull(token, query: PullQuery) {
      const params = new URLSearchParams();
      if (query.since) params.set('since', query.since);
      if (query.cursor) params.set('cursor', query.cursor);
      if (query.profile) params.set('profile', query.profile);
      if (query.limit) params.set('limit', String(query.limit));
      const qs = params.toString();
      return request<PullResponse>(`/api/sync/pull/${qs ? `?${qs}` : ''}`, { method: 'GET', token });
    },
  };
}
