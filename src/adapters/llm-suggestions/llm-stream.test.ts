import { describe, expect, it, vi } from 'vitest';
import { FollowUpError } from '../../core/follow-up/errors';
import type { AiSettings, FollowUpContext } from '../../core/ports';
import type { PartialFollowUp } from '../../core/follow-up/partial';
import { createLlmFollowUpProvider } from './index';
import { createAiModelCatalog, pickDefaultModel } from './models';
import { createAiSettingsStore } from './settings-store';

const SETTINGS: AiSettings = {
  apiKey: 'sk-secret-key',
  model: 'gemini-3.8-flash',
  baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
  remember: false,
};

const CONTEXT: FollowUpContext = {
  accepted: { id: 'rec', title: 'Fixed lights-out', steps: ['Alarm'], rationale: 'Sleep fell' },
  zone: { id: 'brain', label: 'Brain', status: 'caution' },
  missionDay: 10,
  findings: [],
  readings: [],
};

const ANSWER = {
  title: 'Wind down earlier',
  blocks: [
    { type: 'rationale', text: 'A steady evening helps.' },
    { type: 'new_habit', name: 'Wind-down', frequency: 'Daily', timeOfDay: 'Evening', durationMinutes: 15 },
  ],
};
const ANSWER_TEXT = JSON.stringify(ANSWER);

const store = (over: Partial<AiSettings> = {}) => {
  const s = createAiSettingsStore({ session: new FakeStorage(), local: new FakeStorage() });
  s.set({ ...SETTINGS, ...over });
  return s;
};

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

const encoder = new TextEncoder();
const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;

/** An SSE response whose body arrives as the given raw chunks, optionally spaced out in time. */
function sse(chunks: string[], opts: { gapMs?: number; startDelayMs?: number; hangAfter?: boolean; status?: number } = {}) {
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (i >= chunks.length) {
        if (opts.hangAfter) return new Promise<void>(() => undefined);
        controller.close();
        return;
      }
      if (opts.startDelayMs && i === 0) await new Promise((r) => setTimeout(r, opts.startDelayMs));
      if (opts.gapMs && i > 0) await new Promise((r) => setTimeout(r, opts.gapMs));
      controller.enqueue(encoder.encode(chunks[i++]!));
    },
  });
  return new Response(body, { status: opts.status ?? 200, headers: { 'content-type': 'text/event-stream' } });
}

const text = (t: string, status: number) => new Response(t, { status });

