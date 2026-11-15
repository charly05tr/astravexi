import { FollowUpError } from '../../core/follow-up/errors';

/** Best-effort message from an error body: `{error:{message}}`, `[{error:{message}}]` or `{message}`. */
export function errorDetail(body: unknown): string {
  const first = Array.isArray(body) ? body[0] : body;
  const error = (first as { error?: unknown } | null)?.error;
  const message =
    typeof error === 'string' ? error : (error as { message?: unknown } | null)?.message ?? (first as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message.slice(0, 200) : '';
}

export const isKeyRejected = (status: number, detail: string): boolean =>
  status === 401 || status === 403 || (status === 400 && /api key/i.test(detail));

/** A readable, key-free message for an HTTP failure. */
export function messageForStatus(status: number, detail: string, model?: string): string {
  if (isKeyRejected(status, detail)) {
    return 'The AI service rejected this API key. Check that it is correct and has access to the model.';
  }
  if (status === 404) {
    return model
      ? `The AI service could not find model "${model}" (or the base URL is wrong). Pick another model in AI assistant settings.`
      : 'The AI service could not find that address. Check the base URL in AI assistant settings.';
  }
  if (status === 429) return 'The AI service quota is exceeded. Wait a moment or check your plan limits.';
  if (status >= 500) return 'The AI service is temporarily unavailable. Please try again later.';
  return detail ? `The AI service could not process the request: ${detail}` : 'The AI service could not process the request.';
}

export const FIRST_BYTE_MESSAGE = 'The AI service is taking too long to start answering. Try again or pick a faster model.';
export const IDLE_MESSAGE = 'The AI service stopped responding. Try again or pick a faster model.';

export async function readErrorDetail(response: Response): Promise<string> {
  try {
    return errorDetail(await response.json());
  } catch {
    return '';
  }
}

export function httpError(status: number, detail: string, model?: string): FollowUpError {
  return new FollowUpError('http', messageForStatus(status, detail, model));
}
