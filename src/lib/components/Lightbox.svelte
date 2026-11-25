<script lang="ts">
  import { onMount } from "svelte";
  import { localeStore } from "#lib/locale.svelte.ts";
  import Icon from "./Icon.svelte";

  let isOpen = $state(false);
  let src = $state("");
  let alt = $state("");
  let t = $derived(localeStore.t.site);

  function closeLightbox() {
    isOpen = false;
    if (typeof document !== "undefined") {
      document.body.classList.remove("overflow-hidden");
    }
  }

  onMount(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest?.("#lightbox-modal")) return;

      if (
        target.tagName === "IMG" &&
        !target.classList.contains("user-icon") &&
        !target.classList.contains("icon") &&
        !target.classList.contains("no-lightbox") &&
        target.id !== "lightboxImage" &&
        !target.classList.contains("back-button")
      ) {
        const img = target as HTMLImageElement;
        src = img.src;
        alt = img.alt || img.getAttribute("data-caption") || "";
        isOpen = true;
        document.body.classList.add("overflow-hidden");
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLightbox();
    };

    document.addEventListener("click", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.classList.remove("overflow-hidden");
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  });
</script>

{#if isOpen}
  <div
    id="lightbox-modal"
    class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/90 p-4 backdrop-blur-md"
  >
    <button
      type="button"
      aria-label={t.backdropClose}
      onclick={closeLightbox}
      class="absolute inset-0 cursor-zoom-out bg-transparent"
    ></button>
    <button
      type="button"
      aria-label={t.close}
      onclick={closeLightbox}
      class="absolute right-5 top-5 z-20 flex size-10 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/20"
    >
      <Icon name="close" class="size-6" />
    </button>
    <button type="button" onclick={closeLightbox} class="relative z-10 cursor-zoom-out bg-transparent">
      <img
        id="lightboxImage"
        {src}
        {alt}
        class="max-h-[82vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
      />
    </button>
    {#if alt}
      <div class="relative z-10 mt-4 max-w-2xl text-center text-sm text-gray-300">
        {alt}
      </div>
    {/if}
  </div>
{/if}
