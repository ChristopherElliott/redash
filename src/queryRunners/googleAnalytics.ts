import { google } from "googleapis";
import { BaseQueryRunner, RunQueryResult, register } from "./index";

export class GoogleAnalytics extends BaseQueryRunner {
  static runnerType(): string { return "google_analytics"; }
  static runnerName(): string { return "Google Analytics"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        jsonKeyFile: { type: "string", title: "JSON Key File (contents)", format: "textarea" },
        viewId: { type: "string", title: "View ID" },
      },
      required: ["jsonKeyFile", "viewId"],
      secret: ["jsonKeyFile"],
    };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    try {
      let queryObj: Record<string, unknown>;
      try {
        queryObj = JSON.parse(query);
      } catch {
        return [null, "Query must be valid JSON (GA reporting API request body)."];
      }

      const key = JSON.parse(this.configuration.jsonKeyFile as string);
      const auth = new google.auth.GoogleAuth({
        credentials: key,
        scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
      });

      const analytics = google.analyticsreporting({ version: "v4", auth });
      const resp = await analytics.reports.batchGet({
        requestBody: {
          reportRequests: [
            {
              viewId: this.configuration.viewId as string,
              ...queryObj,
            },
          ],
        },
      });

      const report = resp.data.reports?.[0];
      if (!report) return [{ columns: [], rows: [] }, null];

      const dimHeaders = report.columnHeader?.dimensions ?? [];
      const metHeaders =
        report.columnHeader?.metricHeader?.metricHeaderEntries?.map((m) => m.name ?? "") ?? [];

      const columns = this.fetchColumns([
        ...dimHeaders.map((d) => [d, null] as [string, null]),
        ...metHeaders.map((m) => [m, null] as [string, null]),
      ]);

      const rows = (report.data?.rows ?? []).map((row) => {
        const r: Record<string, unknown> = {};
        (row.dimensions ?? []).forEach((val, i) => {
          if (dimHeaders[i]) r[dimHeaders[i]] = val;
        });
        (row.metrics ?? []).flatMap((m) => m.values ?? []).forEach((val, i) => {
          if (metHeaders[i]) r[metHeaders[i]] = val;
        });
        return r;
      });

      return [{ columns, rows }, null];
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    }
  }
}

register(GoogleAnalytics as any);
