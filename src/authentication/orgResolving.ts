import { Request, Response, NextFunction } from "express";
import { Organization } from "../models/organization";
import logger from "../logger";

declare global {
  namespace Express {
    interface Request {
      org?: Organization;
      orgSlug?: string;
    }
  }
}

export async function resolveOrg(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (req.org) {
    return next();
  }

  const slug: string =
    (req.params.org_slug as string) ||
    (req.session as any)?.org_slug ||
    "default";

  try {
    const org = await Organization.getBySlug(slug);
    req.org = org ?? undefined;
    logger.debug(`Current organization: ${org?.name} (slug: ${slug})`);
  } catch (err) {
    logger.warn(`Could not resolve org for slug: ${slug}`);
    req.org = undefined;
  }

  next();
}
