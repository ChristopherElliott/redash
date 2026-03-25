import { Router, Request, Response, NextFunction } from "express";
import { AppDataSource } from "../models/connection";
import { Organization } from "../models/organization";
import { requireAdmin } from "../authentication/middleware";
import { getObjectOr404 } from "./base";

export const organizationRouter = Router();

// GET /api/settings/organization
organizationRouter.get("/", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg as Organization;
    res.json({
      id: org.id,
      name: org.name,
      slug: org.slug,
      settings: org.settings,
      is_disabled: org.isDisabled,
    });
  } catch (e) { next(e); }
});

// POST /api/settings/organization
organizationRouter.post("/", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg as Organization;
    const repo = AppDataSource.getRepository(Organization);
    const dbOrg = await getObjectOr404(() => repo.findOne({ where: { id: org.id } }));

    if (req.body.name) dbOrg.name = req.body.name;
    if (req.body.settings) dbOrg.settings = { ...dbOrg.settings, ...req.body.settings };

    await repo.save(dbOrg);
    res.json({ id: dbOrg.id, name: dbOrg.name, settings: dbOrg.settings });
  } catch (e) { next(e); }
});
