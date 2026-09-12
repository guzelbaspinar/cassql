import { describe, it, expect, vi, beforeEach } from "vitest";

const { connect, shutdown, ClientCtor } = vi.hoisted(() => {
  const connect = vi.fn().mockResolvedValue(undefined);
  const shutdown = vi.fn().mockResolvedValue(undefined);
  const ClientCtor = vi.fn(function ClientMock() {
    return { connect, shutdown };
  });
  return { connect, shutdown, ClientCtor };
});

vi.mock("cassandra-driver", () => ({
  default: { Client: ClientCtor },
}));

import { CassandraClient } from "../src/client";

describe("CassandraClient", () => {
  beforeEach(() => {
    connect.mockClear();
    shutdown.mockClear();
    ClientCtor.mockClear();
  });

  it("wraps driver Client with default noop logger", () => {
    const wrapper = new CassandraClient({ contactPoints: ["127.0.0.1"] });
    expect(ClientCtor).toHaveBeenCalledWith({ contactPoints: ["127.0.0.1"] });
    expect(wrapper.client).toBeDefined();
    expect(wrapper.logger.info).toBeTypeOf("function");
  });

  it("connect() invokes default noop logger info", async () => {
    const wrapper = new CassandraClient({ contactPoints: ["127.0.0.1"] });
    await wrapper.connect();
    expect(connect).toHaveBeenCalled();
  });

  it("default logger noop methods do not throw", () => {
    const wrapper = new CassandraClient({ contactPoints: ["127.0.0.1"] });
    expect(() => wrapper.logger.warn("warn")).not.toThrow();
    expect(() => wrapper.logger.error("error")).not.toThrow();
    expect(() => wrapper.logger.debug?.("debug")).not.toThrow();
  });

  it("connect() and disconnect() call driver and log", async () => {
    const info = vi.fn();
    const wrapper = new CassandraClient({ contactPoints: ["127.0.0.1"] }, { info, warn: vi.fn(), error: vi.fn() });
    await wrapper.connect();
    expect(connect).toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("cassql: Cassandra connection pool established");

    await wrapper.disconnect();
    expect(shutdown).toHaveBeenCalled();
    expect(info).toHaveBeenCalledWith("cassql: Cassandra connection pool shut down");
  });
});
