import axios from "axios";
import logger from "../logger";
import { BaseDestination, NotifyOptions, register } from "./index";

export class Mattermost extends BaseDestination {
  static destinationType(): string { return "mattermost"; }
  static icon(): string { return "fa-bolt"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        url: { type: "string", title: "Mattermost Webhook URL" },
        username: { type: "string", title: "Username" },
        icon_url: { type: "string", title: "Icon (URL)" },
        channel: { type: "string", title: "Channel" },
      },
      secret: "url",
    };
  }

  async notify({ alert, newState, options }: NotifyOptions): Promise<void> {
    const text = alert.customSubject
      ? alert.customSubject
      : newState === "triggered"
      ? `#### ${alert.name} just triggered`
      : `#### ${alert.name} went back to normal`;

    const payload: Record<string, unknown> = { text };

    if (alert.customBody) {
      payload.attachments = [
        { fields: [{ title: "Description", value: alert.customBody }] },
      ];
    }

    if (options.username) payload.username = options.username;
    if (options.icon_url) payload.icon_url = options.icon_url;
    if (options.channel) payload.channel = options.channel;

    try {
      const resp = await axios.post(options.url as string, payload, { timeout: 5000 });
      logger.warn(`Mattermost response: ${resp.status}`);
      if (resp.status !== 200) {
        logger.error(`Mattermost webhook send ERROR. status_code => ${resp.status}`);
      }
    } catch (err) {
      logger.error("Mattermost webhook send ERROR", err);
    }
  }
}

register(Mattermost as any);
