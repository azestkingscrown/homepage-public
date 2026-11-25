<script lang="ts">
  import { page } from "$app/state";
  import { invalidateAll } from "$app/navigation";
  import { onMount } from "svelte";
  import Icon, { type IconName } from "./Icon.svelte";
  import { localeStore } from "#lib/locale.svelte.ts";
  import { CORE_NAV_PATHS, EXTERNAL_LINKS, SITE_META } from "#lib/siteLinks.ts";
  import { themeStore } from "#lib/theme.svelte.ts";

  interface SessionProp {
    user: {
      id: string;
      name: string;
      image: string | null;
    };
  }

  let { session }: { session: SessionProp | null } = $props();


  let t = $derived(localeStore.t);

  let coreNavigation = $derived<
    { name: string; href: string; icon: IconName; isStaticDoc?: boolean }[]
  >([
    { name: t.nav.overview, href: CORE_NAV_PATHS.home, icon: "home" },
    { name: t.nav.chzzkGuide, href: CORE_NAV_PATHS.chzzkGuide, icon: "book", isStaticDoc: true },
    { name: t.nav.chzzkUpdate, href: CORE_NAV_PATHS.chzzkUpdate, icon: "branch" },
    { name: t.nav.technicalInfo, href: CORE_NAV_PATHS.technicalInfo, icon: "shield", isStaticDoc: true },
  ]);

  let serviceNavigation = $derived<
    { name: string; href: string; icon: IconName; tag: string }[]
  >([
    { name: t.nav.ddns, href: CORE_NAV_PATHS.ddns, icon: "globe", tag: "Auth" },
    { name: t.nav.minecraft, href: CORE_NAV_PATHS.minecraft, icon: "gamepad", tag: "Auth" },
    { name: t.nav.hosting, href: CORE_NAV_PATHS.hosting, icon: "upload", tag: "OTP" },
    { name: t.nav.admin, href: CORE_NAV_PATHS.admin, icon: "admin", tag: "OTP" },
  ]);

  let shortcuts = $derived<{ name: string; href: string; icon: IconName }[]>([
    { name: t.nav.github, href: EXTERNAL_LINKS.github, icon: "github" },
    { name: t.nav.contactServer, href: EXTERNAL_LINKS.discordContact, icon: "discord" },
    { name: t.nav.boySite, href: EXTERNAL_LINKS.boySite, icon: "external" },
  ]);

  let themeOptions = $derived<["light" | "dark" | "system", string, IconName][]>([
    ["light", t.nav.themeLight, "sun"],
    ["dark", t.nav.themeDark, "moon"],
    ["system", t.nav.themeSystem, "monitor"],
  ]);

  const langOptions: ["ko" | "en", string][] = [
    ["ko", "한국어"],
    ["en", "English"],
  ];

  let mobileOpen = $state(false);
  let profileMenuOpen = $state(false);
  let liveAvatar = $state<string | null>(null);
  let fallbackStep = $state<0 | 1 | 2>(0);

  let pathname = $derived(page.url.pathname || "/");
  let isLoggedIn = $derived(Boolean(session?.user));
  let userName = $derived(session?.user?.name || "Guest");
  let userId = $derived(session?.user?.id);
  let initials = $derived(isLoggedIn ? userName.slice(0, 2).toUpperCase() : "GU");

  function getDiscordDefaultAvatar(id?: string): string {
    if (!id) return "https://cdn.discordapp.com/embed/avatars/0.png";
    try {
      const idx = Number((BigInt(id) >> BigInt(22)) % BigInt(6));
      return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    } catch {
      return "https://cdn.discordapp.com/embed/avatars/0.png";
    }
  }

  let primaryAvatar = $derived(liveAvatar || session?.user?.image || null);
  let resolvedAvatarSrc = $derived(
    fallbackStep === 0
      ? primaryAvatar
      : fallbackStep === 1
        ? getDiscordDefaultAvatar(userId)
        : null,
  );

  function handleAvatarError() {
    fallbackStep = fallbackStep === 0 ? 1 : 2;
  }

  function isActive(href: string): boolean {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function navLinkClass(active: boolean): string {
    return active
      ? "flex items-center justify-between gap-x-2.5 rounded border border-oc-border bg-oc-subtle px-2.5 py-2 text-sm font-medium text-oc-strong transition"
      : "flex items-center justify-between gap-x-2.5 rounded border border-transparent px-2.5 py-2 text-sm font-medium text-oc-muted transition hover:bg-oc-subtle hover:text-oc-strong";
  }

  async function handleSignOut() {
    profileMenuOpen = false;
    mobileOpen = false;
    await fetch("/api/auth/signout", { method: "POST" });
    await invalidateAll();
  }

  function signInUrl(): string {
    return `/api/auth/signin?callbackUrl=${encodeURIComponent(pathname)}`;
  }

  onMount(() => {
    const closeMenus = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        mobileOpen = false;
        profileMenuOpen = false;
      }
    };
    window.addEventListener("keydown", closeMenus);

    if (session?.user?.id) {
      fetch("/api/discord")
        .then((r) => r.json())
        .then((json) => {
          const u = json?.data?.discord_user;
          if (json?.success && u?.id === session?.user?.id && u?.avatar) {
            const ext = String(u.avatar).startsWith("a_") ? "gif" : "png";
            liveAvatar = `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${ext}?size=128`;
            fallbackStep = 0;
          }
        })
        .catch(() => {});
    }

    return () => window.removeEventListener("keydown", closeMenus);
  });
