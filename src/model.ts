import type cassandra from "cassandra-driver";
import { assertValidTableRef } from "./util/identifiers";
import { CassqlExecutionError, CassqlNotAppliedError, CassqlValidationError } from "./util/errors";
import { Conditions } from "./util/conditions";
import { buildSelectQuery, buildCountQuery, SelectOptions, BuiltQuery } from "./query/select";
import { buildInsertQuery, InsertOptions } from "./query/insert";
import { buildUpdateQuery, UpdateFields, UpdateOptions } from "./query/update";
import { buildDeleteQuery, DeleteOptions } from "./query/delete";
import { buildBatchQuery, BatchOptions } from "./query/batch";
import { noopLogger, type Logger } from "./client";

export type Row = Record<string, unknown>;
export type OnReadCallback = (row: Row) => void | Promise<void>;
export type OnEndCallback = () => void | Promise<void>;

/** Options forwarded as-is to the driver's `client.execute` (consistency, hints, etc). */
export interface ExecOptions {
  consistency?: cassandra.types.consistencies;
  isIdempotent?: boolean;
  fetchSize?: number;
  pageState?: string | Buffer;
  /** Per-query read timeout in milliseconds (maps to the driver's `readTimeout`). */
  readTimeout?: number;
  autoPage?: boolean;
}

export interface FindResult<T extends Row = Row> {
  rows: T[];
  pageState?: string;
}

/**
 * A statement built ahead of time (e.g. via `Model.buildInsert`) for use inside
 * `batchExecute`.
 */
export interface Statement extends BuiltQuery {}

export class Model<T extends Row = Row> {
  protected readonly table: string;
  protected readonly client: cassandra.Client;
  protected readonly logger: Logger;

  constructor(tableName: string, client: cassandra.Client, logger: Logger = noopLogger) {
    this.table = assertValidTableRef(tableName, "Model table name");
    this.client = client;
    this.logger = logger;
  }

  // ---------------------------------------------------------------------
  // SELECT
  // ---------------------------------------------------------------------

  async find(conditions: Conditions = {}, attributes: string[] = [], options: SelectOptions & ExecOptions = {}): Promise<T[]> {
    const { query, params } = buildSelectQuery(this.table, conditions, attributes, options);
    const result = await this.execute(query, params, options);
    return (result.rows as T[]) ?? [];
  }

  /** Like `find`, but also returns the driver's paging state for manual pagination. */
  async findPage(
    conditions: Conditions = {},
    attributes: string[] = [],
    options: SelectOptions & ExecOptions = {}
  ): Promise<FindResult<T>> {
    const { query, params } = buildSelectQuery(this.table, conditions, attributes, options);
    const result = await this.execute(query, params, options);
    return { rows: (result.rows as T[]) ?? [], pageState: result.pageState };
  }

  async findOne(conditions: Conditions = {}, attributes: string[] = [], options: SelectOptions & ExecOptions = {}): Promise<T | null> {
    const rows = await this.find(conditions, attributes, { ...options, limit: 1 });
    return rows[0] ?? null;
  }

  async count(conditions: Conditions = {}, options: Pick<SelectOptions, "allowFiltering"> & ExecOptions = {}): Promise<number> {
    const { query, params } = buildCountQuery(this.table, conditions, options);
    const result = await this.execute(query, params, options);
    const row = result.rows?.[0] as { count?: cassandra.types.Long | number } | undefined;
    if (!row || row.count === undefined) return 0;
    return typeof row.count === "number" ? row.count : Number(row.count);
  }

  stream(
    conditions: Conditions,
    attributes: string[],
    onRead: OnReadCallback,
    onEnd: OnEndCallback = () => {},
    options: SelectOptions & ExecOptions = {}
  ): Promise<void> {
    if (typeof onRead !== "function") {
      return Promise.reject(new CassqlValidationError("onRead must be a function"));
    }
    const { query, params } = buildSelectQuery(this.table, conditions, attributes, options);

    return new Promise((resolve, reject) => {
      const stream = this.client.stream(query, params, {
        prepare: true,
        autoPage: options.autoPage ?? true,
        fetchSize: options.fetchSize,
        consistency: options.consistency,
      });

      stream.on("readable", function readableHandler(this: NodeJS.ReadableStream) {
        let row: unknown;
        // eslint-disable-next-line no-cond-assign
        while ((row = this.read())) {
          Promise.resolve(onRead(row as Row)).catch((err) => stream.emit("error", err));
        }
      });

      stream.on("end", () => {
        Promise.resolve(onEnd()).then(resolve, reject);
      });

      stream.on("error", (error: Error) => {
        this.logger.error("cassql stream error", { query, params, error });
        reject(new CassqlExecutionError("Cassandra stream error", query, params, error));
      });
    });
  }

  // ---------------------------------------------------------------------
  // INSERT
  // ---------------------------------------------------------------------

  /**
   * Inserts a row. When `options.ifNotExists` is set, returns whether the write was
   * applied (Lightweight Transaction); throws `CassqlNotAppliedError` if you'd rather
   * treat "already exists" as an error — use `insertOrThrow` for that behavior.
   */
  async insert(data: Record<string, unknown>, options: InsertOptions & ExecOptions = {}): Promise<{ applied: boolean; existing?: Row }> {
    const { query, params } = buildInsertQuery(this.table, data, options);
    const result = await this.execute(query, params, options);
    if (!options.ifNotExists) return { applied: true };
    const row = result.rows?.[0] as (Row & { "[applied]"?: boolean }) | undefined;
    const applied = row ? Boolean(row["[applied]"]) : true;
    return { applied, existing: applied ? undefined : row };
  }

