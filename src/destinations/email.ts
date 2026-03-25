import nodemailer from "nodemailer";
import { settings } from "../settings";
import logger from "../logger";
import { BaseDestination, NotifyOptions, register } from "./index";

function createTransport() {
  return nodemailer.createTransport({
    host: settings.MAIL_SERVER,
    port: settings.MAIL_PORT,
    secure: settings.MAIL_USE_SSL,
    auth: settings.MAIL_USERNAME
      ? { user: settings.MAIL_USERNAME, pass: settings.MAIL_PASSWORD }
      : undefined,
  } as any);
}

export class Email extends BaseDestination {
  static destinationType(): string { return "email"; }
  static icon(): string { return "fa-envelope"; }

  static configurationSchema(): Record<string, unknown> {
    return {
      type: "object",
      properties: {
        addresses: { type: "string" },
        subject_template: {
          type: "string",
          default: settings.ALERTS_DEFAULT_MAIL_SUBJECT_TEMPLATE,
          title: "Subject Template",
        },
      },
      required: ["addresses"],
      extra_options: ["subject_template"],
    };
  }

  async notify({ alert, query, user, newState, host, options }: NotifyOptions): Promise<void> {
    const recipients = (options.addresses as string ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);

    if (recipients.length === 0) {
      logger.warn("No emails given. Skipping send.");
      return;
    }

    const html = alert.customBody
      ? alert.customBody
      : `<p>${alert.name} changed state to ${newState}.</p><p><a href="${host}/queries/${query.id}">Query</a> | <a href="${host}/alerts/${alert.id}">Alert</a></p>`;

    const state = newState.toUpperCase();
    const subject = alert.customSubject
      ? alert.customSubject
      : (options.subject_template as string ?? settings.ALERTS_DEFAULT_MAIL_SUBJECT_TEMPLATE)
          .replace("{alert_name}", alert.name)
          .replace("{state}", state);

    logger.debug(`Notifying: ${recipients.join(", ")}`);

    try {
      const transporter = createTransport();
      await transporter.sendMail({
        from: settings.MAIL_DEFAULT_SENDER ?? undefined,
        to: recipients.join(", "),
        subject,
        html,
      });
    } catch (err) {
      logger.error("Mail send error", err);
    }
  }
}

register(Email as any);
