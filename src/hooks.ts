import type { Reroute } from "@sveltejs/kit/hooks";

export const reroute: Reroute = ({ url }) => {
  const pathname = url.pathname;
  const host = url.hostname.toLowerCase();

  const isReservedPath =
    pathname.startsWith("/api") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/hosting") ||
    pathname.startsWith("/minecraft") ||
    pathname.startsWith("/ddns") ||
    pathname.startsWith("/_app") ||
    pathname.startsWith("/uploads") ||
    pathname.startsWith("/docs") ||
    pathname.includes(".") ||
    pathname === "/favicon.ico";

  if (!isReservedPath && host.startsWith("chzzk.")) {
    const cleanPath = pathname.replace(/\/$/, "");
    if (cleanPath === "" || cleanPath === "/guide") {
      return "/chzzk-bot-guide";
    }
    if (cleanPath === "/tech" || cleanPath === "/technical") {
      return "/technical-info";
    }
    if (cleanPath === "/update") {
      return "/chzzk-bot-update";
    }
  }

  return pathname;
};
