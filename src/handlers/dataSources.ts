import { Router, Request, Response, NextFunction } from "express";
import { AppDataSource } from "../models/connection";
import { DataSource } from "../models/dataSource";
import { requireAuth, requireAdmin } from "../authentication/middleware";
import { getObjectOr404, requireFields } from "./base";
import { getQueryRunners, getQueryRunner } from "../queryRunners";
import { testConnectionJob, getSchemaJob } from "../tasks/general";
import { queriesQueue } from "../tasks";
import { REDIS_URL } from "../settings";

export const dataSourcesRouter = Router();

// GET /api/data_sources/types
dataSourcesRouter.get("/types", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const runners = getQueryRunners();
    const types = Object.values(runners)
      .map((R: any) => ({ type: R.runnerType(), name: R.runnerName(), configuration_schema: R.configurationSchema() }))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(types);
  } catch (e) { next(e); }
});

// GET /api/data_sources
dataSourcesRouter.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const user = (req as any).currentUser;
    const repo = AppDataSource.getRepository(DataSource);
    let qb = repo.createQueryBuilder("ds").where("ds.orgId = :orgId", { orgId: org.id });
    const sources = await qb.getMany();
    res.json(sources.map((ds) => ({ id: ds.id, name: ds.name, type: ds.type, syntax: "sql" })));
  } catch (e) { next(e); }
});

// POST /api/data_sources
dataSourcesRouter.post("/", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    requireFields(req.body, ["name", "type"]);
    const repo = AppDataSource.getRepository(DataSource);
    const ds = repo.create({
      name: req.body.name,
      type: req.body.type,
      options: req.body.options ?? {},
      orgId: org.id,
    });
    await repo.save(ds);
    res.status(201).json({ id: ds.id, name: ds.name, type: ds.type });
  } catch (e) { next(e); }
});

// GET /api/data_sources/:id
dataSourcesRouter.get("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(DataSource);
    const ds = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    res.json({ id: ds.id, name: ds.name, type: ds.type });
  } catch (e) { next(e); }
});

// POST /api/data_sources/:id (update)
dataSourcesRouter.post("/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(DataSource);
    const ds = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    if (req.body.name) ds.name = req.body.name;
    if (req.body.type) ds.type = req.body.type;
    if (req.body.options) ds.options = req.body.options;
    await repo.save(ds);
    res.json({ id: ds.id, name: ds.name, type: ds.type });
  } catch (e) { next(e); }
});

// DELETE /api/data_sources/:id
dataSourcesRouter.delete("/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(DataSource);
    const ds = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    await repo.remove(ds);
    res.status(204).send();
  } catch (e) { next(e); }
});

// GET /api/data_sources/:id/schema
dataSourcesRouter.get("/:id/schema", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refresh = req.query.refresh === "true";
    const schema = await getSchemaJob(parseInt(req.params.id), refresh);
    res.json({ schema });
  } catch (e) { next(e); }
});

// POST /api/data_sources/:id/test
dataSourcesRouter.post("/:id/test", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await testConnectionJob(parseInt(req.params.id));
    if (result === true) {
      res.json({ ok: true });
    } else {
      res.json({ ok: false, message: (result as Error).message });
    }
  } catch (e) { next(e); }
});

// POST /api/data_sources/:id/pause
dataSourcesRouter.post("/:id/pause", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const redis = (await import("ioredis")).default;
    const r = new redis(REDIS_URL);
    await r.set(`ds:${req.params.id}:pause`, req.body.reason ?? "");
    r.disconnect();
    res.json({ id: req.params.id });
  } catch (e) { next(e); }
});

// DELETE /api/data_sources/:id/pause
dataSourcesRouter.delete("/:id/pause", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const redis = (await import("ioredis")).default;
    const r = new redis(REDIS_URL);
    await r.del(`ds:${req.params.id}:pause`);
    r.disconnect();
    res.json({ id: req.params.id });
  } catch (e) { next(e); }
});
