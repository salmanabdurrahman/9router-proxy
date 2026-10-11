# 9Router Edge Relay

High-performance, secure Edge relay for **9Router** with dual deployment support (**Cloudflare Workers** and **Vercel Edge**), region locking, anti-SSRF protection, constant-time authentication, and Server-Sent Events (SSE) streaming support.

## Why this relay exists

When integrating upstream AI providers (such as Google Gemini, Google Antigravity, Anthropic Claude, or OpenAI), two primary edge challenges frequently arise:

1. **Geographic Routing & Provider Geoblocking**:
   Certain AI models enforce strict geographic filtering (`FAILED_PRECONDITION: User location is not supported for the API use`). Default Anycast routing from Southeast Asia may traverse unapproved transit points (such as Hong Kong or Taiwan), triggering instant blocks even if the user's home country is supported.
   - **Solution**: Pin egress execution explicitly to supported regions: **Singapore** (~15–30 ms from SE Asia / Indonesia) or **US** (~180–220 ms trans-Pacific fallback).

2. **Payload Size Constraints (Screenshots & Vision)**:
   Modern LLM workflows frequently send high-resolution screenshots or multi-image payloads as base64 data.
   - **Vercel Edge / Serverless**: Imposes a hard **4.5 MB** incoming request body limit. Requests exceeding 4.5 MB are rejected with HTTP 413 (`FUNCTION_PAYLOAD_TOO_LARGE`).
   - **Cloudflare Workers**: Supports up to **100 MB** request bodies across Free and Paid accounts, eliminating payload bottlenecks for multimodal workflows.

This relay provides a unified codebase (`src/index.ts`) compatible with both runtimes, losslessly proxying SSE streams while isolating sensitive tokens and blocking SSRF.

## Platform Comparison: Cloudflare Workers vs. Vercel Edge

| Feature / Dimension          | Cloudflare Workers                          | Vercel Edge                                      |
| :--------------------------- | :------------------------------------------ | :----------------------------------------------- |
| **Max Request Body**         | **100 MB** (Ideal for screenshots & vision) | **4.5 MB** (Sufficient for text & code)          |
| **Region Pinning**           | Placement Hints (`[placement]`)             | Edge Function Regions (`regions: [...]`)         |
| **Default Region (SE Asia)** | `aws:ap-southeast-1` (Singapore, ~15–30 ms) | `sin1` (Singapore, ~15–30 ms)                    |
| **Fallback Region (US)**     | `aws:us-east-1` (US East, ~180–220 ms)      | `iad1` (Washington D.C., ~180–220 ms)            |
| **SSE Streaming**            | Native (`duplex: "half"`)                   | Native (`duplex: "half"`)                        |
| **Primary Use Case**         | Vision models, heavy payloads, multimodal   | Lightweight text/code chat, Vercel-native stacks |

## Security Features

- **Mandatory Authentication**: Rejects any request missing `x-relay-secret` header or `?key=` query parameter.
- **Constant-Time Comparison**: Protects against timing attacks when validating the secret (`safeEqual`).
- **Minimum Secret Length**: Enforces secrets of at least 16 characters.
- **Anti-SSRF & Protocol Enforcement**:
  - Restricts upstream targets strictly to `https://` on standard port `443`.
  - Prohibits embedded credentials, sub-path smuggling in target origins, backslashes, fragments, and protocol-relative tricks (`//evil.com`).
  - Blocks private IP ranges, loopback (`127.0.0.1`), and link-local addresses.
- **Lossless Header Sanitization**: Strips hop-by-hop headers, runtime-specific tracing headers, and forwarding IPs while preserving provider authorization headers (`authorization`, etc.).
- **Manual Redirect Handling**: Upstream redirects are never automatically followed, preventing credential leakage across origins.

## Deployment & Configuration

### Option A: Cloudflare Workers (Recommended for Large Screenshots)

Cloudflare Workers handles requests up to 100 MB and uses Placement Hints to steer execution close to the specified cloud region.

