import axios from "axios";
import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import { AppDataSource } from "../models/connection";
import { Event } from "../models/event";
import { DataSource } from "../models/dataSource";
import { settings } from "../settings";
import { logger as rootLogger } from "../logger";
import { getQueryRunner } from "../queryRunners";
import { defaultQueue, emailQueue } from "./index";

const logger = rootLogger.child({ module: "tasks.general" });

export async function recordEventJob(rawEvent: Record<string, unknown>): Promise<void> {
  const repo = AppDataSource.getRepository(Event);
  const event = repo.create(rawEvent as Partial<Event>);
  await repo.save(event);

  for (const hook of settings.EVENT_REPORTING_WEBHOOKS) {
    logger.debug(`Forwarding event to: ${hook}`);
    try {
      await axios.post(hook, {
        schema: "iglu:io.redash.webhooks/event/jsonschema/1-0-0",
        data: event,
      });
    } catch (err: any) {
      logger.error(`Failed posting to ${hook}: ${err.message}`);
    }
  }
}

export async function sendMailJob(
  to: string[],
  subject: string,
  html: string,
  text: string
): Promise<void> {
  const transportOptions: SMTPTransport.Options = {
    host: settings.MAIL_SERVER,
    port: settings.MAIL_PORT,
    secure: settings.MAIL_USE_SSL,
    auth:
      settings.MAIL_USERNAME
        ? { user: settings.MAIL_USERNAME, pass: settings.MAIL_PASSWORD ?? undefined }
        : undefined,
  };
  const transporter = nodemailer.createTransport(transportOptions);

  try {
    await transporter.sendMail({
      from: settings.MAIL_DEFAULT_SENDER ?? undefined,
      to: to.join(", "),
      subject,
      html,
      text,
    });
  } catch (err: any) {
    logger.error(`Failed sending message: ${subject} — ${err.message}`);
  }
}

export async function testConnectionJob(dataSourceId: number): Promise<boolean | Error> {
  try {
    const repo = AppDataSource.getRepository(DataSource);
    const ds = await repo.findOneOrFail({ where: { id: dataSourceId } });
    const inst = getQueryRunner(ds.type, ds.options ?? {});
    if (!inst) throw new Error(`No runner for type: ${ds.type}`);
    await inst.testConnection();
    return true;
  } catch (e: any) {
    return e instanceof Error ? e : new Error(String(e));
  }
}

export async function getSchemaJob(
  dataSourceId: number,
  refresh: boolean
): Promise<unknown[] | { error: { code: number; message: string; details?: string } }> {
  try {
    const repo = AppDataSource.getRepository(DataSource);
    const ds = await repo.findOneOrFail({ where: { id: dataSourceId } });
    const inst = getQueryRunner(ds.type, ds.options ?? {});
    if (!inst) throw new Error(`No runner for type: ${ds.type}`);
    const schema = await inst.getSchema(refresh);
    return schema;
  } catch (err: any) {
    if (err.message?.includes("not supported")) {
      return { error: { code: 1, message: "Data source type does not support retrieving schema" } };
    }
    return { error: { code: 2, message: "Error retrieving schema", details: String(err) } };
  }
}

/** Enqueue a recordEvent task */
export function recordEvent(rawEvent: Record<string, unknown>): Promise<unknown> {
  return defaultQueue.add("recordEvent", rawEvent);
}

/** Enqueue a sendMail task */
export function sendMail(to: string[], subject: string, html: string, text: string): Promise<unknown> {
  return emailQueue.add("sendMail", { to, subject, html, text });
}
