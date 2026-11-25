export interface DdnsUser {
  discordId: string;
  name: string;
  token: string;
  role: "admin" | "user";
  createdAt: string;
}

export interface WhitelistUser {
  id: string;
  name: string;
}

export interface DomainState {
  domain: string;
  label?: string;
  os?: "windows" | "linux";
  ownerId?: string;
  ownerName?: string;
  createdAt?: string;
  currentIp: string | null;
  previousIp: string | null;
  lastUpdated: string | null;
  lastChecked: string | null;
  status: "ok" | "error" | "unconfigured";
  message?: string;
  isIpMatching: boolean;
}

export interface DdnsApiResponse {
  success: boolean;
  clientIp: string;
  domains: DomainState[];
  allDomains?: DomainState[];
  users?: DdnsUser[];
  whitelist?: WhitelistUser[];
  defaultDomain?: string;
  authToken?: string;
  authType?: "discord" | "token";
  isAdmin?: boolean;
  user?: { name: string; id: string; role?: "admin" | "user" };
}

export interface AdminDataState {
  users: DdnsUser[];
  whitelist: WhitelistUser[];
  domains: DomainState[];
}

export function maskIp(
  ip?: string | null,
  maskSensitive = true,
  forceReveal = false,
): string {
  if (!ip?.trim()) return "등록 대기 중";
  if (!maskSensitive || forceReveal) return ip;
  const parts = ip.split(".");
  if (parts.length === 4) return `${parts[0]}.•••.•••.${parts[3]}`;
  return "••••:••••:••••:••••";
}

export function maskDomain(
  domain?: string | null,
  maskSensitive = true,
  forceReveal = false,
): string {
  if (!domain?.trim()) return "";
  if (!maskSensitive || forceReveal) return domain;
  const parts = domain.split(".");
  if (parts.length >= 3) {
    const prefix = parts[0];
    const rest = parts.slice(1).join(".");
    return `${"•".repeat(Math.max(prefix.length, 6))}.${rest}`;
  }
  return "••••••••.example.com";
}

export function getDeviceOs(item: DomainState): "windows" | "linux" {
  if (item.os === "windows" || item.os === "linux") return item.os;
  return (item.label || "").toLowerCase().includes("win") ? "windows" : "linux";
}

export function formatTimeAgo(isoString: string | null): string {
  if (!isoString) return "기록 없음";
  const date = new Date(isoString);
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 60) return "방금 전";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  return `${date.toLocaleDateString("ko-KR")} ${date.toLocaleTimeString("ko-KR")}`;
}

function getPublicOrigin(): string {
  return typeof window !== "undefined" ? window.location.origin : "https://example.com";
}

export function buildWindowsCommand(domain: string, token: string): string {
  const origin = getPublicOrigin();
  return `Remove-Item ddns.js -Force 2>$null ; Set-Content ddns.js 'const update = () => fetch("${origin}/api/ddns/update?domain=${domain}", { headers: { Authorization: "Bearer ${token}" }, signal: AbortSignal.timeout(10000) }).then(r=>r.json()).then(d=>console.log(new Date().toLocaleTimeString(), d)).catch(console.error); update(); setInterval(update, 10 * 60 * 1000);' ; pm2 delete ddns-windows 2>$null ; pm2 start ddns.js --name "ddns-windows" ; pm2 save`;
}

export function buildLinuxCommand(domain: string, token: string): string {
  const origin = getPublicOrigin();
  return `rm -f ~/ddns.js && cat << 'EOF' > ~/ddns.js\nconst update = () => fetch("${origin}/api/ddns/update?domain=${domain}", {\n  headers: { Authorization: "Bearer ${token}" },\n  signal: AbortSignal.timeout(10000)\n}).then(r => r.json()).then(d => console.log(new Date().toLocaleTimeString(), d)).catch(console.error);\nupdate();\nsetInterval(update, 10 * 60 * 1000);\nEOF\npm2 delete ddns-updater 2>/dev/null; pm2 start ~/ddns.js --name "ddns-updater" && pm2 save`;
}
