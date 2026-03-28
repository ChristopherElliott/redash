import axios from "axios";
import { BaseQueryRunner, Column, RunQueryResult, TYPE_INTEGER, TYPE_FLOAT, TYPE_BOOLEAN, TYPE_STRING, TYPE_DATETIME, TYPE_DATE, register } from "./index";

const TYPES_MAP: Record<string, string> = {
  UInt8: TYPE_INTEGER, UInt16: TYPE_INTEGER, UInt32: TYPE_INTEGER, UInt64: TYPE_INTEGER,
  Int8: TYPE_INTEGER, Int16: TYPE_INTEGER, Int32: TYPE_INTEGER, Int64: TYPE_INTEGER,
  Float32: TYPE_FLOAT, Float64: TYPE_FLOAT,
  Decimal: TYPE_FLOAT,
  Boolean: TYPE_BOOLEAN,
  String: TYPE_STRING, FixedString: TYPE_STRING, UUID: TYPE_STRING, Enum8: TYPE_STRING, Enum16: TYPE_STRING,
  Date: TYPE_DATE, Date32: TYPE_DATE,
  DateTime: TYPE_DATETIME, DateTime64: TYPE_DATETIME,
};

function mapType(chType: string): string {
  // Strip Nullable(...) wrapper
  const inner = chType.replace(/^Nullable\((.+)\)$/, "$1");
  const base = inner.split("(")[0];
  return TYPES_MAP[base] ?? TYPE_STRING;
}

export class ClickHouse extends BaseQueryRunner {
  static noopQuery = "SELECT 1";
  static runnerType(): string { return "clickhouse"; }
  static runnerName(): string { return "ClickHouse"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        url: { type: "string", default: "http://127.0.0.1:8123" },
        user: { type: "string", default: "default" },
        password: { type: "string", default: "" },
        dbname: { type: "string", title: "Database Name" },
        timeout: { type: "number", default: 30, title: "Request Timeout" },
        verify: { type: "boolean", default: true, title: "Verify SSL Certificate" },
      },
      order: ["url", "user", "password", "dbname"],
      secret: ["password"],
    };
  }

  private get baseUrl(): string {
    return (this.configuration.url as string) ?? "http://127.0.0.1:8123";
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    try {
      const resp = await axios.post(
        this.baseUrl,
        `${query} FORMAT JSONCompact`,
        {
          params: {
            database: this.configuration.dbname,
            default_format: "JSONCompact",
          },
          auth: {
            username: (this.configuration.user as string) ?? "default",
            password: (this.configuration.password as string) ?? "",
          },
          timeout: ((this.configuration.timeout as number) ?? 30) * 1000,
        }
      );

      const data = resp.data as { data: unknown[][]; meta: { name: string; type: string }[] };
      const columns = this.fetchColumns(
        data.meta.map((m) => [m.name, mapType(m.type) as any])
      );
      const rows = data.data.map((row) => {
        const r: Record<string, unknown> = {};
        columns.forEach((col, i) => { r[col.name] = row[i]; });
        return r;
      });
      return [{ columns, rows }, null];
    } catch (err: any) {
      return [null, err.response?.data ?? err.message ?? String(err)];
    }
  }

  async getSchema() {
    const [result, error] = await this.runQuery(
      `SELECT database, table, name, type
       FROM system.columns
       WHERE database NOT IN ('system','information_schema')
       ORDER BY database, table, position`,
      null
    );
    if (error || !result) return [];
    const schema: Record<string, { name: string; columns: (string | Column)[] }> = {};
    for (const row of result.rows) {
      const key = `${row.database}.${row.table}`;
      if (!schema[key]) schema[key] = { name: key, columns: [] };
      schema[key].columns.push({ name: row.name as string, type: mapType(row.type as string) as any });
    }
    return Object.values(schema);
  }
}

register(ClickHouse as any);
