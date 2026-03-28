import { Router, Request, Response, NextFunction } from "express";
import { AppDataSource } from "../models/connection";
import { User } from "../models/user";
import { requireAuth, requireAdmin } from "../authentication/middleware";
import { getObjectOr404, requireFields, paginate } from "./base";
import { generateToken } from "../utils";
import { sendMail } from "../tasks/general";

export const usersRouter = Router();

function serializeUser(u: User, includeEmail = true): Record<string, unknown> {
  return {
    id: u.id,
    name: u.name,
    ...(includeEmail ? { email: u.email } : {}),
    org_id: u.orgId,
    group_ids: u.groupIds,
    is_disabled: u.isDisabled,
    active_at: u.activeAt,
    created_at: u.createdAt,
    updated_at: u.updatedAt,
  };
}

// GET /api/users
usersRouter.get("/", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    const page = parseInt((req.query.page as string) ?? "1");
    const pageSize = parseInt((req.query.page_size as string) ?? "25");
    const repo = AppDataSource.getRepository(User);
    const all = await repo.find({ where: { orgId: org.id } });
    res.json(paginate(all, page, pageSize, serializeUser));
  } catch (e) { next(e); }
});

// POST /api/users (invite new user)
usersRouter.post("/", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const org = (req as any).currentOrg;
    requireFields(req.body, ["name", "email"]);
    const repo = AppDataSource.getRepository(User);
    const existing = await repo.findOne({ where: { email: req.body.email, orgId: org.id } });
    if (existing) return res.status(400).json({ message: "User with this email already exists." });

    const user = repo.create({
      name: req.body.name,
      email: req.body.email,
      orgId: org.id,
      groupIds: req.body.group_ids ?? [],
      apiKey: generateToken(40),
    } as Partial<User>);
    await repo.save(user);
    res.status(201).json(serializeUser(user));
  } catch (e) { next(e); }
});

// GET /api/users/:id
usersRouter.get("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(User);
    const u = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    res.json(serializeUser(u));
  } catch (e) { next(e); }
});

// POST /api/users/:id (update)
usersRouter.post("/:id", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(User);
    const u = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    const allowed = ["name", "email", "group_ids"];
    for (const key of allowed) {
      if (key in req.body) {
        (u as any)[key === "group_ids" ? "groupIds" : key] = req.body[key];
      }
    }
    if (req.body.password) await u.setPassword(req.body.password);
    await repo.save(u);
    res.json(serializeUser(u));
  } catch (e) { next(e); }
});

// POST /api/users/:id/invite
usersRouter.post("/:id/invite", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(User);
    const u = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    const { sendInviteEmail, inviteLinkForUser } = await import("../authentication/account");
    const org = (req as any).currentOrg;
    const inviter: User = (req as any).user;
    const inviteUrl = inviteLinkForUser(u, org);
    await sendInviteEmail(inviter, u, inviteUrl, org);
    res.json({ message: "Invited" });
  } catch (e) { next(e); }
});

// POST /api/users/:id/reset_password
usersRouter.post("/:id/reset_password", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(User);
    const u = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    const { sendPasswordResetEmail } = await import("../authentication/account");
    await sendPasswordResetEmail(u, (req as any).currentOrg);
    res.json({ message: "Reset email sent" });
  } catch (e) { next(e); }
});

// POST /api/users/:id/regenerate_api_key
usersRouter.post("/:id/regenerate_api_key", requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(User);
    const u = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    u.apiKey = generateToken(40);
    await repo.save(u);
    res.json({ api_key: u.apiKey });
  } catch (e) { next(e); }
});

// POST /api/users/:id/disable
usersRouter.post("/:id/disable", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(User);
    const u = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    u.disabledAt = new Date();
    await repo.save(u);
    res.json(serializeUser(u));
  } catch (e) { next(e); }
});

// DELETE /api/users/:id/disable (re-enable)
usersRouter.delete("/:id/disable", requireAdmin, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const repo = AppDataSource.getRepository(User);
    const u = await getObjectOr404(() => repo.findOne({ where: { id: parseInt(req.params.id) } }));
    u.disabledAt = undefined;
    await repo.save(u);
    res.json(serializeUser(u));
  } catch (e) { next(e); }
});
