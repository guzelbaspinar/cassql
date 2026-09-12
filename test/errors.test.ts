import { describe, it, expect } from "vitest";
import {
  CassqlError,
  CassqlValidationError,
  CassqlUnsupportedError,
  CassqlExecutionError,
  CassqlNotAppliedError,
} from "../src/util/errors";

describe("error classes", () => {
  it("constructs typed errors with expected shape", () => {
    const base = new CassqlError("base");
    expect(base).toBeInstanceOf(Error);
    expect(base.name).toBe("CassqlError");

    expect(new CassqlValidationError("bad")).toBeInstanceOf(CassqlError);
    expect(new CassqlUnsupportedError("nope")).toBeInstanceOf(CassqlError);

    const exec = new CassqlExecutionError("exec", "SELECT 1", [1], new Error("cause"));
    expect(exec.query).toBe("SELECT 1");
    expect(exec.params).toEqual([1]);
    expect(exec.cause).toBeInstanceOf(Error);

    const notApplied = new CassqlNotAppliedError("lwt", { id: 1 });
    expect(notApplied.existingRow).toEqual({ id: 1 });
  });
});
