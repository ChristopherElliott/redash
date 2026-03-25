import { Queue } from "bullmq";
import { settings } from "../settings";
import { logger as rootLogger } from "../logger";
import { createRedisConnection } from "./worker";

const logger = rootLogger.child({ module: "tasks.schedule" });

export const periodicQueue = new Queue("periodic", { connection: createRedisConnection() });

export interface PeriodicJobDef {
  name: string;
  /** Interval in milliseconds */
  intervalMs: number;
  data?: Record<string, unknown>;
  timeout?: number;
}

export function periodicJobDefinitions(): PeriodicJobDef[] {
  const jobs: PeriodicJobDef[] = [
    { name: "refreshQueries", intervalMs: 30_000, timeout: 600_000 },
    { name: "removeGhostLocks", intervalMs: 60_000 },
    { name: "emptySchedules", intervalMs: 60 * 60_000 },
    {
      name: "refreshSchemas",
      intervalMs: settings.SCHEMAS_REFRESH_SCHEDULE * 60_000,
    },
    { name: "syncUserDetails", intervalMs: 60_000, timeout: 60_000 },
    {
      name: "sendAggregatedErrors",
      intervalMs: settings.SEND_FAILURE_EMAIL_INTERVAL * 60_000,
    },
  ];

  if (settings.VERSION_CHECK) {
    jobs.push({ name: "versionCheck", intervalMs: 24 * 60 * 60_000 });
  }

  if (settings.QUERY_RESULTS_CLEANUP_ENABLED) {
    jobs.push({ name: "cleanupQueryResults", intervalMs: 5 * 60_000 });
  }

  return jobs;
}

export async function schedulePeriodicJobs(): Promise<void> {
  const jobs = periodicJobDefinitions();

  for (const job of jobs) {
    logger.info(`Scheduling ${job.name} with interval ${job.intervalMs}ms`);
    await periodicQueue.add(
      job.name,
      job.data ?? {},
      {
        repeat: { every: job.intervalMs },
        jobId: `periodic:${job.name}`,
        ...(job.timeout ? { timeout: job.timeout } : {}),
      }
    );
  }

  logger.info(`Scheduled ${jobs.length} periodic jobs.`);
}
