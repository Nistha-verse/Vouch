export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(statusCode: number, code: string, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  toBody(): ApiErrorBody {
    const body: ApiErrorBody = { error: { code: this.code, message: this.message } };
    if (this.details !== undefined) body.error.details = this.details as Record<string, unknown>;
    return body;
  }
}

export function fromUnknown(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new ApiError(500, 'internal-error', 'An internal server error occurred.', {});
}
