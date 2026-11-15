import { FollowUpError } from '../../core/follow-up/errors';
import { followUpJsonSchema, parseFollowUp } from '../../core/follow-up/blocks';
import type { FollowUpSuggestion } from '../../core/follow-up/blocks';
import { partialFollowUp } from '../../core/follow-up/partial';
import type { PartialFollowUp } from '../../core/follow-up/partial';
import type { AiSettingsStore, FollowUpContext, FollowUpSuggestionProvider } from '../../core/ports';
import { GEMINI_REASONING_EFFORT, isGeminiBaseUrl } from './config';
import { buildMessages } from './prompt';
import { FIRST_BYTE_MESSAGE, IDLE_MESSAGE, errorDetail, httpError, isKeyRejected, readErrorDetail, messageForStatus } from './status';

/**
 * From sending the request until the first body chunk (or the whole JSON body): a thinking model can stay
 * silent for a long time before it says anything, and some servers send no headers until it is done.
 */
export const FIRST_BYTE_TIMEOUT_MS = 90_000;
/** Silence BETWEEN chunks once the stream has started: the service stalled mid-answer. */
export const IDLE_TIMEOUT_MS = 30_000;
/** Upper bound for the whole request, however steady the stream. */
export const MAX_TOTAL_MS = 180_000;

export interface LlmProviderOptions {
  settings: AiSettingsStore;
  /** Defaults to the global fetch. Tests inject a fake. */
  fetch?: typeof fetch;
  firstByteTimeoutMs?: number;
  idleTimeoutMs?: number;
  maxTotalMs?: number;
  /** Receives one diagnostic line per request. Defaults to console.debug in dev builds only. Never gets the key or any content. */
  debug?: (line: string) => void;
}

const endpoint = (baseUrl: string) => `${baseUrl.trim().replace(/\/+$/, '')}/chat/completions`;

/** Models sometimes wrap JSON in a code fence even when told not to. */
function unfence(content: string): string {
  const match = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(content);
  return match ? match[1]! : content;
}

function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl.trim()).host;
  } catch {
    return 'invalid-url';
  }
}

const abortError = () => new DOMException('The request was cancelled.', 'AbortError');

interface Chunk {
  choices?: Array<{ delta?: { content?: unknown }; message?: { content?: unknown }; finish_reason?: unknown }>;
  error?: unknown;
}

/**
 * Follow-up suggestions from any OpenAI-compatible Chat Completions server (Gemini's compatible endpoint by
 * default, or a local Ollama/llama.cpp). Plain fetch, no SDK. The answer streams over SSE so the UI can show
 * finished blocks early, and so a slow model is judged by silence (idle timeout), not by total time. It asks
 * for a JSON schema response and retries once with `json_object` if the server rejects that format.
 */
