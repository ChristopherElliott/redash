import crypto from "crypto";
import Mustache from "mustache";
import { settings } from "../settings";

const COMMENTS_REGEX = /\/\*.*?\*\//gs;

export function utcnow(): Date {
  return new Date();
}

export function dtFromTimestamp(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

export function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_\-]+/g, "-");
}

export function genQueryHash(sql: string): string {
  sql = sql.replace(COMMENTS_REGEX, "");
  sql = sql.split(/\s+/).join("");
  return crypto.createHash("md5").update(sql, "utf8").digest("hex");
}

export function generateToken(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes).map((b) => chars[b % chars.length]).join("");
}

function sanitizeData(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data === "number" && (isNaN(data) || !isFinite(data))) return null;
  if (Array.isArray(data)) return data.map(sanitizeData);
  if (typeof data === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      out[k] = sanitizeData(v);
    }
    return out;
  }
  return data;
}

export function jsonDumps(data: unknown): string {
  return JSON.stringify(sanitizeData(data));
}

export function jsonLoads(data: string): unknown {
  return JSON.parse(data);
}

export function mustacheRender(template: string, context?: Record<string, unknown>): string {
  // Disable HTML escaping (raw render)
  Mustache.escape = (s: string) => s;
  return Mustache.render(template, context ?? {});
}

export function mustacheRenderEscape(template: string, context?: Record<string, unknown>): string {
  // Re-enable escaping
  Mustache.escape = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  return Mustache.render(template, context ?? {});
}

export function baseUrl(org: { slug: string }): string {
  if (settings.MULTI_ORG) {
    return `${settings.HOST}/${org.slug}`;
  }
  return settings.HOST;
}

export function filterNone(d: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v != null));
}

export function toFilename(s: string): string {
  s = s.replace(/[<>:"\\\/|?*]+/gu, " ");
  s = s.replace(/\s+/gu, "_");
  return s.replace(/^_+|_+$/g, "");
}

export function collectParametersFromRequest(args: Record<string, string>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(args)) {
    if (k.startsWith("p_")) params[k.slice(2)] = v;
  }
  return params;
}

export function buildUrl(host: string, path: string, scheme = "https"): string {
  return `${scheme}://${host}${path}`;
}
