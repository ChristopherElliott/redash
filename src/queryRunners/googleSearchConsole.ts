import { google } from "googleapis";
import { BaseQueryRunner, RunQueryResult, register } from "./index";

export class GoogleSearchConsole extends BaseQueryRunner {
  static runnerType(): string { return "google_search_console"; }
  static runnerName(): string { return "Google Search Console"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        jsonKeyFile: { type: "string", title: "JSON Key File (contents)", format: "textarea" },
        site_url: { type: "string", title: "Site URL" },
      },
      required: ["jsonKeyFile", "site_url"],
      secret: ["jsonKeyFile"],
    };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    try {
      let queryObj: Record<string, unknown>;
      try { queryObj = JSON.parse(query); } catch {
        return [null, "Query must be valid JSON (Search Console API request body)."];
      }

      const key = JSON.parse(this.configuration.jsonKeyFile as string);
      const auth = new google.auth.GoogleAuth({
        credentials: key,
        scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
      });
      const sc = google.searchconsole({ version: "v1", auth });

      const resp = await sc.searchanalytics.query({
        siteUrl: this.configuration.site_url as string,
        requestBody: queryObj as any,
      });

      const rows = resp.data.rows ?? [];
      if (!rows.length) return [{ columns: [], rows: [] }, null];

      const dims: string[] = (queryObj.dimensions as string[]) ?? [];
      const columns = this.fetchColumns([
        ...dims.map((d) => [d, null] as [string, null]),
        ["clicks", null], ["impressions", null], ["ctr", null], ["position", null],
      ]);

      const dataRows = rows.map((row: any) => {
        const r: Record<string, unknown> = {};
        (row.keys ?? []).forEach((k: string, i: number) => { if (dims[i]) r[dims[i]] = k; });
        r.clicks = row.clicks;
        r.impressions = row.impressions;
        r.ctr = row.ctr;
        r.position = row.position;
        return r;
      });

      return [{ columns, rows: dataRows }, null];
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    }
  }
}

register(GoogleSearchConsole as any);
