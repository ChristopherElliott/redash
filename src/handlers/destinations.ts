import { Router, Request, Response, NextFunction } from "express";
import { AppDataSource } from "../models/connection";
import { NotificationDestination } from "../models/notificationDestination";
import { requireAuth, requireAdmin } from "../authentication/middleware";
import { getObjectOr404, requireFields } from "./base";
import { getAllDestinations } from "../destinations";

export const destinationsRouter = Router();

// GET /api/destinations/types
destinationsRouter.get("/types", requireAdmin, async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const all = getAllDestinations();
    res.json(all.map((D: any) => ({ type: D.type, name: D.name, icon: D.icon, configuration_schema: D.configurationSchema() })));
  } catch (e) { next(e); }
});

// GET /api/destinations
destinationsRouter.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const repo = AppDataSource.getRepository(NotificationDestination);
    const all = await repo.find({ where: { orgId: org.id } });
    res.json(all.map((d) => d.toDict()));
  } catch (e) { next(e); }
});

// POST /api/destinations
destinationsRouter.post("/", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const user = (req as any).currentUser;
    requireFields(req.body, ["name", "type", "options"]);
    const repo = AppDataSource.getRepository(NotificationDestination);
    const d = repo.create({
      name: req.body.name,
      type: req.body.type,
      options: req.body.options,
      orgId: org.id,
      userId: user.id,
    } as Partial<NotificationDestination>);
    await repo.save(d);
    res.status(201).json(d.toDict(true));
  } catch (e) { next(e); }
});

// GET /api/destinations/:id
destinationsRouter.get("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(NotificationDestination);
    const d = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    res.json(d.toDict(true));
  } catch (e) { next(e); }
});

// POST /api/destinations/:id (update)
destinationsRouter.post("/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(NotificationDestination);
    const d = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    if (req.body.name) d.name = req.body.name;
    if (req.body.options) d.options = req.body.options;
    await repo.save(d);
    res.json(d.toDict(true));
  } catch (e) { next(e); }
});

// DELETE /api/destinations/:id
destinationsRouter.delete("/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(NotificationDestination);
    const d = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    await repo.remove(d);
    res.status(204).send();
  } catch (e) { next(e); }
});
