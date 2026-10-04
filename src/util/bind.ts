import { types } from "cassandra-driver";

/**
 * Converts values the cassandra-driver cannot bind directly (e.g. native bigint)
 * into driver types before execute/stream/batch.
 */
export function coerceBindValue(value: unknown): unknown {
  if (typeof value === "bigint") {
    return types.Long.fromString(value.toString());
  }
  if (Array.isArray(value)) {
    return value.map(coerceBindValue);
  }
  if (value instanceof Set) {
    return new Set([...value].map(coerceBindValue));
  }
  if (value instanceof Map) {
    return new Map([...value.entries()].map(([k, v]) => [coerceBindValue(k), coerceBindValue(v)]));
  }
  return value;
}

export function coerceBindParams(params: unknown[]): unknown[] {
  return params.map(coerceBindValue);
}
