<script lang="ts">
  import { page } from "$app/state";
  import { localeStore } from "#lib/locale.svelte.ts";
  import { EXTERNAL_LINKS } from "#lib/siteLinks.ts";
  import Icon from "./Icon.svelte";

  let hideFooter = $derived((page.url.pathname || "").startsWith("/admin"));
  let t = $derived(localeStore.t.footer);
</script>

{#if !hideFooter}
  <footer
    class="mt-auto border-t border-oc-border bg-oc-bg"
  >
    <div
      class="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6 lg:px-10"
    >
      <p class="font-mono text-xs text-oc-muted">
        © 2026 Azest_Kingscrown. All rights reserved.
      </p>

      <div class="flex flex-wrap items-center justify-center gap-2.5">
        <a
          href={EXTERNAL_LINKS.kakaopay}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 rounded bg-[#FEE500] px-3.5 py-2 text-xs font-bold text-[#0c0c0c] transition hover:opacity-90"
        >
          <Icon name="heart" class="size-3.5 shrink-0" />
          {t.supportKr}
        </a>
        <a
          href={EXTERNAL_LINKS.kofi}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 rounded bg-[#FF5E5B] px-3.5 py-2 text-xs font-bold text-white transition hover:opacity-90"
        >
          <Icon name="cup" class="size-3.5 shrink-0" />
          {t.supportGlobal}
        </a>
      </div>
    </div>
  </footer>
{/if}
