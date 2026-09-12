import { column } from "./identifiers";
import { CassqlValidationError } from "./errors";

export interface OrderByClause {
  column: string;
  order: "asc" | "desc";
}

export type OrderBy = OrderByClause | OrderByClause[] | { column: string[]; order: "asc" | "desc" };

function isMultiColumnShape(orderBy: OrderBy): orderBy is { column: string[]; order: "asc" | "desc" } {
  return !Array.isArray(orderBy) && Array.isArray((orderBy as { column: unknown }).column);
}

export function buildOrderByClause(orderBy?: OrderBy): string {
  if (!orderBy) return "";

  let clauses: OrderByClause[];
  if (Array.isArray(orderBy)) {
    clauses = orderBy;
  } else if (isMultiColumnShape(orderBy)) {
    clauses = orderBy.column.map((col) => ({ column: col, order: orderBy.order }));
  } else {
    clauses = [orderBy];
  }

  const valid = clauses.filter((c) => c && c.column && c.order);
  if (valid.length === 0) return "";

  for (const c of valid) {
    if (c.order !== "asc" && c.order !== "desc") {
      throw new CassqlValidationError(`orderBy.order must be "asc" or "desc", got "${c.order}"`);
    }
  }

  return ` ORDER BY ${valid.map((c) => `${column(c.column, "orderBy column")} ${c.order}`).join(", ")}`;
}
