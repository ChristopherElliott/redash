import { BaseQueryRunner, RunQueryResult, register } from "./index";

export class DuckDB extends BaseQueryRunner {
  static noopQuery = "SELECT 1";
  static runnerType(): string { return "duckdb"; }
  static runnerName(): string { return "DuckDB"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        database: { type: "string", title: "Database File Path (leave empty for in-memory)", default: ":memory:" },
      },
    };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    try {
      // Dynamic import — duckdb may not be installed
      const duckdb = await import("duckdb").catch(() => null);
      if (!duckdb) return [null, "duckdb package not installed."];

      const db = new duckdb.Database(
        (this.configuration.database as string) ?? ":memory:"
      );
      const conn = db.connect();
      return await new Promise<RunQueryResult>((resolve) => {
        conn.all(query, (err: Error | null, rows: Record<string, unknown>[]) => {
          conn.close();
          db.close();
          if (err) return resolve([null, err.message]);
          if (!rows?.length) return resolve([{ columns: [], rows: [] }, null]);
          const columns = Object.keys(rows[0]).map((k) => ({ name: k, friendly_name: k }));
          resolve([{ columns, rows }, null]);
        });
      });
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    }
  }
}

register(DuckDB as any);
