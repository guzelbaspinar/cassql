import { describe, it, expect } from "vitest";
import { types } from "cassandra-driver";
import { coerceBindParams, coerceBindValue } from "../src/util/bind";

describe("coerceBindValue", () => {
  it("converts native bigint to Long", () => {
    const v = coerceBindValue(9007199254740993n);
    expect(v).toBeInstanceOf(types.Long);
    expect(String(v)).toBe("9007199254740993");
  });

  it("converts bigint inside arrays", () => {
    const [a] = coerceBindParams([5n, "x"]);
    expect(a).toBeInstanceOf(types.Long);
    expect(String(a)).toBe("5");
  });
});
