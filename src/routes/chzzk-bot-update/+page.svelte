<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import { localeStore } from "#lib/locale.svelte.ts";
  import { buildHostUrls } from "#lib/siteLinks.ts";

  let { data } = $props();
  let urls = $derived(buildHostUrls(data.host));
  let t = $derived(localeStore.t.update);
</script>

<svelte:head>
  <title>{t.pageTitle}</title>
</svelte:head>

<div class="mx-auto max-w-4xl space-y-6">
  <!-- Header -->
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <div class="flex items-center gap-2">
        <span class="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-500/30 dark:bg-indigo-400/10 dark:text-indigo-400">
          Changelog
        </span>
        <span class="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-600/30 dark:bg-emerald-400/10 dark:text-emerald-400">
          Discord Verified App
        </span>
      </div>
      <h1 class="mt-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
        {t.heading}
      </h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {t.subheading}
      </p>
    </div>

    <div class="flex flex-wrap gap-2">
      <a
        href={`${urls.chzzkUrl}/guide`}
        class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 shadow-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:hover:bg-gray-900"
      >
        <Icon name="book" class="size-4" />
        {t.btnFullGuide}
      </a>
    </div>
  </div>

  <!-- Release 1 -->
  <section class="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3 dark:border-gray-800">
      <div class="flex items-center gap-2">
        <Icon name="cpu" class="size-5 text-indigo-600 dark:text-indigo-400" />
        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-50">
          {t.r1Title}
        </h2>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-400">NEW</span>
        <span class="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">2026.06.29</span>
      </div>
    </div>

    <p class="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
      {t.r1IntroPre}
      <strong class="font-semibold text-gray-900 dark:text-gray-50">
        {t.r1IntroStrong}
      </strong>{t.r1IntroPost}
    </p>

    <ul class="space-y-2.5 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
      <li class="flex gap-2">
        <span class="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500"></span>
        <span><strong class="text-gray-900 dark:text-gray-100">{t.r1b1Title}</strong> {t.r1b1Desc}</span>
      </li>
      <li class="flex gap-2">
        <span class="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500"></span>
        <span><strong class="text-gray-900 dark:text-gray-100">{t.r1b2Title}</strong> {t.r1b2Pre}<strong class="text-indigo-600 dark:text-indigo-400">{t.r1b2Highlight}</strong>{t.r1b2Post}</span>
      </li>
      <li class="flex gap-2">
        <span class="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500"></span>
        <span><strong class="text-gray-900 dark:text-gray-100">{t.r1b3Title}</strong> {t.r1b3Pre}<code class="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs dark:bg-gray-900">client.login()</code>{t.r1b3Post}</span>
      </li>
      <li class="flex gap-2">
        <span class="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500"></span>
        <span><strong class="text-gray-900 dark:text-gray-100">{t.r1b4Title}</strong> {t.r1b4Pre}<code class="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs dark:bg-gray-900">SQLITE_BUSY</code>{t.r1b4Post}</span>
      </li>
      <li class="flex gap-2">
        <span class="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500"></span>
        <span><strong class="text-gray-900 dark:text-gray-100">{t.r1b5Title}</strong> {t.r1b5Desc}</span>
      </li>
    </ul>
  </section>

  <!-- Release 2 -->
  <section class="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3 dark:border-gray-800">
      <div class="flex items-center gap-2">
        <Icon name="globe" class="size-5 text-indigo-600 dark:text-indigo-400" />
        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-50">
          {t.r2Title}
        </h2>
      </div>
      <span class="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">2026.05.31</span>
    </div>

    <ul class="space-y-2.5 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
      <li class="flex gap-2"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500"></span><span><strong class="text-gray-900 dark:text-gray-100">{t.r2b1Title}</strong> {t.r2b1Desc}</span></li>
      <li class="flex gap-2"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500"></span><span><strong class="text-gray-900 dark:text-gray-100">{t.r2b2Title}</strong> {t.r2b2Desc}</span></li>
      <li class="flex gap-2"><span class="mt-2 size-1.5 shrink-0 rounded-full bg-indigo-500"></span><span><strong class="text-gray-900 dark:text-gray-100">{t.r2b3Title}</strong> {t.r2b3Desc}</span></li>
    </ul>
  </section>

  <!-- Feature Update -->
  <section class="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3 dark:border-gray-800">
      <div class="flex items-center gap-2">
        <Icon name="sparkles" class="size-5 text-indigo-600 dark:text-indigo-400" />
        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-50">
          {t.fTitle}
        </h2>
      </div>
      <span class="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-400">Feature</span>
    </div>

    <p class="text-sm leading-relaxed text-gray-600 dark:text-gray-300">
      {t.fIntroPre}<code class="rounded bg-indigo-50 px-1.5 py-0.5 font-mono text-xs font-semibold text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300">/알림메시지설정</code>{t.fIntroPost}
    </p>
    <ul class="space-y-1.5 text-sm leading-relaxed text-gray-600 dark:text-gray-300">
      <li>• <strong class="text-gray-900 dark:text-gray-100">{t.fb1Title}</strong> {t.fb1Desc}</li>
      <li>• <strong class="text-gray-900 dark:text-gray-100">{t.fb2Title}</strong> {t.fb2Pre}<code>@everyone</code>{t.fb2Post}</li>
      <li>• <strong class="text-gray-900 dark:text-gray-100">{t.fb3Title}</strong> <code>/등록</code>{t.fb3Post}</li>
    </ul>
  </section>

  <!-- Examples -->
  <section class="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3 dark:border-gray-800">
      <div class="flex items-center gap-2">
        <Icon name="terminal" class="size-5 text-indigo-600 dark:text-indigo-400" />
        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-50">{t.exTitle}</h2>
      </div>
    </div>

    <div class="space-y-3">
      <div class="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/50">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{t.ex1Title}</h3>
        <pre class="mt-2 overflow-x-auto rounded-md border border-gray-200 bg-white p-3 font-mono text-xs text-indigo-700 dark:border-gray-800 dark:bg-gray-950 dark:text-indigo-300">/알림메시지설정 스트리머:강소연 종류:방송시작 멘션역할:@소연팬 메시지:강소연 방송 켰다! 다들 모여라!</pre>
      </div>
      <div class="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/50">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{t.ex2Title}</h3>
        <pre class="mt-2 overflow-x-auto rounded-md border border-gray-200 bg-white p-3 font-mono text-xs text-indigo-700 dark:border-gray-800 dark:bg-gray-950 dark:text-indigo-300">/알림메시지설정 스트리머:강소연 종류:커뮤니티 멘션역할:(아예 비워둠) 메시지:(원하는 문구 기입 또는 비워둠)</pre>
      </div>
      <div class="rounded-md border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-gray-900/50">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">{t.ex3Title}</h3>
        <pre class="mt-2 overflow-x-auto rounded-md border border-gray-200 bg-white p-3 font-mono text-xs text-indigo-700 dark:border-gray-800 dark:bg-gray-950 dark:text-indigo-300">/알림메시지설정 스트리머:강소연 종류:방송시작 멘션역할:@everyone 메시지: 드디어 {"{streamer}"}님이 방송을 켰습니다!</pre>
      </div>
    </div>
  </section>

  <!-- Bottom Links -->
  <div class="flex flex-wrap items-center gap-3 pt-2">
    <a
      href={`${urls.mainUrl}/`}
      class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-900 shadow-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:hover:bg-gray-900"
    >
      <Icon name="arrowLeft" class="size-4" />
      {t.btnBackMain}
    </a>
    <a
      href={`${urls.chzzkUrl}/guide`}
      class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3.5 py-2 text-sm font-medium text-gray-900 shadow-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:hover:bg-gray-900"
    >
      {t.btnViewGuide}
    </a>
  </div>
</div>
