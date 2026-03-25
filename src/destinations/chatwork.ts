import axios from "axios";
import logger from "../logger";
import { BaseDestination, NotifyOptions, register } from "./index";

const DEFAULT_TEMPLATE = "{alert_name} changed state to {new_state}.\n{alert_url}\n{query_url}";

export class ChatWork extends BaseDestination {
  static destinationType(): string { return "chatwork"; }
  static icon(): string { return "fa-comment"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        api_token: { type: "string", title: "API Token" },
        room_id: { type: "string", title: "Room ID" },
        message_template: {
          type: "string",
          default: DEFAULT_TEMPLATE,
          title: "Message Template",
        },
      },
      secret: ["api_token"],
      required: ["message_template", "api_token", "room_id"],
    };
  }

  async notify({ alert, query, newState, host, options }: NotifyOptions): Promise<void> {
    const url = `https://api.chatwork.com/v2/rooms/${options.room_id}/messages`;

    let message = "";
    if (alert.customSubject) {
      message = alert.customSubject + "\n";
    }

    if (alert.customBody) {
      message += alert.customBody;
    } else {
      const alertUrl = `${host}/alerts/${alert.id}`;
      const queryUrl = `${host}/queries/${query.id}`;
      const template = (options.message_template as string) ?? DEFAULT_TEMPLATE;
      message += template
        .replace("{alert_name}", alert.name)
        .replace("{new_state}", newState.toUpperCase())
        .replace("{alert_url}", alertUrl)
        .replace("{query_url}", queryUrl);
    }

    try {
      const resp = await axios.post(
        url,
        new URLSearchParams({ body: message }),
        {
          headers: { "X-ChatWorkToken": options.api_token as string },
          timeout: 5000,
        }
      );
      logger.warn(`ChatWork response: ${resp.status}`);
      if (resp.status !== 200) {
        logger.error(`ChatWork send ERROR. status_code => ${resp.status}`);
      }
    } catch (err) {
      logger.error("ChatWork send ERROR", err);
    }
  }
}

register(ChatWork as any);
