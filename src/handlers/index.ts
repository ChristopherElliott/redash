import { Express } from "express";
import { settings } from "../settings";
import { dataSourcesRouter } from "./dataSources";
import { queriesRouter } from "./queries";
import { queryResultsRouter } from "./queryResults";
import { alertsRouter } from "./alerts";
import { dashboardsRouter } from "./dashboards";
import { visualizationsRouter } from "./visualizations";
import { widgetsRouter } from "./widgets";
import { usersRouter } from "./users";
import { groupsRouter } from "./groups";
import { destinationsRouter } from "./destinations";
import { eventsRouter } from "./events";
import { organizationRouter } from "./organization";
import { adminRouter } from "./admin";
import { querySnippetsRouter } from "./querySnippets";
import { favoritesRouter } from "./favorites";
import { permissionsRouter } from "./permissions";
import { setupRouter } from "./setup";
import { authRouter } from "./authentication";
import { apiErrorHandler } from "./base";

function prefix(path: string): string {
  if (settings.MULTI_ORG) return `/:org_slug${path}`;
  return path;
}

export function registerRoutes(app: Express): void {
  // Auth / session (no org prefix needed for these)
  app.use("/api", authRouter);
  app.use("/", authRouter);  // /login, /logout

  // Setup (no org prefix)
  app.use("/setup", setupRouter);

  // Org-scoped API routes
  app.use(prefix("/api/data_sources"), dataSourcesRouter);
  app.use(prefix("/api/queries"), queriesRouter);
  app.use(prefix("/api/query_results"), queryResultsRouter);
  app.use(prefix("/api/alerts"), alertsRouter);
  app.use(prefix("/api/dashboards"), dashboardsRouter);
  app.use(prefix("/api/visualizations"), visualizationsRouter);
  app.use(prefix("/api/widgets"), widgetsRouter);
  app.use(prefix("/api/users"), usersRouter);
  app.use(prefix("/api/groups"), groupsRouter);
  app.use(prefix("/api/destinations"), destinationsRouter);
  app.use(prefix("/api/events"), eventsRouter);
  app.use(prefix("/api/settings/organization"), organizationRouter);
  app.use(prefix("/api/admin"), adminRouter);
  app.use(prefix("/api/query_snippets"), querySnippetsRouter);
  app.use(prefix("/api"), favoritesRouter);   // /api/queries/:id/favorite, /api/dashboards/:id/favorite
  app.use(prefix("/api"), permissionsRouter); // /api/:objectType/:objectId/acl

  // Error handler (must be last)
  app.use(apiErrorHandler);
}
