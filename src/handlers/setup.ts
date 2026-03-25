import { Router, Request, Response, NextFunction } from "express";
import { AppDataSource } from "../models/connection";
import { Organization } from "../models/organization";
import { User } from "../models/user";
import { Group } from "../models/group";
import { generateToken } from "../utils";

export const setupRouter = Router();

const ADMIN_PERMISSIONS = ["admin", "super_admin", "list_users", "edit_user", "list_data_sources",
  "edit_data_source", "list_groups", "edit_group", "create_alert", "list_alerts", "view_query",
  "create_query", "edit_query", "run_query", "create_dashboard", "edit_dashboard", "view_dashboard",
  "schedule_query", "list_dashboards"];

const DEFAULT_PERMISSIONS = ["view_query", "run_query", "create_query", "create_dashboard", "create_alert"];

// POST /setup — create the initial organization and admin user
setupRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only allow setup if no organization exists yet
    const orgRepo = AppDataSource.getRepository(Organization);
    const existing = await orgRepo.count();
    if (existing > 0) {
      return res.redirect("/");
    }

    const { name, email, password, org_name } = req.body;
    if (!name || !email || !password || !org_name) {
      return res.status(400).json({ message: "name, email, password, and org_name are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // Create org
    const org = orgRepo.create({ name: org_name, slug: "default", settings: {} });
    await orgRepo.save(org);

    // Create built-in groups
    const groupRepo = AppDataSource.getRepository(Group);
    const adminGroup = groupRepo.create({
      name: "admin", orgId: org.id, type: "builtin_admin", permissions: ADMIN_PERMISSIONS,
    } as Partial<Group>);
    const defaultGroup = groupRepo.create({
      name: "default", orgId: org.id, type: "builtin_default", permissions: DEFAULT_PERMISSIONS,
    } as Partial<Group>);
    await groupRepo.save([adminGroup, defaultGroup]);

    // Create admin user
    const userRepo = AppDataSource.getRepository(User);
    const user = userRepo.create({
      name,
      email,
      orgId: org.id,
      groupIds: [adminGroup.id, defaultGroup.id],
      apiKey: generateToken(40),
    } as Partial<User>);
    await user.setPassword(password);
    await userRepo.save(user);

    res.status(201).json({
      message: "Organization created successfully",
      org: { id: org.id, name: org.name, slug: org.slug },
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (e) { next(e); }
});

// GET /setup — check if setup is needed
setupRouter.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await AppDataSource.getRepository(Organization).count();
    if (count > 0) {
      return res.redirect("/");
    }
    res.json({ setup_required: true });
  } catch (e) { next(e); }
});
