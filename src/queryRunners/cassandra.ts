import { BaseQueryRunner, RunQueryResult, TYPE_BOOLEAN, TYPE_DATETIME, TYPE_FLOAT, TYPE_INTEGER, TYPE_STRING, register } from "./index";

const TYPES_MAP: Record<string, string> = {
  int: TYPE_INTEGER, bigint: TYPE_INTEGER, varint: TYPE_INTEGER, smallint: TYPE_INTEGER, tinyint: TYPE_INTEGER, counter: TYPE_INTEGER,
  float: TYPE_FLOAT, double: TYPE_FLOAT, decimal: TYPE_FLOAT,
  boolean: TYPE_BOOLEAN,
  timestamp: TYPE_DATETIME,
};

export class Cassandra extends BaseQueryRunner {
  static runnerType(): string { return "cassandra"; }
  static runnerName(): string { return "Cassandra"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        hosts: { type: "string", title: "Hosts (comma-separated)", default: "localhost" },
        port: { type: "number", default: 9042 },
        keyspace: { type: "string", title: "Keyspace" },
        username: { type: "string" },
        password: { type: "string" },
        ssl: { type: "boolean", default: false },
        protocol_version: { type: "number", default: 4 },
      },
      required: ["keyspace"],
      secret: ["password"],
    };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    try {
      const cassandra = await import("cassandra-driver").catch(() => null);
      if (!cassandra) return [null, "cassandra-driver package not installed."];

      const cfg = this.configuration;
      const client = new cassandra.Client({
        contactPoints: (cfg.hosts as string ?? "localhost").split(",").map((h) => h.trim()),
        localDataCenter: "datacenter1",
        keyspace: cfg.keyspace as string,
        credentials:
          cfg.username ? { username: cfg.username as string, password: (cfg.password as string) ?? "" } : undefined,
        protocolOptions: { port: (cfg.port as number) ?? 9042 },
      });

      await client.connect();
      try {
        const result = await client.execute(query);
        const columns = this.fetchColumns(
          result.columns.map((c) => [
            c.name,
            TYPES_MAP[c.type?.code?.toString() ?? ""] as any ?? null,
          ])
        );
        const rows = result.rows.map((row) => {
          const r: Record<string, unknown> = {};
          columns.forEach((col) => { r[col.name] = row[col.name]; });
          return r;
        });
        return [{ columns, rows }, null];
      } finally {
        await client.shutdown();
      }
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    }
  }
}

register(Cassandra as any);
