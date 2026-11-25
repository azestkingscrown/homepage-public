<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import { localeStore } from "#lib/locale.svelte.ts";

  let t = $derived(localeStore.t.unauthorized);
</script>

<svelte:head>
  <title>{t.pageTitle}</title>
</svelte:head>

<div class="flex min-h-[70vh] items-center justify-center">
  <div class="w-full max-w-md space-y-5 rounded-md border border-oc-border bg-oc-surface p-6 text-center">
    <div class="mx-auto flex size-14 items-center justify-center rounded-full border border-[#ed5a5a]/30 bg-[#ed5a5a]/10 text-[#db2424] dark:text-[#ed5a5a]">
      <Icon name="shield" class="size-7" />
    </div>

    <div class="space-y-2">
      <span class="inline-flex items-center rounded border border-[#ed5a5a]/30 bg-[#ed5a5a]/10 px-2 py-0.5 font-mono text-xs font-semibold text-[#db2424] dark:text-[#ed5a5a]">
        403 Forbidden
      </span>
      <h1 class="text-xl font-bold text-oc-strong">
        {t.heading}
      </h1>
      <p class="break-keep text-sm leading-relaxed text-oc-text">
        {t.description}
      </p>
    </div>

    <div class="flex flex-col gap-2.5 pt-2">
      <a
        href="/minecraft"
        class="inline-flex w-full items-center justify-center rounded bg-oc-strong px-4 py-2 text-sm font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
      >
        {t.btnBackControl}
      </a>
      <a
        href="/"
        class="inline-flex w-full items-center justify-center gap-1.5 rounded border border-oc-border bg-oc-bg px-4 py-2 text-sm font-medium text-oc-strong transition hover:border-oc-border-strong hover:bg-oc-hover"
      >
        <Icon name="home" class="size-4" />
        {t.btnBackHome}
      </a>
    </div>
  </div>
</div>
