import logger from "../logger";

// ── Column type constants ──────────────────────────────────────────────────────
export const TYPE_INTEGER = "integer";
export const TYPE_FLOAT = "float";
export const TYPE_BOOLEAN = "boolean";
export const TYPE_STRING = "string";
export const TYPE_DATETIME = "datetime";
export const TYPE_DATE = "date";

export type ColumnType =
  | typeof TYPE_INTEGER
  | typeof TYPE_FLOAT
  | typeof TYPE_BOOLEAN
  | typeof TYPE_STRING
  | typeof TYPE_DATETIME
  | typeof TYPE_DATE;

export const SUPPORTED_COLUMN_TYPES = new Set<ColumnType>([
  TYPE_INTEGER, TYPE_FLOAT, TYPE_BOOLEAN, TYPE_STRING, TYPE_DATETIME, TYPE_DATE,
]);

// ── Result types ───────────────────────────────────────────────────────────────
export interface Column {
  name: string;
  type?: ColumnType | null;
  friendly_name?: string;
}

export interface QueryResult {
  columns: Column[];
  rows: Record<string, unknown>[];
}

export type RunQueryResult = [QueryResult | null, string | null];

// ── Exceptions ─────────────────────────────────────────────────────────────────
export class InterruptException extends Error {}
export class NotSupported extends Error {}

// ── Base class ─────────────────────────────────────────────────────────────────
export abstract class BaseQueryRunner {
  static deprecated = false;
  static shouldAnnotateQuery = true;
  static noopQuery: string | null = null;
  static limitQuery = " LIMIT 1000";

  protected configuration: Record<string, unknown>;

  constructor(configuration: Record<string, unknown>) {
    this.configuration = configuration;
  }

  static runnerName(): string {
    return this.name;
  }

  static runnerType(): string {
    return this.name.toLowerCase();
  }

  static enabled(): boolean {
    return true;
  }

  static configurationSchema(): Record<string, unknown> {
    return {};
  }

  static toDict(): Record<string, unknown> {
    return {
      name: this.runnerName(),
      type: this.runnerType(),
      configuration_schema: this.configurationSchema(),
      ...(this.deprecated ? { deprecated: true } : {}),
    };
  }

  /** Execute a query and return [data, error]. */
  abstract runQuery(query: string, user: unknown): Promise<RunQueryResult>;

  /** Return schema as array of { name, columns[] } objects. */
  async getSchema(_getStats = false): Promise<{ name: string; columns: (string | Column)[] }[]> {
    return [];
  }

  /** Test the connection. */
  async testConnection(): Promise<void> {
    const noopQuery = (this.constructor as typeof BaseQueryRunner).noopQuery;
    if (noopQuery) {
      const [, err] = await this.runQuery(noopQuery, null);
      if (err) throw new Error(err);
    }
  }

  fetchColumns(fields: [string, ColumnType | null | undefined][]): Column[] {
    return fields.map(([name, type]) => ({
      name,
      friendly_name: name,
      type: type ?? undefined,
    }));
  }

  annotateQuery(query: string, metadata: Record<string, unknown>): string {
    if (!(this.constructor as typeof BaseQueryRunner).shouldAnnotateQuery) {
      return query;
    }
    const metaStr = Object.entries(metadata)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    return `/* Redash Query: ${metaStr} */\n${query}`;
  }

  /** Guess column type from a JS value */
  static guessType(value: unknown): ColumnType {
    if (typeof value === "boolean") return TYPE_BOOLEAN;
    if (typeof value === "number") {
      return Number.isInteger(value) ? TYPE_INTEGER : TYPE_FLOAT;
    }
    if (typeof value === "string") {
      if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return TYPE_DATETIME;
      if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return TYPE_DATE;
    }
    return TYPE_STRING;
  }
}

// ── Abstract SQL runner ────────────────────────────────────────────────────────
export abstract class BaseSQLQueryRunner extends BaseQueryRunner {
  /** Sub-classes provide their specific table-fetch logic. */
  protected abstract _getTables(
    schema: Record<string, { name: string; columns: (string | Column)[] }>
  ): Promise<void>;

  async getSchema(_getStats = false): Promise<{ name: string; columns: (string | Column)[] }[]> {
    const schema: Record<string, { name: string; columns: (string | Column)[] }> = {};
    await this._getTables(schema);
    return Object.values(schema);
  }
}

// ── Abstract HTTP runner ───────────────────────────────────────────────────────
export abstract class BaseHTTPQueryRunner extends BaseQueryRunner {}

// ── Registry ───────────────────────────────────────────────────────────────────
type RunnerCtor = new (cfg: Record<string, unknown>) => BaseQueryRunner;
interface RunnerClass extends RunnerCtor {
  enabled(): boolean;
  runnerName(): string;
  runnerType(): string;
  configurationSchema(): Record<string, unknown>;
  toDict(): Record<string, unknown>;
}

const queryRunners = new Map<string, RunnerClass>();

export function register(runnerClass: RunnerClass): void {
  if (runnerClass.enabled()) {
    logger.debug(`Registering query runner: ${runnerClass.runnerType()}`);
    queryRunners.set(runnerClass.runnerType(), runnerClass);
  } else {
    logger.warn(
      `${runnerClass.runnerName()} not enabled — skipping registration.`
    );
  }
}

/** Get a runner instance for the given type+config, or just the class if no config provided */
export function getQueryRunner(type: string, configuration?: Record<string, unknown>): BaseQueryRunner | null;
export function getQueryRunner(type: string): typeof BaseQueryRunner | null;
export function getQueryRunner(
  type: string,
  configuration?: Record<string, unknown>
): BaseQueryRunner | typeof BaseQueryRunner | null {
  const cls = queryRunners.get(type);
  if (!cls) return null;
  if (configuration !== undefined) return new cls(configuration);
  return cls as unknown as typeof BaseQueryRunner;
}

/** Return the raw runner class map (for listing available types) */
export function getQueryRunners(): Map<string, RunnerClass> {
  return queryRunners;
}

export function getConfigurationSchemaForQueryRunnerType(
  type: string
): Record<string, unknown> | null {
  return queryRunners.get(type)?.configurationSchema() ?? null;
}

export function getAllQueryRunners(): Record<string, unknown>[] {
  return Array.from(queryRunners.values()).map((cls) => cls.toDict());
}

export function importQueryRunners(): void {
  require("./postgresql");
  require("./mysql");
  require("./mssql");
  require("./clickhouse");
  require("./csv");
  require("./elasticsearch");
  require("./mongodb");
  require("./athena");
  require("./bigQuery");
  require("./cloudwatch");
  require("./cloudwatchInsights");
  require("./googleSpreadsheets");
  require("./googleAnalytics");
  require("./googleAnalytics4");
  require("./googleSearchConsole");
  require("./databricks");
  require("./druid");
  require("./duckdb");
  require("./influxdb");
  require("./arango");
  require("./cassandra");
  require("./azureKusto");
  require("./exasol");
  require("./drill");
  require("./graphite");
  require("./excel");
  require("./prometheus");
  require("./presto");
}

export function guessType(value: unknown): ColumnType {
  return BaseQueryRunner.guessType(value);
}
