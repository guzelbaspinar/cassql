import { describe, it, expect } from "vitest";
import { buildSelectQuery, buildCountQuery } from "../src/query/select";
import { CassqlUnsupportedError, CassqlValidationError } from "../src/util/errors";

describe("buildSelectQuery", () => {
  it("builds a basic select with no conditions", () => {
    const { query, params } = buildSelectQuery("stocks", {}, []);
    expect(query).toBe("SELECT * FROM stocks");
    expect(params).toEqual([]);
  });

  it("builds equality conditions with bound params (no literal injection)", () => {
    const { query, params } = buildSelectQuery("stocks", { symbol: "GARAN" }, ["symbol", "price"]);
    expect(query).toBe("SELECT symbol, price FROM stocks WHERE symbol = ?");
    expect(params).toEqual(["GARAN"]);
  });

  it("handles comparison operators", () => {
    const { query, params } = buildSelectQuery("stocks", { quantity: { $lt: 20 }, symbol: "GARAN" }, ["price", "quantity"]);
    expect(query).toBe("SELECT price, quantity FROM stocks WHERE quantity < ? AND symbol = ?");
    expect(params).toEqual([20, "GARAN"]);
  });

  it("handles multiple operators on the same column", () => {
    const { query, params } = buildSelectQuery("stocks", { price: { $gte: 100, $lte: 200 } }, []);
    expect(query).toBe("SELECT * FROM stocks WHERE price >= ? AND price <= ?");
    expect(params).toEqual([100, 200]);
  });

  it("handles $in", () => {
    const { query, params } = buildSelectQuery("stocks", { id: { $in: [1, 2, 3] } }, ["id"]);
    expect(query).toBe("SELECT id FROM stocks WHERE id IN (?, ?, ?)");
    expect(params).toEqual([1, 2, 3]);
  });

  it("rejects empty $in arrays", () => {
    expect(() => buildSelectQuery("stocks", { id: { $in: [] } }, [])).toThrow(CassqlValidationError);
  });

  it("handles $ne, $contains, $containsKey", () => {
    const { query, params } = buildSelectQuery("stocks", { tags: { $contains: "tech" }, meta: { $containsKey: "region" }, symbol: { $ne: "X" } }, []);
    expect(query).toContain("tags CONTAINS ?");
    expect(query).toContain("meta CONTAINS KEY ?");
    expect(query).toContain("symbol != ?");
    expect(params).toEqual(["tech", "region", "X"]);
  });

  it("rejects unsupported operators", () => {
    expect(() => buildSelectQuery("stocks", { price: { $regex: "x" } } as any, [])).toThrow(CassqlUnsupportedError);
  });

  it("rejects $or", () => {
    expect(() => buildSelectQuery("stocks", { $or: [{ a: 1 }] } as any, [])).toThrow(CassqlUnsupportedError);
  });

  it("builds ORDER BY: single column", () => {
    const { query } = buildSelectQuery("stocks", { symbol: "GARAN" }, [], { orderBy: { column: "trade_date", order: "desc" } });
    expect(query).toBe("SELECT * FROM stocks WHERE symbol = ? ORDER BY trade_date desc");
  });

  it("builds ORDER BY: multiple columns, shared order", () => {
    const { query } = buildSelectQuery("stocks", {}, [], { orderBy: { column: ["trade_date", "id"], order: "desc" } });
    expect(query).toBe("SELECT * FROM stocks ORDER BY trade_date desc, id desc");
  });

  it("builds ORDER BY: multiple columns, independent order", () => {
    const { query } = buildSelectQuery("stocks", {}, [], {
      orderBy: [
        { column: "trade_date", order: "desc" },
        { column: "id", order: "asc" },
      ],
    });
    expect(query).toBe("SELECT * FROM stocks ORDER BY trade_date desc, id asc");
  });

  it("builds LIMIT, PER PARTITION LIMIT, DISTINCT and ALLOW FILTERING in correct CQL order", () => {
    const { query } = buildSelectQuery("stocks", { symbol: "GARAN" }, [], {
      distinct: true,
      orderBy: { column: "trade_date", order: "desc" },
      perPartitionLimit: 5,
      limit: 100,
      allowFiltering: true,
    });
    expect(query).toBe(
      "SELECT DISTINCT * FROM stocks WHERE symbol = ? ORDER BY trade_date desc PER PARTITION LIMIT 5 LIMIT 100 ALLOW FILTERING"
    );
  });

  it("rejects malicious column/attribute names instead of interpolating them", () => {
    expect(() => buildSelectQuery("stocks", {}, ["price); DROP TABLE stocks; --"])).toThrow(CassqlValidationError);
    expect(() => buildSelectQuery("stocks; DROP TABLE stocks", {}, [])).toThrow(CassqlValidationError);
    expect(() => buildSelectQuery("stocks", { "price = 1 OR 1=1; --": 1 }, [])).toThrow(CassqlValidationError);
  });

  it("supports TOKEN() range paging", () => {
    const { query, params } = buildSelectQuery("stocks", { $token: { columns: ["id"], op: "$gt", value: [42] } }, []);
    expect(query).toBe("SELECT * FROM stocks WHERE TOKEN(id) > TOKEN(?)");
    expect(params).toEqual([42]);
  });

  it("validates attributes and limit options", () => {
    expect(() => buildSelectQuery("stocks", {}, "x" as any)).toThrow(CassqlValidationError);
    expect(() => buildSelectQuery("stocks", {}, [], { limit: -1 })).toThrow(CassqlValidationError);
    expect(() => buildSelectQuery("stocks", {}, [], { limit: 1.5 })).toThrow(CassqlValidationError);
    expect(() => buildSelectQuery("stocks", {}, [], { perPartitionLimit: -2 })).toThrow(CassqlValidationError);
  });
});

describe("buildCountQuery", () => {
  it("builds COUNT(*)", () => {
    const { query, params } = buildCountQuery("stocks", { symbol: "GARAN" });
    expect(query).toBe("SELECT COUNT(*) FROM stocks WHERE symbol = ?");
    expect(params).toEqual(["GARAN"]);
  });

  it("supports ALLOW FILTERING", () => {
    const { query } = buildCountQuery("stocks", {}, { allowFiltering: true });
    expect(query).toBe("SELECT COUNT(*) FROM stocks ALLOW FILTERING");
  });
});
