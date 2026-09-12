import { assertValidTableRef, column } from "../util/identifiers";
import { buildWhereClause, buildConditionClauses, Conditions } from "../util/conditions";
import { CassqlUnsupportedError, CassqlValidationError } from "../util/errors";
import { BuiltQuery } from "./select";

export type DeleteSelector =
  | string
  /** Delete a single map key or list index: `col[key]`. */
  | { column: string; key: unknown };

export interface DeleteOptions {
  /** Explicit write timestamp in microseconds since epoch (DELETE only supports TIMESTAMP, not TTL). */
  timestamp?: number | bigint;
  ifExists?: boolean;
  if?: Conditions;
  /** Specific columns (or collection elements) to delete instead of the whole row. */
  columns?: DeleteSelector[];
}

export function buildDeleteQuery(table: string, conditions: Conditions, options: DeleteOptions = {}): BuiltQuery {
  assertValidTableRef(table);
  if (options.ifExists && options.if) {
    throw new CassqlUnsupportedError("Use either options.ifExists or options.if, not both");
  }

  const params: unknown[] = [];

  let selectClause = "";
  if (options.columns && options.columns.length > 0) {
    const parts = options.columns.map((sel) => {
      if (typeof sel === "string") {
        return column(sel, "delete column");
      }
      const col = column(sel.column, "delete column");
      params.push(sel.key);
      return `${col}[?]`;
    });
    selectClause = ` ${parts.join(", ")}`;
  }

  const usingClause = options.timestamp !== undefined ? (() => {
    if (typeof options.timestamp !== "number" && typeof options.timestamp !== "bigint") {
      throw new CassqlValidationError("timestamp must be a number or bigint");
    }
    params.push(options.timestamp);
    return " USING TIMESTAMP ?";
  })() : "";

  const where = buildWhereClause(conditions, params);

  let ifClause = "";
  if (options.ifExists) {
    ifClause = " IF EXISTS";
  } else if (options.if) {
    const ifParams: unknown[] = [];
    const clauses = buildConditionClauses(options.if, ifParams);
    if (clauses.length > 0) {
      ifClause = ` IF ${clauses.join(" AND ")}`;
      params.push(...ifParams);
    }
  }

  const query = `DELETE${selectClause} FROM ${table}${usingClause}${where}${ifClause}`;
  return { query, params };
}
