import axios from "axios";
import { BaseQueryRunner, RunQueryResult, TYPE_DATETIME, TYPE_STRING, register } from "./index";

export class Prometheus extends BaseQueryRunner {
  static shouldAnnotateQuery = false;

  static runnerType(): string { return "prometheus"; }
  static runnerName(): string { return "Prometheus"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        url: { type: "string", title: "Prometheus API URL" },
        verify_ssl: { type: "boolean", title: "Verify SSL", default: true },
      },
      required: ["url"],
    };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    const baseUrl = this.configuration.url as string;

    try {
      query = query.trim();
      if (!query.startsWith("query=")) query = `query=${query}`;

      const params = new URLSearchParams(query);
      const isRange = params.has("step");

      // "end=now" → current timestamp
      if (isRange && (!params.has("end") || params.get("end") === "now")) {
        params.set("end", String(Math.floor(Date.now() / 1000)));
      }

      // Convert ISO date strings to timestamps
      for (const key of ["start", "end"]) {
        const val = params.get(key);
        if (val && isNaN(Number(val))) {
          params.set(key, String(Math.floor(new Date(val).getTime() / 1000)));
        }
      }

      const endpoint = `${baseUrl}/api/v1/${isRange ? "query_range" : "query"}`;
      const resp = await axios.get(endpoint, {
        params: Object.fromEntries(params.entries()),
        httpsAgent: !this.configuration.verify_ssl ? new (require("https").Agent)({ rejectUnauthorized: false }) : undefined,
      });

      const metrics: any[] = resp.data?.data?.result ?? [];
      if (!metrics.length) return [null, "query result is empty."];

      const labelNames = Object.keys(metrics[0].metric);
      const columns = this.fetchColumns([
        ["timestamp", TYPE_DATETIME],
        ["value", TYPE_STRING],
        ...labelNames.map((l) => [l, TYPE_STRING] as [string, any]),
      ]);

      const rows: Record<string, unknown>[] = [];
      for (const metric of metrics) {
        const labels = metric.metric;
        const points: [number, string][] = isRange ? metric.values : [metric.value];
        for (const [ts, val] of points) {
          const row: Record<string, unknown> = {
            timestamp: new Date(ts * 1000),
            value: val,
          };
          for (const l of labelNames) row[l] = labels[l] ?? null;
          rows.push(row);
        }
      }

      return [{ columns, rows }, null];
    } catch (err: any) {
      return [null, err.response?.data?.error ?? err.message ?? String(err)];
    }
  }

  async getSchema(_getStats = false): Promise<{ name: string; columns: string[] }[]> {
    const baseUrl = this.configuration.url as string;
    const resp = await axios.get(`${baseUrl}/api/v1/label/__name__/values`);
    const names: string[] = resp.data?.data ?? [];
    return names.map((name) => ({ name, columns: [] }));
  }
}

register(Prometheus as any);
