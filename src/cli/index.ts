#!/usr/bin/env node
import { Command } from "commander";
import { AppDataSource } from "../models/connection";
import { User } from "../models/user";
import { Organization } from "../models/organization";
import { Group } from "../models/group";
import { generateToken } from "../utils";
import { getStatus } from "../monitor";
import { Redis } from "ioredis";
import { REDIS_URL } from "../settings";

async function initDb(): Promise<void> {
  if (!AppDataSource.isInitialized) await AppDataSource.initialize();
}

const program = new Command();
program.name("redash-ts").description("Redash TypeScript management CLI");

// ─── version ────────────────────────────────────────────────────────────────
program.command("version").description("Print version").action(() => {
  const pkg = require("../../package.json");
  console.log(pkg.version);
});

// ─── status ─────────────────────────────────────────────────────────────────
program.command("status").description("Show system status").action(async () => {
  await initDb();
  const redis = new Redis(REDIS_URL);
  const status = await getStatus(redis, AppDataSource);
  redis.disconnect();
  console.log(JSON.stringify(status, null, 2));
});

// ─── database ────────────────────────────────────────────────────────────────
const dbCmd = program.command("database").description("Database management");
dbCmd.command("create-tables").description("Create database tables (TypeORM sync)").action(async () => {
  await initDb();
  await AppDataSource.synchronize();
  console.log("Tables created.");
  await AppDataSource.destroy();
});

// ─── users ───────────────────────────────────────────────────────────────────
const usersCmd = program.command("users").description("Users management");

usersCmd
  .command("create <email> <name>")
  .description("Create a new user")
  .option("--org <slug>", "Organization slug", "default")
  .option("--password <password>", "Password")
  .option("--admin", "Grant admin access")
  .action(async (email: string, name: string, opts: { org: string; password?: string; admin?: boolean }) => {
    await initDb();
    const orgRepo = AppDataSource.getRepository(Organization);
    const org = await orgRepo.findOne({ where: { slug: opts.org } });
    if (!org) { console.error(`Organization ${opts.org} not found`); process.exit(1); }

    const repo = AppDataSource.getRepository(User);
    const u = repo.create({ name, email, orgId: org.id, apiKey: generateToken(40), groupIds: [] } as Partial<User>);
    if (opts.password) await u.setPassword(opts.password);
    await repo.save(u);
    console.log(`User ${email} created (id=${u.id}).`);
    await AppDataSource.destroy();
  });

usersCmd
  .command("grant-admin <email>")
  .description("Grant admin access to a user")
  .option("--org <slug>", "Organization slug", "default")
  .action(async (email: string, opts: { org: string }) => {
    await initDb();
    const orgRepo = AppDataSource.getRepository(Organization);
    const org = await orgRepo.findOne({ where: { slug: opts.org } });
    if (!org) { console.error(`Organization ${opts.org} not found`); process.exit(1); }

    const grpRepo = AppDataSource.getRepository(Group);
    const adminGroup = await grpRepo.findOne({ where: { orgId: org.id, type: "builtin_admin" } });
    if (!adminGroup) { console.error("Admin group not found"); process.exit(1); }

    const repo = AppDataSource.getRepository(User);
    const u = await repo.findOne({ where: { email, orgId: org.id } });
    if (!u) { console.error(`User ${email} not found`); process.exit(1); }
    if (!u.groupIds?.includes(adminGroup.id)) {
      u.groupIds = [...(u.groupIds ?? []), adminGroup.id];
      await repo.save(u);
      console.log("User updated.");
    } else {
      console.log("User is already an admin.");
    }
    await AppDataSource.destroy();
  });

usersCmd
  .command("list")
  .description("List all users")
  .option("--org <slug>", "Organization slug", "default")
  .action(async (opts: { org: string }) => {
    await initDb();
    const orgRepo = AppDataSource.getRepository(Organization);
    const org = await orgRepo.findOne({ where: { slug: opts.org } });
    if (!org) { console.error(`Organization ${opts.org} not found`); process.exit(1); }

    const repo = AppDataSource.getRepository(User);
    const users = await repo.find({ where: { orgId: org.id } });
    for (const u of users) {
      console.log(`${u.id}\t${u.email}\t${u.name}${u.isDisabled ? " [disabled]" : ""}`);
    }
    await AppDataSource.destroy();
  });

// ─── organizations ────────────────────────────────────────────────────────────
const orgCmd = program.command("org").description("Organization management");

orgCmd
  .command("create <name>")
  .description("Create a new organization")
  .option("--slug <slug>", "URL slug")
  .action(async (name: string, opts: { slug?: string }) => {
    await initDb();
    const repo = AppDataSource.getRepository(Organization);
    const slug = opts.slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const org = repo.create({ name, slug, settings: {} });
    await repo.save(org);
    console.log(`Organization "${name}" created (id=${org.id}, slug=${slug}).`);
    await AppDataSource.destroy();
  });

// ─── workers ─────────────────────────────────────────────────────────────────
program
  .command("worker")
  .description("Start BullMQ workers")
  .action(async () => {
    await initDb();
    const { startWorkers } = await import("../tasks");
    startWorkers();
    console.log("Workers started. Press Ctrl+C to stop.");
  });

program
  .command("scheduler")
  .description("Start periodic job scheduler")
  .action(async () => {
    await initDb();
    const { schedulePeriodicJobs } = await import("../tasks/schedule");
    await schedulePeriodicJobs();
    console.log("Periodic jobs scheduled.");
    await AppDataSource.destroy();
  });

program.parseAsync(process.argv).catch((e) => {
  console.error(e);
  process.exit(1);
});
