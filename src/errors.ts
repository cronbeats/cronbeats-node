export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "SERVER_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly httpStatus: number | null;
  readonly retryable: boolean;
  readonly raw: unknown;

  constructor(args: {
    code: ApiErrorCode;
    message: string;
    httpStatus?: number | null;
    retryable?: boolean;
    raw?: unknown;
  }) {
    super(args.message);
    this.name = "ApiError";
    this.code = args.code;
    this.httpStatus = args.httpStatus ?? null;
    this.retryable = args.retryable ?? false;
    this.raw = args.raw ?? null;
  }
}
