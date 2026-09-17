export type GroqRuntimeErrorCode =
  | 'missing-api-key'
  | 'groq-request-failed'
  | 'invalid-model-response'
  | 'invalid-spend-intent';

export class GroqRuntimeError extends Error {
  constructor(
    readonly code: GroqRuntimeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'GroqRuntimeError';
  }
}