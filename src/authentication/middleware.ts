import { Request, Response, NextFunction } from "express";
import logger from "../logger";

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.user) {
    return next();
  }

  const isXhr = req.headers["x-requested-with"] === "XMLHttpRequest";
  if (isXhr || req.path.includes("/api/")) {
    res.status(404).json({
      message: "Couldn't find resource. Please login and try again.",
    });
    return;
  }

  const loginUrl = req.org
    ? `/${req.org.slug}/login?next=${encodeURIComponent(req.originalUrl)}`
    : `/login?next=${encodeURIComponent(req.originalUrl)}`;

  res.redirect(loginUrl);
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    res.status(401).json({ message: "Not authenticated." });
    return;
  }

  const user = req.user as any;
  if (!user.hasPermission || !user.hasPermission("admin")) {
    res.status(403).json({ message: "Admin access required." });
    return;
  }

  next();
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user as any;
    if (!user?.hasPermission(permission)) {
      res.status(403).json({ message: "Access denied." });
      return;
    }
    next();
  };
}
