import { google, sheets_v4 } from "googleapis";
import { BaseQueryRunner, RunQueryResult, register } from "./index";

export class GoogleSpreadsheets extends BaseQueryRunner {
  static runnerType(): string { return "google_spreadsheets"; }
  static runnerName(): string { return "Google Spreadsheets"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        jsonKeyFile: { type: "string", title: "JSON Key File (contents)", format: "textarea" },
      },
      required: ["jsonKeyFile"],
      secret: ["jsonKeyFile"],
    };
  }

  private getAuth() {
    const key = JSON.parse(this.configuration.jsonKeyFile as string);
    return new google.auth.GoogleAuth({
      credentials: key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    // query format: "spreadsheet_id|range" e.g. "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms|Sheet1!A1:Z"
    const [spreadsheetId, range] = query.split("|").map((s) => s.trim());
    if (!spreadsheetId) return [null, "Query must be 'spreadsheet_id|range'."];

    try {
      const auth = this.getAuth();
      const sheets = google.sheets({ version: "v4", auth });
      const resp = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: range || "Sheet1",
      });

      const values = resp.data.values ?? [];
      if (values.length < 2) return [{ columns: [], rows: [] }, null];

      const headers = values[0].map((h: unknown) => String(h ?? ""));
      const columns = this.fetchColumns(headers.map((h: string) => [h, null]));
      const rows = values.slice(1).map((row: unknown[]) => {
        const r: Record<string, unknown> = {};
        columns.forEach((col, i) => { r[col.name] = row[i] ?? null; });
        return r;
      });
      return [{ columns, rows }, null];
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    }
  }
}

register(GoogleSpreadsheets as any);
