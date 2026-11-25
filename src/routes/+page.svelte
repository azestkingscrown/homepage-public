<script lang="ts">
  import DiscordStatus from "#lib/components/DiscordStatus.svelte";
  import GithubStats from "#lib/components/GithubStats.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import ServerStatus from "#lib/components/ServerStatus.svelte";
  import { localeStore } from "#lib/locale.svelte.ts";
  import { buildHostUrls, EXTERNAL_LINKS } from "#lib/siteLinks.ts";

  let { data } = $props();
  let urls = $derived(buildHostUrls(data.host));
  let t = $derived(localeStore.t.home);
</script>

<div class="space-y-8">
  <!-- Page Header -->
  <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 class="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-2xl">
        Overview
      </h1>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        {t.subtitle}
      </p>
    </div>
    <div class="mt-2 sm:mt-0">
      <span class="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-500/30 dark:bg-indigo-400/10 dark:text-indigo-400 dark:ring-indigo-400/30">
        {t.badge}
      </span>
    </div>
  </div>

  <!-- Hero + Discord Presence -->
  <section class="grid grid-cols-1 gap-4 lg:grid-cols-12">
    <div class="flex flex-col justify-between gap-6 rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A] lg:col-span-8">
      <div class="space-y-3">
        <p class="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
          Welcome
        </p>
        <h2 class="break-keep text-2xl font-extrabold tracking-tight text-gray-900 dark:text-gray-50 sm:text-3xl">
          {t.greeting}
        </h2>
        <p class="max-w-2xl break-keep text-sm leading-relaxed text-gray-600 dark:text-gray-400 sm:text-base">
          {t.bio}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2.5">
        <a
          href={`${urls.chzzkUrl}/guide`}
          class="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-xs transition hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600"
        >
          <Icon name="book" class="size-4" />
          {t.btnGuide}
        </a>
        <a
          href={`${urls.chzzkUrl}/update`}
          class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-900 shadow-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:hover:bg-gray-900"
        >
          <Icon name="branch" class="size-4" />
          {t.btnUpdate}
        </a>
        <a
          href={EXTERNAL_LINKS.github}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-900 shadow-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:hover:bg-gray-900"
        >
          <Icon name="github" class="size-4" />
          GitHub
          <Icon name="external" class="size-3.5 text-gray-400" />
        </a>
        <a
          href={EXTERNAL_LINKS.boySite}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-3.5 py-2 text-sm font-medium text-gray-900 transition hover:bg-gray-200/80 dark:bg-gray-900 dark:text-gray-50 dark:hover:bg-gray-800"
        >
          {t.btnBoy}
          <Icon name="external" class="size-3.5 text-gray-400" />
        </a>
      </div>
    </div>

    <div class="lg:col-span-4">
      <DiscordStatus />
    </div>
  </section>

  <!-- Real-time Server Status -->
  <section class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <Icon name="server" class="size-5 text-indigo-600 dark:text-indigo-400" />
        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-50">
          Server Status
        </h2>
        <span class="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-600/30 dark:bg-emerald-400/10 dark:text-emerald-400">
          Real-time · 1s
        </span>
      </div>
      <a
        href="/minecraft"
        class="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      >
        {t.minecraftPanel}
      </a>
    </div>
    <ServerStatus />
  </section>

  <!-- Tech Stack & GitHub Stats -->
  <section class="space-y-4">
    <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-50">
      Developer Profile &amp; Metrics
    </h2>
    <GithubStats />
  </section>

  <!-- Contact Section -->
  <section class="space-y-4">
    <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-50">Contact</h2>
    <div class="flex flex-col justify-between gap-5 rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A] sm:flex-row sm:items-center">
      <div class="max-w-2xl space-y-2">
        <div class="flex items-center gap-2">
          <span class="flex size-8 items-center justify-center rounded-md bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
            <Icon name="shield" class="size-4" />
          </span>
          <h3 class="text-base font-semibold text-gray-900 dark:text-gray-50">
            {t.contactTitle}
          </h3>
          <span class="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            1:1 Ticket
          </span>
        </div>
        <p class="break-keep text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          {t.contactDesc}
        </p>
      </div>
      <div class="shrink-0">
        <a
          href={EXTERNAL_LINKS.discordContact}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600"
        >
          <Icon name="discord" class="size-4" />
          {t.contactBtn}
        </a>
      </div>
    </div>
  </section>
</div>
