import { Queue, Job } from "bullmq";
import { createRedisConnection, createWorker } from "./worker";
import { recordEventJob, sendMailJob, testConnectionJob, getSchemaJob } from "./general";
import { checkAlertsForQueryJob } from "./alerts";
import { executeQueryJob, refreshQueries, cleanupQueryResults, emptySchedules, refreshSchemas, removeGhostLocks, refreshSchema } from "./queries";
import { sendAggregatedErrors } from "./failureReport";
import { logger as rootLogger } from "../logger";

const logger = rootLogger.child({ module: "tasks" });

// ─── Queues ────────────────────────────────────────────────────────────────

export const defaultQueue = new Queue("default", { connection: createRedisConnection() });
export const emailQueue = new Queue("emails", { connection: createRedisConnection() });
export const queriesQueue = new Queue("queries", { connection: createRedisConnection() });
export const schemasQueue = new Queue("schemas", { connection: createRedisConnection() });
export const periodicQueue = new Queue("periodic", { connection: createRedisConnection() });

// ─── Workers ────────────────────────────────────────────────────────────────

export function startWorkers(): void {
  createWorker("default", async (job: Job) => {
    switch (job.name) {
      case "recordEvent": return recordEventJob(job.data);
      case "checkAlertsForQuery": return checkAlertsForQueryJob(job.data.queryId, job.data.metadata);
      case "refreshQueries": return refreshQueries();
      case "removeGhostLocks": return removeGhostLocks();
      case "emptySchedules": return emptySchedules();
      case "refreshSchemas": return refreshSchemas();
      case "sendAggregatedErrors": return sendAggregatedErrors();
      default:
        logger.warn(`Unknown default queue job: ${job.name}`);
    }
  });

  createWorker("emails", async (job: Job) => {
    const { to, subject, html, text } = job.data;
    return sendMailJob(to, subject, html, text);
  });

  createWorker("queries", async (job: Job) => {
    if (job.name === "executeQuery") return executeQueryJob(job.data);
    logger.warn(`Unknown queries queue job: ${job.name}`);
  });

  createWorker("schemas", async (job: Job) => {
    if (job.name === "refreshSchema") return refreshSchema(job.data.dataSourceId);
    logger.warn(`Unknown schemas queue job: ${job.name}`);
  });

  createWorker("periodic", async (job: Job) => {
    switch (job.name) {
      case "refreshQueries": return refreshQueries();
      case "removeGhostLocks": return removeGhostLocks();
      case "emptySchedules": return emptySchedules();
      case "refreshSchemas": return refreshSchemas();
      case "cleanupQueryResults": return cleanupQueryResults();
      case "sendAggregatedErrors": return sendAggregatedErrors();
      default:
        logger.warn(`Unknown periodic queue job: ${job.name}`);
    }
  });

  logger.info("All workers started.");
}

// ─── Re-exports ─────────────────────────────────────────────────────────────

export { recordEvent, sendMail } from "./general";
export { checkAlertsForQuery } from "./alerts";
export { enqueueQuery } from "./queries";
export { schedulePeriodicJobs } from "./schedule";
