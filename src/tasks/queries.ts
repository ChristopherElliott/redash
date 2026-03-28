import { Redis } from "ioredis";
import { AppDataSource } from "../models/connection";
import { Query, QueryResult } from "../models/query";
import { genQueryHash, utcnow } from "../utils";
import { getQueryRunner } from "../queryRunners";
import { settings, REDIS_URL } from "../settings";
import { logger as rootLogger } from "../logger";
import { queriesQueue, schemasQueue } from "./index";
import { checkAlertsForQuery } from "./alerts";
import { statsdClient } from "../metrics";

const logger = rootLogger.child({ module: "tasks.queries" });

const TIMEOUT_MESSAGE = "Query exceeded Redash query execution time limit.";

let redisClient: Redis | null = null;
function getRedis(): Redis {
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL);
  }
  return redisClient;
}

function jobLockId(queryHash: string, dataSourceId: number): string {
  return `query_hash_job:${dataSourceId}:${queryHash}`;
}

async function unlock(queryHash: string, dataSourceId: number): Promise<void> {
  await getRedis().del(jobLockId(queryHash, dataSourceId));
}

export interface EnqueueQueryOptions {
  userId?: number;
  isApiKey?: boolean;
  scheduledQueryId?: number | null;
  metadata?: Record<string, unknown>;
}

export async function enqueueQuery(
  query: string,
  dataSourceId: number,
  opts: EnqueueQueryOptions = {}
): Promise<string | null> {
  const { userId, isApiKey = false, scheduledQueryId = null, metadata = {} } = opts;
  const queryHash = genQueryHash(query);
  const redis = getRedis();
  const lockKey = jobLockId(queryHash, dataSourceId);

  logger.info(`Inserting job for ${queryHash} with metadata=${JSON.stringify(metadata)}`);

  // Check for existing job
  const existingJobId = await redis.get(lockKey);
  if (existingJobId) {
    logger.info(`[${queryHash}] Found existing job: ${existingJobId}`);
    const existingJob = await queriesQueue.getJob(existingJobId);
    if (existingJob) {
      const state = await existingJob.getState();
      const isDone = state === "completed" || state === "failed";
      if (!isDone) {
        logger.info(`[${queryHash}] Job still active, returning existing job id`);
        return existingJobId;
      }
    }
    // Job is done or gone — remove lock
    await redis.del(lockKey);
  }

  const queueName = scheduledQueryId ? "scheduled_queries" : "queries";
  const timeLimit = settings.ADHOC_QUERY_TIME_LIMIT > 0 ? settings.ADHOC_QUERY_TIME_LIMIT : null;

  const job = await queriesQueue.add(
    "executeQuery",
    {
      query,
      dataSourceId,
      userId,
      isApiKey,
      scheduledQueryId,
      metadata: { ...metadata, Queue: queueName },
    },
    {
      jobId: undefined,
      attempts: 1,
      ...(timeLimit ? { timeout: timeLimit * 1000 } : {}),
    }
  );

  logger.info(`[${queryHash}] Created new job: ${job.id}`);
  await redis.set(lockKey, job.id!, 'EX', settings.JOB_EXPIRY_TIME);
  return job.id!;
}

export async function executeQueryJob(jobData: {
  query: string;
  dataSourceId: number;
  userId?: number;
  isApiKey?: boolean;
  scheduledQueryId?: number | null;
  metadata: Record<string, unknown>;
}): Promise<number> {
  const { query, dataSourceId, userId, isApiKey, scheduledQueryId, metadata } = jobData;
  const queryHash = genQueryHash(query);
  const startedAt = Date.now();

  logger.debug(`Executing query:\n${query}`);

  const dsRepo = AppDataSource.getRepository("DataSource");
  const ds = await dsRepo.findOneOrFail({ where: { id: dataSourceId } });
  const runner = getQueryRunner(ds.type, ds.options ?? {});
  if (!runner) throw new Error(`No query runner for type: ${ds.type}`);

  let data: unknown = null;
  let error: string | null = null;

  try {
    [data, error] = await runner.runQuery(query, userId);
  } catch (e: any) {
    error = e?.message ?? String(e);
    data = null;
  }

  const runTime = (Date.now() - startedAt) / 1000;
  logger.info(
    `job=execute_query query_hash=${queryHash} ds_id=${dataSourceId} error=[${error}]`
  );

  await unlock(queryHash, dataSourceId);

  if (error !== null || data === null) {
    throw new Error(error ?? "Unknown error");
  }

  // Store result
  const qrRepo = AppDataSource.getRepository(QueryResult);
  const qr = qrRepo.create({
    dataSourceId,
    queryHash,
    query,
    data: JSON.stringify(data),
    runtime: runTime,
    retrievedAt: utcnow(),
  } as Partial<QueryResult>);
  await qrRepo.save(qr);

  // Update queries referencing this result
  const queryRepo = AppDataSource.getRepository(Query);
  const queriesUsingResult = await queryRepo.find({
    where: { queryHash, dataSourceId } as any,
  });
  const updatedIds: number[] = [];
  for (const q of queriesUsingResult) {
    q.latestQueryDataId = qr.id;
    await queryRepo.save(q);
    updatedIds.push(q.id);
  }

  // Check alerts
  for (const qid of updatedIds) {
    await checkAlertsForQuery(qid, metadata);
  }

  return qr.id;
}

