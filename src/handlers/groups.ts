import { Router, Request, Response, NextFunction } from "express";
import { AppDataSource } from "../models/connection";
import { Group } from "../models/group";
import { User } from "../models/user";
import { DataSource } from "../models/dataSource";
import { requireAuth, requireAdmin } from "../authentication/middleware";
import { getObjectOr404, requireFields } from "./base";

export const groupsRouter = Router();

function serializeGroup(g: Group): Record<string, unknown> {
  return { id: g.id, name: g.name, type: g.type, permissions: g.permissions, org_id: g.orgId };
}

// GET /api/groups
groupsRouter.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const repo = AppDataSource.getRepository(Group);
    const groups = await repo.find({ where: { orgId: org.id } });
    res.json(groups.map(serializeGroup));
  } catch (e) { next(e); }
});

// POST /api/groups
groupsRouter.post("/", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    requireFields(req.body, ["name"]);
    const repo = AppDataSource.getRepository(Group);
    const g = repo.create({ name: req.body.name, orgId: org.id, type: "regular", permissions: [] } as Partial<Group>);
    await repo.save(g);
    res.status(201).json(serializeGroup(g));
  } catch (e) { next(e); }
});

// GET /api/groups/:id
groupsRouter.get("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Group);
    const g = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    res.json(serializeGroup(g));
  } catch (e) { next(e); }
});

// POST /api/groups/:id (update)
groupsRouter.post("/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Group);
    const g = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    if (req.body.name) g.name = req.body.name;
    if (req.body.permissions) g.permissions = req.body.permissions;
    await repo.save(g);
    res.json(serializeGroup(g));
  } catch (e) { next(e); }
});

// DELETE /api/groups/:id
groupsRouter.delete("/:id", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(Group);
    const g = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    await repo.remove(g);
    res.status(204).send();
  } catch (e) { next(e); }
});

// GET /api/groups/:id/members
groupsRouter.get("/:id/members", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const groupId = parseInt(req.params.id);
    const repo = AppDataSource.getRepository(User);
    const members = await repo
      .createQueryBuilder("u")
      .where(":groupId = ANY(u.groups)", { groupId })
      .getMany();
    res.json(members.map((u) => ({ id: u.id, name: u.name, email: u.email })));
  } catch (e) { next(e); }
});

// POST /api/groups/:id/members
groupsRouter.post("/:id/members", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const groupId = parseInt(req.params.id);
    requireFields(req.body, ["user_id"]);
    const repo = AppDataSource.getRepository(User);
    const u = await getObjectOr404(() => repo.findOne({ where: { id: req.body.user_id } }));
    if (!u.groupIds) u.groupIds = [];
    if (!u.groupIds.includes(groupId)) {
      u.groupIds = [...u.groupIds, groupId];
      await repo.save(u);
    }
    res.status(201).json({ user_id: u.id, group_id: groupId });
  } catch (e) { next(e); }
});

// DELETE /api/groups/:id/members/:userId
groupsRouter.delete("/:id/members/:userId", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const groupId = parseInt(req.params.id);
    const repo = AppDataSource.getRepository(User);
    const u = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.userId) } }));
    u.groupIds = (u.groupIds ?? []).filter((gid) => gid !== groupId);
    await repo.save(u);
    res.status(204).send();
  } catch (e) { next(e); }
});

// GET /api/groups/:id/data_sources
groupsRouter.get("/:id/data_sources", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const groupId = parseInt(req.params.id);
    const result = await AppDataSource.query(
      `SELECT ds.*, dsg.view_only FROM data_sources ds JOIN data_source_groups dsg ON ds.id = dsg.data_source_id WHERE dsg.group_id = $1`,
      [groupId]
    );
    res.json(result);
  } catch (e) { next(e); }
});

// POST /api/groups/:id/data_sources
groupsRouter.post("/:id/data_sources", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const groupId = parseInt(req.params.id);
    requireFields(req.body, ["data_source_id"]);
    await AppDataSource.query(
      `INSERT INTO data_source_groups (group_id, data_source_id, view_only) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [groupId, req.body.data_source_id, req.body.view_only ?? false]
    );
    res.status(201).json({ group_id: groupId, data_source_id: req.body.data_source_id });
  } catch (e) { next(e); }
});

// DELETE /api/groups/:id/data_sources/:dsId
groupsRouter.delete("/:id/data_sources/:dsId", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AppDataSource.query(
      `DELETE FROM data_source_groups WHERE group_id = $1 AND data_source_id = $2`,
      [parseInt(req.params.id), parseInt(req.params.dsId)]
    );
    res.status(204).send();
  } catch (e) { next(e); }
});

// POST /api/groups/:id/data_sources/:dsId (update view_only)
groupsRouter.post("/:id/data_sources/:dsId", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AppDataSource.query(
      `UPDATE data_source_groups SET view_only = $3 WHERE group_id = $1 AND data_source_id = $2`,
      [parseInt(req.params.id), parseInt(req.params.dsId), req.body.view_only ?? false]
    );
    res.json({ group_id: req.params.id, data_source_id: req.params.dsId });
  } catch (e) { next(e); }
});
