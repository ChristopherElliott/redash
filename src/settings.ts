// Redash settings — mirrors redash/settings/__init__.py
// All values are read from environment variables at startup.
import "dotenv/config";

function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === "true" || value === "1";
}

function arrayFromString(value: string | undefined, delimiter = ","): string[] {
  if (!value) return [];
  return value
    .split(delimiter)
    .map((s) => s.trim())
    .filter(Boolean);
}

function setFromString(value: string | undefined, delimiter = ","): Set<string> {
  return new Set(arrayFromString(value, delimiter));
}

function intOrNone(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseInt(value, 10);
  return isNaN(n) ? null : n;
}

const env = process.env;

// ── Redis ──────────────────────────────────────────────────────────────────────
export const REDIS_URL = env.REDASH_REDIS_URL ?? env.REDIS_URL ?? "redis://localhost:6379/0";
export const RQ_REDIS_URL = env.RQ_REDIS_URL ?? REDIS_URL;

// ── Database ───────────────────────────────────────────────────────────────────
export const DATABASE_URL =
  env.REDASH_DATABASE_URL ?? env.DATABASE_URL ?? "postgresql://localhost/postgres";
export const SQLALCHEMY_MAX_OVERFLOW = intOrNone(env.SQLALCHEMY_MAX_OVERFLOW);
export const SQLALCHEMY_POOL_SIZE = intOrNone(env.SQLALCHEMY_POOL_SIZE);
export const SQLALCHEMY_DISABLE_POOL = parseBoolean(env.SQLALCHEMY_DISABLE_POOL);
export const SQLALCHEMY_ENABLE_POOL_PRE_PING = parseBoolean(env.SQLALCHEMY_ENABLE_POOL_PRE_PING);

// ── StatsD ─────────────────────────────────────────────────────────────────────
export const STATSD_HOST = env.REDASH_STATSD_HOST ?? "127.0.0.1";
export const STATSD_PORT = parseInt(env.REDASH_STATSD_PORT ?? "8125", 10);
export const STATSD_PREFIX = env.REDASH_STATSD_PREFIX ?? "redash";
export const STATSD_USE_TAGS = parseBoolean(env.REDASH_STATSD_USE_TAGS);

// ── Security ───────────────────────────────────────────────────────────────────
const secretKey = env.REDASH_COOKIE_SECRET;
if (!secretKey) {
  throw new Error(
    "You must set the REDASH_COOKIE_SECRET environment variable."
  );
}
export const SECRET_KEY: string = secretKey;
export const DATASOURCE_SECRET_KEY = env.REDASH_SECRET_KEY ?? SECRET_KEY;

export const ENFORCE_HTTPS = parseBoolean(env.REDASH_ENFORCE_HTTPS);
export const ENFORCE_HTTPS_PERMANENT = parseBoolean(env.REDASH_ENFORCE_HTTPS_PERMANENT);
export const ENFORCE_FILE_SAVE = parseBoolean(env.REDASH_ENFORCE_FILE_SAVE, true);
export const ENFORCE_PRIVATE_ADDRESS_BLOCK = parseBoolean(env.REDASH_ENFORCE_PRIVATE_IP_BLOCK, true);
export const ENFORCE_CSRF = parseBoolean(env.REDASH_ENFORCE_CSRF);
export const CSRF_TIME_LIMIT = parseInt(env.REDASH_CSRF_TIME_LIMIT ?? String(3600 * 6), 10);

export const COOKIE_SECURE = parseBoolean(env.REDASH_COOKIES_SECURE ?? String(ENFORCE_HTTPS));
export const SESSION_COOKIE_SECURE = parseBoolean(env.REDASH_SESSION_COOKIE_SECURE ?? String(COOKIE_SECURE));
export const SESSION_COOKIE_HTTPONLY = parseBoolean(env.REDASH_SESSION_COOKIE_HTTPONLY, true);
export const SESSION_EXPIRY_TIME = parseInt(env.REDASH_SESSION_EXPIRY_TIME ?? String(60 * 60 * 6), 10);
export const SESSION_COOKIE_NAME = env.REDASH_SESSION_COOKIE_NAME ?? "session";

export const REMEMBER_COOKIE_DURATION = parseInt(
  env.REDASH_REMEMBER_COOKIE_DURATION ?? String(60 * 60 * 24 * 31),
  10
);

export const CONTENT_SECURITY_POLICY =
  env.REDASH_CONTENT_SECURITY_POLICY ??
  "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-eval'; font-src 'self' data:; img-src 'self' http: https: data: blob:; object-src 'none'; frame-ancestors 'none'; frame-src redash.io;";
