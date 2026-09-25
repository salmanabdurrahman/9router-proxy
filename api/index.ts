import { handleRequest } from "../src/index";

/**
 * Vercel Edge Runtime configuration.
 *
 * Configured to execute in the Singapore (sin1) region.
 * This provides ultra-low latency (~15-30ms) for users in Southeast Asia / Indonesia
 * while maintaining edge proxy routing.
 *
 * Note: If Google Antigravity or Gemini ever triggers intermittent
 * "FAILED_PRECONDITION: User location is not supported" due to cloud datacenter IP filtering,
 * switch this back to ["iad1"] (Washington, D.C., USA).
 */
export const config = {
  runtime: "edge",
  regions: ["sin1"],
};

/**
 * Vercel HTTP entry point handler.
 *
 * @param request - Standard Web API Request.
 */
export default async function handler(request: Request): Promise<Response> {
  return handleRequest(request);
}
