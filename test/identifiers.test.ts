import { describe, it, expect } from "vitest";
import { assertValidIdentifier, assertValidTableRef } from "../src/util/identifiers";
import { CassqlValidationError } from "../src/util/errors";

describe("assertValidIdentifier", () => {
  it("accepts normal identifiers", () => {
    expect(assertValidIdentifier("symbol", "x")).toBe("symbol");
    expect(assertValidIdentifier("_private_col", "x")).toBe("_private_col");
    expect(assertValidIdentifier("col123", "x")).toBe("col123");
  });

  it("rejects identifiers starting with a digit", () => {
    expect(() => assertValidIdentifier("1col", "x")).toThrow(CassqlValidationError);
  });

  it("rejects empty / non-string input", () => {
    expect(() => assertValidIdentifier("", "x")).toThrow(CassqlValidationError);
    expect(() => assertValidIdentifier(null, "x")).toThrow(CassqlValidationError);
    expect(() => assertValidIdentifier(undefined, "x")).toThrow(CassqlValidationError);
    expect(() => assertValidIdentifier(42, "x")).toThrow(CassqlValidationError);
  });

  it("rejects classic SQL/CQL injection payloads", () => {
    const payloads = [
      "symbol; DROP TABLE users",
      "symbol -- comment",
      "symbol/*comment*/",
      "symbol OR 1=1",
      "symbol' OR '1'='1",
      "symbol) VALUES ((SELECT 1",
      "a.b.c",
      "a b",
      "a\nb",
      "a\tb",
      "a\"b",
      "a'b",
      "a`b",
      "$symbol",
      "col-name",
      "col.name",
    ];
    for (const p of payloads) {
      expect(() => assertValidIdentifier(p, "x"), `payload: ${p}`).toThrow(CassqlValidationError);
    }
  });

  it("rejects reserved keywords", () => {
    expect(() => assertValidIdentifier("select", "x")).toThrow(CassqlValidationError);
    expect(() => assertValidIdentifier("DROP", "x")).toThrow(CassqlValidationError);
    expect(() => assertValidIdentifier("Table", "x")).toThrow(CassqlValidationError);
  });

  it("rejects identifiers over 128 chars", () => {
    expect(() => assertValidIdentifier("a".repeat(129), "x")).toThrow(CassqlValidationError);
  });
});

describe("assertValidTableRef", () => {
  it("accepts bare table names", () => {
    expect(assertValidTableRef("stocks")).toBe("stocks");
  });

  it("accepts keyspace.table", () => {
    expect(assertValidTableRef("market.stocks")).toBe("market.stocks");
  });

  it("rejects more than one dot", () => {
    expect(() => assertValidTableRef("a.b.c")).toThrow(CassqlValidationError);
  });

  it("rejects injection through a fake qualified name", () => {
    expect(() => assertValidTableRef("stocks; DROP TABLE users")).toThrow(CassqlValidationError);
    expect(() => assertValidTableRef("stocks.users; DROP TABLE x")).toThrow(CassqlValidationError);
  });
});