export const CONTENT_SECURITY_POLICY_REPORT_URI = env.REDASH_CONTENT_SECURITY_POLICY_REPORT_URI ?? "";
export const CONTENT_SECURITY_POLICY_REPORT_ONLY = parseBoolean(env.REDASH_CONTENT_SECURITY_POLICY_REPORT_ONLY);
export const REFERRER_POLICY = env.REDASH_REFERRER_POLICY ?? "strict-origin-when-cross-origin";
export const FRAME_OPTIONS = env.REDASH_FRAME_OPTIONS ?? "deny";

export const HSTS_ENABLED = parseBoolean(env.REDASH_HSTS_ENABLED ?? String(ENFORCE_HTTPS));
export const HSTS_MAX_AGE = parseInt(env.REDASH_HSTS_MAX_AGE ?? String(31536000), 10);
export const HSTS_INCLUDE_SUBDOMAINS = parseBoolean(env.REDASH_HSTS_INCLUDE_SUBDOMAINS);
export const HSTS_PRELOAD = parseBoolean(env.REDASH_HSTS_PRELOAD);

// ── Auth ───────────────────────────────────────────────────────────────────────
export const AUTH_TYPE = env.REDASH_AUTH_TYPE ?? "api_key";
export const PASSWORD_LOGIN_ENABLED = parseBoolean(env.REDASH_PASSWORD_LOGIN_ENABLED, true);
export const DATE_FORMAT = env.REDASH_DATE_FORMAT ?? "DD/MM/YY HH:mm";
export const INVITATION_TOKEN_MAX_AGE = parseInt(
  env.REDASH_INVITATION_TOKEN_MAX_AGE ?? String(60 * 60 * 24 * 7),
  10
);
export const MULTI_ORG = parseBoolean(env.REDASH_MULTI_ORG);

// Google OAuth
export const GOOGLE_CLIENT_ID = env.REDASH_GOOGLE_CLIENT_ID ?? "";
export const GOOGLE_CLIENT_SECRET = env.REDASH_GOOGLE_CLIENT_SECRET ?? "";
export const GOOGLE_OAUTH_ENABLED = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
export const GOOGLE_OAUTH_SCHEME_OVERRIDE = env.REDASH_GOOGLE_OAUTH_SCHEME_OVERRIDE ?? "";
export const GOOGLE_OAUTH_CALLBACK_URL =
  env.REDASH_GOOGLE_OAUTH_CALLBACK_URL ?? "/oauth/google_callback";

// SAML
export const SAML_SCHEME_OVERRIDE = env.REDASH_SAML_SCHEME_OVERRIDE ?? "";
export const SAML_METADATA_URL = env.REDASH_SAML_METADATA_URL ?? "";
export const SAML_ENCRYPTION_PEM_PATH = env.REDASH_SAML_ENCRYPTION_PEM_PATH ?? "";
export const SAML_ENCRYPTION_CERT_PATH = env.REDASH_SAML_ENCRYPTION_CERT_PATH ?? "";
export const SAML_ENCRYPTION_ENABLED = !!(SAML_ENCRYPTION_PEM_PATH && SAML_ENCRYPTION_CERT_PATH);

// LDAP
export const LDAP_LOGIN_ENABLED = parseBoolean(env.REDASH_LDAP_LOGIN_ENABLED);
export const LDAP_SSL = parseBoolean(env.REDASH_LDAP_USE_SSL);
export const LDAP_AUTH_METHOD = env.REDASH_LDAP_AUTH_METHOD ?? "SIMPLE";
export const LDAP_HOST_URL = env.REDASH_LDAP_URL ?? "";
export const LDAP_BIND_DN = env.REDASH_LDAP_BIND_DN ?? null;
export const LDAP_BIND_DN_PASSWORD = env.REDASH_LDAP_BIND_DN_PASSWORD ?? "";
export const LDAP_DISPLAY_NAME_KEY = env.REDASH_LDAP_DISPLAY_NAME_KEY ?? "displayName";
export const LDAP_EMAIL_KEY = env.REDASH_LDAP_EMAIL_KEY ?? "mail";
export const LDAP_CUSTOM_USERNAME_PROMPT = env.REDASH_LDAP_CUSTOM_USERNAME_PROMPT ?? "LDAP/AD/SSO username:";
export const LDAP_SEARCH_TEMPLATE = env.REDASH_LDAP_SEARCH_TEMPLATE ?? "(cn=%s)";
export const LDAP_SEARCH_DN = env.REDASH_LDAP_SEARCH_DN ?? env.REDASH_SEARCH_DN ?? "";

