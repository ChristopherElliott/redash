import axios from "axios";
import logger from "../logger";
import { BaseDestination, NotifyOptions, register } from "./index";

export class HangoutsChat extends BaseDestination {
  static destinationType(): string { return "hangouts_chat"; }
  static destinationName(): string { return "Google Hangouts Chat"; }
  static icon(): string { return "fa-bolt"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        url: {
          type: "string",
          title: "Webhook URL (get it from the room settings)",
        },
        icon_url: {
          type: "string",
          title: "Icon URL (32x32 or multiple, png format)",
        },
      },
      secret: ["url"],
      required: ["url"],
    };
  }

  async notify({ alert, query, newState, host, options }: NotifyOptions): Promise<void> {
    try {
      let message: string;
      if (newState === "triggered") {
        message = '<b><font color="#c0392b">Triggered</font></b>';
      } else if (newState === "ok") {
        message = '<font color="#27ae60">Went back to normal</font>';
      } else {
        message =
          "Unable to determine status. Check Query and Alert configuration.";
      }

      const title = alert.customSubject ?? alert.name;

      const card: Record<string, unknown> = {
        header: { title },
        sections: [
          { widgets: [{ textParagraph: { text: message } }] },
        ],
      };

      if (alert.customBody) {
        (card.sections as any[]).push({
          widgets: [{ textParagraph: { text: alert.customBody } }],
        });
      }

      if (options.icon_url) {
        (card.header as any).imageUrl = options.icon_url;
      }

      if (host) {
        (card.sections as any[])[0].widgets.push({
          buttons: [
            {
              textButton: {
                text: "OPEN QUERY",
                onClick: {
                  openLink: { url: `${host}/queries/${query.id}` },
                },
              },
            },
          ],
        });
      }

      const data = { cards: [card] };

      const resp = await axios.post(options.url as string, data, {
        headers: { "Content-Type": "application/json; charset=UTF-8" },
        timeout: 5000,
      });

      if (resp.status !== 200) {
        logger.error(`Hangouts Chat send ERROR. status_code => ${resp.status}`);
      }
    } catch (err) {
      logger.error("Hangouts Chat send ERROR", err);
    }
  }
}

register(HangoutsChat as any);
