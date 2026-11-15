import { describe, expect, it, vi } from 'vitest';
import { FollowUpError } from '../../core/follow-up/errors';
import type { AiSettings, FollowUpContext } from '../../core/ports';
import { createLlmFollowUpProvider } from './index';
import { createAiSettingsStore } from './settings-store';

class FakeStorage implements Storage {
  private data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  clear = () => this.data.clear();
  getItem = (k: string) => this.data.get(k) ?? null;
  key = (i: number) => [...this.data.keys()][i] ?? null;
  removeItem = (k: string) => void this.data.delete(k);
  setItem = (k: string, v: string) => void this.data.set(k, v);
}

const SETTINGS: AiSettings = {
  apiKey: 'sk-secret-key',
  model: 'gemini-3.8-flash',
  baseUrl: 'https://example.test/v1/',
  remember: false,
};

const CONTEXT: FollowUpContext = {
  accepted: { id: 'rec-sleep', title: 'Keep a fixed lights-out time', steps: ['Set an alarm'], rationale: 'Sleep: down 1.5 h' },
  zone: { id: 'brain', label: 'Brain', status: 'caution' },
  missionDay: 150,
  findings: [{ indicatorLabel: 'Sleep', tier: 'caution', whatChanged: 'Sleep fell by 1.5 h.' }],
  readings: [{ indicator: 'Sleep', unit: 'h', value: 5.5, day: 150, context: 'rest' }],
};

const GOOD = { title: 'Wind down earlier', blocks: [{ type: 'rationale', text: 'A steady evening helps.' }] };

function reply(content: unknown, init: ResponseInit = {}) {
  const body = { choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }] };
  return new Response(JSON.stringify(body), { status: 200, ...init });
}

function makeStore(settings: AiSettings = SETTINGS) {
  const store = createAiSettingsStore({ session: new FakeStorage(), local: new FakeStorage() });
  store.set(settings);
  return store;
}

