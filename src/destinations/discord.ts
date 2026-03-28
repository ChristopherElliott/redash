import axios from "axios";
import logger from "../logger";
import { BaseDestination, NotifyOptions, register } from "./index";

const COLORS: Record<string, number> = {
  ok: 2600544,        // green
  triggered: 12597547, // red
  unknown: 16776960,  // yellow
};

export class Discord extends BaseDestination {
  static destinationType(): string { return "discord"; }
  static icon(): string { return "fa-discord"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: { url: { type: "string", title: "Discord Webhook URL" } },
      secret: ["url"],
      required: ["url"],
    };
  }

  async notify({ alert, query, newState, host, options }: NotifyOptions): Promise<void> {
    const fields: Record<string, unknown>[] = [
      { name: "Query", value: `${host}/queries/${query.id}`, inline: true },
      { name: "Alert", value: `${host}/alerts/${alert.id}`, inline: true },
    ];

    if (alert.customBody) {
      fields.push({ name: "Description", value: alert.customBody });
    }

    const text =
      newState === "triggered"
        ? (alert.customSubject ?? `${alert.name} just triggered`)
        : `${alert.name} went back to normal`;

    const color = COLORS[newState] ?? COLORS.unknown;

    const payload = {
      content: text,
      embeds: [{ color, fields }],
    };

    try {
      const resp = await axios.post(options.url as string, payload, {
        headers: { "Content-Type": "application/json" },
        timeout: 5000,
      });
      if (resp.status !== 200 && resp.status !== 204) {
        logger.error(`Discord send ERROR. status_code => ${resp.status}`);
      }
    } catch (err) {
      logger.error("Discord send ERROR", err);
    }
  }
}

register(Discord as any);
