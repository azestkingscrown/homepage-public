import type { Handle } from "@sveltejs/kit/hooks";
import { detectLocale, LOCALE_COOKIE } from "#lib/i18n.ts";
import { getDiscordSession } from "#lib/server/auth.ts";
import { extractClientIp, timingSafeEqualStr } from "#lib/server/session.ts";

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

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  "/api/server": { max: 20, windowMs: 60_000 },
  "/api/upload": { max: 10, windowMs: 60_000 },
  "/api/delete": { max: 10, windowMs: 60_000 },
  "/api/images": { max: 30, windowMs: 60_000 },
  "/api/proxy-image": { max: 120, windowMs: 60_000 },
  "/api/status": { max: 600, windowMs: 60_000 },
};

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of rateLimitMap.entries()) {
    if (val.resetAt < now) {
      rateLimitMap.delete(key);
    }
  }
}, 300_000).unref();

function checkRateLimit(ip: string, pathname: string): {
  allowed: boolean;
  limit: number;
} {
  const limitConfig = Object.entries(RATE_LIMITS).find(([p]) =>
    pathname.startsWith(p),
  );
  if (!limitConfig) return { allowed: true, limit: 60 };

  const { max, windowMs } = limitConfig[1];
  const key = `${ip}:${pathname}`;
  const now = Date.now();

  const entry = rateLimitMap.get(key);
  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, limit: max };
  }

  entry.count += 1;
  return { allowed: entry.count <= max, limit: max };
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
    headers.set("Content-Disposition", "inline");
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

  if (pathname.startsWith("/api/") && !isMonitorAgentRequest(event.request.headers)) {
    const ip = extractClientIp(event.request.headers);
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
