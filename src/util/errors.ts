export class CassqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Thrown when caller input (identifiers, operators, shapes) fails validation. */
export class CassqlValidationError extends CassqlError {}

/** Thrown when an unsupported / unknown operator or query shape is used. */
export class CassqlUnsupportedError extends CassqlError {}

/**
 * Wraps a driver-level execution failure while preserving the original query/params for
 * debugging.
 *
 * **Security note:** `params` holds the *raw* bound values that were sent to Cassandra —
 * these may include passwords, PII, or other sensitive data supplied by your application.
 * If you log this error (or send it to an error-tracking service such as Sentry), make sure
 * to redact sensitive fields first, e.g. via {@link redactParamsForLogging} or your own
 * masking logic. `Model`'s constructor accepts an optional `redactParams` function that is
 * applied only to what gets logged via its `Logger` — the error object's own `.params` is
 * always left unredacted so it remains useful for debugging.
 */
export class CassqlExecutionError extends CassqlError {
  readonly query: string;
  readonly params: unknown[];
  readonly cause?: unknown;

  constructor(message: string, query: string, params: unknown[], cause?: unknown) {
    super(message);
    this.query = query;
    this.params = params;
    this.cause = cause;
  }
}

/**
 * Applies an optional redaction function to a params array before it is handed to a
 * `Logger`/APM integration. If no `redactor` is provided, `params` is returned unchanged
 * (default behavior is not to redact anything).
 */
export function redactParamsForLogging(params: unknown[], redactor?: (params: unknown[]) => unknown[]): unknown[] {
  if (!redactor) return params;
  return redactor(params);
}

/** Thrown when a Lightweight Transaction (IF ...) is not applied. */
export class CassqlNotAppliedError extends CassqlError {
  readonly existingRow?: Record<string, unknown>;
  constructor(message: string, existingRow?: Record<string, unknown>) {
    super(message);
    this.existingRow = existingRow;
  }
}
