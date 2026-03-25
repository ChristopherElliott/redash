import { Worker, Queue, Job, QueueEvents } from "bullmq";
import { statsdClient } from "../metrics";
import { logger as rootLogger } from "../logger";
import { REDIS_URL } from "../settings";

const logger = rootLogger.child({ module: "worker" });

export function createRedisConnection(): { url: string; maxRetriesPerRequest: null } {
  return {
    url: REDIS_URL,
    maxRetriesPerRequest: null,
  };
}

/** Create a BullMQ Queue with StatsD instrumentation */
export function createQueue(name: string): Queue {
  const q = new Queue(name, { connection: createRedisConnection() });
  return q;
}

/** Create a BullMQ Worker with StatsD instrumentation */
export function createWorker(
  queueName: string,
  processor: (job: Job) => Promise<unknown>
): Worker {
  const worker = new Worker(queueName, processor, {
    connection: createRedisConnection(),
    concurrency: parseInt(process.env.WORKERS_COUNT ?? "4"),
  });

  worker.on("active", (job) => {
    statsdClient.increment(`rq.jobs.running.${queueName}`);
    statsdClient.increment(`rq.jobs.started.${queueName}`);
    logger.debug(`Job ${job.id} started on queue ${queueName}`);
  });

  worker.on("completed", (job) => {
    statsdClient.decrement(`rq.jobs.running.${queueName}`);
    statsdClient.increment(`rq.jobs.finished.${queueName}`);
    logger.debug(`Job ${job.id} completed on queue ${queueName}`);
  });

  worker.on("failed", (job, err) => {
    statsdClient.decrement(`rq.jobs.running.${queueName}`);
    statsdClient.increment(`rq.jobs.failed.${queueName}`);
    logger.error(`Job ${job?.id} failed on queue ${queueName}: ${err.message}`);
  });

  return worker;
}

export { Queue, Job, Worker };
