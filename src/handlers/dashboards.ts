import { Router, Request, Response, NextFunction } from "express";
import { AppDataSource } from "../models/connection";
import { Dashboard, Widget } from "../models/dashboard";
import { requireAuth } from "../authentication/middleware";
import { getObjectOr404, requireFields, paginate } from "./base";
import { slugify } from "../utils";

export const dashboardsRouter = Router();

function serializeDashboard(d: Dashboard): Record<string, unknown> {
  return {
    id: d.id,
    name: d.name,
    slug: d.slug,
    is_archived: d.isArchived,
    is_draft: d.isDraft,
    tags: d.tags,
    options: d.options,
    user_id: d.userId,
    org_id: d.orgId,
    created_at: d.createdAt,
    updated_at: d.updatedAt,
  };
}

// GET /api/dashboards
dashboardsRouter.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const page = parseInt((req.query.page as string) ?? "1");
    const pageSize = parseInt((req.query.page_size as string) ?? "25");
    const repo = AppDataSource.getRepository(Dashboard);
    const all = await repo.find({ where: { orgId: org.id, isArchived: false } });
    res.json(paginate(all, page, pageSize, serializeDashboard));
  } catch (e) { next(e); }
});

// POST /api/dashboards
dashboardsRouter.post("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const user = (req as any).currentUser;
    requireFields(req.body, ["name"]);
    const repo = AppDataSource.getRepository(Dashboard);
    const d = repo.create({
      name: req.body.name,
      slug: slugify(req.body.name),
      orgId: org.id,
      userId: user.id,
      isDraft: req.body.is_draft ?? true,
      options: req.body.options ?? {},
      tags: req.body.tags ?? [],
    } as Partial<Dashboard>);
    await repo.save(d);
    res.status(201).json(serializeDashboard(d));
  } catch (e) { next(e); }
});

// GET /api/dashboards/:slugOrId
dashboardsRouter.get("/:slugOrId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Dashboard);
    const id = parseInt(req.params.slugOrId);
    let d: Dashboard | null;
    if (!isNaN(id)) {
      d = await repo.findOne({ where: { id }, relations: ["widgets"] });
    } else {
      d = await repo.findOne({ where: { slug: req.params.slugOrId }, relations: ["widgets"] });
    }
    if (!d) return res.status(404).json({ message: "Not found" });
    res.json(serializeDashboard(d));
  } catch (e) { next(e); }
});

// POST /api/dashboards/:id (update)
dashboardsRouter.post("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Dashboard);
    const d = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    const allowed = ["name", "is_archived", "is_draft", "options", "tags", "layout"];
    for (const key of allowed) {
      if (key in req.body) {
        (d as any)[key === "is_archived" ? "isArchived" : key === "is_draft" ? "isDraft" : key] = req.body[key];
      }
    }
    await repo.save(d);
    res.json(serializeDashboard(d));
  } catch (e) { next(e); }
});

// DELETE /api/dashboards/:id
dashboardsRouter.delete("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Dashboard);
    const d = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    d.isArchived = true;
    await repo.save(d);
    res.status(204).send();
  } catch (e) { next(e); }
});

// GET /api/dashboards/tags
dashboardsRouter.get("/tags", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const result = await AppDataSource.query(
      `SELECT UNNEST(tags) as tag, COUNT(*) as count FROM dashboards WHERE org_id = $1 AND is_archived = false GROUP BY tag ORDER BY tag`,
      [org.id]
    );
    res.json({ tags: result });
  } catch (e) { next(e); }
});

// POST /api/dashboards/:id/fork
dashboardsRouter.post("/:id/fork", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const user = (req as any).currentUser;
    const repo = AppDataSource.getRepository(Dashboard);
    const source = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    const fork = repo.create({
      name: `Copy of ${source.name}`,
      slug: slugify(`copy-of-${source.name}`),
      orgId: org.id,
      userId: user.id,
      isDraft: true,
      options: { ...source.options },
      tags: [...(source.tags ?? [])],
    } as Partial<Dashboard>);
    await repo.save(fork);
    res.status(201).json(serializeDashboard(fork));
  } catch (e) { next(e); }
});

// GET /api/dashboards/my
dashboardsRouter.get("/my", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const user = (req as any).currentUser;
    const page = parseInt((req.query.page as string) ?? "1");
    const pageSize = parseInt((req.query.page_size as string) ?? "25");
    const repo = AppDataSource.getRepository(Dashboard);
    const all = await repo.find({ where: { orgId: org.id, userId: user.id, isArchived: false } });
    res.json(paginate(all, page, pageSize, serializeDashboard));
  } catch (e) { next(e); }
});
