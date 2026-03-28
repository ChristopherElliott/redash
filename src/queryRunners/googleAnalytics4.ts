import axios from "axios";
import { google } from "googleapis";
import { BaseQueryRunner, RunQueryResult, register } from "./index";

export class GoogleAnalytics4 extends BaseQueryRunner {
  static runnerType(): string { return "google_analytics4"; }
  static runnerName(): string { return "Google Analytics 4"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        jsonKeyFile: { type: "string", title: "JSON Key File (contents)", format: "textarea" },
        property_id: { type: "string", title: "GA4 Property ID" },
      },
      required: ["jsonKeyFile", "property_id"],
      secret: ["jsonKeyFile"],
    };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    try {
      let queryObj: Record<string, unknown>;
      try {
        queryObj = JSON.parse(query);
      } catch {
        return [null, "Query must be valid JSON (GA4 RunReport request body)."];
      }

      const key = JSON.parse(this.configuration.jsonKeyFile as string);
      const auth = new google.auth.GoogleAuth({
        credentials: key,
        scopes: ["https://www.googleapis.com/auth/analytics.readonly"],
      });
      const token = await auth.getAccessToken();

      const propertyId = this.configuration.property_id as string;
      const resp = await axios.post(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`,
        queryObj,
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );

      const data = resp.data as any;
      const dimHeaders = (data.dimensionHeaders ?? []).map((h: any) => h.name);
      const metHeaders = (data.metricHeaders ?? []).map((h: any) => h.name);

      const columns = this.fetchColumns([
        ...dimHeaders.map((h: string) => [h, null] as [string, null]),
        ...metHeaders.map((h: string) => [h, null] as [string, null]),
      ]);

      const rows = (data.rows ?? []).map((row: any) => {
        const r: Record<string, unknown> = {};
        (row.dimensionValues ?? []).forEach((v: any, i: number) => { if (dimHeaders[i]) r[dimHeaders[i]] = v.value; });
        (row.metricValues ?? []).forEach((v: any, i: number) => { if (metHeaders[i]) r[metHeaders[i]] = v.value; });
        return r;
      });

      return [{ columns, rows }, null];
    } catch (err: any) {
      return [null, err.response?.data?.error?.message ?? err.message ?? String(err)];
    }
  }
}

register(GoogleAnalytics4 as any);
