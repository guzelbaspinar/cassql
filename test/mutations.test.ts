import { describe, it, expect } from "vitest";
import { buildInsertQuery } from "../src/query/insert";
import { buildUpdateQuery } from "../src/query/update";
import { buildDeleteQuery } from "../src/query/delete";
import { buildBatchQuery } from "../src/query/batch";
import { CassqlUnsupportedError, CassqlValidationError } from "../src/util/errors";

describe("buildInsertQuery", () => {
  it("builds a basic insert", () => {
    const { query, params } = buildInsertQuery("stocks", { symbol: "GARAN", price: 111.3 });
    expect(query).toBe("INSERT INTO stocks (symbol, price) VALUES (?, ?)");
    expect(params).toEqual(["GARAN", 111.3]);
  });

  it("supports IF NOT EXISTS and USING TTL/TIMESTAMP", () => {
    const { query, params } = buildInsertQuery(
      "stocks",
      { symbol: "GARAN" },
      { ifNotExists: true, using: { ttl: 3600, timestamp: 1000 } }
    );
    expect(query).toBe("INSERT INTO stocks (symbol) VALUES (?) IF NOT EXISTS USING TTL ? AND TIMESTAMP ?");
    expect(params).toEqual(["GARAN", 3600, 1000]);
  });

  it("rejects empty data", () => {
    expect(() => buildInsertQuery("stocks", {})).toThrow(CassqlValidationError);
  });

  it("rejects non-plain insert data", () => {
    expect(() => buildInsertQuery("stocks", null as any)).toThrow(CassqlValidationError);
    expect(() => buildInsertQuery("stocks", [] as any)).toThrow(CassqlValidationError);
  });

  it("rejects malicious column names", () => {
    expect(() => buildInsertQuery("stocks", { "a, (SELECT 1) --": 1 })).toThrow(CassqlValidationError);
  });
});

describe("buildUpdateQuery", () => {
  it("builds a basic update", () => {
    const { query, params } = buildUpdateQuery("stocks", { price: 100, quantity: 30 }, { symbol: "GARAN", quantity: { $lt: 20 } });
    expect(query).toBe("UPDATE stocks SET price = ?, quantity = ? WHERE symbol = ? AND quantity < ?");
    expect(params).toEqual([100, 30, "GARAN", 20]);
  });

  it("supports collection append/prepend/add/remove", () => {
    const append = buildUpdateQuery("t", { tags: { $append: "x" } }, { id: 1 });
    expect(append.query).toBe("UPDATE t SET tags = tags + ? WHERE id = ?");
    expect(append.params).toEqual(["x", 1]);

    const prepend = buildUpdateQuery("t", { tags: { $prepend: "x" } }, { id: 1 });
    expect(prepend.query).toBe("UPDATE t SET tags = ? + tags WHERE id = ?");

    const add = buildUpdateQuery("t", { tagset: { $add: "x" } }, { id: 1 });
    expect(add.query).toBe("UPDATE t SET tagset = tagset + ? WHERE id = ?");

    const remove = buildUpdateQuery("t", { tagset: { $remove: "x" } }, { id: 1 });
    expect(remove.query).toBe("UPDATE t SET tagset = tagset - ? WHERE id = ?");
  });

  it("supports counter increment via $inc (including negative for decrement)", () => {
    const inc = buildUpdateQuery("counters", { hits: { $inc: 5 } }, { id: 1 });
    expect(inc.query).toBe("UPDATE counters SET hits = hits + ? WHERE id = ?");
    expect(inc.params).toEqual([5, 1]);

    const dec = buildUpdateQuery("counters", { hits: { $inc: -5 } }, { id: 1 });
    expect(dec.params).toEqual([-5, 1]);
  });

  it("supports map key set and list index set", () => {
    const mapSet = buildUpdateQuery("t", { attrs: { $mapSet: { key: "color", value: "red" } } }, { id: 1 });
    expect(mapSet.query).toBe("UPDATE t SET attrs[?] = ? WHERE id = ?");
    expect(mapSet.params).toEqual(["color", "red", 1]);

    const listSet = buildUpdateQuery("t", { items: { $listSetIndex: { index: 0, value: "first" } } }, { id: 1 });
    expect(listSet.query).toBe("UPDATE t SET items[?] = ? WHERE id = ?");
    expect(listSet.params).toEqual([0, "first", 1]);
  });

  it("supports USING TTL, IF EXISTS and column-level IF (LWT)", () => {
    const withTtl = buildUpdateQuery("t", { v: 1 }, { id: 1 }, { using: { ttl: 60 } });
    expect(withTtl.query).toBe("UPDATE t USING TTL ? SET v = ? WHERE id = ?");
    expect(withTtl.params).toEqual([60, 1, 1]);

    const ifExists = buildUpdateQuery("t", { v: 1 }, { id: 1 }, { ifExists: true });
    expect(ifExists.query).toBe("UPDATE t SET v = ? WHERE id = ? IF EXISTS");

    const ifCond = buildUpdateQuery("t", { v: 1 }, { id: 1 }, { if: { v: 0 } });
    expect(ifCond.query).toBe("UPDATE t SET v = ? WHERE id = ? IF v = ?");
    expect(ifCond.params).toEqual([1, 1, 0]);
  });

  it("rejects using both ifExists and if", () => {
    expect(() => buildUpdateQuery("t", { v: 1 }, { id: 1 }, { ifExists: true, if: { v: 0 } })).toThrow(CassqlUnsupportedError);
  });

  it("rejects empty updateFields", () => {
    expect(() => buildUpdateQuery("t", {}, { id: 1 })).toThrow(CassqlValidationError);
  });

  it("rejects invalid updateFields shape", () => {
    expect(() => buildUpdateQuery("t", null as any, { id: 1 })).toThrow(CassqlValidationError);
    expect(() => buildUpdateQuery("t", [] as any, { id: 1 })).toThrow(CassqlValidationError);
  });

  it("treats multi-key objects and unknown operators as literal values", () => {
    const multi = buildUpdateQuery("t", { meta: { a: 1, b: 2 } }, { id: 1 });
    expect(multi.query).toBe("UPDATE t SET meta = ? WHERE id = ?");
    expect(multi.params).toEqual([{ a: 1, b: 2 }, 1]);

    const unknown = buildUpdateQuery("t", { meta: { $unknown: 1 } }, { id: 1 });
    expect(unknown.query).toBe("UPDATE t SET meta = ? WHERE id = ?");
    expect(unknown.params).toEqual([{ $unknown: 1 }, 1]);
  });

  it("validates $inc and $listSetIndex operands", () => {
    expect(() => buildUpdateQuery("t", { c: { $inc: "x" } }, { id: 1 })).toThrow(CassqlValidationError);
    expect(() => buildUpdateQuery("t", { items: { $listSetIndex: { index: -1, value: 1 } } }, { id: 1 })).toThrow(
      CassqlValidationError
    );
    expect(() => buildUpdateQuery("t", { items: { $listSetIndex: { index: 1.5, value: 1 } } }, { id: 1 })).toThrow(
      CassqlValidationError
    );
  });

  it("supports bigint $inc", () => {
    const { params } = buildUpdateQuery("t", { hits: { $inc: 5n } }, { id: 1 });
    expect(params[0]).toBe(5n);
  });

  it("writes plain scalar and Date values directly", () => {
    const d = new Date("2020-01-01T00:00:00.000Z");
    const { query, params } = buildUpdateQuery("t", { when: d, n: 3 }, { id: 1 });
    expect(query).toBe("UPDATE t SET when = ?, n = ? WHERE id = ?");
    expect(params).toEqual([d, 3, 1]);
  });
});

