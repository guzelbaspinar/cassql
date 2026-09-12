import { describe, it, expect } from "vitest";
import {
  CassandraClient,
  Model,
  CassqlError,
  CassqlValidationError,
  CassqlUnsupportedError,
  CassqlExecutionError,
  CassqlNotAppliedError,
  buildSelectQuery,
  buildCountQuery,
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
  buildBatchQuery,
} from "../src/index";

describe("package entry (index)", () => {
  it("re-exports public API surface", () => {
    expect(CassandraClient).toBeTypeOf("function");
    expect(Model).toBeTypeOf("function");
    expect(CassqlError).toBeTypeOf("function");
    expect(CassqlValidationError).toBeTypeOf("function");
    expect(CassqlUnsupportedError).toBeTypeOf("function");
    expect(CassqlExecutionError).toBeTypeOf("function");
    expect(CassqlNotAppliedError).toBeTypeOf("function");
    expect(buildSelectQuery("t", {}, [])).toEqual({ query: "SELECT * FROM t", params: [] });
    expect(buildCountQuery("t", {})).toEqual({ query: "SELECT COUNT(*) FROM t", params: [] });
    expect(buildInsertQuery("t", { id: 1 })).toMatchObject({ params: [1] });
    expect(buildUpdateQuery("t", { v: 1 }, { id: 1 })).toMatchObject({ params: [1, 1] });
    expect(buildDeleteQuery("t", { id: 1 })).toMatchObject({ params: [1] });
    expect(buildBatchQuery([buildInsertQuery("t", { id: 1 })])).toMatchObject({ params: [1] });
  });
});
