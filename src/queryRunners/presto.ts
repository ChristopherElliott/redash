import { BaseSQLQueryRunner, Column, RunQueryResult, TYPE_INTEGER, TYPE_FLOAT, TYPE_BOOLEAN, TYPE_STRING, TYPE_DATE, TYPE_DATETIME, register } from "./index";

const PRESTO_TYPE_MAP: Record<string, string> = {
  integer: TYPE_INTEGER, tinyint: TYPE_INTEGER, smallint: TYPE_INTEGER,
  long: TYPE_INTEGER, bigint: TYPE_INTEGER,
  float: TYPE_FLOAT, double: TYPE_FLOAT, real: TYPE_FLOAT,
  boolean: TYPE_BOOLEAN,
  string: TYPE_STRING, varchar: TYPE_STRING, char: TYPE_STRING,
  date: TYPE_DATE,
  timestamp: TYPE_DATETIME,
};

export class Presto extends BaseSQLQueryRunner {
  static noopQuery = "SHOW TABLES";

  static runnerType(): string { return "presto"; }
  static runnerName(): string { return "Presto"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        host: { type: "string" },
        port: { type: "number", default: 8080 },
        schema: { type: "string" },
        catalog: { type: "string" },
        username: { type: "string" },
        password: { type: "string" },
        protocol: { type: "string", default: "http" },
      },
      required: ["host"],
      secret: ["password"],
    };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    try {
      const { default: presto } = await import("presto-client").catch(() => ({ default: null }));
      if (!presto) return [null, "presto-client not installed. Run: npm install presto-client"];

      const cfg = this.configuration;
      const client = new presto.Client({
        host: cfg.host as string,
        port: (cfg.port as number) ?? 8080,
        user: (cfg.username as string) ?? "redash",
        catalog: cfg.catalog as string | undefined,
        schema: cfg.schema as string | undefined,
      });

      return new Promise((resolve) => {
        const columns: Column[] = [];
        const rows: Record<string, unknown>[] = [];
        let colNames: string[] = [];

        client.execute({
          query,
          columns: (err: any, cols: any[]) => {
            if (err) return resolve([null, String(err)]);
            cols.forEach((c) => {
              columns.push({
                name: c.name,
                friendly_name: c.name,
                type: PRESTO_TYPE_MAP[c.type?.toLowerCase()] as any,
              });
              colNames.push(c.name);
            });
          },
          data: (_err: any, _colsIgnored: any, data: any[][]) => {
            for (const row of data) {
              const r: Record<string, unknown> = {};
              row.forEach((v, i) => { r[colNames[i]] = v; });
              rows.push(r);
            }
          },
          success: () => resolve([{ columns, rows }, null]),
          error: (err: any) => resolve([null, String(err)]),
        });
      });
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    }
  }

  protected async _getTables(
    schema: Record<string, { name: string; columns: (string | Column)[] }>
  ): Promise<void> {
    const [result, error] = await this.runQuery(
      "SELECT table_schema, table_name, column_name FROM information_schema.columns ORDER BY 1, 2",
      null
    );
    if (error || !result) return;
    for (const row of result.rows) {
      const key = `${row.table_schema}.${row.table_name}`;
      if (!schema[key]) schema[key] = { name: key, columns: [] };
      schema[key].columns.push(row.column_name as string);
    }
  }
}

/** Trino is API-compatible with Presto */
export class Trino extends Presto {
  static runnerType(): string { return "trino"; }
  static runnerName(): string { return "Trino"; }
}

register(Presto as any);
register(Trino as any);
