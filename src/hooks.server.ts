import type { Handle } from "@sveltejs/kit/hooks";
import { detectLocale, LOCALE_COOKIE } from "#lib/i18n.ts";
import { getDiscordSession } from "#lib/server/auth.ts";
import {
  extractClientIp,
  safePeerIp,
  timingSafeEqualStr,
} from "#lib/server/session.ts";

const EXTRA_TRUSTED_ORIGINS = (process.env.TRUSTED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const TRUSTED_ORIGINS = new Set([
  "https://example.com",
  "https://www.example.com",
  "https://chzzk.example.com",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...EXTRA_TRUSTED_ORIGINS,
]);

const CSRF_EXEMPT_PATHS = new Set(["/api/ddns/update", "/nic/update"]);
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function isFormLikeContentType(contentType: string): boolean {
  const mime = contentType.split(";")[0].trim().toLowerCase();
  return (
    mime === "" ||
    mime === "application/x-www-form-urlencoded" ||
    mime === "multipart/form-data" ||
    mime === "text/plain"
  );
}

interface RateLimitRule {
  prefix: string;
  max: number;
  windowMs: number;
}

const MAX_RATE_LIMIT_ENTRIES = 10_000;
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMIT_RULES: RateLimitRule[] = [
  { prefix: "/api/server-status", max: 120, windowMs: 60_000 },
  { prefix: "/api/discord-status", max: 120, windowMs: 60_000 },
  { prefix: "/api/tokscale-status", max: 120, windowMs: 60_000 },
  { prefix: "/api/proxy-image", max: 120, windowMs: 60_000 },
  { prefix: "/api/status", max: 600, windowMs: 60_000 },
  { prefix: "/api/server", max: 20, windowMs: 60_000 },
  { prefix: "/api/r2/upload", max: 600, windowMs: 60_000 },
  { prefix: "/api/r2", max: 180, windowMs: 60_000 },
  { prefix: "/api/drive/upload", max: 600, windowMs: 60_000 },
  { prefix: "/api/drive/stream", max: 600, windowMs: 60_000 },
  { prefix: "/api/drive/ticket", max: 120, windowMs: 60_000 },
  { prefix: "/api/drive/content", max: 240, windowMs: 60_000 },
  { prefix: "/api/drive", max: 180, windowMs: 60_000 },
  { prefix: "/api/upload", max: 30, windowMs: 60_000 },
  { prefix: "/api/delete", max: 10, windowMs: 60_000 },
  { prefix: "/api/images", max: 30, windowMs: 60_000 },
  { prefix: "/api/ddns/update", max: 30, windowMs: 60_000 },
  { prefix: "/api/ddns/myip", max: 60, windowMs: 60_000 },
  { prefix: "/api/ddns", max: 40, windowMs: 60_000 },
  { prefix: "/nic/update", max: 30, windowMs: 60_000 },
  { prefix: "/api/auth/signin", max: 20, windowMs: 60_000 },
  { prefix: "/api/auth/callback", max: 20, windowMs: 60_000 },
  { prefix: "/api/auth/signout", max: 20, windowMs: 60_000 },
  { prefix: "/api/discord", max: 60, windowMs: 60_000 },
  { prefix: "/uploads", max: 180, windowMs: 60_000 },
];

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap.entries()) {
    if (val.resetAt < now) {
      rateLimitMap.delete(key);
    }
  }
}, 300_000).unref();

function evictRateLimitIfNeeded(now: number): void {
  if (rateLimitMap.size < MAX_RATE_LIMIT_ENTRIES) return;
  for (const [k, v] of rateLimitMap.entries()) {
    if (v.resetAt < now) rateLimitMap.delete(k);
  }
  while (rateLimitMap.size >= MAX_RATE_LIMIT_ENTRIES) {
    const oldestKey = rateLimitMap.keys().next().value;
    if (oldestKey === undefined) break;
    rateLimitMap.delete(oldestKey);
  }
}

