import axios from "axios";
import logger from "../logger";
import { BaseDestination, NotifyOptions, register } from "./index";

const DEFAULT_MESSAGE_TEMPLATE = JSON.stringify({
  "@type": "MessageCard",
  "@context": "http://schema.org/extensions",
  themeColor: "0076D7",
  summary: "A Redash Alert was Triggered",
  sections: [
    {
      activityTitle: "A Redash Alert was Triggered",
      facts: [
        { name: "Alert Name", value: "{alert_name}" },
        { name: "Alert URL", value: "{alert_url}" },
        { name: "Query", value: "{query_text}" },
        { name: "Query URL", value: "{query_url}" },
      ],
      markdown: true,
    },
  ],
});

/**
 * Replaces {key} placeholders in a JSON string without conflicting with
 * existing braces (mirrors the Python Template-based approach).
 */
function jsonStringSubstitute(
  template: string,
  substitutions: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    Object.prototype.hasOwnProperty.call(substitutions, key)
      ? substitutions[key]
      : `{${key}}`
  );
}

export class MicrosoftTeamsWebhook extends BaseDestination {
  static destinationType(): string { return "microsoft_teams_webhook"; }
  static destinationName(): string { return "Microsoft Teams Webhook"; }
  static icon(): string { return "fa-bolt"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        url: { type: "string", title: "Microsoft Teams Webhook URL" },
        message_template: {
          type: "string",
          default: DEFAULT_MESSAGE_TEMPLATE,
          title: "Message Template",
        },
      },
      required: ["url"],
    };
  }

  async notify({ alert, query, newState, host, options }: NotifyOptions): Promise<void> {
    try {
      const alertUrl = `${host}/alerts/${alert.id}`;
      const queryUrl = `${host}/queries/${query.id}`;

      const messageTemplate =
        (options.message_template as string) ?? DEFAULT_MESSAGE_TEMPLATE;

      const payload = jsonStringSubstitute(messageTemplate, {
        alert_name: alert.name,
        alert_url: alertUrl,
        query_text: query.queryText ?? "",
        query_url: queryUrl,
      });

      const resp = await axios.post(options.url as string, JSON.parse(payload), {
        headers: { "Content-Type": "application/json" },
        timeout: 5000,
      });

      if (resp.status !== 200) {
        logger.error(`MS Teams Webhook send ERROR. status_code => ${resp.status}`);
      }
    } catch (err) {
      logger.error("MS Teams Webhook send ERROR", err);
    }
  }
}

register(MicrosoftTeamsWebhook as any);
