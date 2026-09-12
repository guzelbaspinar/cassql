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

/** Wraps a driver-level execution failure while preserving the original query/params for debugging. */
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

/** Thrown when a Lightweight Transaction (IF ...) is not applied. */
export class CassqlNotAppliedError extends CassqlError {
  readonly existingRow?: Record<string, unknown>;
  constructor(message: string, existingRow?: Record<string, unknown>) {
    super(message);
    this.existingRow = existingRow;
  }
}
