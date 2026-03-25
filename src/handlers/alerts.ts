import { Router, Request, Response, NextFunction } from "express";
import { AppDataSource } from "../models/connection";
import { Alert, AlertSubscription } from "../models/alert";
import { requireAuth } from "../authentication/middleware";
import { getObjectOr404, requireFields } from "./base";

export const alertsRouter = Router();

function serializeAlert(a: Alert): Record<string, unknown> {
  return {
    id: a.id,
    name: a.name,
    query_id: a.queryId,
    user_id: a.userId,
    options: a.options,
    state: a.state,
    rearm: a.rearm,
    last_triggered_at: a.lastTriggeredAt,
    muted: a.muted,
    created_at: a.createdAt,
    updated_at: a.updatedAt,
  };
}

// GET /api/alerts
alertsRouter.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).currentUser;
    const repo = AppDataSource.getRepository(Alert);
    const alerts = await repo.find({ where: { userId: user.id } });
    res.json(alerts.map(serializeAlert));
  } catch (e) { next(e); }
});

// POST /api/alerts
alertsRouter.post("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).currentUser;
    requireFields(req.body, ["name", "query_id", "options"]);
    const repo = AppDataSource.getRepository(Alert);
    const a = repo.create({
      name: req.body.name,
      queryId: req.body.query_id,
      userId: user.id,
      options: req.body.options,
      rearm: req.body.rearm,
    } as Partial<Alert>);
    await repo.save(a);
    res.status(201).json(serializeAlert(a));
  } catch (e) { next(e); }
});

// GET /api/alerts/:id
alertsRouter.get("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Alert);
    const a = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    res.json(serializeAlert(a));
  } catch (e) { next(e); }
});

// POST /api/alerts/:id (update)
alertsRouter.post("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Alert);
    const a = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    if (req.body.name) a.name = req.body.name;
    if (req.body.options) a.options = req.body.options;
    if (req.body.rearm !== undefined) a.rearm = req.body.rearm;
    await repo.save(a);
    res.json(serializeAlert(a));
  } catch (e) { next(e); }
});

// DELETE /api/alerts/:id
alertsRouter.delete("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Alert);
    const a = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    await repo.remove(a);
    res.status(204).send();
  } catch (e) { next(e); }
});

// POST /api/alerts/:id/mute
alertsRouter.post("/:id/mute", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Alert);
    const a = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    a.muted = true;
    await repo.save(a);
    res.json(serializeAlert(a));
  } catch (e) { next(e); }
});

// DELETE /api/alerts/:id/mute (unmute)
alertsRouter.delete("/:id/mute", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Alert);
    const a = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    a.muted = false;
    await repo.save(a);
    res.json(serializeAlert(a));
  } catch (e) { next(e); }
});

// GET /api/alerts/:id/eval
alertsRouter.get("/:id/eval", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Alert);
    const a = await getObjectOr404(() =>
      repo.findOne({ where: { id: parseInt(req.params.id) }, relations: ["query", "query.latestQueryData"] })
    );
    const state = a.evaluate();
    res.json({ state });
  } catch (e) { next(e); }
});

// GET /api/alerts/:id/subscriptions
alertsRouter.get("/:id/subscriptions", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(AlertSubscription);
    const subs = await repo.find({ where: { alertId: parseInt(req.params.id) } });
    res.json(subs.map((s) => ({ id: s.id, alert_id: s.alertId, user_id: s.userId, destination_id: s.destinationId })));
  } catch (e) { next(e); }
});

// POST /api/alerts/:id/subscriptions
alertsRouter.post("/:id/subscriptions", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).currentUser;
    const repo = AppDataSource.getRepository(AlertSubscription);
    const sub = repo.create({
      alertId: parseInt(req.params.id),
      userId: user.id,
      destinationId: req.body.destination_id,
    } as Partial<AlertSubscription>);
    await repo.save(sub);
    res.status(201).json({ id: sub.id });
  } catch (e) { next(e); }
});

// DELETE /api/alerts/:id/subscriptions/:subId
alertsRouter.delete("/:id/subscriptions/:subId", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(AlertSubscription);
    const sub = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.subId) } }));
    await repo.remove(sub);
    res.status(204).send();
  } catch (e) { next(e); }
});
