import { invalidateAll } from "$app/navigation";
import { page } from "$app/state";
import {
  getTranslations,
  LOCALE_COOKIE,
  type Locale,
  type Translations,
} from "./i18n.ts";

let clientOverride = $state<Locale | null>(null);

function getSharedCookieDomain(hostname: string): string {
  const baseHost = hostname.replace(/^(?:www|chzzk)\./i, "");
  if (
    !baseHost ||
    baseHost === "localhost" ||
    /^\d+\.\d+\.\d+\.\d+$/.test(baseHost) ||
    !baseHost.includes(".")
  ) {
    return "";
  }
  return `; Domain=.${baseHost}`;
}

export const localeStore = {
  get current(): Locale {
    if (typeof window !== "undefined" && clientOverride) {
      return clientOverride;
    }
    const fromPage = (page.data as { locale?: Locale } | undefined)?.locale;
    return fromPage === "ko" || fromPage === "en" ? fromPage : "en";
  },
  get t(): Translations {
    return getTranslations(this.current);
  },
  set(next: Locale) {
    if (typeof window === "undefined") return;
    clientOverride = next;
    const domain = getSharedCookieDomain(window.location.hostname);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LOCALE_COOKIE}=${next}; Path=/; Max-Age=31536000; SameSite=Lax${domain}${secure}`;
    try {
      localStorage.setItem("lang", next);
    } catch {
      // ignore storage restrictions
    }
    document.documentElement.lang = next;
    void invalidateAll();
  },
  toggle() {
    this.set(this.current === "ko" ? "en" : "ko");
  },
};
