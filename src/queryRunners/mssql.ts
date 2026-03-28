import sql from "mssql";
import { BaseSQLQueryRunner, Column, RunQueryResult, TYPE_BOOLEAN, TYPE_DATE, TYPE_DATETIME, TYPE_FLOAT, TYPE_INTEGER, TYPE_STRING, register } from "./index";

const TYPES_MAP: Record<string, string> = {
  bigint: TYPE_INTEGER, int: TYPE_INTEGER, smallint: TYPE_INTEGER, tinyint: TYPE_INTEGER,
  float: TYPE_FLOAT, real: TYPE_FLOAT, decimal: TYPE_FLOAT, numeric: TYPE_FLOAT, money: TYPE_FLOAT,
  bit: TYPE_BOOLEAN,
  date: TYPE_DATE,
  datetime: TYPE_DATETIME, datetime2: TYPE_DATETIME, smalldatetime: TYPE_DATETIME, datetimeoffset: TYPE_DATETIME,
};

export class SQLServer extends BaseSQLQueryRunner {
  static noopQuery = "SELECT 1";
  static runnerType(): string { return "mssql"; }
  static runnerName(): string { return "Microsoft SQL Server"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        server: { type: "string", default: "localhost" },
        port: { type: "number", default: 1433 },
        user: { type: "string" },
        password: { type: "string" },
        db: { type: "string", title: "Database Name" },
        encrypt: { type: "boolean", default: false, title: "Encrypt Connection" },
      },
      order: ["server", "user", "password", "db"],
      required: ["db"],
      secret: ["password"],
    };
  }

  private getConfig(): sql.config {
    const cfg = this.configuration;
    return {
      server: (cfg.server as string) ?? "localhost",
      port: (cfg.port as number) ?? 1433,
      user: cfg.user as string,
      password: cfg.password as string,
      database: cfg.db as string,
      options: {
        encrypt: (cfg.encrypt as boolean) ?? false,
        trustServerCertificate: true,
      },
    };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    let pool: sql.ConnectionPool | undefined;
    try {
      pool = await sql.connect(this.getConfig());
      const result = await pool.request().query(query);
      const recordSet = result.recordset;
      if (!recordSet?.length && !result.recordsets?.length) {
        return [null, "Query completed but it returned no data."];
      }
      const rows = recordSet ?? result.recordsets?.[0] ?? [];
      const columns = this.fetchColumns(
        Object.keys(rows[0] ?? {}).map((name) => [name, null])
      );
      const data = rows.map((row: Record<string, unknown>) => {
        const r: Record<string, unknown> = {};
        columns.forEach((col) => { r[col.name] = row[col.name]; });
        return r;
      });
      return [{ columns, rows: data }, null];
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    } finally {
      await pool?.close();
    }
  }

  protected async _getTables(
    schema: Record<string, { name: string; columns: (string | Column)[] }>
  ): Promise<void> {
    const [result, error] = await this.runQuery(
      `SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME, DATA_TYPE
       FROM INFORMATION_SCHEMA.COLUMNS
       ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION`,
      null
    );
    if (error || !result) return;
    for (const row of result.rows) {
      const key = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`;
      if (!schema[key]) schema[key] = { name: key, columns: [] };
      schema[key].columns.push({ name: row.COLUMN_NAME as string, type: (TYPES_MAP[row.DATA_TYPE as string] ?? TYPE_STRING) as any });
    }
  }
}

register(SQLServer as any);
