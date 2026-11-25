export type ThemeMode = "light" | "dark" | "system";

function applyDomTheme(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  const prefersDark = Boolean(
    window.matchMedia?.("(prefers-color-scheme: dark)").matches,
  );
  const isDark = mode === "dark" || (mode === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", isDark);
}

class ThemeController {
  mode = $state<ThemeMode>("system");

  init() {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark" || saved === "system") {
        this.mode = saved;
      }
    } catch {}
    applyDomTheme(this.mode);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      if (this.mode === "system") applyDomTheme("system");
    };
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }

  set(next: ThemeMode) {
    this.mode = next;
    try {
      localStorage.setItem("theme", next);
    } catch {}
    applyDomTheme(next);
  }

  cycle() {
    if (this.mode === "dark") this.set("light");
    else if (this.mode === "light") this.set("system");
    else this.set("dark");
  }
}

export const themeStore = new ThemeController();