describe("buildDeleteQuery", () => {
  it("builds a basic delete", () => {
    const { query, params } = buildDeleteQuery("stocks", { symbol: "GARAN" });
    expect(query).toBe("DELETE FROM stocks WHERE symbol = ?");
    expect(params).toEqual(["GARAN"]);
  });

  it("supports column/element-level delete", () => {
    const { query, params } = buildDeleteQuery("t", { id: 1 }, { columns: ["price", { column: "attrs", key: "color" }] });
    expect(query).toBe("DELETE price, attrs[?] FROM t WHERE id = ?");
    expect(params).toEqual(["color", 1]);
  });

  it("supports USING TIMESTAMP and IF EXISTS / IF", () => {
    const { query, params } = buildDeleteQuery("t", { id: 1 }, { timestamp: 12345 });
    expect(query).toBe("DELETE FROM t USING TIMESTAMP ? WHERE id = ?");
    expect(params).toEqual([12345, 1]);

    const ifExists = buildDeleteQuery("t", { id: 1 }, { ifExists: true });
    expect(ifExists.query).toBe("DELETE FROM t WHERE id = ? IF EXISTS");

    const ifCond = buildDeleteQuery("t", { id: 1 }, { if: { v: 0 } });
    expect(ifCond.query).toBe("DELETE FROM t WHERE id = ? IF v = ?");
    expect(ifCond.params).toEqual([1, 0]);

    const tsBig = buildDeleteQuery("t", { id: 1 }, { timestamp: 99n });
    expect(tsBig.params[0]).toBe(99n);
  });

  it("rejects ifExists and if together and invalid timestamp", () => {
    expect(() => buildDeleteQuery("t", { id: 1 }, { ifExists: true, if: { v: 1 } })).toThrow(CassqlUnsupportedError);
    expect(() => buildDeleteQuery("t", { id: 1 }, { timestamp: "bad" as any })).toThrow(CassqlValidationError);
  });
});

describe("buildBatchQuery", () => {
  it("combines multiple statements into a single BEGIN BATCH", () => {
    const insert = buildInsertQuery("t", { id: 1 });
    const update = buildUpdateQuery("t2", { v: 2 }, { id: 1 });
    const { query, params } = buildBatchQuery([insert, update]);
    expect(query).toContain("BEGIN BATCH");
    expect(query).toContain("INSERT INTO t (id) VALUES (?);");
    expect(query).toContain("UPDATE t2 SET v = ? WHERE id = ?;");
    expect(query).toContain("APPLY BATCH");
    expect(params).toEqual([1, 2, 1]);
  });

  it("supports UNLOGGED batch type", () => {
    const { query } = buildBatchQuery([buildInsertQuery("t", { id: 1 })], { type: "unlogged" });
    expect(query).toContain("BEGIN UNLOGGED BATCH");
  });

  it("supports COUNTER batch and batch-level USING TIMESTAMP", () => {
    const { query, params } = buildBatchQuery([buildInsertQuery("t", { id: 1 })], {
      type: "counter",
      using: { timestamp: 42 },
    });
    expect(query).toContain("BEGIN COUNTER BATCH");
    expect(query).toContain("USING TIMESTAMP ?");
    expect(params[0]).toBe(42);
  });

  it("rejects an empty batch", () => {
    expect(() => buildBatchQuery([])).toThrow(CassqlValidationError);
  });
});
