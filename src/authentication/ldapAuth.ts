import { Router, Request, Response } from "express";
import { settings } from "../settings";
import { createAndLoginUser, getNextPath } from "./index";
import logger from "../logger";

export function createLdapRouter(): Router {
  const router = Router();

  router.get(
    ["/ldap/login", "/:org_slug/ldap/login"],
    (req: Request, res: Response) => {
      if (!settings.LDAP_LOGIN_ENABLED) {
        logger.error("Cannot use LDAP for login without being enabled in settings");
        return res.redirect("/");
      }
      // Render login form — static frontend handles this
      res.json({ ldapEnabled: true });
    }
  );

  router.post(
    ["/ldap/login", "/:org_slug/ldap/login"],
    async (req: Request, res: Response) => {
      const orgSlug = req.params.org_slug;
      const unsafeNext = (req.query.next as string) || "/";
      const nextPath = getNextPath(unsafeNext);

      if (!settings.LDAP_LOGIN_ENABLED) {
        logger.error("Cannot use LDAP for login without being enabled in settings");
        return res.redirect(nextPath);
      }

      const { email, password } = req.body as { email: string; password: string };

      try {
        const ldapUser = await authLdapUser(email, password);
        if (!ldapUser) {
          return res.status(401).json({ message: "Incorrect credentials." });
        }

        const name = String(ldapUser[settings.LDAP_DISPLAY_NAME_KEY]?.[0] ?? email);
        const userEmail = String(ldapUser[settings.LDAP_EMAIL_KEY]?.[0] ?? email);

        const user = await createAndLoginUser(req.org!, name, userEmail);
        if (!user) {
          return res.redirect("/");
        }

        // Store user in session
        (req.session as any).userId = `${user.id}-${user.apiKey}`;
        res.redirect(nextPath || "/");
      } catch (err) {
        logger.error("LDAP login error", err);
        res.status(500).json({ message: "Login error." });
      }
    }
  );

  return router;
}

interface LdapEntry {
  dn: string;
  [key: string]: string | string[] | undefined;
}

async function authLdapUser(
  username: string,
  password: string
): Promise<LdapEntry | null> {
  // Dynamic import so that the absence of ldapts doesn't crash the server
  // when LDAP is disabled.
  let ldapts: typeof import("ldapts");
  try {
    ldapts = await import("ldapts");
  } catch {
    logger.error("ldapts package not installed. Cannot authenticate via LDAP.");
    return null;
  }

  const { Client } = ldapts;

  const client = new Client({
    url: settings.LDAP_HOST_URL,
    tlsOptions: settings.LDAP_SSL ? { rejectUnauthorized: false } : undefined,
  });

  try {
    // Bind with service account if configured
    if (settings.LDAP_BIND_DN) {
      await client.bind(settings.LDAP_BIND_DN, settings.LDAP_BIND_DN_PASSWORD);
    } else {
      await client.bind("", "");
    }

    const filter = (settings.LDAP_SEARCH_TEMPLATE as string).replace(
      "%s",
      escapeFilterValue(username)
    );

    const { searchEntries } = await client.search(settings.LDAP_SEARCH_DN, {
      filter,
      attributes: [settings.LDAP_DISPLAY_NAME_KEY, settings.LDAP_EMAIL_KEY],
    });

    if (searchEntries.length === 0) {
      return null;
    }

    const entry = searchEntries[0];

    // Re-bind as the found user to verify password
    await client.bind(entry.dn, password);

    return {
      dn: entry.dn,
      [settings.LDAP_DISPLAY_NAME_KEY]: entry[settings.LDAP_DISPLAY_NAME_KEY] as string[],
      [settings.LDAP_EMAIL_KEY]: entry[settings.LDAP_EMAIL_KEY] as string[],
    };
  } catch (err) {
    logger.warn("LDAP authentication failed", err);
    return null;
  } finally {
    await client.unbind();
  }
}

function escapeFilterValue(value: string): string {
  return value
    .replace(/\\/g, "\\5c")
    .replace(/\*/g, "\\2a")
    .replace(/\(/g, "\\28")
    .replace(/\)/g, "\\29")
    .replace(/\0/g, "\\00");
}
