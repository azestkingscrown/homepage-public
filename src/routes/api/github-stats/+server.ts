import type { RequestHandler } from "./$types";
import { getGitHubStats, type GitHubStatsData } from "#lib/server/githubStats.ts";

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
  .stat { fill: #aeaeae; }
  .icon { fill: #dbdbdb; }
  .rank-text { fill: #fafafa; }
  .rank-circle-rim { stroke: #fafafa; opacity: 0.2; }
  .rank-circle { stroke: #fafafa; opacity: 0.85; }`;

  const lightVars = `
  .card-bg { fill: #ffffff; stroke: ${hideBorder ? "none" : "#e0e0e0"}; }
  .header { fill: #161616; }
  .stat { fill: #5c5c5c; }
  .icon { fill: #5c5c5c; }
  .rank-text { fill: #161616; }
  .rank-circle-rim { stroke: #161616; opacity: 0.16; }
  .rank-circle { stroke: #161616; opacity: 0.85; }`;

  if (themeParam === "light") return lightVars;
  if (themeParam === "dark") return darkVars;
  return `${darkVars}
@media (prefers-color-scheme: light) {${lightVars}
}`;
}

function renderGitHubStatsSvg(
  stats: GitHubStatsData,
  themeParam: string,
  hideBorder: boolean,
): string {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(100, Math.max(0, 100 - stats.rank.percentile));
  const dashOffset = ((100 - progress) / 100) * circumference;

  const title = escapeXml(`${stats.displayName}'s GitHub Stats`);
  const desc = escapeXml(
    `Total Stars Earned: ${stats.totalStars}, Total Commits (last year): ${stats.totalCommits}, Total PRs: ${stats.totalPRs}, Total Issues: ${stats.totalIssues}, Contributed to (last year): ${stats.contributedTo}`,
  );

  const rows: Array<{
    label: string;
    value: string;
    y: number;
    iconPath: string;
  }> = [
    {
      label: "Total Stars Earned:",
      value: stats.totalStars.toLocaleString("en-US"),
      y: 0,
      iconPath:
        "M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25zm0 2.445L6.615 5.5a.75.75 0 01-.564.41l-3.097.45 2.24 2.184a.75.75 0 01.216.664l-.528 3.084 2.769-1.456a.75.75 0 01.698 0l2.77 1.456-.53-3.084a.75.75 0 01.216-.664l2.24-2.183-3.096-.45a.75.75 0 01-.564-.41L8 2.694v.001z",
    },
    {
      label: "Total Commits (last year):",
      value: stats.totalCommits.toLocaleString("en-US"),
      y: 25,
      iconPath:
        "M1.643 3.143L.427 1.927A.25.25 0 000 2.104V5.75c0 .138.112.25.25.25h3.646a.25.25 0 00.177-.427L2.715 4.215a6.5 6.5 0 11-1.18 4.458.75.75 0 10-1.493.154 8.001 8.001 0 101.6-5.684zM7.75 4a.75.75 0 01.75.75v2.992l2.028.812a.75.75 0 01-.557 1.392l-2.5-1A.75.75 0 017 8.25v-3.5A.75.75 0 017.75 4z",
    },
    {
      label: "Total PRs:",
      value: stats.totalPRs.toLocaleString("en-US"),
      y: 50,
      iconPath:
        "M7.177 3.073L9.573.677A.25.25 0 0110 .854v4.792a.25.25 0 01-.427.177L7.177 3.427a.25.25 0 010-.354zM3.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122v5.256a2.251 2.251 0 11-1.5 0V5.372A2.25 2.25 0 011.5 3.25zM11 2.5h-1V4h1a1 1 0 011 1v5.628a2.251 2.251 0 101.5 0V5A2.5 2.5 0 0011 2.5zm1 10.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0zM3.75 12a.75.75 0 100 1.5.75.75 0 000-1.5z",
    },
    {
      label: "Total Issues:",
      value: stats.totalIssues.toLocaleString("en-US"),
      y: 75,
      iconPath:
        "M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM0 8a8 8 0 1116 0A8 8 0 010 8zm9 3a1 1 0 11-2 0 1 1 0 012 0zm-.25-6.25a.75.75 0 00-1.5 0v3.5a.75.75 0 001.5 0v-3.5z",
    },
    {
      label: "Contributed to (last year):",
      value: stats.contributedTo.toLocaleString("en-US"),
      y: 100,
      iconPath:
        "M2 2.5A2.5 2.5 0 014.5 0h8.75a.75.75 0 01.75.75v12.5a.75.75 0 01-.75.75h-2.5a.75.75 0 110-1.5h1.75v-2h-8a1 1 0 00-.714 1.7.75.75 0 01-1.072 1.05A2.495 2.495 0 012 11.5v-9zm10.5-1V9h-8c-.356 0-.694.074-1 .208V2.5a1 1 0 011-1h8zM5 12.25v3.25a.25.25 0 00.4.2l1.45-1.087a.25.25 0 01.3 0L8.6 15.7a.25.25 0 00.4-.2v-3.25a.25.25 0 00-.25-.25h-3.5a.25.25 0 00-.25.25z",
    },
  ];

  const rowsMarkup = rows
    .map(
      (row) => `
    <g transform="translate(25, ${row.y})">
      <svg class="icon" viewBox="0 0 16 16" width="16" height="16">
        <path fill-rule="evenodd" d="${row.iconPath}"/>
      </svg>
      <text class="stat bold" x="25" y="12.5">${escapeXml(row.label)}</text>
      <text class="stat bold" x="224" y="12.5">${escapeXml(row.value)}</text>
    </g>`,
    )
    .join("");

  return `<svg width="467" height="195" viewBox="0 0 467 195" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="titleId descId">
  <title id="titleId">${title}, Rank: ${escapeXml(stats.rank.level)}</title>
  <desc id="descId">${desc}</desc>
  <style>
    ${buildThemeCss(themeParam, hideBorder)}
    .header { font: 600 18px ${FONT_SANS}; }
    .stat { font: 600 14px ${FONT_SANS}; }
    .bold { font-weight: 700; }
    .rank-text { font: 800 24px ${FONT_SANS}; }
    .rank-circle-rim { fill: none; stroke-width: 6; }
    .rank-circle {
      fill: none;
      stroke-width: 6;
      stroke-linecap: round;
      stroke-dasharray: ${circumference.toFixed(2)};
      stroke-dashoffset: ${dashOffset.toFixed(2)};
      transform-origin: -10px 8px;
      transform: rotate(-90deg);
    }
  </style>
  <rect class="card-bg" x="0.5" y="0.5" rx="8" width="466" height="194" />
  <g transform="translate(25, 35)">
    <text x="0" y="0" class="header">${title}</text>
  </g>
  <g transform="translate(0, 55)">
    <g transform="translate(390.5, 47.5)">
      <circle class="rank-circle-rim" cx="-10" cy="8" r="${radius}" />
      <circle class="rank-circle" cx="-10" cy="8" r="${radius}" />
      <text class="rank-text" x="-10" y="9" dominant-baseline="central" text-anchor="middle">${escapeXml(stats.rank.level)}</text>
    </g>
    <svg x="0" y="0">${rowsMarkup}
    </svg>
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

  try {
    const stats = await getGitHubStats();
    const svg = renderGitHubStatsSvg(stats, theme, hideBorder);
    return new Response(svg, { status: 200, headers: CACHE_HEADERS });
  } catch (err) {
    console.error("GitHub Stats SVG error:", err);
    return new Response("GitHub Stats unavailable", {
      status: 502,
      headers: { "Cache-Control": "no-store" },
    });
  }
};
