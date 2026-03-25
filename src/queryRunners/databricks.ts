import axios from "axios";
import { BaseSQLQueryRunner, Column, RunQueryResult, TYPE_BOOLEAN, TYPE_DATE, TYPE_DATETIME, TYPE_FLOAT, TYPE_INTEGER, TYPE_STRING, register } from "./index";

const TYPES_MAP: Record<string, string> = {
  INT: TYPE_INTEGER, BIGINT: TYPE_INTEGER, SMALLINT: TYPE_INTEGER, TINYINT: TYPE_INTEGER,
  FLOAT: TYPE_FLOAT, DOUBLE: TYPE_FLOAT, DECIMAL: TYPE_FLOAT,
  BOOLEAN: TYPE_BOOLEAN,
  STRING: TYPE_STRING, VARCHAR: TYPE_STRING, CHAR: TYPE_STRING, BINARY: TYPE_STRING,
  DATE: TYPE_DATE,
  TIMESTAMP: TYPE_DATETIME,
};

export class Databricks extends BaseSQLQueryRunner {
  static runnerType(): string { return "databricks"; }
  static runnerName(): string { return "Databricks"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        host: { type: "string", title: "Server Hostname" },
        http_path: { type: "string", title: "HTTP Path" },
        token: { type: "string", title: "Access Token" },
        database: { type: "string", title: "Default Database" },
        catalog: { type: "string", title: "Unity Catalog" },
      },
      required: ["host", "http_path", "token"],
      secret: ["token"],
    };
  }

  private get apiBase(): string {
    return `https://${this.configuration.host}/api/2.0/sql/statements`;
  }

  private get headers() {
    return { Authorization: `Bearer ${this.configuration.token}` };
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    try {
      // Submit statement
      const submitResp = await axios.post(
        this.apiBase,
        {
          statement: query,
          warehouse_id: (this.configuration.http_path as string).split("/").pop(),
          catalog: this.configuration.catalog,
          schema: this.configuration.database,
          wait_timeout: "30s",
          disposition: "INLINE",
          format: "JSON_ARRAY",
        },
        { headers: this.headers }
      );

      const statementId = submitResp.data.statement_id;
      let state = submitResp.data.status?.state;

      // Poll if not done
      while (state === "PENDING" || state === "RUNNING") {
        await new Promise((r) => setTimeout(r, 1000));
        const pollResp = await axios.get(`${this.apiBase}/${statementId}`, {
          headers: this.headers,
        });
        state = pollResp.data.status?.state;
        if (state === "SUCCEEDED") {
          return this.parseResult(pollResp.data);
        }
        if (state === "FAILED" || state === "CANCELED") {
          return [null, pollResp.data.status?.error?.message ?? state];
        }
      }

      return this.parseResult(submitResp.data);
    } catch (err: any) {
      return [null, err.response?.data?.message ?? err.message ?? String(err)];
    }
  }

  private parseResult(data: any): RunQueryResult {
    const schema = data.manifest?.schema?.columns ?? [];
    const columns = this.fetchColumns(
      schema.map((c: any) => [c.name, TYPES_MAP[c.type_text?.toUpperCase() ?? ""] as any ?? null])
    );
    const rows = (data.result?.data_array ?? []).map((row: unknown[]) => {
      const r: Record<string, unknown> = {};
      columns.forEach((col, i) => { r[col.name] = row[i]; });
      return r;
    });
    return [{ columns, rows }, null];
  }

  protected async _getTables(
    schema: Record<string, { name: string; columns: (string | Column)[] }>
  ): Promise<void> {
    const [result, error] = await this.runQuery("SHOW TABLES", null);
    if (error || !result) return;
    for (const row of result.rows) {
      const key = `${row.database ?? row.namespace}.${row.tableName ?? row.table_name}`;
      if (!schema[key]) schema[key] = { name: key, columns: [] };
    }
  }
}

register(Databricks as any);
