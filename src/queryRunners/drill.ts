import axios from "axios";
import { BaseQueryRunner, Column, RunQueryResult, TYPE_INTEGER, TYPE_FLOAT, TYPE_BOOLEAN, TYPE_DATETIME, register } from "./index";

function convertType(value: unknown, type: string): unknown {
  if (value === null || value === undefined || value === "") return "";
  if (type === TYPE_INTEGER) return parseInt(String(value));
  if (type === TYPE_FLOAT) return parseFloat(String(value));
  if (type === TYPE_BOOLEAN) return String(value).toLowerCase() === "true";
  if (type === TYPE_DATETIME) return new Date(String(value));
  return String(value);
}

export class Drill extends BaseQueryRunner {
  static runnerType(): string { return "drill"; }
  static runnerName(): string { return "Apache Drill"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        url: { type: "string", title: "Drill URL" },
        username: { type: "string" },
        password: { type: "string" },
        allowed_schemas: { type: "string", title: "List of schemas (comma-separated)" },
      },
      required: ["url"],
      secret: ["password"],
    };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    try {
      const cfg = this.configuration;
      const resp = await axios.post(
        `${cfg.url}/query.json`,
        { queryType: "SQL", query },
        cfg.username
          ? { auth: { username: cfg.username as string, password: (cfg.password as string) ?? "" } }
          : {}
      );
      const data = resp.data as { columns: string[]; rows: Record<string, unknown>[] };
      if (!data.columns?.length) return [{ columns: [], rows: [] }, null];

      const firstRow = data.rows[0] ?? {};
      const columns = this.fetchColumns(
        data.columns.map((c) => [c, this.guessTypeFromValue(firstRow[c])])
      );
      const typeMap: Record<string, string> = {};
      columns.forEach((col) => { if (col.type) typeMap[col.name] = col.type; });

      const rows = data.rows.map((row) => {
        const r: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(row)) {
          r[k] = convertType(v, typeMap[k] ?? "string");
        }
        return r;
      });
      return [{ columns, rows }, null];
    } catch (err: any) {
      return [null, err.response?.data?.errorMessage ?? err.message ?? String(err)];
    }
  }

  private guessTypeFromValue(v: unknown): any {
    if (typeof v === "number") return Number.isInteger(v) ? TYPE_INTEGER : TYPE_FLOAT;
    if (typeof v === "boolean") return TYPE_BOOLEAN;
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v)) return TYPE_DATETIME;
    return null;
  }

  fetchColumns(fields: [string, any][]): Column[] {
    return fields.map(([name, type]) => ({ name, friendly_name: name, type: type ?? undefined }));
  }

  async getSchema(_getStats = false) {
    const cfg = this.configuration;
    let query = `SELECT DISTINCT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.\`COLUMNS\`
      WHERE TABLE_SCHEMA NOT IN ('INFORMATION_SCHEMA','sys') AND TABLE_SCHEMA NOT LIKE '%.information_schema'`;

    const allowed = cfg.allowed_schemas as string | undefined;
    if (allowed) {
      const schemas = allowed.split(",").map((s) => `'${s.trim().replace(/[^a-zA-Z0-9_.`]/g, "")}'`);
      query += ` AND TABLE_SCHEMA IN (${schemas.join(",")})`;
    }

    const [result, error] = await this.runQuery(query, null);
    if (error || !result) return [];

    const schema: Record<string, { name: string; columns: string[] }> = {};
    for (const row of result.rows) {
      const key = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`;
      if (!schema[key]) schema[key] = { name: key, columns: [] };
      schema[key].columns.push(row.COLUMN_NAME as string);
    }
    return Object.values(schema);
  }
}

register(Drill as any);
