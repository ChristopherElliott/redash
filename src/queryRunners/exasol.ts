import { BaseSQLQueryRunner, Column, RunQueryResult, register } from "./index";

export class Exasol extends BaseSQLQueryRunner {
  static noopQuery = "SELECT 1";
  static runnerType(): string { return "exasol"; }
  static runnerName(): string { return "Exasol"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        host: { type: "string" },
        port: { type: "number", default: 8563 },
        user: { type: "string" },
        password: { type: "string" },
        schema: { type: "string" },
        websocket_timeout: { type: "number", default: 10 },
      },
      required: ["host", "user", "password"],
      secret: ["password"],
    };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    try {
      const { Connection } = await import("@exasol/exasol-driver").catch(() => ({ Connection: null }));
      if (!Connection) return [null, "@exasol/exasol-driver not installed."];

      const cfg = this.configuration;
      const conn = await Connection.create({
        host: cfg.host as string,
        port: (cfg.port as number) ?? 8563,
        user: cfg.user as string,
        password: cfg.password as string,
        schema: cfg.schema as string | undefined,
      });

      try {
        const result = await conn.execute(query);
        const columns = this.fetchColumns(
          (result.columns ?? []).map((c: any) => [c.name, null])
        );
        const rows = (result.rows ?? []).map((row: unknown[]) => {
          const r: Record<string, unknown> = {};
          columns.forEach((col, i) => { r[col.name] = row[i]; });
          return r;
        });
        return [{ columns, rows }, null];
      } finally {
        await conn.disconnect();
      }
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    }
  }

  protected async _getTables(
    schema: Record<string, { name: string; columns: (string | Column)[] }>
  ): Promise<void> {
    const [result, error] = await this.runQuery(
      "SELECT TABLE_SCHEMA, TABLE_NAME, COLUMN_NAME FROM EXA_ALL_COLUMNS ORDER BY TABLE_SCHEMA, TABLE_NAME",
      null
    );
    if (error || !result) return;
    for (const row of result.rows) {
      const key = `${row.TABLE_SCHEMA}.${row.TABLE_NAME}`;
      if (!schema[key]) schema[key] = { name: key, columns: [] };
      schema[key].columns.push(row.COLUMN_NAME as string);
    }
  }
}

register(Exasol as any);
