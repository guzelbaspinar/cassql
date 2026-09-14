import { describe, it, expect } from "vitest";
import { buildConditionClauses, buildWhereClause } from "../src/util/conditions";
import { buildOrderByClause } from "../src/util/orderBy";
import { buildUsingClause } from "../src/util/using";
import { assertValidTableRef } from "../src/util/identifiers";
import { CassqlUnsupportedError, CassqlValidationError } from "../src/util/errors";

describe("buildConditionClauses", () => {
  it("rejects non-object conditions", () => {
    expect(() => buildConditionClauses(null as any, [])).toThrow(CassqlValidationError);
    expect(() => buildConditionClauses([] as any, [])).toThrow(CassqlValidationError);
  });

  it("rejects empty operator objects", () => {
    expect(() => buildConditionClauses({ x: {} }, [])).toThrow(CassqlValidationError);
  });

  it("validates $token shape and operators", () => {
    expect(() =>
      buildConditionClauses({ $token: { columns: [], op: "$gt", value: [1] } }, [])
    ).toThrow(CassqlValidationError);
    expect(() =>
      buildConditionClauses({ $token: { columns: ["id"], op: "$gt", value: [1, 2] } }, [])
    ).toThrow(CassqlValidationError);
    expect(() =>
      buildConditionClauses({ $token: { columns: ["id"], op: "$nope" as any, value: [1] } }, [])
    ).toThrow(CassqlUnsupportedError);

    const params: unknown[] = [];
    const clauses = buildConditionClauses(
      { $token: { columns: ["id", "day"], op: "$lte", value: [1, 2] } },
      params
    );
    expect(clauses[0]).toBe("TOKEN(id, day) <= TOKEN(?, ?)");
    expect(params).toEqual([1, 2]);
  });

  it("buildWhereClause returns empty string when no predicates", () => {
    expect(buildWhereClause({}, [])).toBe("");
  });

  it("rejects Object.prototype member names used as fake operators instead of silently matching them", () => {
    expect(() => buildConditionClauses({ symbol: { toString: "whatever" } as any }, [])).toThrow(CassqlUnsupportedError);
    expect(() => buildConditionClauses({ symbol: { constructor: 1 } as any }, [])).toThrow(CassqlUnsupportedError);
    expect(() => buildConditionClauses({ symbol: { hasOwnProperty: 1 } as any }, [])).toThrow(CassqlUnsupportedError);
    // Sanity check: genuinely unknown operators still throw the same way.
    expect(() => buildConditionClauses({ symbol: { $foo: 1 } as any }, [])).toThrow(CassqlUnsupportedError);
  });

  it("rejects an $in list beyond the maximum size instead of overflowing the call stack", () => {
    const bigArray = new Array(2001).fill(1);
    expect(() => buildConditionClauses({ id: { $in: bigArray } }, [])).toThrow(CassqlValidationError);
  });

  it("accepts a large $in list within the maximum size using a loop instead of spread", () => {
    const params: unknown[] = [];
    const array = new Array(2000).fill(1);
    const clauses = buildConditionClauses({ id: { $in: array } }, params);
    expect(clauses[0]).toBe(`id IN (${array.map(() => "?").join(", ")})`);
    expect(params).toHaveLength(2000);
  });

  it("rejects a $token.value / $token.columns length mismatch", () => {
    const bigArray = new Array(2001).fill(1);
    expect(() =>
      buildConditionClauses({ $token: { columns: ["id"], op: "$eq", value: bigArray as any } }, [])
    ).toThrow(CassqlValidationError);
  });

  it("rejects an oversized $token.value list even when it matches $token.columns in length", () => {
    const size = 2001;
    const columns = Array.from({ length: size }, (_, i) => `c${i}`);
    const value = new Array(size).fill(1);
    expect(() => buildConditionClauses({ $token: { columns, op: "$eq", value: value as any } }, [])).toThrow(
      CassqlValidationError
    );
  });
});

describe("buildOrderByClause", () => {
  it("returns empty only for missing orderBy", () => {
    expect(buildOrderByClause()).toBe("");
    expect(buildOrderByClause([])).toBe("");
  });

  it("rejects invalid order direction", () => {
    expect(() => buildOrderByClause({ column: "id", order: "up" as "asc" })).toThrow(CassqlValidationError);
  });

  it("rejects orderBy entries with a missing/empty column instead of silently dropping them", () => {
    expect(() => buildOrderByClause([{ column: "", order: "asc" }])).toThrow(CassqlValidationError);
    expect(() => buildOrderByClause([{ column: "date" } as any])).toThrow(CassqlValidationError);
  });

  it("rejects orderBy entries with a missing order", () => {
    expect(() => buildOrderByClause([{ order: "asc" } as any])).toThrow(CassqlValidationError);
  });
});

describe("buildUsingClause", () => {
  it("rejects invalid ttl and timestamp", () => {
    const params: unknown[] = [];
    expect(() => buildUsingClause({ ttl: -1 }, params)).toThrow(CassqlValidationError);
    expect(() => buildUsingClause({ ttl: 1.5 }, params)).toThrow(CassqlValidationError);
    expect(() => buildUsingClause({ timestamp: "nope" as any }, params)).toThrow(CassqlValidationError);
  });

  it("accepts bigint timestamp", () => {
    const params: unknown[] = [];
    const clause = buildUsingClause({ timestamp: 100n }, params);
    expect(clause).toBe(" USING TIMESTAMP ?");
    expect(params).toEqual([100n]);
  });

  it("returns empty string for empty using options object", () => {
    const params: unknown[] = [];
    expect(buildUsingClause({}, params)).toBe("");
    expect(params).toEqual([]);
  });
});

describe("assertValidTableRef edge cases", () => {
  it("rejects empty table name", () => {
    expect(() => assertValidTableRef("")).toThrow(CassqlValidationError);
    expect(() => assertValidTableRef(null)).toThrow(CassqlValidationError);
  });
});
