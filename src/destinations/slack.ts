import axios from "axios";
import logger from "../logger";
import { BaseDestination, NotifyOptions, register } from "./index";

export class Slack extends BaseDestination {
  static destinationType(): string { return "slack"; }
  static icon(): string { return "fa-slack"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        url: { type: "string", title: "Slack Webhook URL" },
      },
      secret: ["url"],
    };
  }

  async notify({ alert, query, user, newState, host, options }: NotifyOptions): Promise<void> {
    const fields = [
      { title: "Query", type: "mrkdwn", value: `${host}/queries/${query.id}` },
      { title: "Alert", type: "mrkdwn", value: `${host}/alerts/${alert.id}` },
    ];

    if (alert.customBody) {
      fields.push({ title: "Description", value: alert.customBody } as any);
    }

    let text: string;
    let color: string;

    if (newState === "triggered") {
      text = alert.customSubject ?? `${alert.name} just triggered`;
      color = "#c0392b";
    } else {
      text = `${alert.name} went back to normal`;
      color = "#27ae60";
    }

    const payload = { attachments: [{ text, color, fields }] };

    try {
      const resp = await axios.post(options.url as string, payload, { timeout: 5000 });
      logger.warn(`Slack response: ${resp.status}`);
    } catch (err) {
      logger.error("Slack send ERROR", err);
    }
  }
}

register(Slack as any);
