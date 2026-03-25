import { Router, Request, Response, NextFunction } from "express";
import { AppDataSource } from "../models/connection";
import { Event } from "../models/event";
import { requireAdmin } from "../authentication/middleware";

export const eventsRouter = Router();

// GET /api/events
eventsRouter.get("/", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const repo = AppDataSource.getRepository(Event);
    const events = await repo.find({
      where: { orgId: org.id },
      order: { createdAt: "DESC" },
      take: 100,
    });
    res.json(events.map((e) => e.toDict()));
  } catch (e) { next(e); }
});
