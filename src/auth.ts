import { QUERY_SECRET, SECRET_HEADER } from "./constants";

/**
 * Performs a constant-time string comparison to prevent timing attacks.
 * Returns true if both strings are identical in content and length.
 *
 * @param a - First string to compare.
 * @param b - Second string to compare.
 */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") {
    return false;
  }

  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);

  if (aBytes.length !== bBytes.length) {
    return false;
  }

  let difference = 0;
  for (let i = 0; i < aBytes.length; i++) {
    difference |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }

  return difference === 0;
}

/**
 * Extracts the provided relay secret from either:
 * 1. The `x-relay-secret` header.
 * 2. The `?key=` URL search parameter.
 *
 * @param request - Incoming HTTP Request.
 */
export function getProvidedSecret(request: Request): string {
  const headerSecret = request.headers.get(SECRET_HEADER);
  if (headerSecret) {
    return headerSecret.trim();
  }

  try {
    const url = new URL(request.url);
    return (url.searchParams.get(QUERY_SECRET) || "").trim();
  } catch {
    return "";
  }
}

/**
 * Validates whether the incoming request possesses a valid authentication secret.
 *
 * @param request - Incoming HTTP Request.
 * @param expectedSecret - Configured secret token.
 */
export function authenticate(request: Request, expectedSecret: string): boolean {
  const providedSecret = getProvidedSecret(request);
  if (!providedSecret) {
    return false;
  }

  return safeEqual(providedSecret, expectedSecret);
}
