import cassandra from "cassandra-driver";

export interface Logger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug?: (...args: unknown[]) => void;
}

export const noopLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
};

/**
 * Thin wrapper around `cassandra-driver`'s Client. Create exactly one instance per
 * application/process and reuse it across every Model — the driver manages its own
 * connection pool internally and is not cheap to re-create per request.
 */
export class CassandraClient {
  readonly logger: Logger;
  readonly client: cassandra.Client;

  constructor(connectionOptions: cassandra.ClientOptions, logger: Logger = noopLogger) {
    this.client = new cassandra.Client(connectionOptions);
    this.logger = logger;
  }

  /**
   * Optional: eagerly establishes the connection pool. Not required — the driver
   * connects lazily on the first query — but useful to fail fast at startup.
   */
  async connect(): Promise<void> {
    await this.client.connect();
    this.logger.info("cassql: Cassandra connection pool established");
  }

  async disconnect(): Promise<void> {
    await this.client.shutdown();
    this.logger.info("cassql: Cassandra connection pool shut down");
  }
}
