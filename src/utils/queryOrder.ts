import { SelectQueryBuilder, ObjectLiteral } from "typeorm";

/** Apply ORDER BY to a TypeORM query builder from user-supplied sort strings.
 *
 * Sort arg format:  "columnName" (asc) or "-columnName" (desc).
 * Compound: "alias-column" maps to alias.column.
 *
 * Example:
 *   sortQuery(qb, "name", "-created_at")
 */
export function sortQuery<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  ...args: (string | undefined | null)[]
): SelectQueryBuilder<T> {
  for (const sort of args) {
    if (!sort) continue;

    let col: string;
    let dir: "ASC" | "DESC";

    if (sort.startsWith("-")) {
      dir = "DESC";
      col = sort.slice(1);
    } else {
      dir = "ASC";
      col = sort;
    }

    // Support "alias-column" → "alias.column"
    const parts = col.split("-");
    const expr = parts.length > 1 ? `${parts[0]}.${parts[1]}` : col;

    qb = qb.addOrderBy(expr, dir, "NULLS LAST");
  }
  return qb;
}
