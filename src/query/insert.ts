import { assertValidTableRef, column } from "../util/identifiers";
import { buildUsingClause, UsingOptions } from "../util/using";
import { CassqlValidationError } from "../util/errors";
import { BuiltQuery } from "./select";

export interface InsertOptions {
  /** Adds `IF NOT EXISTS` (a Lightweight Transaction / Paxos round). */
  ifNotExists?: boolean;
  using?: UsingOptions;
}

export function buildInsertQuery(table: string, data: Record<string, unknown>, options: InsertOptions = {}): BuiltQuery {
  assertValidTableRef(table);
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new CassqlValidationError("insert data must be a plain object");
  }
  const entries = Object.entries(data);
  if (entries.length === 0) {
    throw new CassqlValidationError("insert data must not be empty");
  }

  const columns = entries.map(([field]) => column(field, "insert column"));
  const placeholders = entries.map(() => "?");
  const params: unknown[] = entries.map(([, value]) => value);

  const ifNotExists = options.ifNotExists ? " IF NOT EXISTS" : "";
  const using = buildUsingClause(options.using, params);

  const query = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})${ifNotExists}${using}`;
  return { query, params };
}
