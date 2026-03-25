import axios from "axios";
import { BaseQueryRunner, RunQueryResult, TYPE_DATETIME, TYPE_FLOAT, TYPE_STRING, register } from "./index";

export class Graphite extends BaseQueryRunner {
  static shouldAnnotateQuery = false;

  static runnerType(): string { return "graphite"; }
  static runnerName(): string { return "Graphite"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        url: { type: "string" },
        username: { type: "string" },
        password: { type: "string" },
        verify: { type: "boolean", title: "Verify SSL certificate", default: true },
      },
      required: ["url"],
      secret: ["password"],
    };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    const cfg = this.configuration;
    const baseUrl = `${cfg.url}/render?format=json&`;
    const url = baseUrl + query.split("\n").join("&");

    try {
      const resp = await axios.get(url, {
        auth: cfg.username
          ? { username: cfg.username as string, password: (cfg.password as string) ?? "" }
          : undefined,
      });

      const columns = this.fetchColumns([
        ["Time::x", TYPE_DATETIME],
        ["value::y", TYPE_FLOAT],
        ["name::series", TYPE_STRING],
      ]);

      const rows: Record<string, unknown>[] = [];
      for (const series of resp.data) {
        for (const [value, timestamp] of series.datapoints) {
          rows.push({
            "Time::x": new Date(timestamp * 1000),
            "value::y": value,
            "name::series": series.target,
          });
        }
      }

      return [{ columns, rows }, null];
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    }
  }

  async testConnection(): Promise<void> {
    const cfg = this.configuration;
    const resp = await axios.get(`${cfg.url}/render`, {
      auth: cfg.username
        ? { username: cfg.username as string, password: (cfg.password as string) ?? "" }
        : undefined,
    });
    if (resp.status !== 200) throw new Error(`Unexpected status: ${resp.status}`);
  }
}

register(Graphite as any);
