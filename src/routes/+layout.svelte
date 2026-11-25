<script lang="ts">
  import { onMount } from "svelte";
  import "../app.css";
  import Footer from "#lib/components/Footer.svelte";
  import Lightbox from "#lib/components/Lightbox.svelte";
  import Sidebar from "#lib/components/Sidebar.svelte";
  import { localeStore } from "#lib/locale.svelte.ts";
  import { themeStore } from "#lib/theme.svelte.ts";

  let { data, children } = $props();

  onMount(() => {
    return themeStore.init();
  });
</script>

<svelte:head>
  <title>Azest_Kingscrown</title>
  <meta name="description" content={localeStore.t.site.description} />
</svelte:head>

<Sidebar session={data.session} />

<div class="flex min-h-screen flex-col lg:pl-72">
  <main class="mx-auto w-full max-w-6xl flex-1 p-4 sm:px-6 sm:py-8 lg:px-10 lg:py-8">
    {@render children()}
  </main>
  <Footer />
</div>

<Lightbox />
