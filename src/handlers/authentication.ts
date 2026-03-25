import { Router, Request, Response, NextFunction } from "express";
import passport from "passport";
import { AppDataSource } from "../models/connection";
import { User } from "../models/user";
import { settings } from "../settings";
import { validateToken } from "../authentication/account";
import { requireAuth } from "../authentication/middleware";

export const authRouter = Router();

// GET /api/session — return current session info
authRouter.get("/session", requireAuth, (req: Request, res: Response) => {
  const user = (req as any).currentUser as User;
  const org = (req as any).currentOrg;
  res.json({
    current_user: {
      id: user.id,
      name: user.name,
      email: user.email,
      org_id: user.orgId,
      group_ids: user.groupIds,
      api_key: user.apiKey,
      is_disabled: user.isDisabled,
      permissions: user.permissions,
    },
    org: org ? { id: org.id, name: org.name, slug: org.slug, settings: org.settings } : null,
    client_config: {
      version: process.env.npm_package_version ?? "unknown",
      multi_org: settings.MULTI_ORG,
      google_login_enabled: !!settings.GOOGLE_CLIENT_ID,
      ldap_login_enabled: settings.LDAP_LOGIN_ENABLED,
      saml_enabled: settings.SAML_METADATA_URL !== "",
      password_login_enabled: settings.PASSWORD_LOGIN_ENABLED,
      allow_scripts_in_user_input: settings.ALLOW_SCRIPTS_IN_USER_INPUT,
      date_format: settings.DATE_FORMAT,
    },
  });
});

// POST /login — authenticate with username/password
authRouter.post("/login", (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate("local", (err: any, user: User | false) => {
    if (err) return next(err);
    if (!user) return res.status(401).json({ message: "Invalid credentials" });

    req.logIn(user, (loginErr) => {
      if (loginErr) return next(loginErr);
      res.json({ message: "Logged in successfully" });
    });
  })(req, res, next);
});

// GET /logout
authRouter.get("/logout", (req: Request, res: Response) => {
  req.logout(() => {
    res.json({ message: "Logged out" });
  });
});

// POST /logout
authRouter.post("/logout", (req: Request, res: Response) => {
  req.logout(() => {
    res.json({ message: "Logged out" });
  });
});

// GET /api/config — public configuration for the frontend
authRouter.get("/config", (_req: Request, res: Response) => {
  res.json({
    google_login_enabled: !!settings.GOOGLE_CLIENT_ID,
    ldap_login_enabled: settings.LDAP_LOGIN_ENABLED,
    saml_enabled: settings.SAML_METADATA_URL !== "",
    password_login_enabled: settings.PASSWORD_LOGIN_ENABLED,
    multi_org: settings.MULTI_ORG,
  });
});

// POST /api/users/:id/verify — mark email as verified
authRouter.post("/users/:id/verify", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ message: "Token required" });

    const userId = parseInt(validateToken(token), 10);
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "User not found" });

    user.details = { ...(user.details ?? {}), is_email_verified: true };
    await repo.save(user);
    res.json({ message: "Email verified" });
  } catch (e: any) {
    if (e.message?.includes("expired")) return res.status(400).json({ message: "Token expired" });
    if (e.message?.includes("invalid")) return res.status(400).json({ message: "Invalid token" });
    next(e);
  }
});

// POST /api/users/:id/reset_password_form — set new password via token
authRouter.post("/users/:id/reset_password_form", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ message: "Token and password required" });
    if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

    const userId = parseInt(validateToken(token), 10);
    const repo = AppDataSource.getRepository(User);
    const user = await repo.findOne({ where: { id: userId } });
    if (!user) return res.status(404).json({ message: "User not found" });

    await user.setPassword(password);
    user.details = { ...(user.details ?? {}), is_invitation_pending: false };
    await repo.save(user);
    res.json({ message: "Password updated" });
  } catch (e: any) {
    if (e.message?.includes("expired")) return res.status(400).json({ message: "Token expired" });
    next(e);
  }
});