export function createLlmFollowUpProvider(options: LlmProviderOptions): FollowUpSuggestionProvider {
  const { settings } = options;
  const firstByteMs = options.firstByteTimeoutMs ?? FIRST_BYTE_TIMEOUT_MS;
  const idleMs = options.idleTimeoutMs ?? IDLE_TIMEOUT_MS;
  const totalMs = options.maxTotalMs ?? MAX_TOTAL_MS;
  const debug =
    options.debug ?? (import.meta.env.DEV && import.meta.env.MODE !== 'test' ? (line: string) => console.debug(line) : undefined);
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function suggest(
    context: FollowUpContext,
    call?: { signal?: AbortSignal; onPartial?: (partial: PartialFollowUp) => void },
  ): Promise<FollowUpSuggestion> {
    if (!settings.isConfigured()) throw new FollowUpError('not-configured', 'The AI assistant is not configured.');
    if (call?.signal?.aborted) throw abortError();
    const { apiKey, baseUrl } = settings.get();
    const model = settings.get().model.trim();
    const messages = buildMessages(context);

    const controller = new AbortController();
    let stopped: 'first' | 'idle' | 'total' | null = null;
    let phaseTimer: ReturnType<typeof setTimeout> | undefined;
    // One timer at a time: "first" until the first body chunk arrives, then "idle" between chunks.
    const arm = (phase: 'first' | 'idle') => {
      clearTimeout(phaseTimer);
      phaseTimer = setTimeout(() => {
        stopped = phase;
        controller.abort();
      }, phase === 'first' ? firstByteMs : idleMs);
    };
    const t0 = Date.now();
    const diag = { format: 'json_schema', headersMs: -1, contentType: '', firstChunkMs: -1, chunks: 0, finish: '-', outcome: 'ok' };
    const totalTimer = setTimeout(() => {
      stopped = 'total';
      controller.abort();
    }, totalMs);
    const onAbort = () => controller.abort();
    call?.signal?.addEventListener('abort', onAbort);
    // Rejects when anything aborts, so a read on a stream that never yields cannot hang.
    const aborted = new Promise<never>((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(abortError()));
    });
    aborted.catch(() => undefined);

    const post = (responseFormat: Record<string, unknown>): Promise<Response> =>
      doFetch(endpoint(baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey.trim()}` },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.4,
          stream: true,
          response_format: responseFormat,
          ...(isGeminiBaseUrl(baseUrl) ? { reasoning_effort: GEMINI_REASONING_EFFORT } : {}),
        }),
        signal: controller.signal,
      });

    try {
      arm('first');
      let res = await post({
        type: 'json_schema',
        json_schema: { name: 'follow_up_suggestion', strict: true, schema: followUpJsonSchema() },
      });
      if (res.status === 400 || res.status === 422) {
        const detail = await readErrorDetail(res);
        // A rejected key will not get better with another format.
        if (isKeyRejected(res.status, detail)) throw httpError(res.status, detail, model);
        arm('first');
        diag.format = 'json_object';
        res = await post({ type: 'json_object' });
      }
      diag.headersMs = Date.now() - t0;
      diag.contentType = res.headers.get('content-type') ?? '-';
      // Headers are not the answer yet: the "first" timer keeps running until a body chunk arrives.
      if (!res.ok) throw httpError(res.status, await readErrorDetail(res), model);

      let output = '';
      let finishReason: unknown;
      const take = (chunk: Chunk) => {
        const first = (Array.isArray(chunk) ? (chunk[0] as Chunk | undefined) : chunk) ?? {};
        if (first.error) {
          const err = first.error as { code?: unknown; message?: unknown };
          throw new FollowUpError(
            'http',
            messageForStatus(typeof err.code === 'number' ? err.code : 500, errorDetail(first), model),
          );
        }
        const choice = first.choices?.[0];
        if (choice?.finish_reason) finishReason = diag.finish = String(choice.finish_reason);
        const piece = choice?.delta?.content ?? choice?.message?.content;
        if (typeof piece === 'string') output += piece;
      };

      if (!res.headers.get('content-type')?.includes('text/event-stream') || !res.body) {
        // A server that ignored `stream: true` answers with one JSON body.
        const body = (await Promise.race([res.json(), aborted])) as Chunk;
        diag.chunks = 1;
        diag.firstChunkMs = Date.now() - t0;
        take(body);
        if (call?.onPartial) call.onPartial(partialFollowUp(output));
      } else {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let done = false;
        const handleLine = (line: string) => {
          if (!line.startsWith('data:')) return;
          const payload = line.slice(5).trim();
          if (!payload) return;
          if (payload === '[DONE]') {
            done = true;
            return;
          }
          let chunk: Chunk;
          try {
            chunk = JSON.parse(payload) as Chunk;
          } catch {
            throw new FollowUpError('invalid', 'The AI answer was not valid.');
          }
          take(chunk);
          call?.onPartial?.(partialFollowUp(output));
        };
        try {
          while (!done) {
            const { done: finished, value } = await Promise.race([reader.read(), aborted]);
            if (diag.chunks === 0 && !finished) diag.firstChunkMs = Date.now() - t0;
            if (!finished) diag.chunks += 1;
            arm('idle');
            if (finished) break;
            buffer += decoder.decode(value, { stream: true });
            // A network chunk can end mid-line: keep the unfinished tail for the next read.
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) handleLine(line.replace(/\r$/, ''));
          }
          buffer += decoder.decode();
          if (!done) handleLine(buffer.replace(/\r$/, ''));
        } catch (error) {
          await reader.cancel().catch(() => undefined);
          throw error;
        } finally {
          reader.releaseLock();
        }
      }

      if (finishReason === 'content_filter') throw new FollowUpError('invalid', 'The AI service declined to answer.');
      if (!output.trim()) throw new FollowUpError('invalid', 'The AI answer was empty.');
      try {
        return parseFollowUp(JSON.parse(unfence(output)));
      } catch (error) {
        if (finishReason === 'length') {
          throw new FollowUpError('invalid', 'The AI answer was cut off. Try again or pick another model.');
        }
        if (error instanceof FollowUpError) throw error;
        throw new FollowUpError('invalid', 'The AI answer was not valid JSON.');
      }
    } catch (error) {
      diag.outcome = error instanceof FollowUpError ? error.code : error instanceof Error ? error.name : 'error';
      if (error instanceof FollowUpError) throw error;
      if (stopped === 'first') throw new FollowUpError('timeout', FIRST_BYTE_MESSAGE);
      if (stopped === 'idle') throw new FollowUpError('timeout', IDLE_MESSAGE);
      if (stopped === 'total') throw new FollowUpError('timeout', 'The AI service took too long to answer.');
      if (controller.signal.aborted) throw abortError();
      throw new FollowUpError('network', 'The AI service could not be reached.');
    } finally {
      debug?.(
        `[ai] model=${model} host=${hostOf(baseUrl)} format=${diag.format} headers=${diag.headersMs}ms content-type=${diag.contentType} ` +
          `first-chunk=${diag.firstChunkMs}ms chunks=${diag.chunks} total=${Date.now() - t0}ms finish=${diag.finish} outcome=${stopped ?? diag.outcome}`,
      );
      clearTimeout(phaseTimer);
      clearTimeout(totalTimer);
      call?.signal?.removeEventListener('abort', onAbort);
    }
  }

  return {
    id: 'llm-openai-compatible',
    isConfigured: () => settings.isConfigured(),
    subscribe: (listener) => settings.subscribe(listener),
    suggest,
  };
}
