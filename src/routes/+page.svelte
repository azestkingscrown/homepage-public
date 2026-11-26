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
      <h1 class="text-xl font-bold tracking-tight text-oc-strong sm:text-2xl">
        Overview
      </h1>
      <p class="text-sm text-oc-muted">
        {t.subtitle}
      </p>
    </div>
    <div class="mt-2 sm:mt-0">
      <span class="inline-flex items-center rounded border border-oc-border bg-oc-subtle px-2 py-0.5 font-mono text-xs font-medium text-oc-text">
        {t.badge}
      </span>
    </div>
  </div>

  <!-- Hero + Discord Presence -->
  <section class="grid grid-cols-1 gap-4 lg:grid-cols-12">
    <div class="flex flex-col justify-between gap-6 rounded-md border border-oc-border bg-oc-surface p-6 lg:col-span-8">
      <div class="space-y-3">
        <p class="font-mono text-xs font-semibold uppercase tracking-wider text-oc-muted">
          Welcome
        </p>
        <h2 class="break-keep text-2xl font-extrabold tracking-tight text-oc-strong sm:text-3xl">
          {t.greeting}
        </h2>
        <p class="max-w-2xl break-keep text-sm leading-relaxed text-oc-text sm:text-base">
          {t.bio}
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2.5">
        <a
          href={`${urls.chzzkUrl}/guide`}
          class="inline-flex items-center gap-1.5 rounded bg-oc-strong px-3.5 py-2 text-sm font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
        >
          <Icon name="book" class="size-4" />
          {t.btnGuide}
        </a>
        <a
          href={`${urls.chzzkUrl}/update`}
          class="inline-flex items-center gap-1.5 rounded border border-oc-border bg-oc-bg px-3.5 py-2 text-sm font-medium text-oc-strong transition hover:border-oc-border-strong hover:bg-oc-hover"
        >
          <Icon name="branch" class="size-4" />
          {t.btnUpdate}
        </a>
        <a
          href={EXTERNAL_LINKS.github}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 rounded border border-oc-border bg-oc-bg px-3.5 py-2 text-sm font-medium text-oc-strong transition hover:border-oc-border-strong hover:bg-oc-hover"
        >
          <Icon name="github" class="size-4" />
          GitHub
          <Icon name="external" class="size-3.5 text-oc-faint" />
        </a>
        <a
          href={EXTERNAL_LINKS.boySite}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 rounded border border-oc-border bg-oc-subtle px-3.5 py-2 text-sm font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
        >
          {t.btnBoy}
          <Icon name="external" class="size-3.5 text-oc-faint" />
        </a>
        <a
          href={EXTERNAL_LINKS.ggLang}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 rounded border border-oc-border bg-oc-subtle px-3.5 py-2 text-sm font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
        >
          {t.btnGgLang}
          <Icon name="external" class="size-3.5 text-oc-faint" />
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
        <Icon name="server" class="size-5 text-oc-strong" />
        <h2 class="text-lg font-semibold text-oc-strong">
          Server Status
        </h2>
        <span class="inline-flex items-center rounded border border-[#54d483]/30 bg-[#54d483]/10 px-2 py-0.5 font-mono text-xs font-semibold text-[#239f50] dark:text-[#54d483]">
          Real-time · 1s
        </span>
      </div>
      <a
        href="/minecraft"
        class="font-mono text-xs font-medium text-oc-muted transition hover:text-oc-strong hover:underline"
      >
        {t.minecraftPanel}
      </a>
    </div>
    <ServerStatus />
  </section>

  <!-- Tech Stack & GitHub Stats -->
  <section class="space-y-4">
    <h2 class="text-lg font-semibold text-oc-strong">
      Developer Profile &amp; Metrics
    </h2>
    <GithubStats />
  </section>

  <!-- Contact Section -->
  <section class="space-y-4">
    <h2 class="text-lg font-semibold text-oc-strong">Contact</h2>
    <div class="flex flex-col justify-between gap-5 rounded-md border border-oc-border bg-oc-surface p-6 sm:flex-row sm:items-center">
      <div class="max-w-2xl space-y-2">
        <div class="flex items-center gap-2">
          <span class="flex size-8 items-center justify-center rounded border border-oc-border bg-oc-subtle text-oc-strong">
            <Icon name="shield" class="size-4" />
          </span>
          <h3 class="text-base font-semibold text-oc-strong">
            {t.contactTitle}
          </h3>
          <span class="rounded border border-oc-border bg-oc-subtle px-2 py-0.5 font-mono text-xs font-medium text-oc-text">
            1:1 Ticket
          </span>
        </div>
        <p class="break-keep text-sm leading-relaxed text-oc-text">
          {t.contactDesc}
        </p>
      </div>
      <div class="shrink-0">
        <a
          href={EXTERNAL_LINKS.discordContact}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 rounded bg-oc-strong px-4 py-2 text-sm font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
        >
          <Icon name="discord" class="size-4" />
          {t.contactBtn}
        </a>
      </div>
    </div>
  </section>
</div>
