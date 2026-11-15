import { afterEach, describe, expect, it, vi } from 'vitest';
import { SyncAuthError, SyncRateLimitError, SyncUnavailableError, SyncValidationError } from '../../core/sync/errors';
import { createHttpSyncGateway } from './index';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function setup(respond: (url: string, init: RequestInit) => Response | Promise<Response>, timeoutMs?: number) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return respond(String(input), init ?? {});
  });
  const gateway = createHttpSyncGateway({ baseUrl: 'https://api.example.test/', fetch: fetchMock as typeof fetch, timeoutMs });
  return { gateway, calls, fetchMock };
}

afterEach(() => vi.useRealTimers());

describe('http sync gateway', () => {
  it('enrolls: POSTs code and name without an Authorization header, and maps the answer', async () => {
    const { gateway, calls } = setup(() => json(201, { device_id: 'd-1', token: 'tok' }));
    expect(await gateway.enroll({ code: 'ABC', name: 'Laptop' })).toEqual({ deviceId: 'd-1', token: 'tok' });
    expect(calls[0]!.url).toBe('https://api.example.test/api/devices/enroll/');
    expect(calls[0]!.init.method).toBe('POST');
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ code: 'ABC', name: 'Laptop' });
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('sends the device token only in the Authorization header', async () => {
    const { gateway, calls } = setup(() => json(200, { profiles: [], records: [] }));
    await gateway.push('secret-token', { profiles: [], records: [] });
    const [call] = calls;
    expect((call!.init.headers as Record<string, string>).Authorization).toBe('Device secret-token');
    expect(call!.url).not.toContain('secret-token');
    expect(String(call!.init.body)).not.toContain('secret-token');
    expect(call!.init.credentials).toBe('omit');
  });

  it('builds the pull query: since, cursor, profile and limit are encoded; empty ones are left out', async () => {
    const { gateway, calls } = setup(() => json(200, { profiles: [], records: [], has_more: false, next_cursor: null, next_since: null }));
    await gateway.pull('t', { since: '2026-06-01T10:00:00+00:00', limit: 500 });
    await gateway.pull('t', { cursor: 'abc_-', limit: 500 });
    await gateway.pull('t', {});
    expect(calls[0]!.url).toBe('https://api.example.test/api/sync/pull/?since=2026-06-01T10%3A00%3A00%2B00%3A00&limit=500');
    expect(calls[1]!.url).toBe('https://api.example.test/api/sync/pull/?cursor=abc_-&limit=500');
    expect(calls[2]!.url).toBe('https://api.example.test/api/sync/pull/');
    expect(calls[0]!.init.method).toBe('GET');
  });

  it('maps 400 to SyncValidationError with the server message', async () => {
    const { gateway } = setup(() => json(400, { detail: 'Invalid or expired enrollment code.' }));
    const error = await gateway.enroll({ code: 'x', name: 'n' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SyncValidationError);
    expect((error as Error).message).toBe('Invalid or expired enrollment code.');
  });

  it('reads the first field message of a DRF validation body', async () => {
    const { gateway } = setup(() => json(400, { records: [{ kind: ['"x" is not a valid choice.'] }] }));
    // An unexpected shape falls back to the generic message instead of throwing.
    await expect(gateway.push('t', { profiles: [], records: [] })).rejects.toMatchObject({
      name: 'SyncValidationError',
      message: 'The server rejected the request.',
    });
  });

  it('maps 401 to SyncAuthError', async () => {
    const { gateway } = setup(() => json(401, { detail: 'Invalid token.' }));
    await expect(gateway.pull('t', {})).rejects.toBeInstanceOf(SyncAuthError);
  });

  it('maps 429 to SyncRateLimitError and reads Retry-After', async () => {
    const { gateway } = setup(() => json(429, {}, { 'Retry-After': '30' }));
    const error = await gateway.enroll({ code: 'x', name: 'n' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SyncRateLimitError);
    expect((error as SyncRateLimitError).retryAfterMs).toBe(30_000);
  });

  it('maps 5xx and network failures to SyncUnavailableError, without leaking the token', async () => {
    const down = setup(() => json(503, {}));
    await expect(down.gateway.pull('secret-token', {})).rejects.toBeInstanceOf(SyncUnavailableError);

    const offline = setup(() => Promise.reject(new TypeError('Failed to fetch')));
    const error = await offline.gateway.pull('secret-token', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SyncUnavailableError);
    expect(String((error as Error).message)).not.toContain('secret-token');
  });

  it('never logs the token', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
    const { gateway } = setup(() => json(401, {}));
    await gateway.pull('secret-token', {}).catch(() => undefined);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    spies.forEach((s) => s.mockRestore());
  });

  it('times out with an AbortController and reports it as unavailable', async () => {
    vi.useFakeTimers();
    const { gateway } = setup(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
      1000,
    );
    const pending = gateway.pull('t', {}).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1001);
    const error = await pending;
    expect(error).toBeInstanceOf(SyncUnavailableError);
    expect((error as Error).message).toMatch(/too long/);
  });

  it('treats an unreadable success body as unavailable', async () => {
    const { gateway } = setup(() => new Response('<html>', { status: 200 }));
    await expect(gateway.pull('t', {})).rejects.toBeInstanceOf(SyncUnavailableError);
  });
});
