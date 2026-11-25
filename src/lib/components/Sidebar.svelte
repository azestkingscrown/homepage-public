<script lang="ts">
  import { page } from "$app/state";
  import { invalidateAll } from "$app/navigation";
  import { onMount } from "svelte";
  import Icon, { type IconName } from "./Icon.svelte";
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

  const coreNavigation: { name: string; href: string; icon: IconName; isStaticDoc?: boolean }[] = [
    { name: "Overview", href: CORE_NAV_PATHS.home, icon: "home" },
    { name: "치지직 봇 가이드", href: CORE_NAV_PATHS.chzzkGuide, icon: "book", isStaticDoc: true },
    { name: "업데이트 내역", href: CORE_NAV_PATHS.chzzkUpdate, icon: "branch" },
    { name: "기술 문서", href: CORE_NAV_PATHS.technicalInfo, icon: "shield", isStaticDoc: true },
  ];

  const serviceNavigation: { name: string; href: string; icon: IconName; tag: string }[] = [
    { name: "DDNS 관리", href: CORE_NAV_PATHS.ddns, icon: "globe", tag: "Auth" },
    { name: "Minecraft 제어", href: CORE_NAV_PATHS.minecraft, icon: "gamepad", tag: "Auth" },
    { name: "File Hosting", href: CORE_NAV_PATHS.hosting, icon: "upload", tag: "OTP" },
    { name: "Admin 대시보드", href: CORE_NAV_PATHS.admin, icon: "admin", tag: "OTP" },
  ];

  const shortcuts: { name: string; href: string; icon: IconName }[] = [
    { name: "GitHub", href: EXTERNAL_LINKS.github, icon: "github" },
    { name: "익명 문의 서버", href: EXTERNAL_LINKS.discordContact, icon: "discord" },
    { name: "혀엉..", href: EXTERNAL_LINKS.boySite, icon: "external" },
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
      ? "flex items-center justify-between gap-x-2.5 rounded-md bg-indigo-50/80 px-2.5 py-2 text-sm font-medium text-indigo-600 transition dark:bg-indigo-500/10 dark:text-indigo-400"
      : "flex items-center justify-between gap-x-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-900 dark:hover:text-gray-50";
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
  aria-label="주 사이드바"
  class="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-72 lg:flex-col"
>
  <aside
    class="flex grow flex-col gap-y-6 overflow-y-auto border-r border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-950"
  >
    <!-- Brand & Theme -->
    <div class="flex items-center justify-between gap-2">
      <a
        href="/"
        class="flex min-w-0 flex-1 items-center gap-x-3 rounded-md p-1.5 transition hover:bg-gray-100 dark:hover:bg-gray-900"
      >
        <span
          class="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold tracking-tight text-white shadow-xs dark:bg-indigo-500"
        >
          {SITE_META.initials}
        </span>
        <div class="min-w-0 flex-1 text-left">
          <p class="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">
            {SITE_META.name}
          </p>
          <p class="truncate text-xs text-gray-500 dark:text-gray-400">
            {SITE_META.subtitle}
          </p>
        </div>
      </a>

      <button
        type="button"
        onclick={() => themeStore.cycle()}
        aria-label="테마 전환"
        title={`현재 테마: ${themeStore.mode}`}
        class="cursor-pointer rounded-md p-2 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-50"
      >
        <Icon
          name={themeStore.mode === "dark" ? "moon" : themeStore.mode === "light" ? "sun" : "monitor"}
          class="size-4"
        />
      </button>
    </div>

    <!-- Navigation Sections -->
    <div class="flex flex-1 flex-col gap-y-7">
      <div>
        <span class="px-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
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
        <span class="px-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
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
                    ? "rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300"
                    : "rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-gray-900 dark:text-gray-500"}
                >
                  {item.tag}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </div>

      <div>
        <span class="px-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
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
                <Icon name="external" class="size-3.5 shrink-0 text-gray-400" />
              </a>
            </li>
          {/each}
        </ul>
      </div>
    </div>

    <!-- Bottom User Profile & Theme Dropdown -->
    <div class="relative mt-auto border-t border-gray-200 pt-3 dark:border-gray-800">
      <button
        type="button"
        onclick={() => (profileMenuOpen = !profileMenuOpen)}
        class="group flex w-full cursor-pointer items-center justify-between rounded-md p-2 text-left text-sm transition hover:bg-gray-100 dark:hover:bg-gray-900"
      >
        <span class="flex min-w-0 items-center gap-2.5">
          {#if isLoggedIn && resolvedAvatarSrc}
            <img
              src={resolvedAvatarSrc}
              alt={userName}
              referrerpolicy="no-referrer"
              onerror={handleAvatarError}
              class="user-icon size-8 shrink-0 rounded-full border border-gray-300 object-cover dark:border-gray-700"
            />
          {:else}
            <span
              class={isLoggedIn
                ? "flex size-8 shrink-0 items-center justify-center rounded-full border border-indigo-300 bg-indigo-50 text-xs font-semibold text-indigo-700 dark:border-indigo-500/40 dark:bg-indigo-500/15 dark:text-indigo-300"
                : "flex size-8 shrink-0 items-center justify-center rounded-full border border-gray-300 bg-white text-xs font-semibold text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"}
            >
              {initials}
            </span>
          {/if}
          <span class="min-w-0">
            <span class="block truncate text-sm font-medium text-gray-900 dark:text-gray-50">
              {userName}
            </span>
            <span class="block truncate text-xs text-gray-500 dark:text-gray-400">
              {isLoggedIn ? "Discord 인증됨" : "로그인 / 테마 설정"}
            </span>
          </span>
        </span>
        <Icon name="more" class="size-4 shrink-0 text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-200" />
      </button>

      {#if profileMenuOpen}
        <div
          class="absolute bottom-full left-0 right-0 z-50 mb-2 rounded-md border border-gray-200 bg-white p-1.5 shadow-lg dark:border-gray-800 dark:bg-[#090E1A]"
        >
          <p class="px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400">
            {isLoggedIn ? `${userName} (Discord)` : "비로그인 상태"}
          </p>
          <div class="my-1 h-px bg-gray-200 dark:bg-gray-800"></div>
          <p class="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
            테마 설정
          </p>
          {#each [["light", "라이트 모드", "sun"], ["dark", "다크 모드", "moon"], ["system", "시스템 연동", "monitor"]] as [val, label, ic]}
            <button
              type="button"
              onclick={() => {
                themeStore.set(val as "light" | "dark" | "system");
                profileMenuOpen = false;
              }}
              class="flex w-full cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm text-gray-800 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <span class="flex items-center gap-2">
                <Icon name={ic as IconName} class="size-4 text-gray-500" />
                {label}
              </span>
              {#if themeStore.mode === val}
                <Icon name="check" class="size-4 text-indigo-600 dark:text-indigo-400" />
              {/if}
            </button>
          {/each}
          <div class="my-1 h-px bg-gray-200 dark:bg-gray-800"></div>
          {#if isLoggedIn}
            <button
              type="button"
              onclick={handleSignOut}
              class="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <Icon name="logout" class="size-4" />
              Discord 로그아웃
            </button>
          {:else}
            <a
              href={signInUrl()}
              data-sveltekit-reload
              class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-indigo-600 transition hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-500/10"
            >
              <Icon name="login" class="size-4" />
              Discord로 로그인
            </a>
          {/if}
        </div>
      {/if}
    </div>
  </aside>
</nav>

<!-- Mobile Top Header (< lg) -->
<header
  class="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-gray-200 bg-white/90 px-4 shadow-xs backdrop-blur-md dark:border-gray-800 dark:bg-gray-950/90 sm:px-6 lg:hidden"
>
  <a href="/" class="flex items-center gap-x-2.5">
    <span
      class="flex aspect-square size-8 shrink-0 items-center justify-center rounded-md bg-indigo-600 text-xs font-bold text-white dark:bg-indigo-500"
    >
      {SITE_META.initials}
    </span>
    <div>
      <p class="text-sm font-semibold text-gray-900 dark:text-gray-50">{SITE_META.name}</p>
      <p class="text-[11px] text-gray-500 dark:text-gray-400">{SITE_META.subtitle}</p>
    </div>
  </a>

  <div class="flex items-center gap-1.5">
    <button
      type="button"
      onclick={() => themeStore.cycle()}
      aria-label="테마 전환"
      class="cursor-pointer rounded-md p-2 text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800"
    >
      <Icon
        name={themeStore.mode === "dark" ? "moon" : themeStore.mode === "light" ? "sun" : "monitor"}
        class="size-4"
      />
    </button>

    <button
      type="button"
      onclick={() => (mobileOpen = true)}
      aria-label="사이드바 열기"
      class="cursor-pointer rounded-md p-2 text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
    >
      <Icon name="menu" class="size-5" />
    </button>
  </div>
</header>

<!-- Mobile Drawer -->
{#if mobileOpen}
  <div
    class="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs lg:hidden"
    role="dialog"
    aria-modal="true"
    aria-label="모바일 내비게이션"
  >
    <button
      type="button"
      aria-label="닫기"
      onclick={() => (mobileOpen = false)}
      class="absolute inset-0 bg-transparent"
    ></button>
    <div
      class="fixed inset-y-2 right-2 z-10 flex w-[88vw] max-w-xs flex-col overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 shadow-xl dark:border-gray-800 dark:bg-[#090E1A]"
    >
      <div class="flex items-center justify-between border-b border-gray-200 pb-3 dark:border-gray-800">
        <div>
          <p class="text-sm font-semibold text-gray-900 dark:text-gray-50">{SITE_META.name}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400">{SITE_META.subtitle}</p>
        </div>
        <button
          type="button"
          onclick={() => (mobileOpen = false)}
          aria-label="메뉴 닫기"
          class="cursor-pointer rounded-md p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <Icon name="close" class="size-5" />
        </button>
      </div>

      <div class="flex flex-1 flex-col gap-y-6 py-4">
        <div>
          <span class="px-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
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
          <span class="px-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
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
                  <span class="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 dark:bg-gray-900">
                    {item.tag}
                  </span>
                </a>
              </li>
            {/each}
          </ul>
        </div>

        <div class="mt-auto border-t border-gray-200 pt-3 dark:border-gray-800">
          {#if isLoggedIn}
            <div class="mb-2 flex items-center gap-2.5 px-2">
              {#if resolvedAvatarSrc}
                <img
                  src={resolvedAvatarSrc}
                  alt={userName}
                  referrerpolicy="no-referrer"
                  onerror={handleAvatarError}
                  class="user-icon size-8 rounded-full border border-gray-300 object-cover dark:border-gray-700"
                />
              {:else}
                <span class="flex size-8 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">
                  {initials}
                </span>
              {/if}
              <div>
                <p class="text-sm font-medium text-gray-900 dark:text-gray-50">{userName}</p>
                <p class="text-xs text-gray-500">Discord 인증됨</p>
              </div>
            </div>
            <button
              type="button"
              onclick={handleSignOut}
              class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-red-200 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <Icon name="logout" class="size-4" />
              Discord 로그아웃
            </button>
          {:else}
            <a
              href={signInUrl()}
              data-sveltekit-reload
              class="flex w-full items-center justify-center gap-2 rounded-md bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500"
            >
              <Icon name="login" class="size-4" />
              Discord로 로그인
            </a>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}
