export type FollowUpErrorCode = 'not-configured' | 'timeout' | 'aborted' | 'network' | 'http' | 'invalid';

/** Why a follow-up suggestion could not be produced. Messages never carry an API key or a response body. */
export class FollowUpError extends Error {
  readonly code: FollowUpErrorCode;
  constructor(code: FollowUpErrorCode, message: string) {
    super(message);
    this.name = 'FollowUpError';
    this.code = code;
  }
}
