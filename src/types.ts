/**
 * Environment bindings across Vercel Edge and Cloudflare Workers.
 */
export interface Env {
  /**
   * Shared secret key used to authenticate 9Router relay requests.
   * Configured via Cloudflare Worker Secrets or Vercel Environment Variables.
   */
  RELAY_SECRET?: string;

  /**
   * Optional custom port when running on local dev server.
   */
  PORT?: string | number;
}

/**
 * Standard JSON response payload for API errors or status reports.
 */
export interface JsonResponsePayload {
  status?: string;
  service?: string;
  authenticated?: boolean;
  error?: string;
  detail?: string;
}
