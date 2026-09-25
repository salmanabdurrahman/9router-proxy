import { authenticate } from "./auth";
import { MIN_SECRET_LENGTH, PATH_HEADER, TARGET_HEADER } from "./constants";
import { sanitizeHeaders } from "./headers";
import { buildTargetUrl } from "./target";
import type { Env, JsonResponsePayload } from "./types";

/**
 * Creates a standardized JSON response with strict no-cache headers.
 *
 * @param data - Response payload object.
 * @param status - HTTP status code (default: 200).
 * @param extraHeaders - Optional supplementary headers.
 */
export function jsonResponse(
  data: JsonResponsePayload,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      pragma: "no-cache",
      ...extraHeaders,
    },
  });
}

/**
 * Primary HTTP request handler for 9Router relay.
 * Compatible with Vercel Edge runtime, Cloudflare Workers, and Bun.
 *
 * @param request - Incoming HTTP Request.
 * @param env - Optional environment bindings (Cloudflare Workers style).
 */
export async function handleRequest(request: Request, env?: Env): Promise<Response> {
  // 1. Resolve and validate the relay secret configuration
  const relaySecret = env?.RELAY_SECRET || process.env.RELAY_SECRET;

  if (typeof relaySecret !== "string" || relaySecret.length < MIN_SECRET_LENGTH) {
    return jsonResponse(
      {
        error: `Relay secret is not configured correctly (minimum ${MIN_SECRET_LENGTH} characters required)`,
      },
      500,
    );
  }

  // 2. Enforce authentication on all requests
  if (!authenticate(request, relaySecret)) {
    return jsonResponse({ error: "Unauthorized access to relay" }, 401);
  }

  const requestUrl = new URL(request.url);

  // 3. Health check & status endpoint (when no upstream target header is supplied)
  const isStatusPath =
    requestUrl.pathname === "/health" ||
    requestUrl.pathname === "/" ||
    requestUrl.pathname === "/api";

  if (isStatusPath && !request.headers.get(TARGET_HEADER)) {
    return jsonResponse({
      status: "ok",
      service: "9router-relay",
      authenticated: true,
    });
  }

  // 4. Extract upstream routing target headers
  const target = request.headers.get(TARGET_HEADER);
  const relayPath = request.headers.get(PATH_HEADER) || "/";

  if (!target) {
    return jsonResponse(
      {
        error: `Missing required '${TARGET_HEADER}' header`,
      },
      400,
    );
  }

  // 5. Build and validate upstream URL with anti-SSRF guards
  let targetUrl: URL;
  try {
    targetUrl = buildTargetUrl(target, relayPath);
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : "Invalid relay target",
      },
      400,
    );
  }

  // 6. Sanitize headers to prevent leakage of internal proxy metadata
  const upstreamHeaders = sanitizeHeaders(request.headers);

  // 7. Prepare upstream request
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const fetchInit: RequestInit = {
    method: request.method,
    headers: upstreamHeaders,
    redirect: "manual", // Never follow redirects automatically for credentialed traffic
  };

  if (hasBody) {
    fetchInit.body = request.body;
    // @ts-ignore Standard full-duplex streaming support in modern edge runtimes
    fetchInit.duplex = "half";
  }

  // 8. Execute upstream call and stream response back to 9Router
  try {
    const upstreamResponse = await fetch(targetUrl.toString(), fetchInit);

    // Stream SSE chunks directly without buffering
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: upstreamResponse.headers,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: "Upstream relay request failed",
        detail: error instanceof Error ? error.message : String(error),
      },
      502,
    );
  }
}

/**
 * Cloudflare Workers entry point export.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env);
  },
};

/**
 * Local Bun server runner for standalone development and testing.
 */
if (import.meta.main) {
  const port = Number(process.env.PORT) || 8787;
  console.log(`9Router Edge Relay running locally on http://localhost:${port}`);
  // @ts-ignore Bun global serve API
  Bun.serve({
    port,
    fetch(req: Request) {
      return handleRequest(req);
    },
  });
}
