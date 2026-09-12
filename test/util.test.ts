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
});

describe("buildOrderByClause", () => {
  it("returns empty for missing or empty orderBy", () => {
    expect(buildOrderByClause()).toBe("");
    expect(buildOrderByClause([{ column: "", order: "asc" }])).toBe("");
  });

  it("rejects invalid order direction", () => {
    expect(() => buildOrderByClause({ column: "id", order: "up" as "asc" })).toThrow(CassqlValidationError);
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
