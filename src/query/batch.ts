import { buildUsingClause, UsingOptions } from "../util/using";
import { CassqlValidationError } from "../util/errors";
import { BuiltQuery } from "./select";

export interface BatchOptions {
  /** LOGGED (default, atomic across partitions) vs UNLOGGED (no atomicity guarantee, better perf) vs COUNTER. */
  type?: "logged" | "unlogged" | "counter";
  using?: Pick<UsingOptions, "timestamp">;
}

/**
 * Combines multiple already-built statements (e.g. from `buildInsertQuery`,
 * `buildUpdateQuery`, `buildDeleteQuery`) into a single `BEGIN BATCH ... APPLY BATCH;`
 * statement, suitable for passing to the driver's `client.batch()` as a
 * "simple statements with own params" batch, or executed as one combined query string.
 */
export function buildBatchQuery(statements: BuiltQuery[], options: BatchOptions = {}): BuiltQuery {
  if (!Array.isArray(statements) || statements.length === 0) {
    throw new CassqlValidationError("batch requires a non-empty array of statements");
  }

  const params: unknown[] = [];
  const kindKeyword = options.type === "unlogged" ? "UNLOGGED " : options.type === "counter" ? "COUNTER " : "";
  const using = buildUsingClause(options.using, params);

  const body = statements
    .map((s) => {
      params.push(...s.params);
      return `  ${s.query.trim()};`;
    })
    .join("\n");

  const query = `BEGIN ${kindKeyword}BATCH${using}\n${body}\nAPPLY BATCH`;
  return { query, params };
}
