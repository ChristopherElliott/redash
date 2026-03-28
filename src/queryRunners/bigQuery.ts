import { BigQuery as BQClient, BigQueryOptions } from "@google-cloud/bigquery";
import { BaseQueryRunner, RunQueryResult, TYPE_BOOLEAN, TYPE_DATE, TYPE_DATETIME, TYPE_FLOAT, TYPE_INTEGER, TYPE_STRING, register } from "./index";

const TYPES_MAP: Record<string, string> = {
  INTEGER: TYPE_INTEGER, INT64: TYPE_INTEGER,
  FLOAT: TYPE_FLOAT, FLOAT64: TYPE_FLOAT, NUMERIC: TYPE_FLOAT, BIGNUMERIC: TYPE_FLOAT,
  BOOLEAN: TYPE_BOOLEAN, BOOL: TYPE_BOOLEAN,
  STRING: TYPE_STRING, BYTES: TYPE_STRING, JSON: TYPE_STRING,
  DATE: TYPE_DATE,
  TIMESTAMP: TYPE_DATETIME, DATETIME: TYPE_DATETIME, TIME: TYPE_DATETIME,
};

export class BigQuery extends BaseQueryRunner {
  static runnerType(): string { return "bigquery"; }
  static runnerName(): string { return "Google BigQuery"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        projectId: { type: "string", title: "Project ID" },
        jsonKeyFile: { type: "string", title: "JSON Key File (contents)", format: "textarea" },
        location: { type: "string", title: "Dataset Location", default: "US" },
        maximumBillingTier: { type: "number", title: "Maximum Billing Tier", default: 1 },
        totalBytesProcessedLimit: { type: "number", title: "Total Bytes Processed Limit" },
      },
      required: ["projectId"],
      secret: ["jsonKeyFile"],
    };
  }

  private getClient(): BQClient {
    const cfg = this.configuration;
    const options: BigQueryOptions = {
      projectId: cfg.projectId as string,
      location: (cfg.location as string) ?? "US",
    };
    if (cfg.jsonKeyFile) {
      try {
        options.credentials = JSON.parse(cfg.jsonKeyFile as string);
      } catch {
        // Use application default if key file parse fails
      }
    }
    return new BQClient(options);
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    try {
      const client = this.getClient();
      const [rows, , response] = await client.query({
        query,
        useLegacySql: false,
        location: (this.configuration.location as string) ?? "US",
      });

      if (!response?.schema?.fields?.length) {
        return [{ columns: [], rows: [] }, null];
      }

      const columns = this.fetchColumns(
        response.schema.fields.map((f: any) => [
          f.name,
          TYPES_MAP[f.type ?? ""] as any ?? null,
        ])
      );

      const dataRows = rows.map((row: Record<string, unknown>) => {
        const r: Record<string, unknown> = {};
        columns.forEach((col) => {
          const v = row[col.name];
          // BigQuery returns Date objects for date fields
          r[col.name] = v instanceof Date ? v.toISOString() : v;
        });
        return r;
      });

      return [{ columns, rows: dataRows }, null];
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    }
  }
}

register(BigQuery as any);
