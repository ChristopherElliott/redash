import { Pool, PoolClient, types } from "pg";
import { BaseSQLQueryRunner, Column, RunQueryResult, TYPE_BOOLEAN, TYPE_DATE, TYPE_DATETIME, TYPE_FLOAT, TYPE_INTEGER, TYPE_STRING, register } from "./index";

// Map PostgreSQL OIDs → Redash types
const TYPES_MAP: Record<number, string> = {
  20: TYPE_INTEGER, 21: TYPE_INTEGER, 23: TYPE_INTEGER,
  700: TYPE_FLOAT, 701: TYPE_FLOAT, 1700: TYPE_FLOAT,
  16: TYPE_BOOLEAN,
  1082: TYPE_DATE, 1182: TYPE_DATE,
  1114: TYPE_DATETIME, 1184: TYPE_DATETIME, 1115: TYPE_DATETIME, 1185: TYPE_DATETIME,
  1014: TYPE_STRING, 1015: TYPE_STRING, 1008: TYPE_STRING, 1009: TYPE_STRING,
  2951: TYPE_STRING, 1043: TYPE_STRING, 1002: TYPE_STRING, 1003: TYPE_STRING,
};

const SCHEMA_QUERY = `
SELECT s.nspname AS table_schema,
       c.relname AS table_name,
       a.attname AS column_name,
       NULL      AS data_type
FROM pg_class c
JOIN pg_namespace s ON c.relnamespace = s.oid
  AND s.nspname NOT IN ('pg_catalog', 'information_schema')
JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
WHERE c.relkind = 'm'
  AND has_table_privilege(quote_ident(s.nspname)||'.'||quote_ident(c.relname),'select')
  AND has_schema_privilege(s.nspname, 'usage')
UNION
SELECT table_schema, table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
  AND has_table_privilege(quote_ident(table_schema)||'.'||quote_ident(table_name),'select')
  AND has_schema_privilege(table_schema, 'usage')
`;

export class PostgreSQL extends BaseSQLQueryRunner {
  static noopQuery = "SELECT 1";

  static runnerType(): string { return "pg"; }
  static runnerName(): string { return "PostgreSQL"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        user: { type: "string" },
        password: { type: "string" },
        host: { type: "string", default: "127.0.0.1" },
        port: { type: "number", default: 5432 },
        dbname: { type: "string", title: "Database Name" },
        sslmode: { type: "string", title: "SSL Mode", default: "prefer" },
      },
      order: ["host", "port", "user", "password"],
      required: ["dbname"],
      secret: ["password"],
    };
  }

  private createPool(): Pool {
    const cfg = this.configuration;
    return new Pool({
      user: cfg.user as string,
      password: cfg.password as string,
      host: (cfg.host as string) ?? "127.0.0.1",
      port: (cfg.port as number) ?? 5432,
      database: cfg.dbname as string,
      ssl:
        cfg.sslmode && cfg.sslmode !== "disable"
          ? { rejectUnauthorized: cfg.sslmode === "verify-full" }
          : false,
    });
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    const pool = this.createPool();
    let client: PoolClient | undefined;
    try {
      client = await pool.connect();
      const result = await client.query(query);
      if (!result.fields?.length) {
        return [null, "Query completed but it returned no data."];
      }
      const columns = this.fetchColumns(
        result.fields.map((f) => [f.name, TYPES_MAP[f.dataTypeID] as any ?? null])
      );
      const rows = result.rows.map((row) => {
        const r: Record<string, unknown> = {};
        columns.forEach((col) => { r[col.name] = row[col.name]; });
        return r;
      });
      return [{ columns, rows }, null];
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    } finally {
      client?.release();
      await pool.end();
    }
  }

  protected async _getTables(
    schema: Record<string, { name: string; columns: (string | Column)[] }>
  ): Promise<void> {
    const [result, error] = await this.runQuery(SCHEMA_QUERY, null);
    if (error || !result) return;

    for (const row of result.rows) {
      const tableSchema = row.table_schema as string;
      const tableName = row.table_name as string;
      const key =
        tableSchema !== "public" ? `${tableSchema}.${tableName}` : tableName;
      if (!schema[key]) schema[key] = { name: key, columns: [] };
      schema[key].columns.push(
        row.data_type
          ? { name: row.column_name as string, type: row.data_type as any }
          : (row.column_name as string)
      );
    }
  }
}

export class Redshift extends PostgreSQL {
  static runnerType(): string { return "redshift"; }
  static runnerName(): string { return "Redshift"; }
}

export class CockroachDB extends PostgreSQL {
  static runnerType(): string { return "cockroach"; }
  static runnerName(): string { return "CockroachDB"; }
}

register(PostgreSQL as any);
register(Redshift as any);
register(CockroachDB as any);
