import axios from "axios";
import logger from "../logger";
import { BaseDestination, NotifyOptions, register } from "./index";

export class Datadog extends BaseDestination {
  static destinationType(): string { return "datadog"; }
  static icon(): string { return "fa-datadog"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        api_key: { type: "string", title: "API Key" },
        tags: { type: "string", title: "Tags" },
        priority: { type: "string", default: "normal", title: "Priority" },
        source_type_name: {
          type: "string",
          default: "my_apps",
          title: "Source Type Name",
        },
      },
      secret: ["api_key"],
      required: ["api_key"],
    };
  }

  async notify({ alert, query, newState, host, options }: NotifyOptions): Promise<void> {
    const alertType = newState === "triggered" ? "error" : "success";
    const title =
      alert.customSubject ??
      (newState === "triggered"
        ? `${alert.name} just triggered`
        : `${alert.name} went back to normal`);

    const queryUrl = `${host}/queries/${query.id}`;
    const alertUrl = `${host}/alerts/${alert.id}`;

    let text = alert.customBody ?? `${alert.name} changed state to ${newState}.`;
    text += `\nQuery: ${queryUrl}\nAlert: ${alertUrl}`;

    const tags: string[] = [];
    if (options.tags) {
      tags.push(...(options.tags as string).split(",").map((t) => t.trim()));
    }
    tags.push("redash", `query_id:${query.id}`, `alert_id:${alert.id}`);

    const body = {
      title,
      text,
      alert_type: alertType,
      priority: options.priority ?? "normal",
      source_type_name: options.source_type_name ?? "my_apps",
      aggregation_key: `redash:${alertUrl}`,
      tags,
    };

    const ddHost = process.env.DATADOG_HOST ?? "api.datadoghq.com";
    const url = `https://${ddHost}/api/v1/events`;

    try {
      const resp = await axios.post(url, body, {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "DD-API-KEY": options.api_key as string,
        },
        timeout: 5000,
      });
      logger.warn(`Datadog response: ${resp.status}`);
      if (resp.status !== 202) {
        logger.error(`Datadog send ERROR. status_code => ${resp.status}`);
      }
    } catch (err) {
      logger.error("Datadog send ERROR", err);
    }
  }
}

register(Datadog as any);