// ─── Maintenance ────────────────────────────────────────────────────────────

export async function emptySchedules(): Promise<void> {
  logger.info("Deleting schedules of past scheduled queries...");
  const repo = AppDataSource.getRepository(Query);
  const now = utcnow();
  const queries = await repo
    .createQueryBuilder("q")
    .where("q.schedule IS NOT NULL")
    .andWhere("q.scheduleUntil < :now", { now })
    .getMany();

  for (const q of queries) {
    q.schedule = null as any;
  }
  await repo.save(queries);
  logger.info(`Deleted ${queries.length} schedules.`);
}

export async function refreshQueries(): Promise<void> {
  logger.info("Refreshing queries...");
  if (settings.FEATURE_DISABLE_REFRESH_QUERIES) {
    logger.info("Disabled refresh queries.");
    return;
  }

  const repo = AppDataSource.getRepository(Query);
  // Find queries that are scheduled and overdue
  const now = utcnow();
  const queries = await repo
    .createQueryBuilder("q")
    .innerJoinAndSelect("q.dataSource", "ds")
    .where("q.schedule IS NOT NULL")
    .andWhere("q.scheduledQueryId IS NULL OR q.nextRunAt <= :now", { now })
    .getMany();

  const enqueued: number[] = [];
  for (const q of queries) {
    if (!q.dataSource || q.dataSource.paused) continue;
    try {
      await enqueueQuery(q.queryText, q.dataSourceId!, {
        userId: q.userId,
        scheduledQueryId: q.id,
        metadata: { query_id: q.id },
      });
      enqueued.push(q.id);
    } catch (e: any) {
      logger.info(`Could not enqueue query ${q.id}: ${e.message}`);
    }
  }

  const redis = getRedis();
  await redis.hset("redash:status", {
    started_at: Date.now(),
    outdated_queries_count: enqueued.length,
    last_refresh_at: Date.now(),
    query_ids: JSON.stringify(enqueued),
  });
  logger.info(`Done refreshing queries. Enqueued: ${enqueued.length}`);
}

export async function cleanupQueryResults(): Promise<void> {
  logger.info(
    `Running query results cleanup (max ${settings.QUERY_RESULTS_CLEANUP_COUNT} results, ${settings.QUERY_RESULTS_CLEANUP_MAX_AGE} days old)`
  );

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - settings.QUERY_RESULTS_CLEANUP_MAX_AGE);

  const repo = AppDataSource.getRepository(QueryResult);
  await repo
    .createQueryBuilder()
    .delete()
    .where("id IN (SELECT id FROM query_results WHERE retrieved_at < :cutoff LIMIT :limit)", {
      cutoff,
      limit: settings.QUERY_RESULTS_CLEANUP_COUNT,
    })
    .execute();
  logger.info("Query results cleanup done.");
}

export async function removeGhostLocks(): Promise<void> {
  const redis = getRedis();
  const keys = await redis.keys("query_hash_job:*");
  let removed = 0;

  for (const key of keys) {
    const jobId = await redis.get(key);
    if (!jobId) {
      await redis.del(key);
      removed++;
      continue;
    }
    const job = await queriesQueue.getJob(jobId);
    if (!job) {
      await redis.del(key);
      removed++;
    }
  }

  logger.info(`Locks found: ${keys.length}, Locks removed: ${removed}`);
}

export async function refreshSchema(dataSourceId: number): Promise<void> {
  const repo = AppDataSource.getRepository("DataSource");
  const ds = await repo.findOneOrFail({ where: { id: dataSourceId } });
  const runner = getQueryRunner(ds.type, ds.options ?? {});
  if (!runner) return;
  const start = Date.now();
  logger.info(`task=refresh_schema state=start ds_id=${dataSourceId}`);
  try {
    await runner.getSchema(true);
    logger.info(
      `task=refresh_schema state=finished ds_id=${dataSourceId} runtime=${((Date.now() - start) / 1000).toFixed(2)}`
    );
    statsdClient.increment("refresh_schema.success");
  } catch (err: any) {
    logger.warn(`Failed refreshing schema for datasource ${dataSourceId}: ${err.message}`);
    statsdClient.increment("refresh_schema.error");
  }
}

export async function refreshSchemas(): Promise<void> {
  logger.info("task=refresh_schemas state=start");
  const start = Date.now();

  const redis = getRedis();
  const blacklistRaw = await redis.smembers("data_sources:schema:blacklist");
  const blacklist = new Set(blacklistRaw.map(Number).filter(Boolean));

  const repo = AppDataSource.getRepository("DataSource");
  const dataSources = await repo.find();

  for (const ds of dataSources) {
    if (ds.paused) continue;
    if (blacklist.has(ds.id)) continue;
    await schemasQueue.add("refreshSchema", { dataSourceId: ds.id });
  }

  logger.info(
    `task=refresh_schemas state=finish total_runtime=${((Date.now() - start) / 1000).toFixed(2)}`
  );
}
