/** Typed failures of the sync gateway. The engine and the UI react to the class, never to a status code. */

/** The device token is missing, unknown or revoked (HTTP 401). The credentials are no longer valid. */
export class SyncAuthError extends Error {
  constructor() {
    super('This device was disconnected.');
    this.name = 'SyncAuthError';
  }
}

/** The server refused the request as malformed or invalid (HTTP 400): a bad enrollment code, a bad batch. */
export class SyncValidationError extends Error {
  constructor(message = 'The server rejected the request.') {
    super(message);
    this.name = 'SyncValidationError';
  }
}

/** Too many requests (HTTP 429). `retryAfterMs` is the server's hint when it sent one. */
export class SyncRateLimitError extends Error {
  constructor(readonly retryAfterMs?: number) {
    super('Too many requests. Try again later.');
    this.name = 'SyncRateLimitError';
  }
}

/** The server could not be reached, timed out, or failed (network error, timeout, 5xx). Worth retrying. */
export class SyncUnavailableError extends Error {
  constructor(message = 'The server could not be reached.') {
    super(message);
    this.name = 'SyncUnavailableError';
  }
}