describe('streaming', () => {
  it('sends stream:true and reasoning_effort low to Gemini only', async () => {
    const hosted = vi.fn().mockResolvedValue(sse([delta(ANSWER_TEXT), 'data: [DONE]\n\n']));
    await createLlmFollowUpProvider({ settings: store(), fetch: hosted }).suggest(CONTEXT);
    const body = JSON.parse((hosted.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.stream).toBe(true);
    expect(body.reasoning_effort).toBe('low');
    expect(body.response_format.type).toBe('json_schema');

    const local = vi.fn().mockResolvedValue(sse([delta(ANSWER_TEXT), 'data: [DONE]\n\n']));
    await createLlmFollowUpProvider({
      settings: store({ baseUrl: 'http://localhost:11434/v1/', model: 'llama3.2' }),
      fetch: local,
    }).suggest(CONTEXT);
    expect(JSON.parse((local.mock.calls[0]![1] as RequestInit).body as string)).not.toHaveProperty('reasoning_effort');
  });

  it('joins events and lines split across reads, stops at [DONE], and reports growing partials', async () => {
    const raw = [delta(ANSWER_TEXT.slice(0, 40)), delta(ANSWER_TEXT.slice(40, 110)), delta(ANSWER_TEXT.slice(110)), 'data: [DONE]\n\n'].join('');
    // Read boundaries fall in the middle of lines, not on event boundaries.
    const chunks = [raw.slice(0, 13), raw.slice(13, 90), raw.slice(90, 200), raw.slice(200)];
    const partials: PartialFollowUp[] = [];
    const out = await createLlmFollowUpProvider({
      settings: store(),
      fetch: vi.fn().mockResolvedValue(sse(chunks)),
    }).suggest(CONTEXT, { onPartial: (p) => partials.push(p) });
    expect(out).toEqual(ANSWER);
    // Blocks only ever appear whole, one more at a time.
    const counts = partials.map((p) => p.blocks.length);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
    expect(Math.max(...counts)).toBe(2);
    expect(partials.some((p) => p.blocks.length === 1)).toBe(true);
  });

  it('ignores text after [DONE] and accepts a stream that ends without it', async () => {
    const noDone = vi.fn().mockResolvedValue(sse([delta(ANSWER_TEXT)]));
    await expect(createLlmFollowUpProvider({ settings: store(), fetch: noDone }).suggest(CONTEXT)).resolves.toEqual(ANSWER);
  });

  it('turns an error payload in the middle of the stream into a readable error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      sse([delta('{"title":"x",'), `data: ${JSON.stringify({ error: { code: 429, message: 'RESOURCE_EXHAUSTED sk-secret-key' } })}\n\n`]),
    );
    const error = (await createLlmFollowUpProvider({ settings: store(), fetch: fetchMock })
      .suggest(CONTEXT)
      .catch((e: unknown) => e)) as FollowUpError;
    expect(error).toBeInstanceOf(FollowUpError);
    expect(error.message).toMatch(/quota/);
    expect(error.message).not.toContain('sk-secret-key');
  });

  it('rejects with a native AbortError when the caller aborts mid-stream', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([delta('{"title":"x"')], { hangAfter: true }));
    const controller = new AbortController();
    const onPartial = vi.fn(() => controller.abort());
    const pending = createLlmFollowUpProvider({ settings: store(), fetch: fetchMock }).suggest(CONTEXT, {
      signal: controller.signal,
      onPartial,
    });
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('times out on silence (idle) with a clear message', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([delta('{"title":"x"')], { hangAfter: true }));
    const error = (await createLlmFollowUpProvider({ settings: store(), fetch: fetchMock, idleTimeoutMs: 40 })
      .suggest(CONTEXT)
      .catch((e: unknown) => e)) as FollowUpError;
    expect(error.code).toBe('timeout');
    expect(error.message).toBe('The AI service stopped responding. Try again or pick a faster model.');
  });

  it('waits through a slow first byte, far longer than the idle limit', async () => {
    // Headers arrive at once, but the model "thinks" for 80 ms before the first chunk (idle limit is 30 ms).
    const fetchMock = vi.fn().mockResolvedValue(sse([delta(ANSWER_TEXT), 'data: [DONE]\n\n'], { startDelayMs: 80 }));
    const out = await createLlmFollowUpProvider({
      settings: store(),
      fetch: fetchMock,
      firstByteTimeoutMs: 400,
      idleTimeoutMs: 30,
    }).suggest(CONTEXT);
    expect(out).toEqual(ANSWER);
  });

  it('waits through slow response headers too (the server answers only when thinking ends)', async () => {
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => setTimeout(() => resolve(sse([delta(ANSWER_TEXT), 'data: [DONE]\n\n'])), 80)),
    );
    const out = await createLlmFollowUpProvider({
      settings: store(),
      fetch: fetchMock as unknown as typeof fetch,
      firstByteTimeoutMs: 400,
      idleTimeoutMs: 30,
    }).suggest(CONTEXT);
    expect(out).toEqual(ANSWER);
  });

  it('accepts a non-stream JSON body that arrives after a long wait, governed by first-byte, not idle', async () => {
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        await new Promise((r) => setTimeout(r, 80));
        controller.enqueue(encoder.encode(JSON.stringify({ choices: [{ message: { content: ANSWER_TEXT } }] })));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }));
    const out = await createLlmFollowUpProvider({
      settings: store(),
      fetch: fetchMock,
      firstByteTimeoutMs: 400,
      idleTimeoutMs: 30,
    }).suggest(CONTEXT);
    expect(out).toEqual(ANSWER);
  });

  it('fails with the first-byte message when nothing at all arrives in time', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sse([delta(ANSWER_TEXT)], { startDelayMs: 300 }));
    const error = (await createLlmFollowUpProvider({ settings: store(), fetch: fetchMock, firstByteTimeoutMs: 40, idleTimeoutMs: 1000 })
      .suggest(CONTEXT)
      .catch((e: unknown) => e)) as FollowUpError;
    expect(error.code).toBe('timeout');
    expect(error.message).toBe('The AI service is taking too long to start answering. Try again or pick a faster model.');
  });

  it('logs one key-free diagnostic line per request', async () => {
    const lines: string[] = [];
    await createLlmFollowUpProvider({
      settings: store(),
      fetch: vi.fn().mockResolvedValue(sse([delta(ANSWER_TEXT), 'data: [DONE]\n\n'])),
      debug: (l) => lines.push(l),
    }).suggest(CONTEXT);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^\[ai\] model=gemini-3\.8-flash host=generativelanguage\.googleapis\.com format=json_schema headers=\d+ms content-type=text\/event-stream first-chunk=\d+ms chunks=\d+ total=\d+ms finish=- outcome=ok$/);
    expect(lines[0]).not.toContain('sk-secret-key');
    expect(lines[0]).not.toContain('Wind down');
  });

  it('does NOT time out a steady slow stream, even when the whole answer takes longer than the idle limit', async () => {
    const pieces = ANSWER_TEXT.match(/.{1,12}/g)!.map(delta);
    const fetchMock = vi.fn().mockResolvedValue(sse([...pieces, 'data: [DONE]\n\n'], { gapMs: 15 }));
    const started = Date.now();
    const out = await createLlmFollowUpProvider({ settings: store(), fetch: fetchMock, idleTimeoutMs: 60 }).suggest(CONTEXT);
    expect(out).toEqual(ANSWER);
    expect(Date.now() - started).toBeGreaterThan(60);
  });

  it('still caps the total time of a stream that never finishes', async () => {
    const pieces = Array.from({ length: 40 }, () => delta(' '));
    const fetchMock = vi.fn().mockResolvedValue(sse(pieces, { gapMs: 10 }));
    const error = (await createLlmFollowUpProvider({
      settings: store(),
      fetch: fetchMock,
      idleTimeoutMs: 100,
      maxTotalMs: 80,
    })
      .suggest(CONTEXT)
      .catch((e: unknown) => e)) as FollowUpError;
    expect(error.code).toBe('timeout');
    expect(error.message).toMatch(/too long/);
  });

  it('says so when the answer was cut off, and when the stream is not JSON', async () => {
    const cut = sse([delta(ANSWER_TEXT.slice(0, 50)), `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'length' }] })}\n\n`]);
    await expect(createLlmFollowUpProvider({ settings: store(), fetch: vi.fn().mockResolvedValue(cut) }).suggest(CONTEXT)).rejects.toThrow(/cut off/);
    const junk = sse([delta('hello there')]);
    await expect(createLlmFollowUpProvider({ settings: store(), fetch: vi.fn().mockResolvedValue(junk) }).suggest(CONTEXT)).rejects.toMatchObject({ code: 'invalid' });
  });
});