function checkRateLimit(ip: string, pathname: string): {
  allowed: boolean;
  limit: number;
} {
  const rule = RATE_LIMIT_RULES.find(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`),
  );
  if (!rule) return { allowed: true, limit: 60 };

  const key = `${ip}:${rule.prefix}`;
  const now = Date.now();

  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    if (!entry) evictRateLimitIfNeeded(now);
    rateLimitMap.set(key, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, limit: rule.max };
  }

  entry.count += 1;
  return { allowed: entry.count <= rule.max, limit: rule.max };
}

function isHiddenDotPath(pathname: string): boolean {
  let decoded = pathname;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    decoded = pathname;
  }

  const isWellKnown =
    (decoded === "/.well-known" || decoded.startsWith("/.well-known/")) &&
    !decoded.includes("..");

  return !isWellKnown && /(^|\/)\./.test(decoded);
}

function checkCsrfViolation(request: Request, url: URL): Response | null {
  const method = request.method.toUpperCase();
  if (!MUTATING_METHODS.has(method) || CSRF_EXEMPT_PATHS.has(url.pathname)) {
    return null;
  }

  const origin = request.headers.get("origin");
  if (origin) {
    if (origin !== url.origin && !TRUSTED_ORIGINS.has(origin)) {
      return Response.json(
        { error: "허용되지 않은 Origin 요청입니다." },
        { status: 403 },
      );
    }
    return null;
  }

  const contentType = request.headers.get("content-type") || "";
  const secFetchSite = request.headers.get("sec-fetch-site") || "";
  const hasCookie = Boolean(request.headers.get("cookie"));
  const isSuspiciousForm =
    hasCookie &&
    isFormLikeContentType(contentType) &&
    secFetchSite !== "same-origin";

  if (secFetchSite === "cross-site" || isSuspiciousForm) {
    return Response.json(
      { error: "Cross-site 요청이 차단되었습니다." },
      { status: 403 },
    );
  }
  return null;
}

function isMonitorAgentRequest(headers: Headers): boolean {
  const tabletToken = headers.get("x-tablet-token");
  const miniToken = headers.get("x-mini-token");
  const secretTabletToken = process.env.TABLET_MONITOR_TOKEN;
  const secretMiniToken = process.env.MINI_MONITOR_TOKEN || secretTabletToken;

  return (
    timingSafeEqualStr(tabletToken, secretTabletToken) ||
    timingSafeEqualStr(miniToken, secretMiniToken)
  );
}

function ensureHtmlVary(headers: Headers): void {
  const existing = headers.get("Vary");
  if (!existing) {
    headers.set("Vary", "Accept-Language, Cookie");
    return;
  }
  const parts = new Set(
    existing
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  );
  parts.add("Accept-Language");
  parts.add("Cookie");
  headers.set("Vary", [...parts].join(", "));
}

function applySecurityHeaders(response: Response, pathname: string): Response {
  const headers = new Headers(response.headers);
  headers.set("X-XSS-Protection", "1; mode=block");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "SAMEORIGIN");
  headers.set("Strict-Transport-Security", "max-age=31536000");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()",
  );
  headers.set("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  headers.set("Cross-Origin-Embedder-Policy", "credentialless");
  const isPublicEmbed =
    pathname.startsWith("/uploads/") ||
    pathname.startsWith("/api/discord-status") ||
    pathname.startsWith("/api/server-status") ||
    pathname.startsWith("/api/tokscale-status");
  headers.set(
    "Cross-Origin-Resource-Policy",
    isPublicEmbed ? "cross-origin" : "same-origin",
  );

  const isHtml = (headers.get("content-type") || "").includes("text/html");

  if (pathname.startsWith("/uploads/")) {
    if (!headers.has("Content-Disposition")) {
      headers.set("Content-Disposition", "attachment");
    }
    headers.set(
      "Content-Security-Policy",
      "default-src 'none'; img-src 'self'; style-src 'none'; script-src 'none'",
    );
  } else if (!headers.has("Content-Security-Policy") && isHtml) {
    headers.set(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
    );
  }

  if (isHtml) {
    ensureHtmlVary(headers);
  }

  if (
    pathname.startsWith("/api/discord-status") ||
    pathname.startsWith("/api/tokscale-status")
  ) {
    headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const handle: Handle = async ({ event, resolve }) => {
  const { pathname } = event.url;

  if (isHiddenDotPath(pathname)) {
    return new Response(null, {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const csrfError = checkCsrfViolation(event.request, event.url);
  if (csrfError) return csrfError;

  const isRateLimitedPath =
    pathname.startsWith("/api/") ||
    pathname === "/nic/update" ||
    pathname.startsWith("/uploads/");
  const bypassRateLimit =
    pathname === "/api/status" && isMonitorAgentRequest(event.request.headers);

  if (isRateLimitedPath && !bypassRateLimit) {
    const ip = extractClientIp(
      event.request.headers,
      safePeerIp(event.getClientAddress),
    );
    const { allowed, limit } = checkRateLimit(ip, pathname);
    if (!allowed) {
      return Response.json(
        { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
        {
          status: 429,
          headers: {
            "Retry-After": "60",
            "X-RateLimit-Limit": String(limit),
          },
        },
      );
    }
  }

  event.locals.session = getDiscordSession(event.cookies);
  event.locals.host =
    event.request.headers.get("host") ||
    event.url.host ||
    "example.com";
  event.locals.locale = detectLocale(
    event.cookies.get(LOCALE_COOKIE),
    event.request.headers.get("accept-language"),
    event.request.headers.get("user-agent"),
  );

  const locale = event.locals.locale;
  const response = await resolve(event, {
    transformPageChunk: ({ html }) => {
      let out = html.replace('<html lang="ko">', `<html lang="${locale}">`);
      const nonceMatch = out.match(/<script nonce="([^"]+)">/);
      if (nonceMatch) {
        out = out.replaceAll(
          'rel="modulepreload">',
          `rel="modulepreload" nonce="${nonceMatch[1]}">`,
        );
      }
      return out;
    },
  });
  return applySecurityHeaders(response, pathname);
};