  async insertOrThrow(data: Record<string, unknown>, options: InsertOptions & ExecOptions = {}): Promise<void> {
    const { applied, existing } = await this.insert(data, options);
    if (!applied) {
      throw new CassqlNotAppliedError(`INSERT IF NOT EXISTS was not applied on "${this.table}": row already exists`, existing);
    }
  }

  // ---------------------------------------------------------------------
  // UPDATE
  // ---------------------------------------------------------------------

  async update(
    updateFields: UpdateFields,
    conditions: Conditions,
    options: UpdateOptions & ExecOptions = {}
  ): Promise<{ applied: boolean; existing?: Row }> {
    const { query, params } = buildUpdateQuery(this.table, updateFields, conditions, options);
    const result = await this.execute(query, params, options);
    if (!options.ifExists && !options.if) return { applied: true };
    const row = result.rows?.[0] as (Row & { "[applied]"?: boolean }) | undefined;
    const applied = row ? Boolean(row["[applied]"]) : true;
    return { applied, existing: applied ? undefined : row };
  }

  // ---------------------------------------------------------------------
  // DELETE
  // ---------------------------------------------------------------------

  async delete(conditions: Conditions, options: DeleteOptions & ExecOptions = {}): Promise<{ applied: boolean; existing?: Row }> {
    const { query, params } = buildDeleteQuery(this.table, conditions, options);
    const result = await this.execute(query, params, options);
    if (!options.ifExists && !options.if) return { applied: true };
    const row = result.rows?.[0] as (Row & { "[applied]"?: boolean }) | undefined;
    const applied = row ? Boolean(row["[applied]"]) : true;
    return { applied, existing: applied ? undefined : row };
  }

  // ---------------------------------------------------------------------
  // Statement builders (for composing a BATCH across one or more Models)
  // ---------------------------------------------------------------------

  buildInsert(data: Record<string, unknown>, options: InsertOptions = {}): Statement {
    return buildInsertQuery(this.table, data, options);
  }

  buildUpdate(updateFields: UpdateFields, conditions: Conditions, options: UpdateOptions = {}): Statement {
    return buildUpdateQuery(this.table, updateFields, conditions, options);
  }

  buildDelete(conditions: Conditions, options: DeleteOptions = {}): Statement {
    return buildDeleteQuery(this.table, conditions, options);
  }

  // ---------------------------------------------------------------------
  // BATCH (static: combines statements possibly spanning several Models/tables)
  // ---------------------------------------------------------------------

  static async batchExecute(
    client: cassandra.Client,
    statements: Statement[],
    options: BatchOptions & ExecOptions = {},
    logger: Logger = noopLogger
  ): Promise<void> {
    if (!Array.isArray(statements) || statements.length === 0) {
      throw new CassqlValidationError("batchExecute requires a non-empty array of statements");
    }
    const queries = statements.map((s) => ({ query: s.query, params: s.params }));
    try {
      // Note: COUNTER batches need no special driver flag — Cassandra infers a counter
      // batch from the fact that every statement inside it is a counter UPDATE.
      // `logged: false` for UNLOGGED batches disables cross-partition atomicity for
      // better throughput; LOGGED (the default) is atomic but slower.
      await client.batch(queries, {
        prepare: true,
        logged: options.type !== "unlogged",
        consistency: options.consistency,
      });
    } catch (error) {
      logger.error("cassql batch error", { statements, error });
      throw new CassqlExecutionError("Cassandra batch error", buildBatchQuery(statements, options).query, [], error);
    }
  }

  /** Escape hatch: build (but do not execute) a raw combined `BEGIN BATCH ... APPLY BATCH` string. */
  static buildBatch(statements: Statement[], options: BatchOptions = {}): Statement {
    return buildBatchQuery(statements, options);
  }

  // ---------------------------------------------------------------------
  // Raw escape hatch
  // ---------------------------------------------------------------------

  /**
   * Executes an arbitrary CQL string with bound parameters. This is the deliberate
   * escape hatch for anything cassql's builders don't cover (custom functions, DDL,
   * etc). Callers are responsible for never concatenating untrusted input into `query`;
   * all dynamic values must go through `params`.
   */
  async raw(query: string, params: unknown[] = [], options: ExecOptions = {}): Promise<Row[]> {
    const result = await this.execute(query, params, options);
    return (result.rows as Row[]) ?? [];
  }

  private async execute(
    query: string,
    params: unknown[],
    options: ExecOptions = {}
  ): Promise<{ rows: Row[] | undefined; pageState?: string }> {
    try {
      const result = await this.client.execute(query, params, {
        prepare: true,
        consistency: options.consistency,
        isIdempotent: options.isIdempotent,
        fetchSize: options.fetchSize,
        pageState: options.pageState,
        readTimeout: options.readTimeout,
      });
      return { rows: result?.rows as Row[] | undefined, pageState: result?.pageState };
    } catch (error) {
      this.logger.error("cassql execute error", { query, params, error });
      throw new CassqlExecutionError(`Cassandra query failed: ${(error as Error).message}`, query, params, error);
    }
  }
}
