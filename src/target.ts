/**
 * Validates and constructs the final upstream URL from `x-relay-target` and `x-relay-path`.
 * Applies strict anti-SSRF and protocol restrictions.
 *
 * @param target - The upstream origin provided via `x-relay-target` (e.g. "https://api.openai.com").
 * @param relayPath - The destination path and query provided via `x-relay-path` (e.g. "/v1/chat/completions").
 * @returns Fully validated URL instance.
 * @throws Error when the target URL fails security invariants.
 */
export function buildTargetUrl(target: string | null, relayPath: string | null): URL {
  if (!target || typeof target !== "string") {
    throw new Error("Missing or invalid x-relay-target header");
  }

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(target);
  } catch {
    throw new Error("Invalid x-relay-target URL");
  }

  // Enforce secure HTTPS protocol only
  if (parsedTarget.protocol !== "https:") {
    throw new Error("Only HTTPS targets are allowed");
  }

  // Restrict to standard HTTPS port
  if (parsedTarget.port && parsedTarget.port !== "443") {
    throw new Error("Only HTTPS port 443 is allowed");
  }

  // Reject private network, loopback, or cloud metadata targets (anti-SSRF)
  const host = parsedTarget.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "[::1]" ||
    host.startsWith("127.") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    host.startsWith("169.254.") ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
  ) {
    throw new Error("Private and loopback network targets are prohibited");
  }

  // Reject embedded credentials (e.g. https://user:pass@example.com)
  if (parsedTarget.username || parsedTarget.password) {
    throw new Error("Target credentials are not allowed");
  }

  // Ensure target header carries only the origin without sub-paths
  if (parsedTarget.pathname !== "/" && parsedTarget.pathname !== "") {
    throw new Error("x-relay-target must contain only the target origin");
  }

  // Ensure query strings and fragments are not smuggled in the origin header
  if (parsedTarget.search || parsedTarget.hash) {
    throw new Error("x-relay-target must not contain query or fragment");
  }

  const effectivePath = relayPath || "/";

  // Validate path formatting
  if (!effectivePath.startsWith("/")) {
    throw new Error("x-relay-path must start with /");
  }

  // Prevent protocol-relative URL exploits (//evil.com)
  if (effectivePath.startsWith("//")) {
    throw new Error("Invalid x-relay-path: protocol-relative path prohibited");
  }

  // Prevent backslash path traversal or parser confusion tricks
  if (effectivePath.includes("\\")) {
    throw new Error("Invalid x-relay-path: backslashes prohibited");
  }

  // Disallow URL fragments from entering upstream HTTP requests
  if (effectivePath.includes("#")) {
    throw new Error("Fragments are not allowed in relay path");
  }

  // Construct target URL using trusted origin
  const finalUrl = new URL(parsedTarget.origin);
  const queryIndex = effectivePath.indexOf("?");

  if (queryIndex === -1) {
    finalUrl.pathname = effectivePath;
  } else {
    finalUrl.pathname = effectivePath.slice(0, queryIndex);
    finalUrl.search = effectivePath.slice(queryIndex);
  }

  // Final invariant: origin and protocol must match initial target
  if (finalUrl.origin !== parsedTarget.origin) {
    throw new Error("Cross-origin routing is not allowed");
  }

  if (finalUrl.protocol !== "https:") {
    throw new Error("Only HTTPS targets are allowed");
  }

  return finalUrl;
}
