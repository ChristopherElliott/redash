import { Redis } from "ioredis";
import { AppDataSource } from "../models/connection";
import { settings, REDIS_URL } from "../settings";
import { logger as rootLogger } from "../logger";
import { baseUrl, jsonDumps, jsonLoads } from "../utils";
import { sendMail } from "./general";

const logger = rootLogger.child({ module: "tasks.failureReport" });

function redisKey(userId: number): string {
  return `aggregated_failures:${userId}`;
}

function getRedis(): Redis {
  return new Redis(REDIS_URL);
}

function commentFor(failure: Record<string, unknown>): string | undefined {
  const scheduleFailures = failure.schedule_failures as number;
  if (scheduleFailures > settings.MAX_FAILURE_REPORTS_PER_QUERY * 0.75) {
    return `NOTICE: This query has failed a total of ${scheduleFailures} times. Reporting may stop when the query exceeds ${settings.MAX_FAILURE_REPORTS_PER_QUERY} overall failures.`;
  }
  return undefined;
}

export async function sendAggregatedErrors(): Promise<void> {
  const redis = getRedis();
  const keys = await redis.keys(redisKey(0).replace("0", "*"));
  for (const k of keys) {
    const match = k.match(/\d+/);
    if (match) await sendFailureReport(parseInt(match[0]));
  }
  redis.disconnect();
}

export async function sendFailureReport(userId: number): Promise<void> {
  const redis = getRedis();
  const raw = await redis.lrange(redisKey(userId), 0, -1);
  const errors = raw.map((e) => jsonLoads(e) as Record<string, unknown>).reverse();

  if (errors.length) {
    const occurrences = new Map<string, number>();
    const uniqueErrors = new Map<string, Record<string, unknown>>();

    for (const e of errors) {
      const key = `${e.id}::${e.message}`;
      occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
      uniqueErrors.set(key, e);
    }

    const userRepo = AppDataSource.getRepository("User");
    const user = await userRepo.findOneOrFail({ where: { id: userId } });

    const failures = Array.from(uniqueErrors.entries()).map(([k, v]) => ({
      id: v.id,
      name: v.name,
      failed_at: v.failed_at,
      failure_reason: v.message,
      failure_count: occurrences.get(k) ?? 1,
      comment: commentFor(v),
    }));

    const orgSlug = (user as any).org?.slug ?? "";
    const baseUrlStr = baseUrl({ slug: orgSlug });
    const subject = `Redash failed to execute ${uniqueErrors.size} of your scheduled queries`;
    const text = failures
      .map((f) => `Query "${f.name}" (id=${f.id}) failed ${f.failure_count} time(s): ${f.failure_reason}`)
      .join("\n");
    const html = `<p>${failures
      .map((f) => `<strong>${f.name}</strong>: ${f.failure_reason} (×${f.failure_count})`)
      .join("</p><p>")}</p><p><a href="${baseUrlStr}">View in Redash</a></p>`;

    await sendMail([user.email], subject, html, text);
  }

  await redis.del(redisKey(userId));
  redis.disconnect();
}

export async function notifyOfFailure(
  message: string,
  query: { id: number; name: string; scheduleFailures: number; userId: number; user?: { isDisabled: boolean } },
  orgSettings: { send_email_on_failed_scheduled_queries?: boolean }
): Promise<void> {
  const subscribed = orgSettings.send_email_on_failed_scheduled_queries ?? false;
  const exceededThreshold = query.scheduleFailures >= settings.MAX_FAILURE_REPORTS_PER_QUERY;

  if (subscribed && !query.user?.isDisabled && !exceededThreshold) {
    const redis = getRedis();
    await redis.lpush(
      redisKey(query.userId),
      jsonDumps({
        id: query.id,
        name: query.name,
        message,
        schedule_failures: query.scheduleFailures,
        failed_at: new Date().toUTCString(),
      })
    );
    redis.disconnect();
  }
}

export async function trackFailure(
  query: { id: number; scheduleFailures: number; userId: number; name: string; user?: { isDisabled: boolean } },
  error: string,
  orgSettings: { send_email_on_failed_scheduled_queries?: boolean } = {}
): Promise<void> {
  logger.debug(error);

  const repo = AppDataSource.getRepository("Query");
  await repo.update(query.id, { scheduleFailures: query.scheduleFailures + 1 } as any);

  await notifyOfFailure(error, { ...query, scheduleFailures: query.scheduleFailures + 1 }, orgSettings);
}
