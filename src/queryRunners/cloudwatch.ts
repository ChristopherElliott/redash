import { CloudWatchClient, GetMetricDataCommand, MetricDataQuery } from "@aws-sdk/client-cloudwatch";
import { BaseQueryRunner, RunQueryResult, TYPE_DATETIME, TYPE_FLOAT, TYPE_STRING, register } from "./index";
import yaml from "js-yaml";

export class CloudWatch extends BaseQueryRunner {
  static runnerType(): string { return "cloudwatch"; }
  static runnerName(): string { return "Amazon CloudWatch"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        aws_access_key_id: { type: "string", title: "AWS Access Key ID" },
        aws_secret_access_key: { type: "string", title: "AWS Secret Access Key" },
        aws_region: { type: "string", title: "AWS Region", default: "us-east-1" },
      },
      required: ["aws_region"],
      secret: ["aws_secret_access_key"],
    };
  }

  private getClient(): CloudWatchClient {
    const cfg = this.configuration;
    return new CloudWatchClient({
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
    try {
      let queryObj: Record<string, unknown>;
      // Accept YAML or JSON
      try {
        queryObj = yaml.load(query) as Record<string, unknown>;
      } catch {
        return [null, "Query must be valid YAML or JSON."];
      }

      const client = this.getClient();
      const resp = await client.send(
        new GetMetricDataCommand({
          StartTime: new Date(queryObj.StartTime as string),
          EndTime: new Date(queryObj.EndTime as string),
          MetricDataQueries: queryObj.MetricDataQueries as MetricDataQuery[],
        })
      );

      const results = resp.MetricDataResults ?? [];
      if (results.length === 0) {
        return [{ columns: [], rows: [] }, null];
      }

      // Pivot: one column per metric, rows indexed by timestamp
      const timestampMap = new Map<string, Record<string, unknown>>();
      for (const result of results) {
        const label = result.Label ?? result.Id ?? "metric";
        (result.Timestamps ?? []).forEach((ts, i) => {
          const key = ts.toISOString();
          if (!timestampMap.has(key)) timestampMap.set(key, { timestamp: key });
          timestampMap.get(key)![label] = result.Values?.[i] ?? null;
        });
      }

      const rows = Array.from(timestampMap.values()).sort((a, b) =>
        (a.timestamp as string).localeCompare(b.timestamp as string)
      );

      const metricLabels = results.map((r) => r.Label ?? r.Id ?? "metric");
      const columns = this.fetchColumns([
        ["timestamp", TYPE_DATETIME],
        ...metricLabels.map((l) => [l, TYPE_FLOAT] as [string, any]),
      ]);

      return [{ columns, rows }, null];
    } catch (err: any) {
      return [null, err.message ?? String(err)];
    }
  }
}

register(CloudWatch as any);
