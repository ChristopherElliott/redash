# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Development
```bash
npm run dev        # Run server with ts-node (no build step needed)
npm run worker     # Start background workers with ts-node
npm run cli        # Run CLI commands with ts-node
```

### Production
```bash
npm run build      # Compile TypeScript to dist/
npm start          # Run compiled server (dist/index.js)
```

### CLI Commands
```bash
npx ts-node src/cli/index.ts version
npx ts-node src/cli/index.ts status
npx ts-node src/cli/index.ts database create-tables
npx ts-node src/cli/index.ts users create <email> <name> [--org] [--password] [--admin]
npx ts-node src/cli/index.ts users list [--org]
npx ts-node src/cli/index.ts org create <name> [--slug]
npx ts-node src/cli/index.ts worker
npx ts-node src/cli/index.ts scheduler
```

### Required Environment Variables
Copy `.env.example` to `.env`. Minimum required:
- `REDASH_COOKIE_SECRET` — session secret
- `REDASH_DATABASE_URL` — PostgreSQL connection (default: `postgresql://localhost/redash`)
- `REDASH_REDIS_URL` — Redis connection (default: `redis://localhost:6379/0`)

## Architecture Overview

This is a TypeScript/Node.js port of the original Python Redash project — a data querying and visualization tool. It requires PostgreSQL and Redis to run.

### Request Lifecycle

1. **`src/index.ts`** — initializes TypeORM DB connection, optionally starts BullMQ workers, then starts the Express server
2. **`src/app.ts`** — configures Express: Helmet CSP, CORS, rate limiting, Morgan logging, auth initialization, route mounting, static asset serving, SPA fallback (all non-API routes serve `index.html`)
3. **`src/authentication/`** — per-request auth: checks session → API key → JWT → HMAC in order. Supports Google OAuth, SAML, LDAP, and Remote User strategies. Org resolution middleware determines the org from request context.
4. **`src/handlers/`** — ~20 route modules (queries, dashboards, alerts, users, groups, datasources, etc.) mounted in `handlers/index.ts`. In multi-org mode, routes are prefixed with `/:org_slug`.
5. **`src/models/`** — TypeORM entities for all domain objects. The `AppDataSource` singleton is used throughout. Main entities: User, Organization, Query, Dashboard, Alert, DataSource, Group, QueryResult, Event.

### Background Jobs

**`src/tasks/`** uses BullMQ with Redis. Queues: `default`, `emails`, `queries`, `schemas`, `periodic`. Job types include: execute query, send alerts, check alerts, refresh schemas, cleanup results, aggregate errors, record events. The worker process is separate from the API server.

### Query Runners

**`src/queryRunners/`** contains 40+ pluggable data source connectors (PostgreSQL, MySQL, MongoDB, BigQuery, Snowflake, Presto, Elasticsearch, CSV, JSON, URL, etc.). Each implements a common interface for query execution.

### Alert Destinations

**`src/destinations/`** contains notification channel connectors: Email, Slack, Discord, Mattermost, PagerDuty, Asana, Datadog, Teams, Webhooks, etc.

### Configuration

**`src/settings.ts`** parses 230+ environment variables at startup. All settings are exported as module-level constants and as a combined `settings` object.

### TypeScript Setup

- Target: ES2020, Module: CommonJS, strict mode enabled
- Decorator support enabled (`experimentalDecorators`, `emitDecoratorMetadata`) — required for TypeORM entities
- Output: `./dist`, source: `./src`
