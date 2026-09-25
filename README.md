# 9Router Edge Relay

High-performance, secure Edge relay for **9Router** with region locking, anti-SSRF protection, constant-time authentication, and Server-Sent Events (SSE) streaming support.

## Why this relay exists

When calling upstream AI providers (such as Google Gemini, Google Antigravity, Anthropic Claude, or OpenAI), users from certain regions may encounter geographic or network blocks (e.g. `FAILED_PRECONDITION: User location is not supported for the API use`).

Using standard Cloudflare Workers can sometimes trigger this error because Cloudflare's Anycast network frequently routes traffic from Southeast Asia through **Hong Kong (HKG)** or **Taiwan**, which Google Gemini blocks entirely.

This relay solves that issue by:

1. Running on **Vercel Edge** with region locking explicitly pinned to **`iad1` (Washington D.C., USA)** or **`sin1` (Singapore)**.
2. Losslessly forwarding headers (`Authorization`, `x-api-key`, etc.) while stripping proxy and edge metadata to prevent provider leakage.
3. Enforcing constant-time secret comparison and strict URL validation to prevent open relay and SSRF attacks.
4. Preserving real-time streaming tokens (`duplex: "half"` with raw SSE chunk pass-through).

## Security Features

- **Mandatory Authentication**: Rejects any request missing `x-relay-secret` header or `?key=` query parameter.
- **Constant-Time Comparison**: Protects against timing attacks when validating the secret.
- **Minimum Secret Length**: Enforces secrets of at least 16 characters.
- **Anti-SSRF & Protocol Enforcement**:
  - Restricts targets strictly to `https://` on standard port `443`.
  - Prohibits embedded credentials, sub-path smuggling in target origins, backslashes, fragments, and protocol-relative tricks (`//evil.com`).
- **Lossless Header Sanitization**: Strips internal hop-by-hop headers, Cloudflare/Vercel tracking headers, and forward IPs without breaking provider authorization.
- **Manual Redirect Handling**: Upstream redirects are never automatically followed, preventing credential leakage across origins.

## Region Selection Strategy: Singapore (`sin1`) vs US (`iad1`)

The edge relay's execution region is controlled in `vercel.json` and `api/index.ts`:

| Region                                     | Latency from Indonesia              | Google Antigravity / Gemini Posture                 | Recommended For                           |
| :----------------------------------------- | :---------------------------------- | :-------------------------------------------------- | :---------------------------------------- |
| **Singapore (`sin1`)** _(Current default)_ | **~15–30 ms** (Ultra-fast TTFB)     | Supported; occasional datacenter IP false-positives | Everyday coding, instant token generation |
| **US Washington D.C. (`iad1`)**            | **~180–220 ms** (Trans-Pacific RTT) | Tier-1 Home Region; 100% immune to region errors    | Fallback if `FAILED_PRECONDITION` occurs  |

### Switching Regions

To switch between regions:

1. In `vercel.json`: Change `"regions": ["sin1"]` to `"regions": ["iad1"]` (or vice-versa).
2. In `api/index.ts`: Update `regions: ["sin1"]`.
3. Commit and push: Vercel automatically deploys the updated edge location within seconds.

## Deployment Guide

### Option 1: Deploy to Vercel (Recommended for Google Antigravity)

Vercel Hobby plan is 100% free and allows pinning your edge function region to the US (`iad1`).

1. **Install Vercel CLI (or connect via GitHub)**:

   ```bash
   npm i -g vercel
   ```

2. **Deploy project**:

   ```bash
   cd ~/Development/9router-proxy
   vercel
   ```

3. **Set Environment Variable in Vercel**:
   - Go to your Vercel Project Dashboard → **Settings** → **Environment Variables**.
   - Add key: `RELAY_SECRET`
   - Value: Generate a strong random key (e.g. `openssl rand -hex 24`).
   - Scope: Production, Preview, Development.

4. **IMPORTANT — Disable Deployment Protection**:
   - In Vercel Project Dashboard → **Settings** → **Deployment Protection**.
   - Ensure **Vercel Authentication** is set to **Disabled** (otherwise Vercel returns HTTP 403 Access Denied to 9Router requests).

5. **Deploy to Production**:
   ```bash
   vercel --prod
   ```

### Option 2: Deploy to Cloudflare Workers (Alternative)

If you prefer Cloudflare Workers:

1. **Set Secret**:

   ```bash
   wrangler secret put RELAY_SECRET
   ```

   Enter your secret key when prompted.

2. **Deploy**:
   ```bash
   npm run deploy:cf
   ```

## Configuring in 9Router

1. Open your **9Router Dashboard** (`http://localhost:20128`).
2. Navigate to **Proxy Pools** (or Provider Connection Settings).
3. Add a new Relay endpoint:
   - **Relay URL**: `https://your-relay-domain.vercel.app`
   - **Secret Header**: `x-relay-secret: <YOUR_RELAY_SECRET>` (or append `?key=<YOUR_RELAY_SECRET>` to the URL).
4. Save and test the connection.

## Verification & Health Check

Test that your deployed relay is operational and properly protected:

```bash
# 1. Unauthenticated request (Expected: 401 Unauthorized)
curl -i https://your-relay-domain.vercel.app/health

# 2. Authenticated health check (Expected: 200 OK)
curl -i -H "x-relay-secret: YOUR_SECRET_HERE" https://your-relay-domain.vercel.app/health

# 3. Via query parameter (Expected: 200 OK)
curl -i "https://your-relay-domain.vercel.app/health?key=YOUR_SECRET_HERE"
```

## Local Development & Testing

Run automated tests:

```bash
bun test
```

Start local relay server:

```bash
RELAY_SECRET=test-secret-at-least-16-chars bun run dev
```

Server starts on `http://localhost:8787`.
