import { assertValidTableRef, column } from "../util/identifiers";
import { buildWhereClause, buildConditionClauses, Conditions } from "../util/conditions";
import { buildUsingClause, UsingOptions } from "../util/using";
import { CassqlUnsupportedError, CassqlValidationError } from "../util/errors";
import { BuiltQuery } from "./select";

/**
 * A plain value means `SET col = ?`.
 * Special collection/counter mutation operators are expressed with these keys:
 *  - $append: add element(s) to the end of a list          -> col = col + ?
 *  - $prepend: add element(s) to the front of a list        -> col = ? + col
 *  - $add: add element(s) to a set, or merge entries into a map -> col = col + ?
 *  - $remove: remove element(s) from a list/set, or remove keys from a map -> col = col - ?
 *  - $inc: increment a counter (or numeric column) by N (N may be negative) -> col = col + ?
 *  - $mapSet: set a single key of a map column               -> col[?] = ?
 *  - $listSetIndex: set a single index of a list column       -> col[?] = ?
 */
export type UpdateValue =
  | unknown
  | { $append: unknown }
  | { $prepend: unknown }
  | { $add: unknown }
  | { $remove: unknown }
  | { $inc: number | bigint }
  | { $mapSet: { key: unknown; value: unknown } }
  | { $listSetIndex: { index: number; value: unknown } };

export type UpdateFields = Record<string, UpdateValue>;

export interface UpdateOptions {
  using?: UsingOptions;
  /** `IF EXISTS` — a Lightweight Transaction guarding against updating a non-existent row. */
  ifExists?: boolean;
  /** Column-level `IF` conditions (a Lightweight Transaction). Mutually exclusive with ifExists. */
  if?: Conditions;
}

function isPlainMutationObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date) && !Buffer.isBuffer(value);
}

function buildSetClause(field: string, value: UpdateValue, params: unknown[]): string {
  const col = column(field, "update column");

  if (!isPlainMutationObject(value)) {
    params.push(value);
    return `${col} = ?`;
  }

  const keys = Object.keys(value);
  if (keys.length !== 1) {
    // Not a recognized single-operator mutation object: treat as a literal value
    // (e.g. writing a raw map/UDT value straight into the column).
    params.push(value);
    return `${col} = ?`;
  }

  const op = keys[0] as string;
  const opValue = (value as Record<string, unknown>)[op];

  switch (op) {
    case "$append":
      params.push(opValue);
      return `${col} = ${col} + ?`;
    case "$prepend":
      params.push(opValue);
      return `${col} = ? + ${col}`;
    case "$add":
      params.push(opValue);
      return `${col} = ${col} + ?`;
    case "$remove":
      params.push(opValue);
      return `${col} = ${col} - ?`;
    case "$inc": {
      if (
        (typeof opValue !== "number" && typeof opValue !== "bigint") ||
        (typeof opValue === "number" && !Number.isFinite(opValue))
      ) {
        throw new CassqlValidationError(`$inc on "${field}" requires a finite number or bigint`);
      }
      params.push(opValue);
      return `${col} = ${col} + ?`;
    }
    case "$mapSet": {
      const { key, value: v } = opValue as { key: unknown; value: unknown };
      params.push(key, v);
      return `${col}[?] = ?`;
    }
    case "$listSetIndex": {
      const { index, value: v } = opValue as { index: unknown; value: unknown };
      if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
        throw new CassqlValidationError(`$listSetIndex on "${field}" requires a non-negative integer index`);
      }
      params.push(index, v);
      return `${col}[?] = ?`;
    }
    case "$raw":
      // Explicit escape hatch: always write the operand as a literal value,
      // even if it happens to look like an operator object itself.
      params.push(opValue);
      return `${col} = ?`;
    default:
      if (op.startsWith("$")) {
        // Looks like an operator (typo'd or unsupported) rather than a literal
        // value — fail loudly instead of silently writing the whole object as
        // a literal (which would otherwise mask typos like `$apend`).
        throw new CassqlUnsupportedError(`Unsupported update operator "${op}" on column "${field}"`);
      }
      // Not `$`-prefixed: treat the whole object as a literal value
      // (e.g. writing a raw map/UDT value straight into the column).
      params.push(value);
      return `${col} = ?`;
  }
}

export function buildUpdateQuery(
  table: string,
  updateFields: UpdateFields,
  conditions: Conditions,
  options: UpdateOptions = {}
): BuiltQuery {
  assertValidTableRef(table);
  if (updateFields === null || typeof updateFields !== "object" || Array.isArray(updateFields)) {
    throw new CassqlValidationError("updateFields must be a plain object");
  }
  if (Object.keys(updateFields).length === 0) {
    throw new CassqlValidationError("updateFields must not be empty");
  }
  if (options.ifExists && options.if) {
    throw new CassqlUnsupportedError("Use either options.ifExists or options.if, not both");
  }

  const params: unknown[] = [];
  const using = buildUsingClause(options.using, params);

  const setClauses = Object.entries(updateFields).map(([field, value]) => buildSetClause(field, value, params));

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

  const query = `UPDATE ${table}${using} SET ${setClauses.join(", ")}${where}${ifClause}`;
  return { query, params };
}