#### 1. Region Configuration (`wrangler.toml`)

- **Default (Singapore)**:
  ```toml
  [placement]
  mode = "targeted"
  region = "aws:ap-southeast-1"
  ```
- **Fallback (US East)** (switch if Google ever reports location unsupported):
  ```toml
  [placement]
  mode = "targeted"
  region = "aws:us-east-1"
  ```

#### 2. Set Secret in Cloudflare

```bash
npx wrangler secret put RELAY_SECRET
```

_Enter a random secret with at least 16 characters (e.g. generated via `openssl rand -hex 24`)._

#### 3. Deploy

```bash
npm run deploy:cf
```

#### 4. Live Log Inspection

```bash
npx wrangler tail
```

### Option B: Vercel Edge (Alternative for Standard Payloads <= 4.5 MB)

Vercel Edge provides free hosting with native region pinning in Singapore (`sin1`) or Washington D.C. (`iad1`).

#### 1. Region Configuration (`vercel.json` & `api/index.ts`)

- **Default (Singapore)**:
  - In `vercel.json`: `"regions": ["sin1"]`
  - In `api/index.ts`: `regions: ["sin1"]`
- **Fallback (US Washington D.C.)**:
  - In `vercel.json`: `"regions": ["iad1"]`
  - In `api/index.ts`: `regions: ["iad1"]`

#### 2. Deploy & Setup via Vercel CLI

```bash
# 1. Login and link project
npx vercel

# 2. Set Environment Variable in Vercel Dashboard (or via CLI)
# Key: RELAY_SECRET (min 16 chars)
# Scope: Production, Preview, Development
npx vercel env add RELAY_SECRET

# 3. IMPORTANT: Disable Deployment Protection
# In Vercel Project Dashboard → Settings → Deployment Protection:
# Set 'Vercel Authentication' to Disabled (prevents HTTP 403 on relay calls)

# 4. Deploy to Production
npm run deploy:vercel
```

## Configuring in 9Router

1. Open your **9Router Dashboard** (`http://localhost:20128`).
2. Navigate to **Proxy Pools** (or Provider Connection Settings).
3. Add a new Relay endpoint:
   - **Relay URL**:
     - Cloudflare: `https://9router-relay.<your-subdomain>.workers.dev` (or your custom domain)
     - Vercel: `https://<your-project>.vercel.app` (or your custom domain)
   - **Secret Header**: `x-relay-secret: <YOUR_RELAY_SECRET>` (or append `?key=<YOUR_RELAY_SECRET>` to the URL).
4. Save and test the upstream connection.

## Verification & Health Check

Verify that the relay is active and enforcing security:

### Cloudflare Workers Endpoint

```bash
# 1. Unauthenticated check (Expected: 401 Unauthorized)
curl -i https://9router-relay.<your-subdomain>.workers.dev/health

# 2. Authenticated health check via header (Expected: 200 OK)
curl -i -H "x-relay-secret: YOUR_SECRET_HERE" https://9router-relay.<your-subdomain>.workers.dev/health

# 3. Authenticated health check via query param (Expected: 200 OK)
curl -i "https://9router-relay.<your-subdomain>.workers.dev/health?key=YOUR_SECRET_HERE"
```

### Vercel Edge Endpoint

```bash
# 1. Unauthenticated check (Expected: 401 Unauthorized)
curl -i https://<your-project>.vercel.app/health

# 2. Authenticated health check via header (Expected: 200 OK)
curl -i -H "x-relay-secret: YOUR_SECRET_HERE" https://<your-project>.vercel.app/health

# 3. Authenticated health check via query param (Expected: 200 OK)
curl -i "https://<your-project>.vercel.app/health?key=YOUR_SECRET_HERE"
```

## Local Development & Testing

Run automated tests:

```bash
bun test
```

Start local relay development server:

```bash
RELAY_SECRET=test-secret-at-least-16-chars bun run dev
```

Server listens on `http://localhost:8787`.
