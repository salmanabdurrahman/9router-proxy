/**
 * Header carrying the shared authentication secret.
 */
export const SECRET_HEADER = "x-relay-secret";

/**
 * Header designating the target upstream origin (e.g. https://generativelanguage.googleapis.com).
 */
export const TARGET_HEADER = "x-relay-target";

/**
 * Header designating the destination request path and query string (e.g. /v1/chat/completions).
 */
export const PATH_HEADER = "x-relay-path";

/**
 * Query parameter fallback for relay authentication.
 */
export const QUERY_SECRET = "key";

/**
 * Minimum required length for the shared relay secret.
 */
export const MIN_SECRET_LENGTH = 16;

/**
 * Headers that belong exclusively to the relay/proxy infrastructure
 * and must be stripped before forwarding requests to the upstream provider.
 */
export const INTERNAL_HEADERS = [
  // 9Router relay-specific headers
  SECRET_HEADER,
  TARGET_HEADER,
  PATH_HEADER,

  // Host and Cloudflare edge metadata
  "host",
  "cf-connecting-ip",
  "cf-ray",
  "cf-visitor",
  "cf-ipcountry",
  "cdn-loop",

  // Vercel edge metadata
  "x-vercel-id",
  "x-vercel-forwarded-for",
  "x-vercel-ip-country",
  "x-vercel-ip-city",
  "x-vercel-ip-latitude",
  "x-vercel-ip-longitude",
  "x-vercel-ip-timezone",
  "x-vercel-deployment-url",

  // Generic proxy forwarding headers
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",

  // Proxy authentication
  "proxy-authorization",

  // Standard HTTP hop-by-hop headers (RFC 7230 section 6.1)
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
] as const;

/**
 * Pre-computed lowercase Set of internal headers for O(1) sanitization lookup.
 */
export const INTERNAL_HEADERS_SET = new Set<string>(
  INTERNAL_HEADERS.map((header) => header.toLowerCase()),
);