// Remote user
export const REMOTE_USER_LOGIN_ENABLED = parseBoolean(env.REDASH_REMOTE_USER_LOGIN_ENABLED);
export const REMOTE_USER_HEADER = env.REDASH_REMOTE_USER_HEADER ?? "X-Forwarded-Remote-User";

// ── Mail ───────────────────────────────────────────────────────────────────────
export const MAIL_SERVER = env.REDASH_MAIL_SERVER ?? "localhost";
export const MAIL_PORT = parseInt(env.REDASH_MAIL_PORT ?? "25", 10);
export const MAIL_USE_TLS = parseBoolean(env.REDASH_MAIL_USE_TLS);
export const MAIL_USE_SSL = parseBoolean(env.REDASH_MAIL_USE_SSL);
export const MAIL_USERNAME = env.REDASH_MAIL_USERNAME ?? null;
export const MAIL_PASSWORD = env.REDASH_MAIL_PASSWORD ?? null;
export const MAIL_DEFAULT_SENDER = env.REDASH_MAIL_DEFAULT_SENDER ?? null;

export function emailServerIsConfigured(): boolean {
  return MAIL_DEFAULT_SENDER !== null;
}

// ── Alerts ─────────────────────────────────────────────────────────────────────
export const ALERTS_DEFAULT_MAIL_SUBJECT_TEMPLATE =
  env.REDASH_ALERTS_DEFAULT_MAIL_SUBJECT_TEMPLATE ??
  "Alert: {alert_name} changed status to {state}";

// ── Rate limiting ──────────────────────────────────────────────────────────────
export const RATELIMIT_ENABLED = parseBoolean(env.REDASH_RATELIMIT_ENABLED, true);
export const THROTTLE_LOGIN_PATTERN = env.REDASH_THROTTLE_LOGIN_PATTERN ?? "50/hour";
export const LIMITER_STORAGE = env.REDASH_LIMITER_STORAGE ?? REDIS_URL;

// ── CORS ───────────────────────────────────────────────────────────────────────
export const ACCESS_CONTROL_ALLOW_ORIGIN = setFromString(
  env.REDASH_CORS_ACCESS_CONTROL_ALLOW_ORIGIN
);
export const ACCESS_CONTROL_ALLOW_CREDENTIALS = parseBoolean(
  env.REDASH_CORS_ACCESS_CONTROL_ALLOW_CREDENTIALS
);
export const ACCESS_CONTROL_REQUEST_METHOD =
  env.REDASH_CORS_ACCESS_CONTROL_REQUEST_METHOD ?? "GET, POST, PUT";
export const ACCESS_CONTROL_ALLOW_HEADERS =
  env.REDASH_CORS_ACCESS_CONTROL_ALLOW_HEADERS ?? "Content-Type";

// ── Feature flags ──────────────────────────────────────────────────────────────
export const VERSION_CHECK = parseBoolean(env.REDASH_VERSION_CHECK, true);
export const FEATURE_DISABLE_REFRESH_QUERIES = parseBoolean(env.REDASH_FEATURE_DISABLE_REFRESH_QUERIES);
export const FEATURE_SHOW_QUERY_RESULTS_COUNT = parseBoolean(env.REDASH_FEATURE_SHOW_QUERY_RESULTS_COUNT, true);
export const FEATURE_ALLOW_CUSTOM_JS_VISUALIZATIONS = parseBoolean(env.REDASH_FEATURE_ALLOW_CUSTOM_JS_VISUALIZATIONS, true);
export const FEATURE_AUTO_PUBLISH_NAMED_QUERIES = parseBoolean(env.REDASH_FEATURE_AUTO_PUBLISH_NAMED_QUERIES, true);
export const FEATURE_EXTENDED_ALERT_OPTIONS = parseBoolean(env.REDASH_FEATURE_EXTENDED_ALERT_OPTIONS);
export const ALLOW_SCRIPTS_IN_USER_INPUT = parseBoolean(env.REDASH_ALLOW_SCRIPTS_IN_USER_INPUT);
export const ALLOW_PARAMETERS_IN_EMBEDS = parseBoolean(env.REDASH_ALLOW_PARAMETERS_IN_EMBEDS);
export const SCHEMA_RUN_TABLE_SIZE_CALCULATIONS = parseBoolean(env.REDASH_SCHEMA_RUN_TABLE_SIZE_CALCULATIONS);

