import { column } from "./identifiers";
import { CassqlUnsupportedError, CassqlValidationError } from "./errors";

export type Primitive = string | number | boolean | Date | Buffer | bigint | null;

export type ConditionValue =
  | Primitive
  | {
      $eq?: Primitive;
      $ne?: Primitive;
      $gt?: Primitive;
      $lt?: Primitive;
      $gte?: Primitive;
      $lte?: Primitive;
      $in?: Primitive[];
      /** CONTAINS — for collection (list/set/map) columns. */
      $contains?: Primitive;
      /** CONTAINS KEY — for map columns. */
      $containsKey?: Primitive;
    };

export type Conditions = Record<string, ConditionValue> & {
  /** TOKEN(partition_key...) comparisons, used for manual paging over a full table scan. */
  $token?: {
    columns: string[];
    op: "$gt" | "$gte" | "$lt" | "$lte" | "$eq";
    value: Primitive[];
  };
};

const SIMPLE_OPERATORS: Record<string, string> = {
  $eq: "=",
  $ne: "!=",
  $gt: ">",
  $lt: "<",
  $gte: ">=",
  $lte: "<=",
  $contains: "CONTAINS",
  $containsKey: "CONTAINS KEY",
};

/**
 * Builds a list of CQL predicate fragments (e.g. `["price > ?", "symbol = ?"]`) from a
 * mongo-like conditions object, pushing bound values into `params` in the same order the
 * fragments are emitted. No user-controlled value is ever concatenated into the returned
 * strings — only validated column names and fixed operator keywords are.
 */
export function buildConditionClauses(conditions: Conditions, params: unknown[]): string[] {
  if (conditions === null || typeof conditions !== "object" || Array.isArray(conditions)) {
    throw new CassqlValidationError("Conditions must be a plain object");
  }
  if ("$or" in conditions) {
    throw new CassqlUnsupportedError("$or is not supported: Cassandra CQL has no OR operator across partitions/conditions");
  }

  const clauses: string[] = [];

  for (const [field, condition] of Object.entries(conditions)) {
    if (field === "$token") continue; // handled separately below
    const col = column(field, "condition column");

    if (condition !== null && typeof condition === "object" && !(condition instanceof Date) && !Buffer.isBuffer(condition)) {
      const entries = Object.entries(condition as Record<string, unknown>);
      if (entries.length === 0) {
        throw new CassqlValidationError(`Condition object for "${field}" must have at least one operator`);
      }
      for (const [op, value] of entries) {
        if (op === "$in") {
          if (!Array.isArray(value) || value.length === 0) {
            throw new CassqlValidationError(`$in operator on "${field}" requires a non-empty array of values`);
          }
          clauses.push(`${col} IN (${value.map(() => "?").join(", ")})`);
          params.push(...value);
          continue;
        }
        const cql = SIMPLE_OPERATORS[op];
        if (!cql) {
          throw new CassqlUnsupportedError(`Unsupported operator "${op}" on column "${field}"`);
        }
        clauses.push(`${col} ${cql} ?`);
        params.push(value);
      }
    } else {
      clauses.push(`${col} = ?`);
      params.push(condition);
    }
  }

  const token = conditions.$token;
  if (token) {
    if (!Array.isArray(token.columns) || token.columns.length === 0) {
      throw new CassqlValidationError("$token.columns must be a non-empty array");
    }
    if (!Array.isArray(token.value) || token.value.length !== token.columns.length) {
      throw new CassqlValidationError("$token.value must be an array matching $token.columns in length");
    }
    const cql = SIMPLE_OPERATORS[token.op];
    if (!cql) {
      throw new CassqlUnsupportedError(`Unsupported $token operator "${token.op}"`);
    }
    const cols = token.columns.map((c) => column(c, "$token column")).join(", ");
    clauses.push(`TOKEN(${cols}) ${cql} TOKEN(${token.value.map(() => "?").join(", ")})`);
    params.push(...token.value);
  }

  return clauses;
}

export function buildWhereClause(conditions: Conditions, params: unknown[]): string {
  const clauses = buildConditionClauses(conditions, params);
  return clauses.length > 0 ? ` WHERE ${clauses.join(" AND ")}` : "";
}
