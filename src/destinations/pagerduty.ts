import axios from "axios";
import logger from "../logger";
import { BaseDestination, NotifyOptions, register } from "./index";

const PAGERDUTY_EVENTS_URL = "https://events.pagerduty.com/v2/enqueue";

export class PagerDuty extends BaseDestination {
  static destinationType(): string { return "pagerduty"; }
  static icon(): string { return "creative-commons-pd-alt"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        integration_key: {
          type: "string",
          title: "PagerDuty Service Integration Key",
        },
        description: {
          type: "string",
          title: "Description for the event, defaults to alert name",
        },
      },
      secret: ["integration_key"],
      required: ["integration_key"],
    };
  }

  async notify({ alert, query, newState, options }: NotifyOptions): Promise<void> {
    if (newState === "unknown") {
      logger.info("Unknown state, doing nothing");
      return;
    }

    const defaultDesc =
      (alert.customSubject as string) ||
      (options.description as string) ||
      `Alert: ${alert.name}`;

    const incidentKey = `${alert.id}_${query.id}`;

    const data: Record<string, unknown> = {
      routing_key: options.integration_key,
      incident_key: incidentKey,
      dedup_key: incidentKey,
      event_action: newState === "triggered" ? "trigger" : "resolve",
      payload: {
        summary: defaultDesc,
        severity: "error",
        source: "redash",
        ...(alert.customBody ? { custom_details: alert.customBody } : {}),
      },
    };

    try {
      const resp = await axios.post(PAGERDUTY_EVENTS_URL, data, { timeout: 5000 });
      logger.warn(`PagerDuty response: ${JSON.stringify(resp.data)}`);
    } catch (err) {
      logger.error("PagerDuty trigger failed!", err);
    }
  }
}

register(PagerDuty as any);
