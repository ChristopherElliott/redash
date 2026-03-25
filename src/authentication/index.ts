import crypto from "crypto";
import { Application, Request, Response, NextFunction } from "express";
import session from "express-session";
import passport from "passport";
import { settings } from "../settings";
import { User } from "../models/user";
import { Organization } from "../models/organization";
import { verifyJwtToken } from "./jwtAuth";
import type { Algorithm } from "jsonwebtoken";
import { resolveOrg } from "./orgResolving";
import { createGoogleOauthRouter } from "./googleOauth";
import { createLdapRouter } from "./ldapAuth";
import { createSamlRouter } from "./samlAuth";
import { createRemoteUserRouter } from "./remoteUserAuth";
import logger from "../logger";

export { resolveOrg } from "./orgResolving";

// ── Helpers ────────────────────────────────────────────────────────────────────

export function getLoginUrl(org?: Organization, next = "/"): string {
  if (settings.MULTI_ORG && org) {
    return `/${org.slug}/login?next=${encodeURIComponent(next)}`;
  }
  return `/login?next=${encodeURIComponent(next)}`;
}

export function sign(key: string, path: string, expires: number): string | null {
  if (!key) return null;
  const hmac = crypto.createHmac("sha1", key);
  hmac.update(path);
  hmac.update(String(expires));
  return hmac.digest("hex");
}

export function getNextPath(unsafeNextPath: string): string {
  if (!unsafeNextPath) return "./";

  try {
    const url = new URL(unsafeNextPath, "http://placeholder");
    const safe = url.pathname + (url.search || "");
    return safe || "./";
  } catch {
    return "./";
  }
}

// ── User Loading ───────────────────────────────────────────────────────────────

async function loadUserFromSession(
  req: Request
): Promise<User | null> {
  const sessionData = req.session as any;
  if (!sessionData?.userId) return null;

  const org = req.org;
  if (!org) return null;

  try {
    const [userId] = String(sessionData.userId).split("-");
    const user = await User.getByIdAndOrg(parseInt(userId, 10), org);
    if (user?.isDisabled || `${user?.id}-${user?.apiKey}` !== sessionData.userId) {
      return null;
    }
    return user;
  } catch {
    return null;
  }
}

function getApiKeyFromRequest(req: Request): string | null {
  const apiKeyQuery = req.query.api_key as string | undefined;
  if (apiKeyQuery) return apiKeyQuery;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Key ")) {
    return authHeader.slice(4);
  }

  if (req.params.token) return req.params.token;

  return null;
}

async function loadUserFromApiKey(req: Request): Promise<User | null> {
  const apiKey = getApiKeyFromRequest(req);
  if (!apiKey || !req.org) return null;

  try {
    const user = await User.getByApiKeyAndOrg(apiKey, req.org);
    if (user?.isDisabled) return null;
    return user;
  } catch {
    return null;
  }
}

async function hmacLoadUser(req: Request): Promise<User | null> {
  const signature = req.query.signature as string | undefined;
  const expires = parseFloat((req.query.expires as string) || "0");
  const queryId = req.params.query_id ? parseInt(req.params.query_id, 10) : null;
  const userId = req.query.user_id as string | undefined;

  const now = Date.now() / 1000;
  if (!signature || !(now < expires && expires <= now + 3600)) return null;

  if (userId) {
    const user = await User.findOne({ where: { id: parseInt(userId, 10) } });
    if (user && sign(user.apiKey, req.path, expires) === signature) {
      return user;
    }
  }

  return null;
}

async function jwtLoadUser(req: Request): Promise<User | null> {
  if (!req.org) return null;

  const orgSettings = req.org.settings as Record<string, unknown>;
  if (!orgSettings.auth_jwt_login_enabled) return null;

  let jwtToken: string | null = null;

  const cookieName = orgSettings.auth_jwt_auth_cookie_name as string | undefined;
  const headerName = orgSettings.auth_jwt_auth_header_name as string | undefined;

  if (cookieName) {
    jwtToken = req.cookies?.[cookieName] ?? null;
  } else if (headerName) {
    jwtToken = (req.headers[headerName.toLowerCase()] as string) ?? null;
  }

  if (!jwtToken) return null;

  const { payload, valid } = await verifyJwtToken(
    jwtToken,
    orgSettings.auth_jwt_auth_issuer as string,
    orgSettings.auth_jwt_auth_audience as string,
    ((orgSettings.auth_jwt_auth_algorithms as string[]) ?? ["RS256"]) as Algorithm[],
    orgSettings.auth_jwt_auth_public_certs_url as string
  );

  if (!valid || !payload) {
    throw new Error("Invalid JWT token");
  }

  const email = payload.email as string | undefined;
  if (!email) {
    logger.info("No email field in token, refusing to login");
    return null;
  }

  try {
    return await User.getByEmailAndOrg(email, req.org);
  } catch {
    return createAndLoginUser(req.org, email, email);
  }
}

// ── Session Setup ──────────────────────────────────────────────────────────────

export async function createAndLoginUser(
  org: Organization,
  name: string,
  email: string,
  picture?: string
): Promise<User | null> {
  let user: User | null = null;

  try {
    user = await User.getByEmailAndOrg(email, org);

    if (user.isDisabled) return null;

    if (user.isInvitationPending) {
      user.isInvitationPending = false;
      await user.save();
    }

    if (user.name !== name) {
      logger.debug(`Updating user name (${user.name} → ${name})`);
      user.name = name;
      await user.save();
    }
  } catch {
    logger.debug(`Creating user object (${name})`);
    const defaultGroup = org.defaultGroup;
    user = User.create({
      org,
      name,
      email,
      isInvitationPending: false,
      profileImageUrl: picture,
      groupIds: defaultGroup ? [defaultGroup.id] : [],
    });
    await user.save();
  }

  return user;
}

// ── Init App ───────────────────────────────────────────────────────────────────

export function initApp(app: Application): void {
  // Session middleware
  app.use(
    session({
      secret: settings.SECRET_KEY,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: settings.SESSION_EXPIRY_TIME * 1000,
        secure: settings.COOKIE_SECURE,
        httpOnly: true,
        sameSite: "lax",
      },
    })
  );

  app.use(passport.initialize());

  // Org resolving must run before auth
  app.use(resolveOrg);

  // Per-request user loading middleware
  app.use(async (req: Request, _res: Response, next: NextFunction) => {
    try {
      let user: User | null = null;

      if (settings.AUTH_TYPE === "hmac") {
        user = await hmacLoadUser(req);
      } else {
        user = await loadUserFromApiKey(req);
      }

      if (!user) {
        user = await jwtLoadUser(req);
      }

      if (!user) {
        user = await loadUserFromSession(req);
      }

      (req as any).user = user ?? undefined;
    } catch (err) {
      logger.warn("Auth middleware error", err);
    }
    next();
  });

  // Register auth routers
  if (settings.GOOGLE_OAUTH_ENABLED) {
    app.use(createGoogleOauthRouter());
  }
  app.use(createLdapRouter());
  app.use(createSamlRouter());
  app.use(createRemoteUserRouter());
}
