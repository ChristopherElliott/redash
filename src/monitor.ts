import { Redis } from "ioredis";
import { Queue, Worker } from "bullmq";
import { DataSource } from "typeorm";
import { settings } from "./settings";

const VERSION = "26.3.0";

export async function getRedisStatus(redis: Redis): Promise<Record<string, unknown>> {
  const info = await redis.info("memory");
  const usedMemoryMatch = info.match(/used_memory:(\d+)/);
  const usedMemoryHumanMatch = info.match(/used_memory_human:(\S+)/);
  return {
    redis_used_memory: usedMemoryMatch ? parseInt(usedMemoryMatch[1], 10) : 0,
    redis_used_memory_human: usedMemoryHumanMatch ? usedMemoryHumanMatch[1] : "0B",
  };
}

export async function getObjectCounts(db: DataSource): Promise<Record<string, unknown>> {
  const status: Record<string, unknown> = {};

  status.queries_count = await db.query(
    "SELECT COUNT(*) as c FROM queries WHERE is_archived = false"
  ).then((r) => parseInt(r[0]?.c ?? "0", 10));

  if (settings.FEATURE_SHOW_QUERY_RESULTS_COUNT) {
    status.query_results_count = await db.query(
      "SELECT COUNT(*) as c FROM query_results"
    ).then((r) => parseInt(r[0]?.c ?? "0", 10));
  }

  status.dashboards_count = await db.query(
    "SELECT COUNT(*) as c FROM dashboards WHERE is_archived = false"
  ).then((r) => parseInt(r[0]?.c ?? "0", 10));

  status.widgets_count = await db.query(
    "SELECT COUNT(*) as c FROM widgets"
  ).then((r) => parseInt(r[0]?.c ?? "0", 10));

  return status;
}

export async function getQueuesStatus(
  redis: Redis
): Promise<Record<string, unknown>> {
  const queues: Record<string, unknown> = {};
  const queueNames = ["queries", "schemas", "periodic"];

  for (const name of queueNames) {
    const q = new Queue(name, { connection: redis as any });
    const counts = await q.getJobCounts(
      "waiting",
      "active",
      "delayed",
      "failed"
    );
    queues[name] = counts;
    await q.close();
  }

  return queues;
}

export async function getDbSizes(
  db: DataSource
): Promise<[string, number][]> {
  const results: [string, number][] = [];

  const queryResultsSize = await db
    .query("SELECT pg_total_relation_size('query_results') as size FROM (SELECT 1) a")
    .then((r) => parseInt(r[0]?.size ?? "0", 10));
  results.push(["Query Results Size", queryResultsSize]);

  const dbSize = await db
    .query("SELECT pg_database_size(current_database()) as size")
    .then((r) => parseInt(r[0]?.size ?? "0", 10));
  results.push(["Redash DB Size", dbSize]);

  return results;
}

export async function getStatus(
  redis: Redis,
  db: DataSource
): Promise<Record<string, unknown>> {
  const status: Record<string, unknown> = {
    version: VERSION,
    workers: [],
  };

  Object.assign(status, await getRedisStatus(redis));
  Object.assign(status, await getObjectCounts(db));

  const managerStatus = await redis.hgetall("redash:status");
  status.manager = {
    ...managerStatus,
    queues: await getQueuesStatus(redis),
  };

  status.database_metrics = {
    metrics: await getDbSizes(db),
  };

  return status;
}
