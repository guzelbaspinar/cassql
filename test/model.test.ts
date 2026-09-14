import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { Model } from "../src/model";
import { CassqlExecutionError, CassqlNotAppliedError, CassqlValidationError } from "../src/util/errors";

function makeMockClient() {
  return {
    execute: vi.fn(),
    batch: vi.fn(),
    stream: vi.fn(),
  };
}

describe("Model", () => {
  let client: ReturnType<typeof makeMockClient>;
  let model: Model;

  beforeEach(() => {
    client = makeMockClient();
    model = new Model("market.stocks", client as any);
  });

  it("uses default logger when none is provided", async () => {
    const defaultModel = new Model("market.stocks", client as any);
    client.execute.mockRejectedValue(new Error("fail"));
    await expect(defaultModel.find({ id: 1 }, [])).rejects.toBeInstanceOf(CassqlExecutionError);
  });

  it("rejects an invalid table name at construction time", () => {
    expect(() => new Model("stocks; DROP TABLE x", client as any)).toThrow(CassqlValidationError);
  });

  it("find() executes a prepared query and returns rows", async () => {
    client.execute.mockResolvedValue({ rows: [{ symbol: "GARAN" }] });
    const rows = await model.find({ symbol: "GARAN" }, ["symbol"]);
    expect(rows).toEqual([{ symbol: "GARAN" }]);
    expect(client.execute).toHaveBeenCalledWith(
      "SELECT symbol FROM market.stocks WHERE symbol = ?",
      ["GARAN"],
      expect.objectContaining({ prepare: true })
    );
  });

  it("find() returns [] when the driver returns no rows", async () => {
    client.execute.mockResolvedValue({});
    const rows = await model.find({}, []);
    expect(rows).toEqual([]);
  });

  it("findOne() applies LIMIT 1 and returns a single row or null", async () => {
    client.execute.mockResolvedValue({ rows: [{ id: 1 }] });
    const row = await model.findOne({ id: 1 });
    expect(row).toEqual({ id: 1 });
    expect(client.execute.mock.calls[0][0]).toContain("LIMIT 1");

    client.execute.mockResolvedValue({ rows: [] });
    expect(await model.findOne({ id: 999 })).toBeNull();
  });

  it("count() parses COUNT(*) result", async () => {
    client.execute.mockResolvedValue({ rows: [{ count: 42 }] });
    expect(await model.count({})).toBe(42);
  });

  it("count() returns 0 when count is missing", async () => {
    client.execute.mockResolvedValue({ rows: [{}] });
    expect(await model.count({})).toBe(0);
    client.execute.mockResolvedValue({ rows: [] });
    expect(await model.count({})).toBe(0);
  });

  it("count() coerces numeric driver Long values", async () => {
    client.execute.mockResolvedValue({ rows: [{ count: 7n as unknown as number }] });
    expect(await model.count({})).toBe(7);
  });

  it("findPage() returns rows and pageState", async () => {
    client.execute.mockResolvedValue({ rows: [{ id: 1 }], pageState: "abc" });
    const page = await model.findPage({}, [], { fetchSize: 10 });
    expect(page).toEqual({ rows: [{ id: 1 }], pageState: "abc" });
  });

  it("findPage() coalesces missing rows to an empty array", async () => {
    client.execute.mockResolvedValue({ pageState: "next" });
    expect(await model.findPage({}, [])).toEqual({ rows: [], pageState: "next" });
  });

  it("insert() performs a plain insert", async () => {
    client.execute.mockResolvedValue({});
    const result = await model.insert({ symbol: "GARAN", price: 1 });
    expect(result).toEqual({ applied: true });
    expect(client.execute).toHaveBeenCalledWith(
      "INSERT INTO market.stocks (symbol, price) VALUES (?, ?)",
      ["GARAN", 1],
      expect.objectContaining({ prepare: true })
    );
  });

  it("insert() with ifNotExists reports applied=false and existing row on conflict", async () => {
    client.execute.mockResolvedValue({ rows: [{ "[applied]": false, symbol: "GARAN" }] });
    const result = await model.insert({ symbol: "GARAN" }, { ifNotExists: true });
    expect(result.applied).toBe(false);
    expect(result.existing).toEqual({ "[applied]": false, symbol: "GARAN" });
  });

  it("insert() with ifNotExists reports applied=true when row is applied", async () => {
    client.execute.mockResolvedValue({ rows: [{ "[applied]": true }] });
    const result = await model.insert({ symbol: "GARAN" }, { ifNotExists: true });
    expect(result).toEqual({ applied: true });
  });

  it("insertOrThrow() throws CassqlNotAppliedError when the LWT is not applied", async () => {
    client.execute.mockResolvedValue({ rows: [{ "[applied]": false }] });
    await expect(model.insertOrThrow({ symbol: "GARAN" }, { ifNotExists: true })).rejects.toBeInstanceOf(CassqlNotAppliedError);
  });

  it("update() runs and reports LWT outcome", async () => {
    client.execute.mockResolvedValue({ rows: [{ "[applied]": true }] });
    const result = await model.update({ price: 1 }, { id: 1 }, { ifExists: true });
    expect(result.applied).toBe(true);
  });

  it("update() LWT without result row defaults to applied", async () => {
    client.execute.mockResolvedValue({});
    expect(await model.update({ v: 1 }, { id: 1 }, { ifExists: true })).toEqual({ applied: true });
  });

  it("update() with column IF reports not applied", async () => {
    client.execute.mockResolvedValue({ rows: [{ "[applied]": false, v: 0 }] });
    const result = await model.update({ v: 1 }, { id: 1 }, { if: { v: 0 } });
    expect(result.applied).toBe(false);
    expect(result.existing).toEqual({ "[applied]": false, v: 0 });
  });

  it("delete() runs a delete", async () => {
    client.execute.mockResolvedValue({});
    const result = await model.delete({ id: 1 });
    expect(result).toEqual({ applied: true });
    expect(client.execute).toHaveBeenCalledWith("DELETE FROM market.stocks WHERE id = ?", [1], expect.objectContaining({ prepare: true }));
  });

  it("delete() with IF EXISTS reports LWT outcome", async () => {
    client.execute.mockResolvedValue({ rows: [{ "[applied]": false }] });
    const result = await model.delete({ id: 1 }, { ifExists: true });
    expect(result.applied).toBe(false);
  });

  it("delete() LWT without result row defaults to applied", async () => {
    client.execute.mockResolvedValue({ rows: undefined });
    expect(await model.delete({ id: 1 }, { if: { v: 1 } })).toEqual({ applied: true });
  });

  it("wraps driver execution errors in CassqlExecutionError with query/params context", async () => {
    client.execute.mockRejectedValue(new Error("boom"));
    await expect(model.find({ id: 1 }, [])).rejects.toMatchObject({
      constructor: CassqlExecutionError,
      query: expect.stringContaining("SELECT"),
      params: [1],
    });
  });

  it("logs execute errors when logger is provided", async () => {
    const errorSpy = vi.fn();
    const loggedModel = new Model("market.stocks", client as any, { info: vi.fn(), warn: vi.fn(), error: errorSpy });
    client.execute.mockRejectedValue(new Error("boom"));
    await expect(loggedModel.find({ id: 1 }, [])).rejects.toBeInstanceOf(CassqlExecutionError);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("redacts logged params via redactParams while the thrown error keeps raw params", async () => {
    const errorSpy = vi.fn();
    const redactedModel = new Model(
      "market.stocks",
      client as any,
      { info: vi.fn(), warn: vi.fn(), error: errorSpy },
      { redactParams: () => ["***"] }
    );
    client.execute.mockRejectedValue(new Error("boom"));
    const promise = redactedModel.find({ id: "super-secret" as any }, []);
    await expect(promise).rejects.toMatchObject({ params: ["super-secret"] });
    expect(errorSpy).toHaveBeenCalledWith("cassql execute error", expect.objectContaining({ params: ["***"] }));
  });

  it("stream() rejects when onEnd fails", async () => {
    const fakeStream = new EventEmitter() as any;
    fakeStream.read = vi.fn().mockReturnValue(null);
    client.stream.mockReturnValue(fakeStream);

    const promise = model.stream({}, [], () => {}, () => Promise.reject(new Error("end fail")));
    fakeStream.emit("end");
    await expect(promise).rejects.toThrow("end fail");
  });

  it("stream() pipes rows through onRead and resolves onEnd", async () => {
    const fakeStream = new EventEmitter() as any;
    fakeStream.read = vi.fn();
    client.stream.mockReturnValue(fakeStream);

    const rows: unknown[] = [];
    const onRead = (row: unknown) => {
      rows.push(row);
    };

    const promise = model.stream({ symbol: "GARAN" }, [], onRead, () => {});

    // Simulate one readable batch then end.
    let reads = 0;
    fakeStream.read.mockImplementation(() => {
      reads += 1;
      return reads === 1 ? { symbol: "GARAN" } : null;
    });
    fakeStream.emit("readable");
    fakeStream.emit("end");

    await promise;
    expect(rows).toEqual([{ symbol: "GARAN" }]);
  });

  it("stream() reads multiple rows in one readable event", async () => {
    const fakeStream = new EventEmitter() as any;
    let reads = 0;
    fakeStream.read = vi.fn().mockImplementation(() => {
      reads += 1;
      return reads <= 2 ? { id: reads } : null;
    });
    client.stream.mockReturnValue(fakeStream);

    const rows: unknown[] = [];
    const promise = model.stream({}, [], (row) => rows.push(row), () => {}, { autoPage: false });
    fakeStream.emit("readable");
    fakeStream.emit("end");
    await promise;
    expect(rows).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("stream() rejects when onRead is not a function", async () => {
    await expect(model.stream({}, [], null as any)).rejects.toBeInstanceOf(CassqlValidationError);
  });

  it("stream() returns a rejected Promise (not a synchronous throw) when query building fails", () => {
    let threwSynchronously = false;
    let result: Promise<void> | undefined;
    try {
      result = model.stream({}, ["bad name"], () => {});
    } catch {
      threwSynchronously = true;
    }
    expect(threwSynchronously).toBe(false);
    expect(result).toBeInstanceOf(Promise);
    return expect(result).rejects.toBeInstanceOf(CassqlValidationError);
  });

  it("stream() rejects on driver error and logs", async () => {
    const fakeStream = new EventEmitter() as any;
    fakeStream.read = vi.fn();
    client.stream.mockReturnValue(fakeStream);
    const errorSpy = vi.fn();
    const loggedModel = new Model("market.stocks", client as any, { info: vi.fn(), warn: vi.fn(), error: errorSpy });

    const promise = loggedModel.stream({}, [], () => {}, () => {});
    fakeStream.emit("error", new Error("stream fail"));
    await expect(promise).rejects.toBeInstanceOf(CassqlExecutionError);
    expect(errorSpy).toHaveBeenCalled();
  });

  it("stream() propagates onRead rejection as stream error", async () => {
    const fakeStream = new EventEmitter() as any;
    let reads = 0;
    fakeStream.read = vi.fn().mockImplementation(() => {
      reads += 1;
      return reads === 1 ? { id: 1 } : null;
    });
    client.stream.mockReturnValue(fakeStream);

    const promise = model.stream({}, [], () => Promise.reject(new Error("read fail")), () => {});
    fakeStream.emit("readable");
    await expect(promise).rejects.toBeInstanceOf(CassqlExecutionError);
  });

  it("Model.batchExecute() sends combined statements through client.batch", async () => {
    client.batch.mockResolvedValue({});
    const insertStmt = model.buildInsert({ id: 1 });
    const updateStmt = model.buildUpdate({ v: 2 }, { id: 1 });
    await Model.batchExecute(client as any, [insertStmt, updateStmt]);
    expect(client.batch).toHaveBeenCalledWith(
      [
        { query: insertStmt.query, params: insertStmt.params },
        { query: updateStmt.query, params: updateStmt.params },
      ],
      expect.objectContaining({ prepare: true, logged: true })
    );
  });

  it("Model.batchExecute() supports unlogged batches and validates input", async () => {
    await expect(Model.batchExecute(client as any, [])).rejects.toBeInstanceOf(CassqlValidationError);
    client.batch.mockResolvedValue({});
    const stmt = model.buildInsert({ id: 1 });
    await Model.batchExecute(client as any, [stmt], { type: "unlogged" });
    expect(client.batch).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ logged: false }));
  });

  it("Model.batchExecute() with default logger on failure", async () => {
    client.batch.mockRejectedValue(new Error("batch fail"));
    const stmt = model.buildInsert({ id: 1 });
    await expect(Model.batchExecute(client as any, [stmt])).rejects.toBeInstanceOf(CassqlExecutionError);
  });

  it("Model.batchExecute() wraps batch errors", async () => {
    const errorSpy = vi.fn();
    client.batch.mockRejectedValue(new Error("batch boom"));
    const stmt = model.buildInsert({ id: 1 });
    await expect(Model.batchExecute(client as any, [stmt], {}, { info: vi.fn(), warn: vi.fn(), error: errorSpy })).rejects.toBeInstanceOf(
      CassqlExecutionError
    );
    expect(errorSpy).toHaveBeenCalled();
  });

  it("Model.buildBatch() returns combined statement", () => {
    const stmt = model.buildInsert({ id: 1 });
    const batch = Model.buildBatch([stmt], { type: "unlogged" });
    expect(batch.query).toContain("BEGIN UNLOGGED BATCH");
  });

  it("model.buildDelete() returns a delete statement", () => {
    const stmt = model.buildDelete({ id: 1 });
    expect(stmt.query).toBe("DELETE FROM market.stocks WHERE id = ?");
  });

  it("raw() executes an arbitrary query with bound params", async () => {
    client.execute.mockResolvedValue({ rows: [{ ok: 1 }] });
    const rows = await model.raw("SELECT release_version FROM system.local WHERE key = ?", ["local"]);
    expect(rows).toEqual([{ ok: 1 }]);
  });

  it("raw() returns [] when driver omits rows", async () => {
    client.execute.mockResolvedValue({});
    expect(await model.raw("SELECT 1")).toEqual([]);
  });

  it("insert() ifNotExists without result row defaults to applied", async () => {
    client.execute.mockResolvedValue({});
    expect(await model.insert({ id: 1 }, { ifNotExists: true })).toEqual({ applied: true });
  });

  it("stream() uses default onEnd when omitted", async () => {
    const fakeStream = new EventEmitter() as any;
    fakeStream.read = vi.fn().mockReturnValue(null);
    client.stream.mockReturnValue(fakeStream);

    const promise = model.stream({}, [], () => {});
    fakeStream.emit("end");
    await promise;
  });
});
