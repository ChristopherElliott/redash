import { Router, Request, Response, NextFunction } from "express";
import { Redis } from "ioredis";
import { AppDataSource } from "../models/connection";
import { Query } from "../models/query";
import { requireAdmin } from "../authentication/middleware";
import { getQueuesStatus } from "../monitor";
import { REDIS_URL } from "../settings";

export const adminRouter = Router();

function getRedis(): Redis {
  return new Redis(REDIS_URL);
}

// GET /api/admin/queries/outdated
adminRouter.get("/queries/outdated", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const redis = getRedis();
    const status = await redis.hgetall("redash:status");
    redis.disconnect();

    let queryIds: number[] = [];
    try { queryIds = JSON.parse(status.query_ids ?? "[]"); } catch {}

    let queries: Query[] = [];
    if (queryIds.length) {
      queries = await AppDataSource.getRepository(Query)
        .createQueryBuilder("q")
        .whereInIds(queryIds)
        .orderBy("q.createdAt", "DESC")
        .getMany();
    }

    res.json({
      queries: queries.map((q) => q.toDict()),
      updated_at: status.last_refresh_at,
    });
  } catch (e) { next(e); }
});

// GET /api/admin/queries/rq_status
adminRouter.get("/queries/rq_status", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const redis = getRedis();
    const queueStatus = await getQueuesStatus(redis);
    redis.disconnect();
    res.json(queueStatus);
  } catch (e) { next(e); }
});