describe('createLlmFollowUpProvider', () => {
  it('posts a chat completion with a bearer key and a json_schema response format, then parses the answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(GOOD));
    const provider = createLlmFollowUpProvider({ settings: makeStore(), fetch: fetchMock });
    const out = await provider.suggest(CONTEXT);
    expect(out).toEqual(GOOD);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.test/v1/chat/completions');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-secret-key');
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('gemini-3.8-flash');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.schema.properties.blocks).toBeDefined();
    expect(body.messages[0].role).toBe('system');
    expect(JSON.parse(body.messages[1].content)).toEqual(CONTEXT);
    expect(init.body).not.toContain('sk-secret-key');
  });

  it('adds a missing trailing slash to the base URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply(GOOD));
    const provider = createLlmFollowUpProvider({
      settings: makeStore({ ...SETTINGS, baseUrl: 'http://localhost:11434/v1' }),
      fetch: fetchMock,
    });
    await provider.suggest(CONTEXT);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('retries once with json_object when the server rejects json_schema', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 400 }))
      .mockResolvedValueOnce(reply(GOOD));
    const provider = createLlmFollowUpProvider({ settings: makeStore(), fetch: fetchMock });
    await expect(provider.suggest(CONTEXT)).resolves.toEqual(GOOD);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse((fetchMock.mock.calls[1]![1] as RequestInit).body as string).response_format).toEqual({
      type: 'json_object',
    });
  });

  it('accepts JSON wrapped in a code fence', async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply('```json\n' + JSON.stringify(GOOD) + '\n```'));
    const provider = createLlmFollowUpProvider({ settings: makeStore(), fetch: fetchMock });
    await expect(provider.suggest(CONTEXT)).resolves.toEqual(GOOD);
  });

  it('does not call the network without a key', async () => {
    const fetchMock = vi.fn();
    const provider = createLlmFollowUpProvider({ settings: makeStore({ ...SETTINGS, apiKey: '' }), fetch: fetchMock });
    expect(provider.isConfigured()).toBe(false);
    await expect(provider.suggest(CONTEXT)).rejects.toMatchObject({ code: 'not-configured' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps failures to typed errors that never contain the key', async () => {
    const cases: Array<[string, () => Promise<Response>, string]> = [
      ['http', () => Promise.resolve(new Response('boom sk-secret-key', { status: 500 })), 'http'],
      ['rejected key', () => Promise.resolve(new Response('no', { status: 401 })), 'http'],
      ['model not found', () => Promise.resolve(new Response('no', { status: 404 })), 'http'],
      ['network', () => Promise.reject(new TypeError('Failed to fetch')), 'network'],
      ['not json', () => Promise.resolve(reply('hello there')), 'invalid'],
      ['wrong shape', () => Promise.resolve(reply({ title: 'x', blocks: [{ type: 'html' }] })), 'invalid'],
      ['no content', () => Promise.resolve(new Response('{"choices":[]}', { status: 200 })), 'invalid'],
    ];
    for (const [name, respond, code] of cases) {
      const provider = createLlmFollowUpProvider({ settings: makeStore(), fetch: vi.fn(respond) });
      const error = await provider.suggest(CONTEXT).catch((e: unknown) => e);
      expect(error, name).toBeInstanceOf(FollowUpError);
      expect((error as FollowUpError).code, name).toBe(code);
      expect((error as FollowUpError).message, name).not.toContain('sk-secret-key');
    }
  });

  it('explains a 404 as a wrong model or base URL, without the key', async () => {
    const provider = createLlmFollowUpProvider({
      settings: makeStore(),
      fetch: vi.fn().mockResolvedValue(new Response('no sk-secret-key', { status: 404 })),
    });
    const error = (await provider.suggest(CONTEXT).catch((e: unknown) => e)) as FollowUpError;
    expect(error.message).toBe(
      'The AI service could not find model "gemini-3.8-flash" (or the base URL is wrong). Pick another model in AI assistant settings.',
    );
    expect(error.message).not.toContain('sk-secret-key');
  });

  it('times out a request that never gets a first byte', async () => {
    const hang = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const provider = createLlmFollowUpProvider({
      settings: makeStore(),
      fetch: hang as unknown as typeof fetch,
      firstByteTimeoutMs: 20,
    });
    await expect(provider.suggest(CONTEXT)).rejects.toMatchObject({ code: 'timeout' });
  });

  it('aborts when the caller aborts, including before the call starts', async () => {
    const hang = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          if (init.signal?.aborted) reject(new DOMException('aborted', 'AbortError'));
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const provider = createLlmFollowUpProvider({ settings: makeStore(), fetch: hang as unknown as typeof fetch });

    const controller = new AbortController();
    const pending = provider.suggest(CONTEXT, { signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });

    const already = new AbortController();
    already.abort();
    await expect(provider.suggest(CONTEXT, { signal: already.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('createAiSettingsStore', () => {
  const KEY = 'astravexi.ai-assistant';

  it('starts unconfigured with the Gemini defaults', () => {
    const store = createAiSettingsStore({ session: new FakeStorage(), local: new FakeStorage() });
    expect(store.isConfigured()).toBe(false);
    expect(store.get().baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta/openai/');
    expect(store.presets.models).toContain('gemini-3.8-flash');
  });

  it('migrates a saved former preset to the new default, but keeps a custom model', () => {
    for (const old of ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.5-pro']) {
      const session = new FakeStorage();
      session.setItem(KEY, JSON.stringify({ apiKey: 'k', model: old, baseUrl: 'https://x.test/' }));
      const store = createAiSettingsStore({ session, local: new FakeStorage() });
      expect(store.get()).toMatchObject({ apiKey: 'k', model: 'gemini-3.8-flash', baseUrl: 'https://x.test/' });
    }
    const custom = new FakeStorage();
    custom.setItem(KEY, JSON.stringify({ apiKey: 'k', model: 'llama3.2', baseUrl: 'http://localhost:11434/v1/' }));
    expect(createAiSettingsStore({ session: custom, local: new FakeStorage() }).get().model).toBe('llama3.2');
  });

  it('keeps the key in sessionStorage by default and never in localStorage', () => {
    const session = new FakeStorage();
    const local = new FakeStorage();
    const store = createAiSettingsStore({ session, local });
    store.set(SETTINGS);
    expect(session.getItem(KEY)).toContain('sk-secret-key');
    expect(local.getItem(KEY)).toBeNull();
    // A reload in the same tab restores it.
    expect(createAiSettingsStore({ session, local }).get().apiKey).toBe('sk-secret-key');
  });

  it('uses localStorage only when remember is on, and moves the key out of sessionStorage', () => {
    const session = new FakeStorage();
    const local = new FakeStorage();
    const store = createAiSettingsStore({ session, local });
    store.set({ ...SETTINGS, remember: true });
    expect(local.getItem(KEY)).toContain('sk-secret-key');
    expect(session.getItem(KEY)).toBeNull();
    const reloaded = createAiSettingsStore({ session: new FakeStorage(), local });
    expect(reloaded.get()).toMatchObject({ apiKey: 'sk-secret-key', remember: true });
  });

  it('forgets everything on clear, notifies listeners and survives a throwing storage', () => {
    const session = new FakeStorage();
    const local = new FakeStorage();
    const store = createAiSettingsStore({ session, local });
    const listener = vi.fn();
    store.subscribe(listener);
    store.set({ ...SETTINGS, remember: true });
    store.clear();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.isConfigured()).toBe(false);
    expect(local.getItem(KEY)).toBeNull();
    expect(session.getItem(KEY)).toBeNull();

    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const resilient = createAiSettingsStore({ session: broken, local: broken });
    resilient.set(SETTINGS);
    expect(resilient.isConfigured()).toBe(true); // memory copy still works
    expect(() => resilient.clear()).not.toThrow();
  });
});
