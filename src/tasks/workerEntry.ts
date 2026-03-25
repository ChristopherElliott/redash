import "reflect-metadata";
import { AppDataSource } from "../models/connection";
import { startWorkers } from "./index";
import { schedulePeriodicJobs } from "./schedule";
import { logger } from "../logger";

async function main() {
  await AppDataSource.initialize();
  logger.info("Database connection established.");
  startWorkers();
  schedulePeriodicJobs();
  logger.info("Worker process started.");
}

main().catch((err) => {
  logger.error("Failed to start worker", err);
  process.exit(1);
});