// ── Query runners ──────────────────────────────────────────────────────────────
const defaultQueryRunners = [
  "postgresql", "mysql", "mssql", "sqlite", "clickhouse", "csv", "json",
  "url", "elasticsearch", "elasticsearch2", "mongodb", "athena", "bigQuery",
  "googleSpreadsheets", "googleAnalytics", "googleAnalytics4",
  "googleSearchConsole", "cassandra", "cloudwatch", "cloudwatchInsights",
  "databricks", "druid", "duckdb", "exasol", "excel", "graphite",
  "influxdb", "influxdbv2", "trino", "presto", "snowflake", "redshift",
  "hive", "impala", "vertica", "db2", "arango", "azureKusto", "couchbase",
  "dgraph", "e6data", "databend", "axibaseTsd",
];
export const QUERY_RUNNERS = arrayFromString(
  env.REDASH_ENABLED_QUERY_RUNNERS ?? defaultQueryRunners.join(",")
);

// ── Destinations ───────────────────────────────────────────────────────────────
export const DESTINATIONS = arrayFromString(
  env.REDASH_ENABLED_DESTINATIONS ??
    "email,slack,webhook,discord,mattermost,chatwork,pagerduty,hangouts_chat,microsoft_teams_webhook,asana,webex,datadog"
);

// ── Query execution ────────────────────────────────────────────────────────────
export const SCHEDULED_QUERY_TIME_LIMIT = parseInt(env.REDASH_SCHEDULED_QUERY_TIME_LIMIT ?? "-1", 10);
export const ADHOC_QUERY_TIME_LIMIT = parseInt(env.REDASH_ADHOC_QUERY_TIME_LIMIT ?? "-1", 10);
export const JOB_EXPIRY_TIME = parseInt(env.REDASH_JOB_EXPIRY_TIME ?? String(3600 * 12), 10);
export const JOB_DEFAULT_FAILURE_TTL = parseInt(env.REDASH_JOB_DEFAULT_FAILURE_TTL ?? String(7 * 24 * 60 * 60), 10);
export const QUERY_RESULTS_CLEANUP_ENABLED = parseBoolean(env.REDASH_QUERY_RESULTS_CLEANUP_ENABLED, true);
export const QUERY_RESULTS_CLEANUP_COUNT = parseInt(env.REDASH_QUERY_RESULTS_CLEANUP_COUNT ?? "100", 10);
export const QUERY_RESULTS_CLEANUP_MAX_AGE = parseInt(env.REDASH_QUERY_RESULTS_CLEANUP_MAX_AGE ?? "7", 10);
export const SCHEMAS_REFRESH_SCHEDULE = parseInt(env.REDASH_SCHEMAS_REFRESH_SCHEDULE ?? "30", 10);
export const SCHEMAS_REFRESH_TIMEOUT = parseInt(env.REDASH_SCHEMAS_REFRESH_TIMEOUT ?? "300", 10);

// ── UI ─────────────────────────────────────────────────────────────────────────
export const PAGE_SIZE = parseInt(env.REDASH_PAGE_SIZE ?? "20", 10);
export const PAGE_SIZE_OPTIONS = arrayFromString(
  env.REDASH_PAGE_SIZE_OPTIONS ?? "5,10,20,50,100"
).map(Number);
export const DASHBOARD_REFRESH_INTERVALS = arrayFromString(
  env.REDASH_DASHBOARD_REFRESH_INTERVALS ?? "60,300,600,1800,3600,43200,86400"
).map(Number);
export const QUERY_REFRESH_INTERVALS = arrayFromString(
  env.REDASH_QUERY_REFRESH_INTERVALS ??
    "60,300,600,900,1800,3600,7200,10800,14400,18000,21600,25200,28800,32400,36000,39600,43200,86400,604800,1209600,2592000"
).map(Number);
export const TABLE_CELL_MAX_JSON_SIZE = parseInt(env.REDASH_TABLE_CELL_MAX_JSON_SIZE ?? "50000", 10);

// ── Misc ───────────────────────────────────────────────────────────────────────
export const HOST = env.REDASH_HOST ?? "";
export const PROXIES_COUNT = parseInt(env.REDASH_PROXIES_COUNT ?? "1", 10);
export const SENTRY_DSN = env.REDASH_SENTRY_DSN ?? "";
export const SENTRY_ENVIRONMENT = env.REDASH_SENTRY_ENVIRONMENT;
export const BIGQUERY_HTTP_TIMEOUT = parseInt(env.REDASH_BIGQUERY_HTTP_TIMEOUT ?? "600", 10);
export const BLOCKED_DOMAINS = setFromString(env.REDASH_BLOCKED_DOMAINS ?? "qq.com");
export const SEND_FAILURE_EMAIL_INTERVAL = parseInt(env.REDASH_SEND_FAILURE_EMAIL_INTERVAL ?? "60", 10);
export const MAX_FAILURE_REPORTS_PER_QUERY = parseInt(env.REDASH_MAX_FAILURE_REPORTS_PER_QUERY ?? "100", 10);
export const STATIC_ASSETS_PATH = env.REDASH_STATIC_ASSETS_PATH ?? "../client/dist/";
export const EVENT_REPORTING_WEBHOOKS = arrayFromString(env.REDASH_EVENT_REPORTING_WEBHOOKS);

