<script lang="ts">
  import { page } from "$app/state";
  import { EXTERNAL_LINKS } from "#lib/siteLinks.ts";
  import Icon from "./Icon.svelte";

  let hideFooter = $derived((page.url.pathname || "").startsWith("/admin"));
</script>

{#if !hideFooter}
  <footer
    class="mt-auto border-t border-gray-200 bg-white/60 dark:border-gray-800/80 dark:bg-gray-950/60"
  >
    <div
      class="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6 lg:px-10"
    >
      <p class="text-xs text-gray-500 dark:text-gray-400">
        © 2026 Azest_Kingscrown. All rights reserved.
      </p>

      <div class="flex flex-wrap items-center justify-center gap-2.5">
        <a
          href={EXTERNAL_LINKS.kakaopay}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 rounded-md bg-[#FEE500] px-3.5 py-2 text-xs font-bold text-gray-950 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <Icon name="heart" class="size-3.5 shrink-0" />
          Support (Korean)
        </a>
        <a
          href={EXTERNAL_LINKS.kofi}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 rounded-md bg-[#FF5E5B] px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <Icon name="cup" class="size-3.5 shrink-0" />
          Support (Global)
        </a>
      </div>
    </div>
  </footer>
{/if}
