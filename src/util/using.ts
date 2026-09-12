import { CassqlValidationError } from "./errors";

export interface UsingOptions {
  /** Time-to-live in seconds for the written data. */
  ttl?: number;
  /** Explicit write timestamp in microseconds since epoch. */
  timestamp?: number | bigint;
}

/**
 * Builds a `USING TTL ? AND TIMESTAMP ?` fragment. Values are always bound as
 * parameters, never interpolated as literals, even though CQL would technically
 * accept literal integers here.
 */
export function buildUsingClause(using: UsingOptions | undefined, params: unknown[]): string {
  if (!using) return "";
  const parts: string[] = [];

  if (using.ttl !== undefined) {
    if (typeof using.ttl !== "number" || !Number.isInteger(using.ttl) || using.ttl < 0) {
      throw new CassqlValidationError("using.ttl must be a non-negative integer (seconds)");
    }
    parts.push("TTL ?");
    params.push(using.ttl);
  }

  if (using.timestamp !== undefined) {
    if (typeof using.timestamp !== "number" && typeof using.timestamp !== "bigint") {
      throw new CassqlValidationError("using.timestamp must be a number or bigint (microseconds since epoch)");
    }
    parts.push("TIMESTAMP ?");
    params.push(using.timestamp);
  }

  return parts.length > 0 ? ` USING ${parts.join(" AND ")}` : "";
}
