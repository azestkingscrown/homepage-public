<script lang="ts">
  import DiscordStatus from "#lib/components/DiscordStatus.svelte";
  import GithubStats from "#lib/components/GithubStats.svelte";
  import Icon from "#lib/components/Icon.svelte";
  import ServerStatus from "#lib/components/ServerStatus.svelte";
  import { buildHostUrls, EXTERNAL_LINKS } from "#lib/siteLinks.ts";

  let { data } = $props();
  let urls = $derived(buildHostUrls(data.host));
</script>

<div class="space-y-8">
  <!-- Page Header -->
  <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 class="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-50 sm:text-2xl">
        Overview
      </h1>
      <p class="text-sm text-gray-500 dark:text-gray-400">
        Personal Workspace, Infrastructure Monitoring &amp; Services
      </p>
    </div>
    <div class="mt-2 sm:mt-0">
      <span class="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-500/30 dark:bg-indigo-400/10 dark:text-indigo-400 dark:ring-indigo-400/30">
        Full-stack Developer &amp; Server Admin
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
          안녕하세요. 아제스트 입니다.
        </h2>
        <p class="max-w-2xl break-keep text-sm leading-relaxed text-gray-600 dark:text-gray-400 sm:text-base">
          다양한 언어를 이용한 각종 개발과 서버 인프라 운영을 취미로 즐깁니다.
          거창한 목표보다는 내가 필요해서 만든 도구들이 누군가에게도 도움이 되기를 바랍니다.
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2.5">
        <a
          href={`${urls.chzzkUrl}/guide`}
          class="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-medium text-white shadow-xs transition hover:bg-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600"
        >
          <Icon name="book" class="size-4" />
          치지직 봇 가이드
        </a>
        <a
          href={`${urls.chzzkUrl}/update`}
          class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-900 shadow-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:hover:bg-gray-900"
        >
          <Icon name="branch" class="size-4" />
          업데이트 내역
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
          혀엉..
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
        Minecraft 제어 패널 →
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
            완전 익명 문의 시스템
          </h3>
          <span class="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
            1:1 Ticket
          </span>
        </div>
        <p class="break-keep text-sm leading-relaxed text-gray-600 dark:text-gray-400">
          프라이버시 보호를 위해 1:1 익명 티켓 시스템을 운영하고 있습니다.
          상담이 시작되면 닉네임이 익명으로 처리되며, 종료 시 상담 내역은 안전하게 보관 후 자동 퇴장 처리됩니다.
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
          문의 서버 입장하기
        </a>
      </div>
    </div>
  </section>
</div>
