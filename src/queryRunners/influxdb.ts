import axios from "axios";
import { BaseHTTPQueryRunner, RunQueryResult, TYPE_DATETIME, TYPE_FLOAT, TYPE_STRING, register } from "./index";

export class InfluxDB extends BaseHTTPQueryRunner {
  static runnerType(): string { return "influxdb"; }
  static runnerName(): string { return "InfluxDB"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        url: { type: "string", title: "InfluxDB URL", default: "http://localhost:8086" },
        token: { type: "string", title: "Token (InfluxDB v2)" },
        org: { type: "string", title: "Organization (InfluxDB v2)" },
        db: { type: "string", title: "Database (InfluxDB v1)" },
        username: { type: "string" },
        password: { type: "string" },
        version: { type: "number", title: "Version", default: 1 },
      },
      secret: ["token", "password"],
    };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    const cfg = this.configuration;
    const version = (cfg.version as number) ?? 1;
    try {
      if (version === 2) {
        // InfluxDB v2 Flux query
        const resp = await axios.post(
          `${cfg.url}/api/v2/query`,
          { query, type: "flux" },
          {
            headers: {
              Authorization: `Token ${cfg.token}`,
              "Content-Type": "application/json",
            },
            params: { org: cfg.org },
          }
        );
        return parseFluxCSV(resp.data as string, this);
      } else {
        // InfluxDB v1 InfluxQL
        const resp = await axios.get(`${cfg.url}/query`, {
          params: { db: cfg.db, q: query, epoch: "ms" },
          auth: cfg.username
            ? { username: cfg.username as string, password: (cfg.password as string) ?? "" }
            : undefined,
        });
        return parseInfluxV1(resp.data, this);
      }
    } catch (err: any) {
      return [null, err.response?.data?.message ?? err.message ?? String(err)];
    }
  }
}

function parseInfluxV1(data: any, runner: InfluxDB): RunQueryResult {
  const series = data?.results?.[0]?.series?.[0];
  if (!series) return [{ columns: [], rows: [] }, null];
  const columns = runner.fetchColumns(
    series.columns.map((name: string) => [name, name === "time" ? TYPE_DATETIME : null])
  );
  const rows = series.values.map((row: unknown[]) => {
    const r: Record<string, unknown> = {};
    columns.forEach((col, i) => { r[col.name] = row[i]; });
    return r;
  });
  return [{ columns, rows }, null];
}

function parseFluxCSV(csv: string, runner: InfluxDB): RunQueryResult {
  // Simple Flux CSV annotated response parser
  const lines = csv.split("\n").filter((l) => l && !l.startsWith("#"));
  if (lines.length < 2) return [{ columns: [], rows: [] }, null];
  const headers = lines[0].split(",");
  const columns = runner.fetchColumns(headers.map((h) => [h.trim(), null]));
  const rows = lines.slice(1).filter(Boolean).map((line) => {
    const values = line.split(",");
    const r: Record<string, unknown> = {};
    columns.forEach((col, i) => { r[col.name] = values[i]?.trim(); });
    return r;
  });
  return [{ columns, rows }, null];
}

register(InfluxDB as any);
