import { Router, Request, Response } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import axios from "axios";
import { settings } from "../settings";
import { Organization } from "../models/organization";
import { createAndLoginUser, getNextPath } from "./index";
import logger from "../logger";

function buildRedirectUri(req: Request): string {
  const scheme = settings.GOOGLE_OAUTH_SCHEME_OVERRIDE || req.protocol;
  return `${scheme}://${req.get("host")}/oauth/google_callback`;
}

function verifyProfile(org: Organization, profile: { email: string }): boolean {
  if (org.isPublic) return true;

  const domain = profile.email.split("@").pop() ?? "";
  if (org.googleAppsDomains?.includes(domain)) return true;
  if (org.hasUser(profile.email) === 1) return true;

  return false;
}

export function createGoogleOauthRouter(): Router {
  const router = Router();

  passport.use(
    "google",
    new GoogleStrategy(
      {
        clientID: settings.GOOGLE_CLIENT_ID,
        clientSecret: settings.GOOGLE_CLIENT_SECRET,
        callbackURL: settings.GOOGLE_OAUTH_CALLBACK_URL,
        scope: ["openid", "email", "profile"],
        passReqToCallback: true,
      },
      async (req: Request, accessToken, _refreshToken, profile, done) => {
        try {
          const org: Organization = req.org!;
          const email = profile.emails?.[0]?.value ?? "";
          const name = profile.displayName ?? email;
          const picture = `${profile.photos?.[0]?.value ?? ""}?sz=40`;

          if (!verifyProfile(org, { email })) {
            logger.warn(
              `User tried to login with unauthorized domain: ${email} (org: ${org.slug})`
            );
            return done(null, false, {
              message: `Your Google account (${email}) isn't allowed.`,
            });
          }

          const user = await createAndLoginUser(org, name, email, picture);
          if (!user) {
            return done(null, false, { message: "Account is disabled." });
          }

          done(null, user);
        } catch (err) {
          done(err as Error);
        }
      }
    )
  );

  // Org-scoped entry point
  router.get("/:org_slug/oauth/google", (req: Request, res: Response) => {
    if (req.session) {
      (req.session as any).org_slug = req.params.org_slug;
      (req.session as any).next_url = req.query.next as string | undefined;
    }
    res.redirect("/oauth/google");
  });

  // Generic entry point
  router.get(
    "/oauth/google",
    (req: Request, res: Response, next) => {
      if (req.session && req.query.next) {
        (req.session as any).next_url = req.query.next as string;
      }
      next();
    },
    passport.authenticate("google", { session: false })
  );

  // Callback
  router.get(
    "/oauth/google_callback",
    passport.authenticate("google", { session: false, failureRedirect: "/login" }),
    (req: Request, res: Response) => {
      const unsafeNext =
        (req.session as any)?.next_url || "/";
      const nextPath = getNextPath(unsafeNext);
      res.redirect(nextPath);
    }
  );

  return router;
}
