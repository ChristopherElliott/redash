import mysql2 from "mysql2/promise";
import { BaseSQLQueryRunner, Column, RunQueryResult, TYPE_BOOLEAN, TYPE_DATE, TYPE_DATETIME, TYPE_FLOAT, TYPE_INTEGER, TYPE_STRING, register } from "./index";

// mysql2 field type numbers → Redash types
const TYPES_MAP: Record<number, string> = {
  1: TYPE_BOOLEAN,   // TINYINT(1) treated as boolean
  3: TYPE_INTEGER,   // INT
  8: TYPE_INTEGER,   // BIGINT
  4: TYPE_FLOAT,     // FLOAT
  5: TYPE_FLOAT,     // DOUBLE
  246: TYPE_FLOAT,   // DECIMAL
  10: TYPE_DATE,     // DATE
  12: TYPE_DATETIME, // DATETIME
  7: TYPE_DATETIME,  // TIMESTAMP
  253: TYPE_STRING,  // VARCHAR
  252: TYPE_STRING,  // BLOB/TEXT
};

export class MySQL extends BaseSQLQueryRunner {
  static noopQuery = "SELECT 1";
  static runnerType(): string { return "mysql"; }
  static runnerName(): string { return "MySQL"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        host: { type: "string", default: "127.0.0.1" },
        user: { type: "string" },
        password: { type: "string" },
        db: { type: "string", title: "Database Name" },
        port: { type: "number", default: 3306 },
        use_ssl: { type: "boolean", title: "Use SSL" },
      },
      order: ["host", "user", "password", "db"],
      required: ["db"],
      secret: ["password"],
    };
  }

  private connectionConfig() {
    const cfg = this.configuration;
    return {
      host: (cfg.host as string) ?? "127.0.0.1",
      user: cfg.user as string,
      password: cfg.password as string,
      database: cfg.db as string,
      port: (cfg.port as number) ?? 3306,
      ssl: cfg.use_ssl ? { rejectUnauthorized: false } : undefined,
      multipleStatements: true,
    };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    let conn: mysql2.Connection | undefined;
    try {
      conn = await mysql2.createConnection(this.connectionConfig());
      const [rows, fields] = await conn.execute(query) as [any[], mysql2.FieldPacket[]];

      if (!fields?.length) {
        return [null, "Query completed but it returned no data."];
      }

      const columns = this.fetchColumns(
        fields.map((f) => [f.name, TYPES_MAP[f.type ?? 0] as any ?? null])
      );
      const data = (rows as Record<string, unknown>[]).map((row) => {
        const r: Record<string, unknown> = {};
        columns.forEach((col) => { r[col.name] = row[col.name]; });
        return r;
      });
      return [{ columns, rows: data }, null];
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    } finally {
      await conn?.end();
    }
  }

  protected async _getTables(
    schema: Record<string, { name: string; columns: (string | Column)[] }>
  ): Promise<void> {
    const [result, error] = await this.runQuery(
      `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA NOT IN ('information_schema','performance_schema','mysql','sys')`,
      null
    );
    if (error || !result) return;
    for (const row of result.rows) {
      const key = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`;
      if (!schema[key]) schema[key] = { name: key, columns: [] };
      schema[key].columns.push({ name: row.COLUMN_NAME as string, type: row.DATA_TYPE as any });
    }
  }
}

register(MySQL as any);
