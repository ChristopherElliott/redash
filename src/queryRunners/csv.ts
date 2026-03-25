import { parse } from "csv-parse/sync";
import axios from "axios";
import { BaseHTTPQueryRunner, RunQueryResult, register } from "./index";

export class CSV extends BaseHTTPQueryRunner {
  static runnerType(): string { return "csv"; }
  static runnerName(): string { return "CSV"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        url: { type: "string", title: "URL to CSV file" },
      },
    };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    // query is the URL if configuration.url is not set, otherwise it's a filter/passthrough
    const url = (this.configuration.url as string) ?? query;
    try {
      const resp = await axios.get<string>(url, { responseType: "text", timeout: 30000 });
      const records = parse(resp.data, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }) as Record<string, unknown>[];

      if (!records.length) return [{ columns: [], rows: [] }, null];
      const columns = this.fetchColumns(Object.keys(records[0]).map((k) => [k, null]));
      return [{ columns, rows: records }, null];
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    }
  }
}

register(CSV as any);
