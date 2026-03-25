import winston from "winston";

const logLevel = process.env.REDASH_LOG_LEVEL ?? "info";
const logToStdout = process.env.REDASH_LOG_STDOUT === "true";
const logPrefix = process.env.REDASH_LOG_PREFIX ?? "";

const logger = winston.createLogger({
  level: logLevel.toLowerCase(),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : "";
      return `${logPrefix}[${timestamp}][PID:${process.pid}][${level.toUpperCase()}] ${message}${metaStr}`;
    })
  ),
  transports: [
    logToStdout
      ? new winston.transports.Console({ stderrLevels: [] })
      : new winston.transports.Console({ stderrLevels: ["error", "warn", "info", "http", "verbose", "debug", "silly"] }),
  ],
});

// Quiet noisy libraries unless DEBUG
if (logLevel.toUpperCase() !== "DEBUG") {
  for (const name of ["passport", "typeorm", "express"]) {
    // External libraries use console.log; we can't silence them here,
    // but we suppress our own child loggers for them.
    logger.child({ module: name }).level = "error";
  }
}

export default logger;
export { logger };

export function getLogger(name: string): winston.Logger {
  return logger.child({ module: name });
}
