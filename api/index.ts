import { handleRequest } from "../src/index";

/**
 * Vercel Edge Runtime configuration.
 *
 * Explicitly locks edge function execution to the Washington, D.C. (iad1) region.
 * This guarantees egress via US datacenter IPs, preventing Google Gemini and Antigravity
 * from rejecting requests due to Hong Kong (HKG) Anycast transit or unsupported regions.
 */
export const config = {
  runtime: "edge",
  regions: ["iad1"],
};

/**
 * Vercel HTTP entry point handler.
 *
 * @param request - Standard Web API Request.
 */
export default async function handler(request: Request): Promise<Response> {
  return handleRequest(request);
}
