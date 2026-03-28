import { CloudWatchLogsClient, StartQueryCommand, GetQueryResultsCommand, QueryStatus } from "@aws-sdk/client-cloudwatch-logs";
import { BaseQueryRunner, RunQueryResult, TYPE_STRING, register } from "./index";

export class CloudWatchInsights extends BaseQueryRunner {
  static runnerType(): string { return "cloudwatch_insights"; }
  static runnerName(): string { return "Amazon CloudWatch Insights"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        aws_access_key_id: { type: "string", title: "AWS Access Key ID" },
        aws_secret_access_key: { type: "string", title: "AWS Secret Access Key" },
        aws_region: { type: "string", title: "AWS Region", default: "us-east-1" },
        log_group_name: { type: "string", title: "Log Group Name(s) (comma-separated)" },
      },
      required: ["aws_region"],
      secret: ["aws_secret_access_key"],
    };
  }

  private getClient(): CloudWatchLogsClient {
    const cfg = this.configuration;
    return new CloudWatchLogsClient({
      region: (cfg.aws_region as string) ?? "us-east-1",
      credentials:
        cfg.aws_access_key_id
          ? { accessKeyId: cfg.aws_access_key_id as string, secretAccessKey: cfg.aws_secret_access_key as string }
          : undefined,
    });
  }

  async runQuery(query: string, _user: unknown): Promise<RunQueryResult> {
    // Expected query format: JSON with { queryString, startTime, endTime, logGroupNames?, limit? }
    let queryObj: Record<string, unknown>;
    try {
      queryObj = JSON.parse(query);
    } catch {
      return [null, "Query must be valid JSON: { queryString, startTime, endTime }"];
    }

    const client = this.getClient();
    const logGroupNames = (
      (queryObj.logGroupNames as string | undefined) ??
      (this.configuration.log_group_name as string | undefined) ??
      ""
    )
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      const startResp = await client.send(
        new StartQueryCommand({
          logGroupNames,
          queryString: queryObj.queryString as string,
          startTime: Math.floor(new Date(queryObj.startTime as string).getTime() / 1000),
          endTime: Math.floor(new Date(queryObj.endTime as string).getTime() / 1000),
          limit: (queryObj.limit as number) ?? 1000,
        })
      );

      const queryId = startResp.queryId!;

      while (true) {
        await new Promise((r) => setTimeout(r, 1000));
        const pollResp = await client.send(new GetQueryResultsCommand({ queryId }));
        const status = pollResp.status;
        if (status === QueryStatus.Complete) {
          const results = pollResp.results ?? [];
          if (!results.length) return [{ columns: [], rows: [] }, null];
          const fieldNames = Array.from(new Set(results.flatMap((r) => r.map((f) => f.field ?? "")).filter(Boolean)));
          const columns = this.fetchColumns(fieldNames.map((f) => [f, null]));
          const rows = results.map((result) => {
            const r: Record<string, unknown> = {};
            result.forEach((f) => { if (f.field) r[f.field] = f.value; });
            return r;
          });
          return [{ columns, rows }, null];
        }
        if (status === QueryStatus.Failed || status === QueryStatus.Cancelled) {
          return [null, `Query ${status}`];
        }
      }
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    }
  }
}

register(CloudWatchInsights as any);
