import { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand, GetQueryResultsCommand, QueryExecutionState } from "@aws-sdk/client-athena";
import { BaseQueryRunner, RunQueryResult, TYPE_INTEGER, TYPE_FLOAT, TYPE_BOOLEAN, TYPE_STRING, TYPE_DATETIME, TYPE_DATE, register } from "./index";

const TYPES_MAP: Record<string, string> = {
  tinyint: TYPE_INTEGER, smallint: TYPE_INTEGER, integer: TYPE_INTEGER, bigint: TYPE_INTEGER,
  float: TYPE_FLOAT, double: TYPE_FLOAT, decimal: TYPE_FLOAT, real: TYPE_FLOAT,
  boolean: TYPE_BOOLEAN,
  char: TYPE_STRING, varchar: TYPE_STRING, string: TYPE_STRING, binary: TYPE_STRING,
  date: TYPE_DATE,
  timestamp: TYPE_DATETIME,
};

export class Athena extends BaseQueryRunner {
  static runnerType(): string { return "athena"; }
  static runnerName(): string { return "Amazon Athena"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        aws_access_key_id: { type: "string", title: "AWS Access Key ID" },
        aws_secret_access_key: { type: "string", title: "AWS Secret Access Key" },
        aws_region: { type: "string", title: "AWS Region", default: "us-east-1" },
        s3_staging_dir: { type: "string", title: "S3 Staging Directory" },
        schema: { type: "string", title: "Schema / Database" },
        work_group: { type: "string", title: "WorkGroup" },
      },
      required: ["s3_staging_dir", "aws_region"],
      secret: ["aws_secret_access_key"],
    };
  }

  private getClient(): AthenaClient {
    const cfg = this.configuration;
    return new AthenaClient({
      region: (cfg.aws_region as string) ?? "us-east-1",
      credentials:
        cfg.aws_access_key_id
          ? {
              accessKeyId: cfg.aws_access_key_id as string,
              secretAccessKey: cfg.aws_secret_access_key as string,
            }
          : undefined,
    });
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    const client = this.getClient();
    const cfg = this.configuration;

    try {
      // Start execution
      const startResp = await client.send(
        new StartQueryExecutionCommand({
          QueryString: query,
          ResultConfiguration: { OutputLocation: cfg.s3_staging_dir as string },
          QueryExecutionContext: cfg.schema ? { Database: cfg.schema as string } : undefined,
          WorkGroup: cfg.work_group as string | undefined,
        })
      );
      const executionId = startResp.QueryExecutionId!;

      // Poll for completion
      while (true) {
        await new Promise((r) => setTimeout(r, 1000));
        const statusResp = await client.send(
          new GetQueryExecutionCommand({ QueryExecutionId: executionId })
        );
        const state = statusResp.QueryExecution?.Status?.State;
        if (state === QueryExecutionState.SUCCEEDED) break;
        if (state === QueryExecutionState.FAILED || state === QueryExecutionState.CANCELLED) {
          const reason = statusResp.QueryExecution?.Status?.StateChangeReason ?? state;
          return [null, `Query ${state}: ${reason}`];
        }
      }

      // Fetch results
      const resultsResp = await client.send(
        new GetQueryResultsCommand({ QueryExecutionId: executionId })
      );
      const resultSet = resultsResp.ResultSet;
      if (!resultSet?.Rows?.length) {
        return [{ columns: [], rows: [] }, null];
      }

      // First row is header
      const headerRow = resultSet.Rows[0];
      const columnInfo = resultSet.ResultSetMetadata?.ColumnInfo ?? [];
      const columns = this.fetchColumns(
        (headerRow.Data ?? []).map((cell, i) => [
          cell.VarCharValue ?? `col${i}`,
          TYPES_MAP[columnInfo[i]?.Type ?? ""] as any ?? null,
        ])
      );

      const rows = resultSet.Rows.slice(1).map((row) => {
        const r: Record<string, unknown> = {};
        columns.forEach((col, i) => {
          r[col.name] = row.Data?.[i]?.VarCharValue ?? null;
        });
        return r;
      });

      return [{ columns, rows }, null];
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    }
  }
}

register(Athena as any);
