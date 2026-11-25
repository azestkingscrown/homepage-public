import type { RequestHandler } from "./$types";
import dns from "node:dns/promises";
import net from "node:net";

const MAX_REDIRECTS = 3;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const FETCH_TIMEOUT_MS = 10_000;

const dnsCacheMap = new Map<string, { addresses: string[]; expiredAt: number }>();

async function getCachedDnsLookupAll(hostname: string): Promise<string[]> {
  const now = Date.now();
  const cached = dnsCacheMap.get(hostname);
  if (cached && cached.expiredAt > now) {
    return cached.addresses;
  }
  const results = await dns.lookup(hostname, { all: true });
  const addresses = results.map((r) => r.address);
  dnsCacheMap.set(hostname, { addresses, expiredAt: now + 300_000 });
  return addresses;
}

const ALLOWED_HOSTS = new Set([
  "img.shields.io",
  "github-readme-stats-fast.vercel.app",
  "github-readme-stats.vercel.app",
  "streak-stats.demolab.com",
  "tokscale.ai",
  "ui-avatars.com",
  "cdn.discordapp.com",
  "api.lanyard.rest",
]);

const TRUSTED_DOMAINS = [
  "shields.io",
  "tokscale.ai",
  "discordapp.com",
  "ui-avatars.com",
  "lanyard.rest",
  "demolab.com",
];

function isAllowedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(lower)) return true;
  return TRUSTED_DOMAINS.some(
    (domain) => lower === domain || lower.endsWith(`.${domain}`),
  );
}

function isPrivateIPv4(ip: string): boolean {
  const [p1, p2] = ip.split(".").map(Number);
  if (p1 === 0 || p1 === 127 || p1 === 10) return true;
  if (p1 === 172 && p2 >= 16 && p2 <= 31) return true;
  if (p1 === 192 && p2 === 168) return true;
  if (p1 === 169 && p2 === 254) return true;
  return p1 === 100 && p2 >= 64 && p2 <= 127;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || /^[:0]+$/.test(lower)) return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  return /^fe[89ab]/.test(lower);
}

function isPrivateOrLocalIp(ip: string): boolean {
  const targetIp = ip.startsWith("::ffff:") ? ip.substring(7) : ip;
  if (net.isIPv4(targetIp)) return isPrivateIPv4(targetIp);
  if (net.isIPv6(targetIp)) return isPrivateIPv6(targetIp);
  return true;
}

async function validateTargetUrl(
  rawUrl: string,
): Promise<{ ok: true; url: URL } | { ok: false; status: number; message: string }> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return { ok: false, status: 400, message: "Invalid URL format" };
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      ok: false,
      status: 403,
      message: "Forbidden: Only HTTP and HTTPS protocols are allowed",
    };
  }

  const hostname = parsedUrl.hostname;
  if (!isAllowedHost(hostname)) {
    return {
      ok: false,
      status: 403,
      message: `Forbidden: Host '${hostname}' is not in the allowlist`,
    };
  }

  try {
    const addresses = await getCachedDnsLookupAll(hostname);
    if (addresses.length === 0 || addresses.some((addr) => isPrivateOrLocalIp(addr))) {
      return {
        ok: false,
        status: 403,
        message: "Forbidden: Access to private or internal IP address is blocked",
      };
    }
  } catch (err) {
    console.error("DNS lookup failed for hostname:", hostname, err);
    return {
      ok: false,
      status: 502,
      message: "Failed to resolve origin host address",
    };
  }

  return { ok: true, url: parsedUrl };
}

async function fetchWithValidatedRedirects(
  initialUrl: string,
): Promise<{ ok: true; response: Response } | { ok: false; response: Response }> {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validation = await validateTargetUrl(currentUrl);
    if (!validation.ok) {
      return {
        ok: false,
        response: new Response(validation.message, { status: validation.status }),
      };
    }

    const res = await fetch(validation.url.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
        Accept:
          "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location || hop === MAX_REDIRECTS) {
        return {
          ok: false,
          response: new Response("Forbidden: Too many or invalid upstream redirects", {
            status: 403,
          }),
        };
      }
      currentUrl = new URL(location, validation.url).toString();
      continue;
    }

    return { ok: true, response: res };
  }

  return { ok: false, response: new Response("Bad Gateway", { status: 502 }) };
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  const contentLength = Number.parseInt(response.headers.get("content-length") || "", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return null;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const arr = new Uint8Array(await response.arrayBuffer());
    return arr.byteLength > maxBytes ? null : arr;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

export const GET: RequestHandler = async ({ url }) => {
  const urlParam = url.searchParams.get("url");
  if (!urlParam) {
    return new Response("Missing URL parameter", { status: 400 });
  }

  try {
    const fetched = await fetchWithValidatedRedirects(urlParam);
    if (!fetched.ok) return fetched.response;
    const response = fetched.response;

    if (!response.ok) {
      return new Response(
        `Failed to fetch image from upstream: ${response.status} ${response.statusText}`,
        { status: response.status },
      );
    }

    const contentType = (response.headers.get("content-type") || "")
      .toLowerCase()
      .trim();
    if (!contentType.startsWith("image/")) {
      return new Response("Forbidden: Upstream response is not an image", {
        status: 403,
      });
    }

    const bytes = await readBoundedBody(response, MAX_IMAGE_BYTES);
    if (!bytes) {
      return new Response("Payload Too Large: Upstream image exceeds 10MB limit", {
        status: 413,
      });
    }

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": contentType.includes("svg")
        ? "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox"
        : "default-src 'none'; img-src 'self'; style-src 'none'; script-src 'none'",
    };

    return new Response(bytes as unknown as BodyInit, { headers });
  } catch (error) {
    console.error("Error proxying image:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