describe('error messages', () => {
  const cases: Array<[string, Response, RegExp]> = [
    ['401', text('x', 401), /rejected this API key/],
    ['403', text('x', 403), /rejected this API key/],
    ['400 with api key detail', text(JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }), 400), /rejected this API key/],
    ['429', text('x', 429), /quota/],
    ['503', text('x', 503), /temporarily unavailable/],
    ['404', text('x', 404), /could not find model "gemini-3.8-flash"/],
  ];
  for (const [name, response, pattern] of cases) {
    it(`maps ${name} and never leaks the key`, async () => {
      const fetchMock = vi.fn().mockResolvedValue(response);
      const error = (await createLlmFollowUpProvider({ settings: store(), fetch: fetchMock })
        .suggest(CONTEXT)
        .catch((e: unknown) => e)) as FollowUpError;
      expect(error.message).toMatch(pattern);
      expect(error.message).not.toContain('sk-secret-key');
    });
  }

  it('does not retry another response format when the key itself is rejected', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(text(JSON.stringify({ error: { message: 'API key not valid' } }), 400));
    await createLlmFollowUpProvider({ settings: store(), fetch: fetchMock }).suggest(CONTEXT).catch(() => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('model catalog', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('lists text models, strips the models/ prefix and sends the key as a bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        object: 'list',
        data: [
          { id: 'models/gemini-3.8-flash' },
          { id: 'models/gemini-3.5-flash-lite' },
          { id: 'models/text-embedding-004' },
          { id: 'models/gemini-embedding-001' },
          { id: 'models/imagen-4' },
        ],
      }),
    );
    const ids = await createAiModelCatalog({ fetch: fetchMock }).listModels({ apiKey: 'sk-secret-key', baseUrl: SETTINGS.baseUrl });
    expect(ids).toEqual(['gemini-3.8-flash', 'gemini-3.5-flash-lite']);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/openai/models');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-secret-key');
  });

  it('keeps every model of a non-Gemini server', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ data: [{ id: 'llama3.2' }, { id: 'qwen3' }] }));
    await expect(
      createAiModelCatalog({ fetch: fetchMock }).listModels({ apiKey: 'k', baseUrl: 'http://localhost:11434/v1' }),
    ).resolves.toEqual(['llama3.2', 'qwen3']);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:11434/v1/models');
  });

  it('maps failures to readable errors', async () => {
    const catalog = (res: () => Promise<Response>) => createAiModelCatalog({ fetch: vi.fn(res) });
    await expect(catalog(() => Promise.resolve(json({}, 401))).listModels({ apiKey: 'k', baseUrl: SETTINGS.baseUrl })).rejects.toThrow(/rejected this API key/);
    await expect(catalog(() => Promise.resolve(json({}, 503))).listModels({ apiKey: 'k', baseUrl: SETTINGS.baseUrl })).rejects.toThrow(/temporarily unavailable/);
    await expect(catalog(() => Promise.reject(new TypeError('Failed to fetch'))).listModels({ apiKey: 'k', baseUrl: SETTINGS.baseUrl })).rejects.toThrow(/could not be reached/);
  });
});

describe('pickDefaultModel', () => {
  it('takes the newest stable flash that is not lite', () => {
    expect(pickDefaultModel(['gemini-2.5-pro', 'gemini-3.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.8-flash-preview', 'gemini-2.5-flash'])).toBe('gemini-3.8-flash');
  });
  it('prefers a stable release over a preview of the same version', () => {
    expect(pickDefaultModel(['gemini-4-flash-preview', 'gemini-4-flash'])).toBe('gemini-4-flash');
  });
  it('skips image, tts and live variants', () => {
    expect(pickDefaultModel(['gemini-4-flash-image', 'gemini-4-flash-live', 'gemini-3-flash'])).toBe('gemini-3-flash');
  });
  it('falls back to the first model when there is no flash, and to null when empty', () => {
    expect(pickDefaultModel(['llama3.2', 'qwen3'])).toBe('llama3.2');
    expect(pickDefaultModel([])).toBeNull();
  });
});
