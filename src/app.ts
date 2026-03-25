import express, { Application, Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import compression from "compression";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import path from "path";
import { settings } from "./settings";
import { initApp as initAuth } from "./authentication";
import logger from "./logger";

export function createApp(): Application {
  const app = express();

  // ── Trust proxy (for X-Forwarded-* headers) ──────────────────────────────────
  app.set("trust proxy", settings.PROXIES_COUNT);

  // ── Security headers (replaces flask-talisman) ───────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: parseCSP(settings.CONTENT_SECURITY_POLICY),
        reportOnly: settings.CONTENT_SECURITY_POLICY_REPORT_ONLY,
      },
      hsts: settings.HSTS_ENABLED
        ? {
            maxAge: settings.HSTS_MAX_AGE,
            includeSubDomains: settings.HSTS_INCLUDE_SUBDOMAINS,
            preload: settings.HSTS_PRELOAD,
          }
        : false,
      frameguard:
        settings.FRAME_OPTIONS === "deny"
          ? { action: "deny" }
          : settings.FRAME_OPTIONS === "sameorigin"
          ? { action: "sameorigin" }
          : false,
      referrerPolicy: {
        policy: settings.REFERRER_POLICY as any,
      },
    })
  );

  // Enforce HTTPS redirect
  if (settings.ENFORCE_HTTPS) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.secure) return next();
      res.redirect(
        settings.ENFORCE_HTTPS_PERMANENT ? 301 : 302,
        `https://${req.hostname}${req.originalUrl}`
      );
    });
  }

  // ── CORS ──────────────────────────────────────────────────────────────────────
  const allowedOrigins = Array.from(settings.ACCESS_CONTROL_ALLOW_ORIGIN);
  if (allowedOrigins.length > 0) {
    app.use(
      cors({
        origin: allowedOrigins,
        credentials: settings.ACCESS_CONTROL_ALLOW_CREDENTIALS,
        methods: settings.ACCESS_CONTROL_REQUEST_METHOD,
        allowedHeaders: ["Content-Type", "Authorization"],
      })
    );
  }

  // ── Body parsing ──────────────────────────────────────────────────────────────
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(compression());

  // ── Logging ───────────────────────────────────────────────────────────────────
  app.use(
    morgan("combined", {
      stream: { write: (msg) => logger.http(msg.trim()) },
    })
  );

  // ── Rate limiting ─────────────────────────────────────────────────────────────
  if (settings.RATELIMIT_ENABLED) {
    const [count, window] = parseRateLimit(settings.THROTTLE_LOGIN_PATTERN);
    const loginLimiter = rateLimit({
      windowMs: window,
      max: count,
      standardHeaders: true,
      legacyHeaders: false,
    });
    app.use(["/login", "/api/session"], loginLimiter);
  }

  // ── Authentication & org resolving ───────────────────────────────────────────
  initAuth(app);

  // ── Static assets ─────────────────────────────────────────────────────────────
  const staticPath = path.resolve(settings.STATIC_ASSETS_PATH);
  app.use("/static", express.static(staticPath));

  // ── API routes ────────────────────────────────────────────────────────────────
  const { registerRoutes } = require("./handlers");
  registerRoutes(app);

  // ── SPA fallback — serve index.html for non-API routes ────────────────────────
  app.get(/^(?!\/api).*/, (_req: Request, res: Response) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  // ── Error handler ─────────────────────────────────────────────────────────────
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error("Unhandled error", err);
    res.status(500).json({ message: "Internal server error." });
  });

  return app;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseCSP(policy: string): Record<string, string | string[]> {
  const directives: Record<string, string[]> = {};
  for (const directive of policy.split(";")) {
    const parts = directive.trim().split(/\s+/);
    if (parts.length >= 1 && parts[0]) {
      directives[parts[0]] = parts.slice(1);
    }
  }
  return directives;
}

function parseRateLimit(pattern: string): [number, number] {
  const [countStr, windowStr] = pattern.split("/");
  const count = parseInt(countStr, 10);
  const windowMs = windowStr === "hour" ? 3600 * 1000 : 60 * 1000;
  return [count, windowMs];
}