</script>

<!-- Desktop Sidebar (lg+) -->
<nav
  aria-label={t.site.mainSidebar}
  class="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-72 lg:flex-col"
>
  <aside
    class="flex grow flex-col gap-y-6 overflow-y-auto border-r border-oc-border bg-oc-bg p-4"
  >
    <!-- Brand, Language & Theme -->
    <div class="flex items-center justify-between gap-2">
      <a
        href="/"
        class="flex min-w-0 flex-1 items-center gap-x-3 rounded p-1.5 transition hover:bg-oc-subtle"
      >
        <span
          class="flex aspect-square size-8 shrink-0 items-center justify-center rounded bg-oc-strong font-mono text-xs font-bold tracking-tight text-oc-inverted"
        >
          {SITE_META.initials}
        </span>
        <div class="min-w-0 flex-1 text-left">
          <p class="truncate text-sm font-semibold text-oc-strong">
            {SITE_META.name}
          </p>
          <p class="truncate font-mono text-xs text-oc-muted">
            {SITE_META.subtitle}
          </p>
        </div>
      </a>

      <div class="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onclick={() => localeStore.toggle()}
          aria-label={t.site.switchLangLabel}
          title={t.site.switchLangLabel}
          class="cursor-pointer rounded px-2 py-1.5 font-mono text-xs font-semibold text-oc-muted transition hover:bg-oc-hover hover:text-oc-strong"
        >
          {localeStore.current === "ko" ? "EN" : "KO"}
        </button>

        <button
          type="button"
          onclick={() => themeStore.cycle()}
          aria-label={t.site.toggleThemeLabel}
          title={`${t.site.currentThemePrefix}: ${themeStore.mode}`}
          class="cursor-pointer rounded p-2 text-oc-muted transition hover:bg-oc-hover hover:text-oc-strong"
        >
          <Icon
            name={themeStore.mode === "dark" ? "moon" : themeStore.mode === "light" ? "sun" : "monitor"}
            class="size-4"
          />
        </button>
      </div>
    </div>

    <!-- Navigation Sections -->
    <div class="flex flex-1 flex-col gap-y-7">
      <div>
        <span class="px-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-oc-faint">
          Workspace
        </span>
        <ul class="mt-2 space-y-0.5">
          {#each coreNavigation as item}
            {@const active = isActive(item.href)}
            <li>
              <a
                href={item.href}
                data-sveltekit-reload={item.isStaticDoc ? "" : undefined}
                class={navLinkClass(active)}
              >
                <span class="flex items-center gap-x-2.5">
                  <Icon name={item.icon} class="size-4 shrink-0" />
                  {item.name}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </div>

      <div>
        <span class="px-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-oc-faint">
          Services &amp; Admin
        </span>
        <ul class="mt-2 space-y-0.5">
          {#each serviceNavigation as item}
            {@const active = isActive(item.href)}
            <li>
              <a href={item.href} class={navLinkClass(active)}>
                <span class="flex items-center gap-x-2.5">
                  <Icon name={item.icon} class="size-4 shrink-0" />
                  {item.name}
                </span>
                <span
                  class={active
                    ? "rounded border border-oc-border-strong bg-oc-hover px-1.5 py-0.5 font-mono text-[10px] font-medium text-oc-strong"
                    : "rounded border border-oc-border bg-oc-subtle px-1.5 py-0.5 font-mono text-[10px] font-medium text-oc-muted"}
                >
                  {item.tag}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </div>

      <div>
        <span class="px-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-oc-faint">
          Shortcuts
        </span>
        <ul class="mt-2 space-y-0.5">
          {#each shortcuts as item}
            <li>
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                class={navLinkClass(false)}
              >
                <span class="flex items-center gap-x-2.5">
                  <Icon name={item.icon} class="size-4 shrink-0" />
                  {item.name}
                </span>
                <Icon name="external" class="size-3.5 shrink-0 text-oc-faint" />
              </a>
            </li>
          {/each}
        </ul>
      </div>
    </div>

    <!-- Bottom User Profile & Theme Dropdown -->
    <div class="relative mt-auto border-t border-oc-border pt-3">
      <button
        type="button"
        onclick={() => (profileMenuOpen = !profileMenuOpen)}
        class="group flex w-full cursor-pointer items-center justify-between rounded p-2 text-left text-sm transition hover:bg-oc-subtle"
      >
        <span class="flex min-w-0 items-center gap-2.5">
          {#if isLoggedIn && resolvedAvatarSrc}
            <img
              src={resolvedAvatarSrc}
              alt={userName}
              referrerpolicy="no-referrer"
              onerror={handleAvatarError}
              class="user-icon size-8 shrink-0 rounded-full border border-oc-border-strong object-cover"
            />
          {:else}
            <span
              class={isLoggedIn
                ? "flex size-8 shrink-0 items-center justify-center rounded-full border border-oc-border-strong bg-oc-subtle font-mono text-xs font-semibold text-oc-strong"
                : "flex size-8 shrink-0 items-center justify-center rounded-full border border-oc-border bg-oc-surface font-mono text-xs font-semibold text-oc-text"}
            >
              {initials}
            </span>
          {/if}
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium text-oc-strong">
              {userName}
            </span>
            <span class="block truncate text-xs text-oc-muted">
              {isLoggedIn ? t.nav.discordAuthed : t.nav.loginOrTheme}
            </span>
          </span>
        </span>
        <Icon name="more" class="size-4 shrink-0 text-oc-faint group-hover:text-oc-strong" />
      </button>

      {#if profileMenuOpen}
        <div
          class="absolute bottom-full left-0 right-0 z-50 mb-2 rounded-md border border-oc-border bg-oc-surface p-1.5 shadow-lg"
        >
          <p class="px-2 py-1 text-xs font-medium text-oc-muted">
            {isLoggedIn ? `${userName} (Discord)` : t.nav.loggedOut}
          </p>
          <div class="my-1 h-px bg-oc-border"></div>
          <p class="px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-oc-faint">
            {t.nav.themeSettings}
          </p>
          {#each themeOptions as [val, label, ic]}
            <button
              type="button"
              onclick={() => {
                themeStore.set(val);
                profileMenuOpen = false;
              }}
              class="flex w-full cursor-pointer items-center justify-between rounded px-2 py-1.5 text-sm text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
            >
              <span class="flex items-center gap-2">
                <Icon name={ic} class="size-4 text-oc-muted" />
                {label}
              </span>
              {#if themeStore.mode === val}
                <Icon name="check" class="size-4 text-oc-strong" />
              {/if}
            </button>
          {/each}
          <div class="my-1 h-px bg-oc-border"></div>
          <p class="px-2 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider text-oc-faint">
            {t.nav.languageSettings}
          </p>
          {#each langOptions as [val, label]}
            <button
              type="button"
              onclick={() => {
                localeStore.set(val);
                profileMenuOpen = false;
              }}
              class="flex w-full cursor-pointer items-center justify-between rounded px-2 py-1.5 text-sm text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
            >
              <span class="flex items-center gap-2">
                <Icon name="globe" class="size-4 text-oc-muted" />
                {label}
              </span>
              {#if localeStore.current === val}
                <Icon name="check" class="size-4 text-oc-strong" />
              {/if}
            </button>
          {/each}
          <div class="my-1 h-px bg-oc-border"></div>
          {#if isLoggedIn}
            <button
              type="button"
              onclick={handleSignOut}
              class="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-[#db2424] transition hover:bg-red-500/10 dark:text-[#ed5a5a]"
            >
              <Icon name="logout" class="size-4" />
              {t.nav.discordSignOut}
            </button>
          {:else}
            <a
              href={signInUrl()}
              data-sveltekit-reload
              class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm font-medium text-oc-strong transition hover:bg-oc-hover"
            >
              <Icon name="login" class="size-4" />
              {t.nav.discordSignIn}
            </a>
          {/if}
        </div>
      {/if}
    </div>
  </aside>
</nav>

<!-- Mobile Top Header (< lg) -->
<header
  class="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-oc-border bg-oc-bg/95 px-4 backdrop-blur-md sm:px-6 lg:hidden"
>
  <a href="/" class="flex items-center gap-x-2.5">
    <span
      class="flex aspect-square size-8 shrink-0 items-center justify-center rounded bg-oc-strong font-mono text-xs font-bold text-oc-inverted"
    >
      {SITE_META.initials}
    </span>
    <div>
      <p class="text-sm font-semibold text-oc-strong">{SITE_META.name}</p>
      <p class="font-mono text-[11px] text-oc-muted">{SITE_META.subtitle}</p>
    </div>
  </a>

  <div class="flex items-center gap-1">
    <button
      type="button"
      onclick={() => localeStore.toggle()}
      aria-label={t.site.switchLangLabel}
      title={t.site.switchLangLabel}
      class="cursor-pointer rounded px-2 py-1.5 font-mono text-xs font-semibold text-oc-muted transition hover:bg-oc-hover hover:text-oc-strong"
    >
      {localeStore.current === "ko" ? "EN" : "KO"}
    </button>

    <button
      type="button"
      onclick={() => themeStore.cycle()}
      aria-label={t.site.toggleThemeLabel}
      class="cursor-pointer rounded p-2 text-oc-muted transition hover:bg-oc-hover hover:text-oc-strong"
    >
      <Icon
        name={themeStore.mode === "dark" ? "moon" : themeStore.mode === "light" ? "sun" : "monitor"}
        class="size-4"
      />
    </button>

    <button
      type="button"
      onclick={() => (mobileOpen = true)}
      aria-label={t.site.openSidebar}
      class="cursor-pointer rounded p-2 text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
    >
      <Icon name="menu" class="size-5" />
    </button>
  </div>
</header>

<!-- Mobile Drawer -->
{#if mobileOpen}
  <div
    class="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs lg:hidden"
    role="dialog"
    aria-modal="true"
    aria-label={t.site.mobileNav}
  >
    <button
      type="button"
      aria-label={t.site.close}
      onclick={() => (mobileOpen = false)}
      class="absolute inset-0 bg-transparent"
    ></button>
    <div
      class="fixed inset-y-2 right-2 z-10 flex w-[88vw] max-w-xs flex-col overflow-y-auto rounded-md border border-oc-border bg-oc-surface p-4 shadow-xl"
    >
      <div class="flex items-center justify-between border-b border-oc-border pb-3">
        <div>
          <p class="text-sm font-semibold text-oc-strong">{SITE_META.name}</p>
          <p class="font-mono text-xs text-oc-muted">{SITE_META.subtitle}</p>
        </div>
        <button
          type="button"
          onclick={() => (mobileOpen = false)}
          aria-label={t.site.closeMenu}
          class="cursor-pointer rounded p-1.5 text-oc-muted transition hover:bg-oc-hover hover:text-oc-strong"
        >
          <Icon name="close" class="size-5" />
        </button>
      </div>

      <div class="flex flex-1 flex-col gap-y-6 py-4">
        <div>
          <span class="px-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-oc-faint">
            Workspace
          </span>
          <ul class="mt-2 space-y-0.5">
            {#each coreNavigation as item}
              <li>
                <a
                  href={item.href}
                  data-sveltekit-reload={item.isStaticDoc ? "" : undefined}
                  onclick={() => (mobileOpen = false)}
                  class={navLinkClass(isActive(item.href))}
                >
                  <span class="flex items-center gap-x-2.5">
                    <Icon name={item.icon} class="size-4 shrink-0" />
                    {item.name}
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        </div>

        <div>
          <span class="px-2.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-oc-faint">
            Services &amp; Admin
          </span>
          <ul class="mt-2 space-y-0.5">
            {#each serviceNavigation as item}
              <li>
                <a
                  href={item.href}
                  onclick={() => (mobileOpen = false)}
                  class={navLinkClass(isActive(item.href))}
                >
                  <span class="flex items-center gap-x-2.5">
                    <Icon name={item.icon} class="size-4 shrink-0" />
                    {item.name}
                  </span>
                  <span class="rounded border border-oc-border bg-oc-subtle px-1.5 py-0.5 font-mono text-[10px] font-medium text-oc-muted">
                    {item.tag}
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        </div>

        <div class="mt-auto border-t border-oc-border pt-3">
          {#if isLoggedIn}
            <div class="mb-2 flex items-center gap-2.5 px-2">
              {#if resolvedAvatarSrc}
                <img
                  src={resolvedAvatarSrc}
                  alt={userName}
                  referrerpolicy="no-referrer"
                  onerror={handleAvatarError}
                  class="user-icon size-8 rounded-full border border-oc-border-strong object-cover"
                />
              {:else}
                <span class="flex size-8 items-center justify-center rounded-full border border-oc-border-strong bg-oc-subtle font-mono text-xs font-semibold text-oc-strong">
                  {initials}
                </span>
              {/if}
              <div>
                <p class="text-sm font-medium text-oc-strong">{userName}</p>
                <p class="text-xs text-oc-muted">{t.nav.discordAuthed}</p>
              </div>
            </div>
            <button
              type="button"
              onclick={handleSignOut}
              class="flex w-full cursor-pointer items-center justify-center gap-2 rounded border border-red-500/30 py-2 text-sm font-medium text-[#db2424] transition hover:bg-red-500/10 dark:text-[#ed5a5a]"
            >
              <Icon name="logout" class="size-4" />
              {t.nav.discordSignOut}
            </button>
          {:else}
            <a
              href={signInUrl()}
              data-sveltekit-reload
              class="flex w-full items-center justify-center gap-2 rounded bg-oc-strong py-2 text-sm font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
            >
              <Icon name="login" class="size-4" />
              {t.nav.discordSignIn}
            </a>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
