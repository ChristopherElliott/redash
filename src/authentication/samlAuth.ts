import { Router, Request, Response } from "express";
import { settings } from "../settings";
import { createAndLoginUser } from "./index";
import { Organization } from "../models/organization";
import logger from "../logger";

export function createSamlRouter(): Router {
  const router = Router();

  // IdP-initiated callback (POST)
  router.post(
    ["/:org_slug/saml/callback", "/saml/callback"],
    async (req: Request, res: Response) => {
      const orgSlug = req.params.org_slug;
      const org: Organization = req.org!;

      if (!org.getSetting("auth_saml_enabled")) {
        logger.error("SAML Login is not enabled");
        return res.redirect(`/${orgSlug || ""}`);
      }

      try {
        // Dynamic import — samlify may not be installed
        const samlify = await import("samlify");

        const sp = samlify.ServiceProvider({
          entityID: org.getSetting("auth_saml_entity_id") as string,
          assertionConsumerService: [
            {
              Binding: samlify.Constants.namespace.binding.post,
              Location: `${req.protocol}://${req.get("host")}/${orgSlug ?? ""}/saml/callback`,
            },
          ],
          wantAssertionsSigned: true,
          authnRequestsSigned: false,
        });

        const idp = samlify.IdentityProvider({
          metadata: org.getSetting("auth_saml_metadata_url") as string,
        });

        const { extract } = await sp.parseLoginResponse(idp, "post", req);
        const email: string = extract.nameID as string;
        const firstName: string = (extract.attributes as any)?.FirstName ?? "";
        const lastName: string = (extract.attributes as any)?.LastName ?? "";
        const name = `${firstName} ${lastName}`.trim() || email;

        const user = await createAndLoginUser(org, name, email);
        if (!user) {
          return res.redirect("/");
        }

        const groupNames: string[] | undefined = (extract.attributes as any)?.RedashGroups;
        if (groupNames) {
          await user.updateGroupAssignments(groupNames);
        }

        (req.session as any).userId = `${user.id}-${user.apiKey}`;
        res.redirect(`/${orgSlug || ""}`);
      } catch (err) {
        logger.error("Failed to parse SAML response", err);
        res.redirect(orgSlug ? `/${orgSlug}/login` : "/login");
      }
    }
  );

  // SP-initiated login (GET)
  router.get(
    ["/:org_slug/saml/login", "/saml/login"],
    async (req: Request, res: Response) => {
      const orgSlug = req.params.org_slug;
      const org: Organization = req.org!;

      if (!org.getSetting("auth_saml_enabled")) {
        logger.error("SAML Login is not enabled");
        return res.redirect(`/${orgSlug || ""}`);
      }

      try {
        const samlify = await import("samlify");

        const sp = samlify.ServiceProvider({
          entityID: org.getSetting("auth_saml_entity_id") as string,
          assertionConsumerService: [
            {
              Binding: samlify.Constants.namespace.binding.post,
              Location: `${req.protocol}://${req.get("host")}/${orgSlug ?? ""}/saml/callback`,
            },
          ],
          authnRequestsSigned: false,
        });

        const idp = samlify.IdentityProvider({
          metadata: org.getSetting("auth_saml_metadata_url") as string,
        });

        const { context } = sp.createLoginRequest(idp, "redirect");

        res.setHeader("Cache-Control", "no-cache, no-store");
        res.setHeader("Pragma", "no-cache");
        res.redirect(302, context);
      } catch (err) {
        logger.error("Failed to initiate SAML login", err);
        res.status(500).json({ message: "SAML login failed." });
      }
    }
  );

  return router;
}
