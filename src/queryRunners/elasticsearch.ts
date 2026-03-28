import { Client } from "@elastic/elasticsearch";
import { BaseHTTPQueryRunner, RunQueryResult, TYPE_BOOLEAN, TYPE_DATETIME, TYPE_FLOAT, TYPE_INTEGER, TYPE_STRING, register } from "./index";

export class Elasticsearch extends BaseHTTPQueryRunner {
  static runnerType(): string { return "elasticsearch"; }
  static runnerName(): string { return "Elasticsearch"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        server: { type: "string", title: "Base URL", default: "http://localhost:9200" },
        index: { type: "string", title: "Index Name" },
        username: { type: "string" },
        password: { type: "string" },
        use_ssl: { type: "boolean", title: "Use SSL" },
      },
      required: ["server"],
      secret: ["password"],
    };
  }

  private getClient(): Client {
    const cfg = this.configuration;
    return new Client({
      node: (cfg.server as string) ?? "http://localhost:9200",
      auth:
        cfg.username
          ? { username: cfg.username as string, password: (cfg.password as string) ?? "" }
          : undefined,
      tls: { rejectUnauthorized: false },
    });
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    try {
      let parsedQuery: Record<string, unknown>;
      try {
        parsedQuery = JSON.parse(query);
      } catch {
        return [null, "Query must be valid JSON."];
      }

      const client = this.getClient();
      const index = (this.configuration.index as string) ?? "*";

      const resp = await client.search({
        index,
        body: parsedQuery,
      });

      const hits = resp.hits?.hits ?? [];
      if (hits.length === 0) {
        return [{ columns: [], rows: [] }, null];
      }

      // Flatten _source fields
      const allKeys = new Set<string>();
      hits.forEach((hit) => {
        Object.keys(hit._source ?? {}).forEach((k) => allKeys.add(k));
      });

      const columns = this.fetchColumns(
        Array.from(allKeys).map((k) => [k, null])
      );
      const rows = hits.map((hit) => {
        const src = (hit._source ?? {}) as Record<string, unknown>;
        const row: Record<string, unknown> = { _id: hit._id };
        columns.forEach((col) => { row[col.name] = src[col.name]; });
        return row;
      });

      return [{ columns, rows }, null];
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    }
  }
}

register(Elasticsearch as any);
