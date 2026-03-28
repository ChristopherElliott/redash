import { BaseQueryRunner, RunQueryResult, register } from "./index";

export class ArangoDB extends BaseQueryRunner {
  static runnerType(): string { return "arango"; }
  static runnerName(): string { return "ArangoDB"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        host: { type: "string", default: "localhost" },
        port: { type: "number", default: 8529 },
        database: { type: "string", default: "_system" },
        username: { type: "string", default: "root" },
        password: { type: "string" },
        use_ssl: { type: "boolean", default: false },
      },
      secret: ["password"],
    };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    try {
      const arangojs = await import("arangojs").catch(() => null);
      if (!arangojs) return [null, "arangojs package not installed."];

      const cfg = this.configuration;
      const scheme = cfg.use_ssl ? "https" : "http";
      const db = new arangojs.Database({
        url: `${scheme}://${cfg.host ?? "localhost"}:${cfg.port ?? 8529}`,
        databaseName: (cfg.database as string) ?? "_system",
        auth: { username: (cfg.username as string) ?? "root", password: (cfg.password as string) ?? "" },
      });

      const cursor = await db.query(query);
      const rows = await cursor.all() as Record<string, unknown>[];
      if (!rows.length) return [{ columns: [], rows: [] }, null];
      const columns = this.fetchColumns(Object.keys(rows[0]).map((k) => [k, null]));
      return [{ columns, rows }, null];
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    }
  }
}

register(ArangoDB as any);
