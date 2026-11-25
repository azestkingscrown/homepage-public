export const SITE_META = {
  name: "Azest_Kingscrown",
  subtitle: "Workspace & Infra",
  initials: "AK",
} as const;

export const CORE_NAV_PATHS = {
  home: "/",
  chzzkGuide: "/chzzk-bot-guide",
  chzzkUpdate: "/chzzk-bot-update",
  technicalInfo: "/technical-info",
  ddns: "/ddns",
  minecraft: "/minecraft",
  hosting: "/hosting",
  admin: "/admin",
} as const;

export const EXTERNAL_LINKS = {
  github: "https://github.com/your-github-username",
  discordContact: "https://discord.gg/your-invite-code",
  boySite: "https://sub.example.com/",
  kakaopay: "https://example.com/support-kr",
  kofi: "https://ko-fi.com/your-handle",
  botInvite: "https://discord.com/discovery/applications/YOUR_BOT_APP_ID",
} as const;

export function buildHostUrls(host = "example.com") {
  const safeHost = host.trim() === "" ? "example.com" : host;
  if (safeHost.includes("localhost") || safeHost.includes("127.0.0.1")) {
    const clean = safeHost.replace(/^chzzk\./i, "");
    return {
      chzzkUrl: `http://chzzk.${clean}`,
      mainUrl: `http://${clean}`,
    };
  }
  const clean = safeHost.replace(/^www\./i, "").replace(/^chzzk\./i, "");
  return {
    chzzkUrl: `https://chzzk.${clean}`,
    mainUrl: `https://${clean}`,
  };
}
