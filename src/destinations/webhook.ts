import axios from "axios";
import logger from "../logger";
import { BaseDestination, NotifyOptions, register } from "./index";

export class Webhook extends BaseDestination {
  static destinationType(): string { return "webhook"; }
  static icon(): string { return "fa-bolt"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        url: { type: "string" },
        username: { type: "string" },
        password: { type: "string" },
      },
      required: ["url"],
      secret: ["password", "url"],
    };
  }

  async notify({ alert, query, user, newState, host, metadata, options }: NotifyOptions): Promise<void> {
    try {
      const data = {
        event: "alert_state_change",
        alert: {
          id: alert.id,
          name: alert.name,
          description: alert.customBody,
          title: alert.customSubject,
        },
        url_base: host,
        metadata,
      };

      const auth =
        options.username
          ? { username: options.username as string, password: (options.password as string) ?? "" }
          : undefined;

      const resp = await axios.post(options.url as string, data, {
        headers: { "Content-Type": "application/json" },
        auth,
        timeout: 5000,
      });

      if (resp.status !== 200) {
        logger.error(`Webhook send ERROR. status_code => ${resp.status}`);
      }
    } catch (err) {
      logger.error("Webhook send ERROR", err);
    }
  }
}

register(Webhook as any);
