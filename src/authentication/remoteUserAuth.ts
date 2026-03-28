import { Router, Request, Response } from "express";
import { settings } from "../settings";
import { createAndLoginUser, getNextPath } from "./index";
import logger from "../logger";

export function createRemoteUserRouter(): Router {
  const router = Router();

  router.get(
    ["/:org_slug/remote_user/login", "/remote_user/login"],
    async (req: Request, res: Response) => {
      const orgSlug = req.params.org_slug;
      const unsafeNext = req.query.next as string | undefined;
      const nextPath = getNextPath(unsafeNext ?? "");

      if (!settings.REMOTE_USER_LOGIN_ENABLED) {
        logger.error(
          "Cannot use remote user for login without being enabled in settings"
        );
        return res.redirect(`/${orgSlug || ""}`);
      }

      let email = req.headers[settings.REMOTE_USER_HEADER.toLowerCase()] as
        | string
        | undefined;

      // Some Apache auth configurations set "(null)" instead of a falsy value
      if (email === "(null)") {
        email = undefined;
      }

      if (!email) {
        logger.error(
          `Cannot use remote user for login when it's not provided in the request ` +
            `(looked in headers['${settings.REMOTE_USER_HEADER}'])`
        );
        return res.redirect(`/${orgSlug || ""}`);
      }

      logger.info(`Logging in ${email} via remote user`);

      const user = await createAndLoginUser(req.org!, email, email);
      if (!user) {
        return res.redirect("/");
      }

      (req.session as any).userId = `${user.id}-${user.apiKey}`;
      res.redirect(302, nextPath || `/${orgSlug || ""}`);
    }
  );

  return router;
}
