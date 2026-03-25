import { AppDataSource } from "../models/connection";
import { Alert } from "../models/alert";
import { Query } from "../models/query";
import { baseUrl } from "../utils";
import { logger as rootLogger } from "../logger";
import { defaultQueue } from "./index";

const logger = rootLogger.child({ module: "tasks.alerts" });

const TRIGGERED_STATE = "triggered";
const OK_STATE = "ok";
const UNKNOWN_STATE = "unknown";

function shouldNotify(alert: Alert, newState: string): boolean {
  let passedRearmThreshold = false;
  if (alert.rearm && alert.lastTriggeredAt) {
    passedRearmThreshold =
      alert.lastTriggeredAt.getTime() + alert.rearm * 1000 < Date.now();
  }
  return newState !== alert.state || (alert.state === TRIGGERED_STATE && passedRearmThreshold);
}

async function notifySubscriptions(
  alert: Alert,
  newState: string,
  metadata: Record<string, unknown>
): Promise<void> {
  const host = baseUrl({ slug: (alert as any).query?.org?.slug ?? "" });
  for (const subscription of alert.subscriptions ?? []) {
    try {
      await subscription.notify(alert, newState, host, metadata);
    } catch (err: any) {
      logger.error(`Error processing destination: ${err.message}`);
    }
  }
}

export async function checkAlertsForQueryJob(
  queryId: number,
  metadata: Record<string, unknown>
): Promise<void> {
  logger.debug(`Checking query ${queryId} for alerts`);

  const queryRepo = AppDataSource.getRepository(Query);
  const query = await queryRepo.findOne({
    where: { id: queryId },
    relations: ["alerts", "alerts.subscriptions"],
  });
  if (!query) return;

  const alertRepo = AppDataSource.getRepository(Alert);

  for (const alert of query.alerts ?? []) {
    logger.info(`Checking alert (${alert.id}) of query ${queryId}.`);
    const newState = alert.evaluate?.() ?? UNKNOWN_STATE;

    if (!shouldNotify(alert, newState)) continue;

    logger.info(`Alert ${alert.id} new state: ${newState}`);
    const oldState = alert.state;

    alert.state = newState;
    alert.lastTriggeredAt = new Date();
    await alertRepo.save(alert);

    if (oldState === UNKNOWN_STATE && newState === OK_STATE) {
      logger.debug("Skipping notification (previous state was unknown and now it's ok).");
      continue;
    }

    if (alert.muted) {
      logger.debug("Skipping notification (alert muted).");
      continue;
    }

    await notifySubscriptions(alert, newState, metadata);
  }
}

export function checkAlertsForQuery(
  queryId: number,
  metadata: Record<string, unknown>
): Promise<unknown> {
  return defaultQueue.add("checkAlertsForQuery", { queryId, metadata });
}
