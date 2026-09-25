import { describe, expect, it } from "bun:test";
import { authenticate, safeEqual } from "../src/auth";
import { MIN_SECRET_LENGTH } from "../src/constants";
import { sanitizeHeaders } from "../src/headers";
import { handleRequest } from "../src/index";
import { buildTargetUrl } from "../src/target";

describe("Constant-Time String Comparison (safeEqual)", () => {
  it("returns true for identical strings", () => {
    expect(safeEqual("super-secret-key-12345", "super-secret-key-12345")).toBe(true);
    expect(safeEqual("", "")).toBe(true);
  });

  it("returns false for different contents or lengths", () => {
    expect(safeEqual("super-secret-key-12345", "super-secret-key-12346")).toBe(false);
    expect(safeEqual("short", "longer-string")).toBe(false);
  });

  it("returns false for invalid inputs", () => {
    // @ts-ignore
    expect(safeEqual(null, "secret")).toBe(false);
    // @ts-ignore
    expect(safeEqual("secret", undefined)).toBe(false);
  });
});

describe("Authentication Gate (authenticate)", () => {
  const secret = "a-very-long-secret-key-for-test-32b";

  it("authenticates using x-relay-secret header", () => {
    const req = new Request("https://relay.example.com/", {
      headers: { "x-relay-secret": secret },
    });
    expect(authenticate(req, secret)).toBe(true);
  });

  it("authenticates using query parameter key", () => {
    const req = new Request(`https://relay.example.com/?key=${encodeURIComponent(secret)}`);
    expect(authenticate(req, secret)).toBe(true);
  });

  it("rejects unauthorized or mismatched secret", () => {
    const req1 = new Request("https://relay.example.com/");
    expect(authenticate(req1, secret)).toBe(false);

    const req2 = new Request("https://relay.example.com/", {
      headers: { "x-relay-secret": "wrong-secret-token" },
    });
    expect(authenticate(req2, secret)).toBe(false);
  });
});

describe("Target URL Validation & Anti-SSRF (buildTargetUrl)", () => {
  it("builds a valid target URL with query params correctly", () => {
    const url = buildTargetUrl("https://api.openai.com", "/v1/chat/completions?stream=true");
    expect(url.toString()).toBe("https://api.openai.com/v1/chat/completions?stream=true");
    expect(url.origin).toBe("https://api.openai.com");
    expect(url.pathname).toBe("/v1/chat/completions");
    expect(url.search).toBe("?stream=true");
  });

  it("rejects non-HTTPS protocols", () => {
    expect(() => buildTargetUrl("http://api.openai.com", "/v1/models")).toThrow(
      "Only HTTPS targets are allowed",
    );
  });

  it("rejects non-standard ports", () => {
    expect(() => buildTargetUrl("https://api.openai.com:8443", "/v1/models")).toThrow(
      "Only HTTPS port 443 is allowed",
    );
  });

  it("rejects embedded credentials", () => {
    expect(() => buildTargetUrl("https://user:pass@api.openai.com", "/v1/models")).toThrow(
      "Target credentials are not allowed",
    );
  });

  it("rejects sub-paths embedded in target origin", () => {
    expect(() => buildTargetUrl("https://api.openai.com/v1", "/chat")).toThrow(
      "x-relay-target must contain only the target origin",
    );
  });

  it("rejects protocol-relative paths", () => {
    expect(() => buildTargetUrl("https://api.openai.com", "//evil.com/leak")).toThrow(
      "protocol-relative path prohibited",
    );
  });

  it("rejects backslashes in paths", () => {
    expect(() => buildTargetUrl("https://api.openai.com", "/v1\\models")).toThrow(
      "backslashes prohibited",
    );
  });

  it("rejects fragments in paths", () => {
    expect(() => buildTargetUrl("https://api.openai.com", "/v1/models#section")).toThrow(
      "Fragments are not allowed",
    );
  });
});

describe("Header Sanitization (sanitizeHeaders)", () => {
  it("strips internal and hop-by-hop headers while preserving provider auth", () => {
    const rawHeaders = new Headers({
      "x-relay-secret": "secret",
      "x-relay-target": "https://api.anthropic.com",
      "x-relay-path": "/v1/messages",
      host: "relay.example.com",
      "cf-connecting-ip": "1.2.3.4",
      "cf-ray": "12345abcde",
      "x-vercel-id": "iad1:12345",
      "x-forwarded-for": "1.2.3.4",
      connection: "keep-alive",
      authorization: "Bearer test-api-key",
      "x-api-key": "anthropic-key-sample",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "user-agent": "Claude-Code/1.0",
    });

    const sanitized = sanitizeHeaders(rawHeaders);

    // Stripped headers
    expect(sanitized["x-relay-secret"]).toBeUndefined();
    expect(sanitized["x-relay-target"]).toBeUndefined();
    expect(sanitized["x-relay-path"]).toBeUndefined();
    expect(sanitized["host"]).toBeUndefined();
    expect(sanitized["cf-connecting-ip"]).toBeUndefined();
    expect(sanitized["cf-ray"]).toBeUndefined();
    expect(sanitized["x-vercel-id"]).toBeUndefined();
    expect(sanitized["x-forwarded-for"]).toBeUndefined();
    expect(sanitized["connection"]).toBeUndefined();

    // Preserved headers
    expect(sanitized["authorization"]).toBe("Bearer test-api-key");
    expect(sanitized["x-api-key"]).toBe("anthropic-key-sample");
    expect(sanitized["anthropic-version"]).toBe("2023-06-01");
    expect(sanitized["content-type"]).toBe("application/json");
    expect(sanitized["user-agent"]).toBe("Claude-Code/1.0");
  });
});

describe("Relay Request Handler (handleRequest)", () => {
  const secret = "test-secret-at-least-16-characters-long";
  const env = { RELAY_SECRET: secret };

  it("returns 500 when secret is too short or missing", async () => {
    const req = new Request("https://relay.example.com/health");
    const res = await handleRequest(req, { RELAY_SECRET: "short" });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain(`minimum ${MIN_SECRET_LENGTH}`);
  });

  it("returns 401 when request is unauthenticated", async () => {
    const req = new Request("https://relay.example.com/health");
    const res = await handleRequest(req, env);
    expect(res.status).toBe(401);
  });

  it("returns 200 on /health when authenticated", async () => {
    const req = new Request("https://relay.example.com/health", {
      headers: { "x-relay-secret": secret },
    });
    const res = await handleRequest(req, env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("9router-relay");
    expect(body.authenticated).toBe(true);
  });

  it("returns 400 when x-relay-target is missing", async () => {
    const req = new Request("https://relay.example.com/v1/chat/completions", {
      headers: { "x-relay-secret": secret },
    });
    const res = await handleRequest(req, env);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required 'x-relay-target'");
  });
});
