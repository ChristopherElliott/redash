import fs from "fs";
import axios from "axios";
import jwt, { Algorithm } from "jsonwebtoken";
import logger from "../logger";

const FILE_SCHEME_PREFIX = "file://";

interface JwkSet {
  keys: Record<string, unknown>[];
}

// Simple in-memory key cache
const keyCache: Map<string, unknown[]> = new Map();

function getPublicKeyFromFile(url: string): string {
  const filePath = url.slice(FILE_SCHEME_PREFIX.length);
  const key = fs.readFileSync(filePath, "utf8");
  keyCache.set(url, [key]);
  return key;
}

async function getPublicKeyFromNet(url: string): Promise<unknown[]> {
  const response = await axios.get<JwkSet | Record<string, unknown>>(url);
  const data = response.data;

  if ("keys" in data && Array.isArray(data.keys)) {
    // For JWK sets return the raw key objects; jsonwebtoken can verify with them
    const keys = data.keys as unknown[];
    keyCache.set(url, keys);
    return keys;
  }

  const fallback = [data];
  keyCache.set(url, fallback);
  return fallback;
}

export async function getPublicKeys(url: string): Promise<unknown[]> {
  if (keyCache.has(url)) {
    return keyCache.get(url)!;
  }

  if (url.startsWith(FILE_SCHEME_PREFIX)) {
    return [getPublicKeyFromFile(url)];
  }

  return getPublicKeyFromNet(url);
}

export interface JwtVerifyResult {
  payload: Record<string, unknown> | null;
  valid: boolean;
}

export async function verifyJwtToken(
  jwtToken: string,
  expectedIssuer: string,
  expectedAudience: string,
  algorithms: Algorithm[],
  publicCertsUrl: string
): Promise<JwtVerifyResult> {
  const keys = await getPublicKeys(publicCertsUrl);

  let unverifiedHeader: { kid?: string } = {};
  try {
    unverifiedHeader = jwt.decode(jwtToken, { complete: true })?.header ?? {};
  } catch {
    // ignore
  }

  const keyId = unverifiedHeader.kid;
  let resolvedKeys = keys;
  if (keyId && !Array.isArray(keys)) {
    const keyMap = keys as Record<string, unknown>;
    resolvedKeys = keyMap[keyId] ? [keyMap[keyId]] : keys;
  }

  for (const key of resolvedKeys) {
    try {
      const payload = jwt.verify(jwtToken, key as jwt.Secret, {
        audience: expectedAudience,
        issuer: expectedIssuer,
        algorithms,
      }) as Record<string, unknown>;

      return { payload, valid: true };
    } catch (err) {
      logger.error("JWT verification failed with key", err);
    }
  }

  return { payload: null, valid: false };
}
