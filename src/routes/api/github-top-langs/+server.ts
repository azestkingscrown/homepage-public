import type { RequestHandler } from "./$types";
import { getGitHubTopLangs, type GitHubTopLangsData } from "#lib/server/githubStats.ts";

const FONT_SANS =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

const CACHE_HEADERS = {
  "Content-Type": "image/svg+xml; charset=utf-8",
  "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
} as const;

function escapeXml(unsafe: string): string {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

function buildThemeCss(themeParam: string, hideBorder: boolean): string {
  const darkVars = `
  .card-bg { fill: #161616; stroke: ${hideBorder ? "none" : "#2e2e2e"}; }
  .header { fill: #fafafa; }
  .lang-name { fill: #aeaeae; }`;

  const lightVars = `
  .card-bg { fill: #ffffff; stroke: ${hideBorder ? "none" : "#e0e0e0"}; }
  .header { fill: #161616; }
  .lang-name { fill: #5c5c5c; }`;

  if (themeParam === "light") return lightVars;
  if (themeParam === "dark") return darkVars;
  return `${darkVars}
@media (prefers-color-scheme: light) {${lightVars}
}`;
}

function renderTopLangsSvg(
  data: GitHubTopLangsData,
  themeParam: string,
  hideBorder: boolean,
): string {
  const cardWidth = 360;
  const barX = 25;
  const barWidth = cardWidth - barX * 2;
  const barHeight = 8;

  const rowsCount = Math.ceil(data.languages.length / 2);
  const cardHeight = Math.max(150, 96 + rowsCount * 26 + 16);

  let currentX = 0;
  const barSegments = data.languages
    .map((lang, idx) => {
      const segWidth =
        idx === data.languages.length - 1
          ? Math.max(0, barWidth - currentX)
          : (lang.percentage / 100) * barWidth;
      const rect = `<rect x="${currentX.toFixed(2)}" y="0" width="${segWidth.toFixed(2)}" height="${barHeight}" fill="${escapeXml(lang.color)}" />`;
      currentX += segWidth;
      return rect;
    })
    .join("");

  const legendItems = data.languages
    .map((lang, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = col === 0 ? 25 : 195;
      const y = row * 26;
      return `
    <g transform="translate(${x}, ${y})">
      <circle cx="5" cy="6" r="5" fill="${escapeXml(lang.color)}" />
      <text class="lang-name" x="15" y="10">${escapeXml(lang.name)} ${lang.percentage.toFixed(2)}%</text>
    </g>`;
    })
    .join("");

  const desc = escapeXml(
    data.languages.map((l) => `${l.name} ${l.percentage.toFixed(2)}%`).join(", "),
  );

  return `<svg width="${cardWidth}" height="${cardHeight}" viewBox="0 0 ${cardWidth} ${cardHeight}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="titleId descId">
  <title id="titleId">Most Used Languages</title>
  <desc id="descId">${desc}</desc>
  <style>
    ${buildThemeCss(themeParam, hideBorder)}
    .header { font: 600 18px ${FONT_SANS}; }
    .lang-name { font: 500 12px ${FONT_SANS}; }
  </style>
  <defs>
    <clipPath id="progress-clip">
      <rect x="0" y="0" width="${barWidth}" height="${barHeight}" rx="4" />
    </clipPath>
  </defs>
  <rect class="card-bg" x="0.5" y="0.5" rx="8" width="${cardWidth - 1}" height="${cardHeight - 1}" />
  <g transform="translate(25, 35)">
    <text x="0" y="0" class="header">Most Used Languages</text>
  </g>
  <g transform="translate(${barX}, 54)" clip-path="url(#progress-clip)">
    ${barSegments}
  </g>
  <g transform="translate(0, 82)">${legendItems}
  </g>
</svg>`;
}

export const GET: RequestHandler = async ({ url }) => {
  const themeRaw = url.searchParams.get("theme")?.trim().toLowerCase() || "dark";
  const theme =
    themeRaw === "light" || themeRaw === "dark" || themeRaw === "auto"
      ? themeRaw
      : "dark";

  const hideBorderRaw = url.searchParams.get("hide_border")?.trim().toLowerCase();
  const hideBorder = hideBorderRaw === "true" || hideBorderRaw === "1";

  const countParam = Number.parseInt(url.searchParams.get("langs_count") || "6", 10);
  const langsCount = Number.isFinite(countParam) ? countParam : 6;

  try {
    const data = await getGitHubTopLangs(langsCount);
    const svg = renderTopLangsSvg(data, theme, hideBorder);
    return new Response(svg, { status: 200, headers: CACHE_HEADERS });
  } catch (err) {
    console.error("GitHub Top Langs SVG error:", err);
    return new Response("GitHub Top Languages unavailable", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
};
