import "reflect-metadata";
import { createApp } from "./app";
import { AppDataSource } from "./models/connection";
import { startWorkers } from "./tasks";
import { logger } from "./logger";

const PORT = parseInt(process.env.PORT ?? "5000", 10);
const HOST = process.env.BIND_ADDRESS ?? "0.0.0.0";

async function main() {
  // Initialize database connection
  await AppDataSource.initialize();
  logger.info("Database connection established.");

  // Start BullMQ workers (if not in web-only mode)
  if (process.env.REDASH_WORKERS !== "false") {
    startWorkers();
    logger.info("Background workers started.");
  }

  const app = createApp();

  app.listen(PORT, HOST, () => {
    logger.info(`Redash server listening on ${HOST}:${PORT}`);
  });
}

main().catch((err) => {
  logger.error("Failed to start server", err);
  process.exit(1);
});
