import { Router, Request, Response, NextFunction } from "express";
import { AppDataSource } from "../models/connection";
import { Visualization } from "../models/visualization";
import { requireAuth } from "../authentication/middleware";
import { getObjectOr404, requireFields } from "./base";

export const visualizationsRouter = Router();

// POST /api/visualizations
visualizationsRouter.post("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    requireFields(req.body, ["query_id", "type", "name", "options"]);
    const repo = AppDataSource.getRepository(Visualization);
    const v = repo.create({
      queryId: req.body.query_id,
      type: req.body.type,
      name: req.body.name,
      description: req.body.description,
      options: req.body.options,
    } as Partial<Visualization>);
    await repo.save(v);
    res.status(201).json(v.toDict());
  } catch (e) { next(e); }
});

// POST /api/visualizations/:id (update)
visualizationsRouter.post("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Visualization);
    const v = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    if (req.body.name) v.name = req.body.name;
    if (req.body.description !== undefined) v.description = req.body.description;
    if (req.body.options) v.options = req.body.options;
    if (req.body.type) v.type = req.body.type;
    await repo.save(v);
    res.json(v.toDict());
  } catch (e) { next(e); }
});

// DELETE /api/visualizations/:id
visualizationsRouter.delete("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Visualization);
    const v = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    await repo.remove(v);
    res.status(204).send();
  } catch (e) { next(e); }
});
