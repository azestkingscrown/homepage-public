import type { RequestHandler } from "./$types";

const DISCORD_ID = process.env.DISCORD_OWNER_ID?.trim() || "";

interface CachedDiscordState {
  discordStatus: "online" | "idle" | "dnd" | "offline";
  username: string;
  globalName: string;
  avatarUrl: string;
  avatarBase64: string;
  lastUpdated: number;
}

const globalDiscordCache: CachedDiscordState = {
  discordStatus: "offline",
  username: "Azest",
  globalName: "☪ AZEST_KINGSCROWN",
  avatarUrl: "",
  avatarBase64: "",
  lastUpdated: 0,
};

const STATUS_COLOR_MAP: Record<string, string> = {
  online: "#3ba55c",
  idle: "#faa61a",
  dnd: "#ed4245",
  offline: "#747f8d",
};

const STATUS_TEXT_KO: Record<string, string> = {
  online: "온라인",
  idle: "수면 중",
  dnd: "다른 용무 중",
  offline: "오프라인",
};

const STATUS_TEXT_EN: Record<string, string> = {
  online: "Online",
  idle: "Sleeping",
  dnd: "Do Not Disturb",
  offline: "Offline",
};

function resolveAvatarUrl(discordUser?: { id?: string; avatar?: string }): string {
  if (discordUser?.avatar && discordUser.id) {
    return `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`;
  }
  try {
    const idNum = BigInt(discordUser?.id || DISCORD_ID);
    const index = Number((idNum >> BigInt(22)) % BigInt(6));
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

async function refreshAvatarBase64(newAvatarUrl: string): Promise<void> {
  if (
    !newAvatarUrl ||
    (newAvatarUrl === globalDiscordCache.avatarUrl && globalDiscordCache.avatarBase64)
  ) {
    return;
  }
  try {
    const imgRes = await fetch(newAvatarUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });
    if (!imgRes.ok) return;
    const buffer = await imgRes.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    const contentType = imgRes.headers.get("content-type") || "image/png";
    globalDiscordCache.avatarBase64 = `data:${contentType};base64,${base64}`;
    globalDiscordCache.avatarUrl = newAvatarUrl;
  } catch (imgError) {
    console.error("Failed to fetch Discord avatar, retaining previous base64:", imgError);
  }
}

async function refreshDiscordCache(now: number): Promise<void> {
  if (!DISCORD_ID || now - globalDiscordCache.lastUpdated < 10_000) return;
  try {
    const res = await fetch(`https://api.lanyard.rest/v1/users/${DISCORD_ID}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return;

    const parsed = await res.json();
    if (!parsed.success || !parsed.data) return;

    const d = parsed.data;
    globalDiscordCache.discordStatus = d.discord_status || "offline";
    globalDiscordCache.username =
      d.discord_user?.username || globalDiscordCache.username;
    globalDiscordCache.globalName =
      d.discord_user?.global_name ||
      d.discord_user?.username ||
      globalDiscordCache.globalName;

    await refreshAvatarBase64(resolveAvatarUrl(d.discord_user));
    globalDiscordCache.lastUpdated = now;
  } catch (error: unknown) {
    console.error(
      "Failed to fetch Lanyard status, falling back to cache:",
      error instanceof Error ? error.message : error,
    );
  }
}

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

function buildThemeCss(themeParam: string): string {
  if (themeParam === "light") {
    return `
  .card-bg { fill: #ffffff; stroke: #e5e7eb; }
  .text-title { fill: #111827; }
  .text-sub { fill: #6b7280; }
  .status-border { stroke: #ffffff; }`;
  }
  if (themeParam === "dark") {
    return `
  .card-bg { fill: #090e1a; stroke: #1f2937; }
  .text-title { fill: #f9fafb; }
  .text-sub { fill: #9ca3af; }
  .status-border { stroke: #090e1a; }`;
  }
  return `
  .card-bg { fill: #090e1a; stroke: #1f2937; }
  .text-title { fill: #f9fafb; }
  .text-sub { fill: #9ca3af; }
  .status-border { stroke: #090e1a; }
  @media (prefers-color-scheme: light) {
    .card-bg { fill: #ffffff; stroke: #e5e7eb; }
    .text-title { fill: #111827; }
    .text-sub { fill: #6b7280; }
    .status-border { stroke: #ffffff; }
  }`;
}

export const GET: RequestHandler = async ({ url }) => {
  const lang = (url.searchParams.get("lang") || "en").toLowerCase();
  const themeParam = (url.searchParams.get("theme") || "auto").toLowerCase();

  await refreshDiscordCache(Date.now());

  const isKo = lang === "ko";
  const statusTextMap = isKo ? STATUS_TEXT_KO : STATUS_TEXT_EN;
  const currentStatus = globalDiscordCache.discordStatus;
  const statusColor = STATUS_COLOR_MAP[currentStatus] || "#747f8d";
  const statusText =
    statusTextMap[currentStatus] || (isKo ? "오프라인" : "Offline");
  const escapedName = escapeXml(
    globalDiscordCache.globalName || globalDiscordCache.username,
  );
  const avatarElement = globalDiscordCache.avatarBase64
    ? `<image href="${globalDiscordCache.avatarBase64}" x="24" y="22" width="52" height="52" clip-path="url(#avatar-clip)" />`
    : `<circle cx="50" cy="48" r="26" fill="#333333" />`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="360" height="96" viewBox="0 0 360 96" fill="none">
<defs>
  <clipPath id="avatar-clip">
    <circle cx="50" cy="48" r="26" />
  </clipPath>
</defs>
<style>
  ${buildThemeCss(themeParam)}
</style>
<rect class="card-bg" x="0.5" y="0.5" width="359" height="95" rx="16" stroke-width="1" />
${avatarElement}
<circle class="status-border" cx="69" cy="67" r="7.5" fill="${statusColor}" stroke-width="3" />
<text class="text-title" x="92" y="43" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="700" letter-spacing="-0.2px">
  ${escapedName}
</text>
<circle cx="96" cy="62" r="4" fill="${statusColor}" />
<text class="text-sub" x="106" y="66" font-family="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="13" font-weight="500">
  ${statusText}
</text>
</svg>`;

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=15, s-maxage=15, stale-while-revalidate=30",
    },
  });
};
