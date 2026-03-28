import { Router, Request, Response, NextFunction } from "express";
import { AppDataSource } from "../models/connection";
import { Query, QueryResult } from "../models/query";
import { requireAuth } from "../authentication/middleware";
import { getObjectOr404, requireFields, paginate } from "./base";
import { genQueryHash, generateToken } from "../utils";
import { enqueueQuery } from "../tasks";
import { format as sqlFormat } from "sql-formatter";

export const queriesRouter = Router();

// POST /api/queries/format
queriesRouter.post("/format", requireAuth, (req: Request, res: Response) => {
  const query = req.body.query ?? "";
  try {
    res.json({ query: sqlFormat(query, { language: "sql" }) });
  } catch {
    res.json({ query });
  }
});

function serializeQuery(q: Query): Record<string, unknown> {
  return {
    id: q.id,
    name: q.name,
    description: q.description,
    query: q.queryText,
    query_hash: q.queryHash,
    is_archived: q.isArchived,
    is_draft: q.isDraft,
    tags: q.tags,
    schedule: q.schedule,
    data_source_id: q.dataSourceId,
    latest_query_data_id: q.latestQueryDataId,
    created_at: q.createdAt,
    updated_at: q.updatedAt,
    user_id: q.userId,
  };
}

// GET /api/queries
queriesRouter.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const user = (req as any).currentUser;
    const page = parseInt((req.query.page as string) ?? "1");
    const pageSize = parseInt((req.query.page_size as string) ?? "25");

    const repo = AppDataSource.getRepository(Query);
    const qb = repo.createQueryBuilder("q")
      .where("q.orgId = :orgId", { orgId: org.id })
      .andWhere("q.isArchived = false")
      .orderBy("q.createdAt", "DESC");

    const all = await qb.getMany();
    res.json(paginate(all, page, pageSize, serializeQuery));
  } catch (e) { next(e); }
});

// POST /api/queries
queriesRouter.post("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const user = (req as any).currentUser;
    requireFields(req.body, ["name", "query", "data_source_id"]);

    const repo = AppDataSource.getRepository(Query);
    const q = repo.create({
      name: req.body.name,
      queryText: req.body.query,
      queryHash: genQueryHash(req.body.query),
      description: req.body.description,
      dataSourceId: req.body.data_source_id,
      orgId: org.id,
      userId: user.id,
      isDraft: req.body.is_draft ?? true,
      schedule: req.body.schedule ?? null,
      options: req.body.options ?? {},
      apiKey: generateToken(40),
    } as Partial<Query>);
    await repo.save(q);
    res.status(201).json(serializeQuery(q));
  } catch (e) { next(e); }
});

// GET /api/queries/recent
queriesRouter.get("/recent", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const repo = AppDataSource.getRepository(Query);
    const queries = await repo.find({
      where: { orgId: org.id, isArchived: false },
      order: { updatedAt: "DESC" },
      take: 10,
    });
    res.json(queries.map(serializeQuery));
  } catch (e) { next(e); }
});

// GET /api/queries/my
queriesRouter.get("/my", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const user = (req as any).currentUser;
    const page = parseInt((req.query.page as string) ?? "1");
    const pageSize = parseInt((req.query.page_size as string) ?? "25");
    const repo = AppDataSource.getRepository(Query);
    const all = await repo.find({ where: { orgId: org.id, userId: user.id, isArchived: false } });
    res.json(paginate(all, page, pageSize, serializeQuery));
  } catch (e) { next(e); }
});

// GET /api/queries/search
queriesRouter.get("/search", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const term = (req.query.q as string) ?? "";
    const repo = AppDataSource.getRepository(Query);
    const results = await repo.createQueryBuilder("q")
      .where("q.orgId = :orgId", { orgId: org.id })
      .andWhere("q.isArchived = false")
      .andWhere("(q.name ILIKE :term OR q.description ILIKE :term OR q.queryText ILIKE :term)", {
        term: `%${term}%`,
      })
      .getMany();
    res.json(results.map(serializeQuery));
  } catch (e) { next(e); }
});

// GET /api/queries/archive
queriesRouter.get("/archive", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const page = parseInt((req.query.page as string) ?? "1");
    const pageSize = parseInt((req.query.page_size as string) ?? "25");
    const repo = AppDataSource.getRepository(Query);
    const all = await repo.find({ where: { orgId: org.id, isArchived: true } });
    res.json(paginate(all, page, pageSize, serializeQuery));
  } catch (e) { next(e); }
});

// GET /api/queries/tags
queriesRouter.get("/tags", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const result = await AppDataSource.query(
      `SELECT UNNEST(tags) as tag, COUNT(*) as count FROM queries WHERE org_id = $1 AND is_archived = false GROUP BY tag ORDER BY tag`,
      [org.id]
    );
    res.json({ tags: result });
  } catch (e) { next(e); }
});

// GET /api/queries/:id
queriesRouter.get("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Query);
    const q = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    res.json(serializeQuery(q));
  } catch (e) { next(e); }
});

// POST /api/queries/:id (update)
queriesRouter.post("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Query);
    const q = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    const allowed = ["name", "description", "query", "schedule", "is_draft", "is_archived", "data_source_id", "options", "tags"];
    for (const key of allowed) {
      if (key in req.body) {
        if (key === "query") {
          q.queryText = req.body.query;
          q.queryHash = genQueryHash(req.body.query);
        } else {
          (q as any)[key === "is_draft" ? "isDraft" : key === "is_archived" ? "isArchived" : key === "data_source_id" ? "dataSourceId" : key] = req.body[key];
        }
      }
    }
    await repo.save(q);
    res.json(serializeQuery(q));
  } catch (e) { next(e); }
});

// DELETE /api/queries/:id
queriesRouter.delete("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Query);
    const q = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    q.isArchived = true;
    q.schedule = null;
    await repo.save(q);
    res.status(204).send();
  } catch (e) { next(e); }
});

// POST /api/queries/:id/refresh
queriesRouter.post("/:id/refresh", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).currentUser;
    const repo = AppDataSource.getRepository(Query);
    const q = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    if (!q.dataSourceId) return res.status(400).json({ message: "No data source" });
    const jobId = await enqueueQuery(q.queryText, q.dataSourceId, {
      userId: user.id,
      metadata: { query_id: q.id },
    });
    res.json({ job: { id: jobId, status: 1 } });
  } catch (e) { next(e); }
});

// POST /api/queries/:id/fork
queriesRouter.post("/:id/fork", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const user = (req as any).currentUser;
    const repo = AppDataSource.getRepository(Query);
    const source = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    const fork = repo.create({
      name: `Copy of ${source.name}`,
      queryText: source.queryText,
      queryHash: source.queryHash,
      description: source.description,
      dataSourceId: source.dataSourceId,
      orgId: org.id,
      userId: user.id,
      isDraft: true,
      schedule: null,
      options: { ...source.options },
      apiKey: generateToken(40),
    } as Partial<Query>);
    await repo.save(fork);
    res.status(201).json(serializeQuery(fork));
  } catch (e) { next(e); }
});

// POST /api/queries/:id/regenerate_api_key
queriesRouter.post("/:id/regenerate_api_key", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Query);
    const q = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    q.apiKey = generateToken(40);
    await repo.save(q);
    res.json(serializeQuery(q));
  } catch (e) { next(e); }
});
