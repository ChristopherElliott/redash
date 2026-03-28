import { Router, Request, Response, NextFunction } from "express";
import { AppDataSource } from "../models/connection";
import { Query, QueryResult } from "../models/query";
import { requireAuth } from "../authentication/middleware";
import { getObjectOr404 } from "./base";
import { enqueueQuery } from "../tasks";
import { genQueryHash } from "../utils";
import { settings } from "../settings";

export const queryResultsRouter = Router();

// POST /api/query_results
queryResultsRouter.post("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).currentUser;
    const { query, data_source_id, query_id, max_age, parameters } = req.body;

    if (!query || !data_source_id) {
      return res.status(400).json({ message: "query and data_source_id are required" });
    }

    const queryHash = genQueryHash(query);
    const maxAge = max_age ?? 0;

    // Check for cached result
    if (maxAge !== 0) {
      const qrRepo = AppDataSource.getRepository(QueryResult);
      const cached = await qrRepo
        .createQueryBuilder("qr")
        .where("qr.queryHash = :queryHash", { queryHash })
        .andWhere("qr.dataSourceId = :dsId", { dsId: data_source_id })
        .orderBy("qr.retrievedAt", "DESC")
        .getOne();

      if (cached) {
        const ageSeconds = (Date.now() - cached.retrievedAt.getTime()) / 1000;
        if (maxAge === -1 || ageSeconds <= maxAge) {
          return res.json({ query_result: cached.toDict() });
        }
      }
    }

    // Enqueue new execution
    const jobId = await enqueueQuery(query, data_source_id, {
      userId: user.id,
      metadata: { query_id: query_id ?? "adhoc" },
    });

    res.json({ job: { id: jobId, status: 1 } });
  } catch (e) { next(e); }
});

// GET /api/query_results/:id
queryResultsRouter.get("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id);
    const qrRepo = AppDataSource.getRepository(QueryResult);
    const qr = await getObjectOr404(() => qrRepo.findOne({ where: { id } }));
    res.json({ query_result: qr.toDict() });
  } catch (e) { next(e); }
});

// GET /api/queries/:query_id/results
queryResultsRouter.get("/queries/:queryId/results", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const qRepo = AppDataSource.getRepository(Query);
    const q = await getObjectOr404(() => qRepo.findOne({ where: { id: parseInt(req.params.queryId) } }));
    if (!q.latestQueryDataId) return res.status(404).json({ message: "No result" });
    const qrRepo = AppDataSource.getRepository(QueryResult);
    const qr = await getObjectOr404(() => qrRepo.findOne({ where: { id: q.latestQueryDataId! } }));
    res.json({ query_result: qr.toDict() });
  } catch (e) { next(e); }
});

// GET /api/jobs/:jobId
queryResultsRouter.get("/jobs/:jobId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { queriesQueue } = await import("../tasks");
    const job = await queriesQueue.getJob(req.params.jobId);
    if (!job) return res.status(404).json({ message: "Job not found" });

    const state = await job.getState();
    const stateMap: Record<string, number> = {
      waiting: 1, active: 2, completed: 3, failed: 4,
    };

    const result: Record<string, unknown> = {
      id: job.id,
      status: stateMap[state] ?? 1,
      query_result_id: null,
      error: null,
    };

    if (state === "completed") {
      result.query_result_id = job.returnvalue;
      result.status = 3;
    } else if (state === "failed") {
      result.error = job.failedReason ?? "Query failed";
      result.status = 4;
    }

    res.json({ job: result });
  } catch (e) { next(e); }
});

// GET /api/queries/:query_id/dropdown
queryResultsRouter.get("/queries/:queryId/dropdown", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const qRepo = AppDataSource.getRepository(Query);
    const q = await getObjectOr404(() => qRepo.findOne({ where: { id: parseInt(req.params.queryId) } }));
    if (!q.latestQueryDataId) return res.json({ query_result: null });
    const qrRepo = AppDataSource.getRepository(QueryResult);
    const qr = await qrRepo.findOne({ where: { id: q.latestQueryDataId } });
    res.json({ query_result: qr ? qr.toDict() : null });
  } catch (e) { next(e); }
});
