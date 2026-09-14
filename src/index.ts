export { CassandraClient } from "./client";
export type { Logger } from "./client";

export { Model } from "./model";
export type { Row, ExecOptions, FindResult, OnReadCallback, OnEndCallback, Statement, ModelOptions } from "./model";

export type { Conditions, ConditionValue, Primitive } from "./util/conditions";
export type { OrderBy, OrderByClause } from "./util/orderBy";
export type { UsingOptions } from "./util/using";
export type { SelectOptions, BuiltQuery } from "./query/select";
export type { InsertOptions } from "./query/insert";
export type { UpdateFields, UpdateValue, UpdateOptions } from "./query/update";
export type { DeleteOptions, DeleteSelector } from "./query/delete";
export type { BatchOptions } from "./query/batch";

export {
  CassqlError,
  CassqlValidationError,
  CassqlUnsupportedError,
  CassqlExecutionError,
  CassqlNotAppliedError,
  redactParamsForLogging,
} from "./util/errors";

// Lower-level, stateless query builders — useful for composing custom batches
// or for testing generated CQL without a live connection.
export { buildSelectQuery, buildCountQuery } from "./query/select";
export { buildInsertQuery } from "./query/insert";
export { buildUpdateQuery } from "./query/update";
export { buildDeleteQuery } from "./query/delete";
export { buildBatchQuery } from "./query/batch";
