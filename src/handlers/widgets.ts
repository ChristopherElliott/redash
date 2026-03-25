import { Router, Request, Response, NextFunction } from "express";
import { AppDataSource } from "../models/connection";
import { Widget } from "../models/dashboard";
import { requireAuth } from "../authentication/middleware";
import { getObjectOr404, requireFields } from "./base";

export const widgetsRouter = Router();

// POST /api/widgets
widgetsRouter.post("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireFields(req.body, ["dashboard_id"]);
    const repo = AppDataSource.getRepository(Widget);
    const w = repo.create({
      dashboardId: req.body.dashboard_id,
      visualizationId: req.body.visualization_id,
      text: req.body.text,
      width: req.body.width ?? 1,
      options: req.body.options ?? {},
    } as Partial<Widget>);
    await repo.save(w);
    res.status(201).json({ id: w.id, dashboard_id: w.dashboardId, width: w.width, options: w.options });
  } catch (e) { next(e); }
});

// POST /api/widgets/:id (update)
widgetsRouter.post("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Widget);
    const w = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    if (req.body.text !== undefined) w.text = req.body.text;
    if (req.body.width !== undefined) w.width = req.body.width;
    if (req.body.options) w.options = req.body.options;
    await repo.save(w);
    res.json({ id: w.id, dashboard_id: w.dashboardId, width: w.width, options: w.options });
  } catch (e) { next(e); }
});

// DELETE /api/widgets/:id
widgetsRouter.delete("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Widget);
    const w = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    await repo.remove(w);
    res.status(204).send();
  } catch (e) { next(e); }
});
