import { Request, Response, NextFunction } from "express";

export const VIEW_ONLY = true;
export const NOT_VIEW_ONLY = false;

export const ACCESS_TYPE_VIEW = "view";
export const ACCESS_TYPE_MODIFY = "modify";
export const ACCESS_TYPE_DELETE = "delete";

export type AccessType =
  | typeof ACCESS_TYPE_VIEW
  | typeof ACCESS_TYPE_MODIFY
  | typeof ACCESS_TYPE_DELETE;

interface UserLike {
  id: number;
  permissions: string[];
  groupIds: number[];
  isApiUser(): boolean;
  hasPermission(perm: string): boolean;
  hasPermissions(perms: string[]): boolean;
}

interface GroupAccessible {
  groups: Record<number, boolean[]>;
  apiKey?: string;
  dashboardApiKeys?: string[];
}

export function hasAccessToObject(
  obj: { apiKey: string; dashboardApiKeys?: string[] },
  apiKey: string,
  needViewOnly: boolean
): boolean {
  if (obj.apiKey === apiKey) return needViewOnly;
  if (obj.dashboardApiKeys?.includes(apiKey)) return needViewOnly;
  return false;
}

export function hasAccessToGroups(
  obj: GroupAccessible,
  user: UserLike,
  needViewOnly: boolean
): boolean {
  const groups = obj.groups ?? obj;

  if (user.permissions.includes("admin")) return true;

  const matchingGroups = Object.keys(groups)
    .map(Number)
    .filter((gId) => user.groupIds.includes(gId));

  if (matchingGroups.length === 0) return false;

  const requiredLevel = needViewOnly ? 1 : 2;
  const allViewOnly = matchingGroups.every((gId) =>
    (groups[gId] as boolean[]).every(Boolean)
  );
  const groupLevel = allViewOnly ? 1 : 2;

  return requiredLevel <= groupLevel;
}

export function hasAccess(
  obj: GroupAccessible,
  user: UserLike,
  needViewOnly: boolean
): boolean {
  if ("apiKey" in obj && user.isApiUser()) {
    return hasAccessToObject(obj as any, (user as any).name, needViewOnly);
  }
  return hasAccessToGroups(obj, user, needViewOnly);
}

export function requireAccess(
  obj: GroupAccessible,
  user: UserLike,
  needViewOnly: boolean,
  res: Response
): boolean {
  if (!hasAccess(obj, user, needViewOnly)) {
    res.status(403).json({ message: "Access denied." });
    return false;
  }
  return true;
}

// ── Express middleware decorators (replace Python @require_permission) ─────────

export function requirePermissions(
  permissions: string[],
  allowOne = false
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user as UserLike | undefined;
    if (!user) {
      res.status(401).json({ message: "Not authenticated." });
      return;
    }

    const hasPerm = allowOne
      ? permissions.some((p) => user.hasPermission(p))
      : user.hasPermissions(permissions);

    if (hasPerm) {
      next();
    } else {
      res.status(403).json({ message: "Permission denied." });
    }
  };
}

export function requirePermission(permission: string) {
  return requirePermissions([permission]);
}

export function requireAnyOfPermission(permissions: string[]) {
  return requirePermissions(permissions, true);
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  return requirePermission("admin")(req, res, next);
}

export function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  return requirePermission("super_admin")(req, res, next);
}

export function hasPermissionOrOwner(
  permission: string,
  objectOwnerId: number,
  user: UserLike
): boolean {
  return objectOwnerId === user.id || user.hasPermission(permission);
}

export function isAdminOrOwner(objectOwnerId: number, user: UserLike): boolean {
  return hasPermissionOrOwner("admin", objectOwnerId, user);
}

export function requirePermissionOrOwner(
  permission: string,
  objectOwnerId: number,
  user: UserLike,
  res: Response
): boolean {
  if (!hasPermissionOrOwner(permission, objectOwnerId, user)) {
    res.status(403).json({ message: "Access denied." });
    return false;
  }
  return true;
}

export function requireAdminOrOwner(
  objectOwnerId: number,
  user: UserLike,
  res: Response
): boolean {
  if (!isAdminOrOwner(objectOwnerId, user)) {
    res
      .status(403)
      .json({ message: "You don't have permission to edit this resource." });
    return false;
  }
  return true;
}

export function canModify(
  obj: { userId: number; groups?: Record<number, boolean[]> },
  user: UserLike
): boolean {
  return (
    isAdminOrOwner(obj.userId, user) ||
    (obj.groups ? hasAccessToGroups(obj as any, user, false) : false)
  );
}

export function requireObjectModifyPermission(
  obj: { userId: number; groups?: Record<number, boolean[]> },
  user: UserLike,
  res: Response
): boolean {
  if (!canModify(obj, user)) {
    res.status(403).json({ message: "Access denied." });
    return false;
  }
  return true;
}
