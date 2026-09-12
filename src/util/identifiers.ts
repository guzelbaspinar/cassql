import { CassqlValidationError } from "./errors";

/**
 * Cassandra unquoted identifiers: letters, digits, underscore, must not start with a digit.
 * We are intentionally strict (stricter than CQL itself allows) because every identifier
 * that reaches this module may originate from caller-supplied strings (column names,
 * table names, keyspace names, orderBy columns, insert/update field names, etc.).
 *
 * We never build a query by concatenating a raw, unvalidated string into CQL text.
 * Every identifier must pass through `assertValidIdentifier` (or `quoteIdentifier`,
 * which calls it) before being interpolated into a query string. Values, in contrast,
 * are NEVER interpolated: they always travel as bind parameters (`?`) executed with
 * `{ prepare: true }`.
 */
const UNQUOTED_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// Reserved CQL keywords that must not be used as bare identifiers even though they
// otherwise match the unquoted-identifier shape. Not exhaustive-exhaustive, but covers
// the keywords that matter for statement-structure safety.
const RESERVED_KEYWORDS = new Set([
  "select", "insert", "update", "delete", "from", "where", "and", "or", "not",
  "in", "into", "values", "set", "using", "ttl", "timestamp", "if", "exists",
  "order", "by", "asc", "desc", "limit", "allow", "filtering", "batch",
  "apply", "begin", "create", "drop", "alter", "table", "keyspace", "index",
  "primary", "key", "token", "counter", "truncate", "grant", "revoke",
]);

export function assertValidIdentifier(name: unknown, context: string): string {
  if (typeof name !== "string" || name.length === 0) {
    throw new CassqlValidationError(`${context}: identifier must be a non-empty string, got ${JSON.stringify(name)}`);
  }
  if (name.length > 128) {
    throw new CassqlValidationError(`${context}: identifier "${name}" exceeds Cassandra's 128 character limit`);
  }
  if (!UNQUOTED_IDENTIFIER.test(name)) {
    throw new CassqlValidationError(
      `${context}: "${name}" is not a valid identifier. Only letters, digits and underscores are allowed, and it must not start with a digit. ` +
        `Quoted/mixed-case identifiers are not supported for security reasons.`
    );
  }
  if (RESERVED_KEYWORDS.has(name.toLowerCase())) {
    throw new CassqlValidationError(`${context}: "${name}" is a reserved CQL keyword and cannot be used as an identifier here`);
  }
  return name;
}

/**
 * Validates a "table" reference that may optionally be keyspace-qualified
 * (e.g. "my_keyspace.my_table"). Each segment is validated independently.
 */
export function assertValidTableRef(table: unknown, context = "table"): string {
  if (typeof table !== "string" || table.length === 0) {
    throw new CassqlValidationError(`${context}: table name must be a non-empty string`);
  }
  const parts = table.split(".");
  if (parts.length > 2) {
    throw new CassqlValidationError(`${context}: "${table}" is not a valid "table" or "keyspace.table" reference`);
  }
  parts.forEach((part, i) => assertValidIdentifier(part, i === 0 && parts.length === 2 ? `${context} (keyspace)` : `${context} (table)`));
  return parts.join(".");
}

/** Validates and returns a column name, safe to interpolate into CQL text. */
export function column(name: unknown, context = "column"): string {
  return assertValidIdentifier(name, context);
}
