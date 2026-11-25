import type { RequestHandler } from "./$types";

const TOKSCALE_USERNAME = process.env.TOKSCALE_USERNAME?.trim() || "";
const UPSTREAM_TIMEOUT_MS = 8_000;
const MAX_SVG_BYTES = 512 * 1024;
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 20;

const ALLOWED_ENUM_PARAMS = {
  theme: new Set(["dark", "light"]),
  rank: new Set(["plain", "percent", "total"]),
  tokens: new Set(["compact", "full"]),
  cost: new Set(["compact", "full"]),
  sort: new Set(["tokens", "cost"]),
  period: new Set(["all", "month", "week"]),
  template: new Set([
    "classic",
    "minimal",
    "terminal",
    "graph",
    "orbit",
    "vitals",
    "blueprint",
    "receipt",
  ]),
} as const;

const CACHE_HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
} as const;

interface CachedSvg {
  svg: string;
  updatedAt: number;
}

const svgCache = new Map<string, CachedSvg>();

function pickEnumParam<K extends keyof typeof ALLOWED_ENUM_PARAMS>(
  searchParams: URLSearchParams,
  key: K,
  fallback: string,
): string {
  const raw = searchParams.get(key)?.trim().toLowerCase();
  if (raw && ALLOWED_ENUM_PARAMS[key].has(raw)) {
    return raw;
  }
  return fallback;
}

function setCachedSvg(key: string, svg: string): void {
  if (svgCache.has(key)) {
    svgCache.delete(key);
  } else if (svgCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = svgCache.keys().next().value;
    if (oldestKey !== undefined) svgCache.delete(oldestKey);
  }
  svgCache.set(key, { svg, updatedAt: Date.now() });
}

function recolorTokscaleSvg(
  svg: string,
  theme: "dark" | "light",
  hideBorder: boolean,
): string {
  const commonReplacements: [RegExp, string][] = [
    [/rx="12"/g, 'rx="8"'],
    [/rx="11\.5"/g, 'rx="7.5"'],
    [
      /Figtree,\s*-apple-system,\s*BlinkMacSystemFont,\s*Segoe UI,\s*sans-serif/g,
      "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    ],
  ];

  const darkBorderStroke = hideBorder ? "none" : "#2e2e2e";
  const lightBorderStroke = hideBorder ? "none" : "#e0e0e0";

  const themeReplacements: [RegExp, string][] =
    theme === "light"
      ? [
          [/fill="#FFFFFF"/gi, 'fill="#ffffff"'],
          [/stroke="rgba\(31,\s*35,\s*40,\s*0\.18\)"/gi, `stroke="${lightBorderStroke}"`],
          [/stroke="rgba\(31,\s*35,\s*40,\s*0\.12\)"/gi, 'stroke="#e0e0e0"'],
          [/fill="#1F2328"/gi, 'fill="#161616"'],
          [/fill="#57606A"/gi, 'fill="#6b6b6b"'],
          [/fill="#757575"/gi, 'fill="#161616"'],
          [/fill="#0969DA"/gi, 'fill="#161616"'],
          [/fill="#1A7F37"/gi, 'fill="#239f50"'],
        ]
      : [
          [/fill="#131822"/gi, 'fill="#161616"'],
          [/fill="#191F2B"/gi, 'fill="#1a1a1a"'],
          [/stroke="rgba\(255,\s*255,\s*255,\s*0\.16\)"/gi, `stroke="${darkBorderStroke}"`],
          [/stroke="rgba\(255,\s*255,\s*255,\s*0\.09\)"/gi, 'stroke="#2e2e2e"'],
          [/fill="#F4F7FB"/gi, 'fill="#fafafa"'],
          [/fill="#A8B3C5"/gi, 'fill="#aeaeae"'],
          [/fill="#787878"/gi, 'fill="#fafafa"'],
          [/fill="#2F8FFF"/gi, 'fill="#fafafa"'],
          [/fill="#3FB950"/gi, 'fill="#54d483"'],
        ];

  let out = svg;
  for (const [pattern, replacement] of [...commonReplacements, ...themeReplacements]) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

export const GET: RequestHandler = async ({ url }) => {
  if (!TOKSCALE_USERNAME) {
    return new Response("TOKSCALE_USERNAME is not configured", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const theme = pickEnumParam(url.searchParams, "theme", "dark") as "dark" | "light";
  const rank = pickEnumParam(url.searchParams, "rank", "percent");
  const tokens = pickEnumParam(url.searchParams, "tokens", "full");
  const cost = pickEnumParam(url.searchParams, "cost", "full");
  const sort = pickEnumParam(url.searchParams, "sort", "tokens");
  const period = pickEnumParam(url.searchParams, "period", "all");
  const template = pickEnumParam(url.searchParams, "template", "classic");

  const hideBorderParam = url.searchParams.get("hide_border")?.trim().toLowerCase();
  const hideBorder = hideBorderParam === "true" || hideBorderParam === "1";

  const upstreamParams = new URLSearchParams({
    theme,
    color: "monochrome",
    rank,
    tokens,
    cost,
    sort,
    period,
    template,
  });
  if (url.searchParams.get("graph") === "1") upstreamParams.set("graph", "1");
  if (url.searchParams.get("compact") === "1") upstreamParams.set("compact", "1");

  const cacheKey = `${upstreamParams.toString()}&hide_border=${hideBorder ? "1" : "0"}`;
  const cached = svgCache.get(cacheKey);
  if (cached && Date.now() - cached.updatedAt < CACHE_TTL_MS) {
    svgCache.delete(cacheKey);
    svgCache.set(cacheKey, cached);
    return new Response(cached.svg, { status: 200, headers: CACHE_HEADERS });
  }

  try {
    const upstreamUrl = `https://tokscale.ai/api/embed/${encodeURIComponent(TOKSCALE_USERNAME)}/svg?${upstreamParams.toString()}`;
    const res = await fetch(upstreamUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      headers: {
        Accept: "image/svg+xml,application/xml;q=0.9,*/*;q=0.8",
        "User-Agent": "homepage-public/1.0",
      },
    });

    const contentType = (res.headers.get("content-type") || "").toLowerCase();
    if (!res.ok || !contentType.includes("image/svg+xml")) {
      throw new Error(`Invalid upstream response: status=${res.status} type=${contentType}`);
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_SVG_BYTES) {
      throw new Error(`Unexpected upstream SVG size: ${bytes.byteLength}`);
    }

    const rawSvg = new TextDecoder("utf-8").decode(bytes);
    if (!rawSvg.includes("<svg")) {
      throw new Error("Upstream body does not contain <svg>");
    }

    const recolored = recolorTokscaleSvg(rawSvg, theme, hideBorder);
    setCachedSvg(cacheKey, recolored);
    return new Response(recolored, { status: 200, headers: CACHE_HEADERS });
  } catch (err) {
    console.error("Failed to fetch or recolor Tokscale SVG:", err);
    if (cached) {
      return new Response(cached.svg, { status: 200, headers: CACHE_HEADERS });
    }
    return new Response("Upstream Tokscale SVG unavailable", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
};
