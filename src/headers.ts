import { INTERNAL_HEADERS_SET } from "./constants";

/**
 * Sanitizes incoming HTTP headers by stripping internal proxy/relay headers
 * while losslessly preserving all upstream provider credentials, models, and metadata.
 *
 * @param headers - Incoming HTTP Request headers.
 * @returns Clean key-value object containing only safe upstream headers.
 */
export function sanitizeHeaders(headers: Headers): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of headers.entries()) {
    const lowerKey = key.toLowerCase();

    // Omit headers that belong to relay infrastructure or hop-by-hop transport
    if (!INTERNAL_HEADERS_SET.has(lowerKey)) {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