// Export all as a single settings object for convenience
export const settings = {
  REDIS_URL, RQ_REDIS_URL, DATABASE_URL,
  STATSD_HOST, STATSD_PORT, STATSD_PREFIX, STATSD_USE_TAGS,
  SECRET_KEY, DATASOURCE_SECRET_KEY,
  ENFORCE_HTTPS, ENFORCE_HTTPS_PERMANENT, COOKIE_SECURE, SESSION_EXPIRY_TIME, SESSION_COOKIE_NAME,
  REMEMBER_COOKIE_DURATION, CONTENT_SECURITY_POLICY, CONTENT_SECURITY_POLICY_REPORT_ONLY,
  REFERRER_POLICY, FRAME_OPTIONS, HSTS_ENABLED, HSTS_MAX_AGE, HSTS_INCLUDE_SUBDOMAINS, HSTS_PRELOAD,
  AUTH_TYPE, INVITATION_TOKEN_MAX_AGE, MULTI_ORG, PASSWORD_LOGIN_ENABLED, DATE_FORMAT,
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_OAUTH_ENABLED,
  GOOGLE_OAUTH_SCHEME_OVERRIDE, GOOGLE_OAUTH_CALLBACK_URL,
  LDAP_LOGIN_ENABLED, LDAP_SSL, LDAP_HOST_URL, LDAP_BIND_DN,
  LDAP_BIND_DN_PASSWORD, LDAP_DISPLAY_NAME_KEY, LDAP_EMAIL_KEY,
  LDAP_SEARCH_TEMPLATE, LDAP_SEARCH_DN, LDAP_CUSTOM_USERNAME_PROMPT,
  SAML_METADATA_URL, SAML_SCHEME_OVERRIDE, SAML_ENCRYPTION_ENABLED,
  REMOTE_USER_LOGIN_ENABLED, REMOTE_USER_HEADER,
  MAIL_SERVER, MAIL_PORT, MAIL_USE_TLS, MAIL_USE_SSL,
  MAIL_USERNAME, MAIL_PASSWORD, MAIL_DEFAULT_SENDER,
  ALERTS_DEFAULT_MAIL_SUBJECT_TEMPLATE,
  RATELIMIT_ENABLED, THROTTLE_LOGIN_PATTERN, LIMITER_STORAGE,
  ACCESS_CONTROL_ALLOW_ORIGIN, ACCESS_CONTROL_ALLOW_CREDENTIALS, ACCESS_CONTROL_REQUEST_METHOD,
  QUERY_RUNNERS, DESTINATIONS,
  SCHEDULED_QUERY_TIME_LIMIT, ADHOC_QUERY_TIME_LIMIT,
  JOB_EXPIRY_TIME, JOB_DEFAULT_FAILURE_TTL,
  QUERY_RESULTS_CLEANUP_ENABLED, QUERY_RESULTS_CLEANUP_COUNT,
  QUERY_RESULTS_CLEANUP_MAX_AGE, SCHEMAS_REFRESH_SCHEDULE,
  PAGE_SIZE, PAGE_SIZE_OPTIONS,
  FEATURE_SHOW_QUERY_RESULTS_COUNT, FEATURE_DISABLE_REFRESH_QUERIES,
  FEATURE_ALLOW_CUSTOM_JS_VISUALIZATIONS, FEATURE_AUTO_PUBLISH_NAMED_QUERIES,
  ALLOW_SCRIPTS_IN_USER_INPUT,
  HOST, PROXIES_COUNT, SENTRY_DSN, SENTRY_ENVIRONMENT,
  BIGQUERY_HTTP_TIMEOUT, BLOCKED_DOMAINS, STATIC_ASSETS_PATH,
  EVENT_REPORTING_WEBHOOKS,
  SEND_FAILURE_EMAIL_INTERVAL, MAX_FAILURE_REPORTS_PER_QUERY,
  VERSION_CHECK,
};
