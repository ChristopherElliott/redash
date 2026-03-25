import { Router, Request, Response, NextFunction } from "express";
import { Entity, PrimaryGeneratedColumn, Column, Unique } from "typeorm";
import { AppDataSource } from "../models/connection";
import { requireAuth, requireAdmin } from "../authentication/middleware";

@Entity("access_permissions")
@Unique(["objectType", "objectId", "accessType", "granteeId"])
class AccessPermission {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: "object_type", length: 50 })
  objectType!: string;

  @Column({ name: "object_id" })
  objectId!: number;

  @Column({ name: "access_type", length: 50 })
  accessType!: string;

  @Column({ name: "grantor_id" })
  grantorId!: number;

  @Column({ name: "grantee_id" })
  granteeId!: number;

  @Column({ name: "created_at", type: "timestamptz", default: () => "now()" })
  createdAt!: Date;
}

export const permissionsRouter = Router();

// GET /api/:objectType/:objectId/acl
permissionsRouter.get("/:objectType/:objectId/acl", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const perms = await AppDataSource.getRepository(AccessPermission).find({
      where: { objectType: req.params.objectType, objectId: parseInt(req.params.objectId) },
    });
    res.json(perms.map((p) => ({
      id: p.id,
      object_type: p.objectType,
      object_id: p.objectId,
      access_type: p.accessType,
      grantor_id: p.grantorId,
      grantee_id: p.granteeId,
    })));
  } catch (e) { next(e); }
});

// POST /api/:objectType/:objectId/acl (grant)
permissionsRouter.post("/:objectType/:objectId/acl", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).currentUser;
    const repo = AppDataSource.getRepository(AccessPermission);
    const p = repo.create({
      objectType: req.params.objectType,
      objectId: parseInt(req.params.objectId),
      accessType: req.body.access_type ?? "modify",
      grantorId: user.id,
      granteeId: req.body.user_id,
    } as Partial<AccessPermission>);
    await repo.save(p);
    res.status(201).json({ id: p.id });
  } catch (e) { next(e); }
});

// DELETE /api/:objectType/:objectId/acl (revoke)
permissionsRouter.delete("/:objectType/:objectId/acl", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    await AppDataSource.getRepository(AccessPermission).delete({
      objectType: req.params.objectType,
      objectId: parseInt(req.params.objectId),
      granteeId: req.body.user_id,
    });
    res.status(204).send();
  } catch (e) { next(e); }
});

// GET /api/:objectType/:objectId/acl/:accessType (check)
permissionsRouter.get("/:objectType/:objectId/acl/:accessType", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).currentUser;
    const perm = await AppDataSource.getRepository(AccessPermission).findOne({
      where: {
        objectType: req.params.objectType,
        objectId: parseInt(req.params.objectId),
        accessType: req.params.accessType,
        granteeId: user.id,
      },
    });
    res.json({ has_access: !!perm });
  } catch (e) { next(e); }
});
