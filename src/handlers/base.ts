import { Request, Response, NextFunction } from "express";
import { AppDataSource } from "../models/connection";
import { recordEvent as recordEventTask } from "../tasks";
import { settings } from "../settings";
import { sortQuery } from "../utils/queryOrder";
import { SelectQueryBuilder, ObjectLiteral } from "typeorm";

export function requireFields(body: Record<string, unknown>, fields: string[]): void {
  for (const f of fields) {
    if (!(f in body)) {
      throw Object.assign(new Error(`Missing required field: ${f}`), { status: 400 });
    }
  }
}

export async function getObjectOr404<T>(
  fn: () => Promise<T | null | undefined>
): Promise<T> {
  const result = await fn();
  if (!result) {
    throw Object.assign(new Error("Not found"), { status: 404 });
  }
  return result;
}

export function paginate<T>(
  results: T[],
  page: number,
  pageSize: number,
  serializer: (item: T) => unknown
): { count: number; page: number; page_size: number; results: unknown[] } {
  const count = results.length;

  if (page < 1) throw Object.assign(new Error("Page must be positive integer."), { status: 400 });
  if (pageSize > 250 || pageSize < 1) throw Object.assign(new Error("Page size is out of range (1-250)."), { status: 400 });
  if ((page - 1) * pageSize + 1 > count && count > 0) throw Object.assign(new Error("Page is out of range."), { status: 400 });

  const start = (page - 1) * pageSize;
  const items = results.slice(start, start + pageSize).map(serializer);

  return { count, page, page_size: pageSize, results: items };
}

export function recordEvent(
  org: { id: number },
  user: { id?: string | number; name?: string; isApiUser?: () => boolean },
  options: Record<string, unknown>,
  req: Request
): void {
  if (user.isApiUser?.()) {
    options.api_key = user.name;
    options.org_id = org.id;
  } else {
    options.user_id = user.id;
    options.user_name = user.name;
    options.org_id = org.id;
  }

  options.user_agent = req.headers["user-agent"] ?? "";
  options.ip = req.ip;

  if (!options.timestamp) options.timestamp = Math.floor(Date.now() / 1000);

  recordEventTask(options as Record<string, unknown>);
}

export function orgScopedRule(rule: string): string {
  if (settings.MULTI_ORG) return `/:org_slug${rule}`;
  return rule;
}

export function filterByTags<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  column: string,
  req: Request
): SelectQueryBuilder<T> {
  const tags = req.query.tags;
  if (tags) {
    const tagArray = Array.isArray(tags) ? tags : [tags];
    qb = qb.andWhere(`${column} @> ARRAY[:...tags]`, { tags: tagArray });
  }
  return qb;
}

export function orderResults<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  defaultOrder: string,
  allowedOrders: Record<string, string>,
  req: Request,
  fallback = true
): SelectQueryBuilder<T> {
  const requestedOrder = ((req.query.order as string) ?? "").trim();

  if (!requestedOrder && !fallback) return qb;

  const selectedOrder = allowedOrders[requestedOrder] ?? (fallback ? defaultOrder : null);
  if (!selectedOrder) return qb;

  return sortQuery(qb.orderBy(), selectedOrder);
}

/** Standard JSON error handler middleware */
export function apiErrorHandler(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err.status ?? err.statusCode ?? 500;
  res.status(status).json({ message: err.message ?? "Internal server error" });
}
