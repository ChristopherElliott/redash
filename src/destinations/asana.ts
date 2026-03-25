import axios from "axios";
import logger from "../logger";
import { BaseDestination, NotifyOptions, register } from "./index";

const ASANA_API_URL = "https://app.asana.com/api/1.0/tasks";

export class Asana extends BaseDestination {
  static destinationType(): string { return "asana"; }
  static icon(): string { return "fa-asana"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        pat: { type: "string", title: "Asana Personal Access Token" },
        project_id: { type: "string", title: "Asana Project ID" },
      },
      secret: ["pat"],
      required: ["pat", "project_id"],
    };
  }

  async notify({ alert, query, newState, host, options }: NotifyOptions): Promise<void> {
    const state = newState === "triggered" ? "TRIGGERED" : "RECOVERED";

    const notes = [
      `${alert.name} has ${state}.`,
      "",
      `Query: ${host}/queries/${query.id}`,
      `Alert: ${host}/alerts/${alert.id}`,
    ].join("\n");

    const data = {
      data: {
        name: `[Redash Alert] ${state}: ${alert.name}`,
        notes,
        projects: [options.project_id],
      },
    };

    try {
      const resp = await axios.post(ASANA_API_URL, data, {
        headers: { Authorization: `Bearer ${options.pat}` },
        timeout: 5000,
      });
      logger.warn(`Asana response: ${resp.status}`);
      if (resp.status !== 201) {
        logger.error(`Asana send ERROR. status_code => ${resp.status}`);
      }
    } catch (err) {
      logger.error("Asana send ERROR", err);
    }
  }
}

register(Asana as any);
