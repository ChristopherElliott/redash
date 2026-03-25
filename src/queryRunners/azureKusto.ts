import axios from "axios";
import { BaseQueryRunner, RunQueryResult, TYPE_BOOLEAN, TYPE_DATETIME, TYPE_FLOAT, TYPE_INTEGER, TYPE_STRING, register } from "./index";

const TYPES_MAP: Record<string, string> = {
  int: TYPE_INTEGER, long: TYPE_INTEGER,
  real: TYPE_FLOAT, decimal: TYPE_FLOAT,
  bool: TYPE_BOOLEAN,
  datetime: TYPE_DATETIME, timespan: TYPE_DATETIME,
};

export class AzureDataExplorer extends BaseQueryRunner {
  static runnerType(): string { return "azure_kusto"; }
  static runnerName(): string { return "Azure Data Explorer (Kusto)"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        cluster: { type: "string", title: "Cluster URL" },
        database: { type: "string", title: "Database" },
        tenant_id: { type: "string", title: "Tenant ID" },
        client_id: { type: "string", title: "Client ID (App ID)" },
        client_secret: { type: "string", title: "Client Secret" },
      },
      required: ["cluster", "database", "tenant_id", "client_id", "client_secret"],
      secret: ["client_secret"],
    };
  }

  private async getAccessToken(): Promise<string> {
    const cfg = this.configuration;
    const resp = await axios.post(
      `https://login.microsoftonline.com/${cfg.tenant_id}/oauth2/token`,
      new URLSearchParams({
        grant_type: "client_credentials",
        client_id: cfg.client_id as string,
        client_secret: cfg.client_secret as string,
        resource: `${cfg.cluster}`,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    return resp.data.access_token;
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    try {
      const token = await this.getAccessToken();
      const resp = await axios.post(
        `${this.configuration.cluster}/v1/rest/query`,
        { db: this.configuration.database, csl: query },
        { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
      );

      const table = resp.data.Tables?.[0];
      if (!table) return [{ columns: [], rows: [] }, null];

      const columns = this.fetchColumns(
        table.Columns.map((c: any) => [
          c.ColumnName,
          TYPES_MAP[c.ColumnType?.toLowerCase() ?? ""] as any ?? null,
        ])
      );
      const rows = table.Rows.map((row: unknown[]) => {
        const r: Record<string, unknown> = {};
        columns.forEach((col, i) => { r[col.name] = row[i]; });
        return r;
      });
      return [{ columns, rows }, null];
    } catch (err: any) {
      return [null, err.response?.data ?? err.message ?? String(err)];
    }
  }
}

register(AzureDataExplorer as any);
