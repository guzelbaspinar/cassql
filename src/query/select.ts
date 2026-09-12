import { assertValidTableRef, column } from "../util/identifiers";
import { buildWhereClause, Conditions } from "../util/conditions";
import { buildOrderByClause, OrderBy } from "../util/orderBy";
import { CassqlValidationError } from "../util/errors";

export interface SelectOptions {
  orderBy?: OrderBy;
  limit?: number;
  /** LIMIT applied per partition (CQL: `PER PARTITION LIMIT`). */
  perPartitionLimit?: number;
  distinct?: boolean;
  /**
   * Explicitly opt in to `ALLOW FILTERING`. Off by default: queries that would
   * require it fail server-side rather than silently degrading performance, unless
   * the caller deliberately acknowledges the cost.
   */
  allowFiltering?: boolean;
  /** Cassandra driver paging state token (base64 string or Buffer) for manual pagination. */
  pageState?: string | Buffer;
  fetchSize?: number;
}

export interface BuiltQuery {
  query: string;
  params: unknown[];
}

export function buildSelectQuery(
  table: string,
  conditions: Conditions,
  attributes: string[],
  options: SelectOptions = {}
): BuiltQuery {
  assertValidTableRef(table);
  if (!Array.isArray(attributes)) {
    throw new CassqlValidationError("attributes must be an array of column names");
  }
  if (options.limit !== undefined && (!Number.isInteger(options.limit) || options.limit < 0)) {
    throw new CassqlValidationError("limit must be a non-negative integer");
  }
  if (options.perPartitionLimit !== undefined && (!Number.isInteger(options.perPartitionLimit) || options.perPartitionLimit < 0)) {
    throw new CassqlValidationError("perPartitionLimit must be a non-negative integer");
  }

  const params: unknown[] = [];
  const selectClause = attributes.length > 0 ? attributes.map((a) => column(a, "select attribute")).join(", ") : "*";
  const distinct = options.distinct ? "DISTINCT " : "";
  const where = buildWhereClause(conditions, params);
  const orderBy = buildOrderByClause(options.orderBy);
  const perPartitionLimit = options.perPartitionLimit !== undefined ? ` PER PARTITION LIMIT ${options.perPartitionLimit}` : "";
  const limit = options.limit !== undefined ? ` LIMIT ${options.limit}` : "";
  const allowFiltering = options.allowFiltering ? " ALLOW FILTERING" : "";

  // CQL grammar order: WHERE, GROUP BY, ORDER BY, PER PARTITION LIMIT, LIMIT, ALLOW FILTERING
  const query = `SELECT ${distinct}${selectClause} FROM ${table}${where}${orderBy}${perPartitionLimit}${limit}${allowFiltering}`;
  return { query, params };
}

export function buildCountQuery(table: string, conditions: Conditions, options: Pick<SelectOptions, "allowFiltering"> = {}): BuiltQuery {
  assertValidTableRef(table);
  const params: unknown[] = [];
  const where = buildWhereClause(conditions, params);
  const allowFiltering = options.allowFiltering ? " ALLOW FILTERING" : "";
  return { query: `SELECT COUNT(*) FROM ${table}${where}${allowFiltering}`, params };
}
