import StatsD from "hot-shots";
import { settings } from "../settings";
import { Request, Response, NextFunction } from "express";

export const statsdClient = new StatsD({
  host: settings.STATSD_HOST,
  port: settings.STATSD_PORT,
  prefix: settings.STATSD_PREFIX,
  mock: !settings.STATSD_USE_TAGS,
  errorHandler: (err) => {
    console.error("StatsD error:", err);
  },
});

/** Express middleware: record request timing and count per endpoint */
export function requestMetrics(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const path = req.route?.path ?? req.path ?? "unknown";

  res.on("finish", () => {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const metric = `api.${req.method.toLowerCase()}.${path.replace(/\//g, ".").replace(/^\./, "")}`;
    statsdClient.timing(metric, duration);
    statsdClient.increment(`api.status.${status}`);
  });

  next();
}
