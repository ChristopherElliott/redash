import axios from "axios";
import logger from "../logger";
import { BaseDestination, NotifyOptions, register } from "./index";

const WEBEX_API_URL = "https://webexapis.com/v1/messages";

interface AdaptiveCardBody {
  type: string;
  [key: string]: unknown;
}

function buildAttachments(
  subject: string,
  description: string,
  queryLink: string,
  alertLink: string
): unknown[] {
  let body: AdaptiveCardBody[];

  try {
    const startIndex = description.indexOf("[");
    const endIndex = description.lastIndexOf("]") + 1;

    if (startIndex !== -1 && endIndex > startIndex) {
      const jsonStr = description
        .slice(startIndex, endIndex)
        .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
        .replace(/'/g, '"');

      const dataArray = JSON.parse(jsonStr);

      if (
        Array.isArray(dataArray) &&
        dataArray.every((row) => Array.isArray(row))
      ) {
        const tableRows: AdaptiveCardBody[] = dataArray.map((row: unknown[]) => ({
          type: "ColumnSet",
          columns: row.map((item) => ({
            type: "Column",
            items: [{ type: "TextBlock", text: String(item), wrap: true }],
          })),
        }));

        body = [
          { type: "TextBlock", text: subject, weight: "bolder", size: "medium", wrap: true },
          { type: "TextBlock", text: description.slice(0, startIndex), isSubtle: true, wrap: true },
          ...tableRows,
          { type: "TextBlock", text: `Click [here](${queryLink}) to check your query!`, wrap: true, isSubtle: true },
          { type: "TextBlock", text: `Click [here](${alertLink}) to check your alert!`, wrap: true, isSubtle: true },
        ];
      } else {
        throw new Error("Not a 2D array");
      }
    } else {
      throw new Error("No array found");
    }
  } catch {
    body = [
      { type: "TextBlock", text: subject, weight: "bolder", size: "medium", wrap: true },
      { type: "TextBlock", text: description, isSubtle: true, wrap: true },
      { type: "TextBlock", text: `Click [here](${queryLink}) to check your query!`, wrap: true, isSubtle: true },
      { type: "TextBlock", text: `Click [here](${alertLink}) to check your alert!`, wrap: true, isSubtle: true },
    ];
  }

  return [
    {
      contentType: "application/vnd.microsoft.card.adaptive",
      content: {
        $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.0",
        body,
      },
    },
  ];
}

export class Webex extends BaseDestination {
  static destinationType(): string { return "webex"; }
  static icon(): string { return "fa-webex"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        webex_bot_token: { type: "string", title: "Webex Bot Token" },
        to_person_emails: { type: "string", title: "People (comma-separated)" },
        to_room_ids: { type: "string", title: "Rooms (comma-separated)" },
      },
      secret: ["webex_bot_token"],
      required: ["webex_bot_token"],
    };
  }

  async notify({ alert, query, newState, host, options }: NotifyOptions): Promise<void> {
    const queryLink = `${host}/queries/${query.id}`;
    const alertLink = `${host}/alerts/${alert.id}`;

    const subject =
      newState === "triggered"
        ? (alert.customSubject ?? `${alert.name} just triggered`)
        : `${alert.name} went back to normal`;

    const description = alert.customBody ?? "";
    const attachments = buildAttachments(subject, description, queryLink, alertLink);
    const templatePayload = {
      markdown: `${subject}\n${description}`,
      attachments,
    };

    const headers = {
      Authorization: `Bearer ${options.webex_bot_token}`,
    };

    const apiDestinations: Record<string, string | undefined> = {
      toPersonEmail: options.to_person_emails as string | undefined,
      roomId: options.to_room_ids as string | undefined,
    };

    for (const [payloadTag, destinations] of Object.entries(apiDestinations)) {
      if (!destinations) continue;

      for (const destinationId of destinations.split(",")) {
        const trimmed = destinationId.trim();
        if (!trimmed) continue;

        const payload = { ...templatePayload, [payloadTag]: trimmed };

        try {
          const resp = await axios.post(WEBEX_API_URL, payload, { headers, timeout: 5000 });
          logger.warn(`Webex response: ${resp.status}`);
          if (resp.status !== 200) {
            logger.error(`Webex send ERROR. status_code => ${resp.status}`);
          }
        } catch (err) {
          logger.error("Webex send ERROR", err);
        }
      }
    }
  }
}

register(Webex as any);
