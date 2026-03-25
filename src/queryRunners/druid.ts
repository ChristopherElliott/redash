import axios from "axios";
import { BaseHTTPQueryRunner, RunQueryResult, register } from "./index";

export class Druid extends BaseHTTPQueryRunner {
  static runnerType(): string { return "druid"; }
  static runnerName(): string { return "Druid"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        host: { type: "string", title: "Broker Host", default: "localhost" },
        port: { type: "number", title: "Broker Port", default: 8082 },
        use_ssl: { type: "boolean", title: "Use SSL" },
      },
      order: ["host", "port"],
    };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    const cfg = this.configuration;
    const scheme = cfg.use_ssl ? "https" : "http";
    const url = `${scheme}://${cfg.host ?? "localhost"}:${cfg.port ?? 8082}/druid/v2/sql`;
    try {
      const resp = await axios.post(url, { query, resultFormat: "object" }, {
        headers: { "Content-Type": "application/json" },
        timeout: 30000,
      });
      const rows = resp.data as Record<string, unknown>[];
      if (!rows?.length) return [{ columns: [], rows: [] }, null];
      const columns = this.fetchColumns(Object.keys(rows[0]).map((k) => [k, null]));
      return [{ columns, rows }, null];
    } catch (err: any) {
      return [null, err.response?.data?.errorMessage ?? err.message ?? String(err)];
    }
  }
}

register(Druid as any);
