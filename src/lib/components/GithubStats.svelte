<script lang="ts">
  import Icon from "./Icon.svelte";

  const GITHUB_USERNAME = "your-github-username";
  const proxyUrl = (url: string) => `/api/proxy-image?url=${encodeURIComponent(url)}`;
</script>

<!-- GitHub & Tokscale AI Stats -->
<div class="rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
  <div class="mb-5 flex items-center justify-between gap-2">
    <div class="flex items-center gap-2">
      <Icon name="github" class="size-5 text-indigo-600 dark:text-indigo-400" />
      <h3 class="text-base font-semibold text-gray-900 dark:text-gray-50">
        GitHub &amp; AI Stats
      </h3>
    </div>
    <a
      href={`https://tokscale.ai/u/${GITHUB_USERNAME}`}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
    >
      Tokscale Profile
      <Icon name="external" class="size-3.5" />
    </a>
  </div>

  <div class="flex flex-col items-center gap-5">
    <div class="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
      <div class="flex items-center justify-center rounded-md border border-gray-200/80 bg-[#1a1b27] p-3 dark:border-gray-800">
        <img
          src={proxyUrl(`https://github-readme-stats-fast.vercel.app/api?username=${GITHUB_USERNAME}&show_icons=true&theme=tokyonight`)}
          alt="GitHub Stats"
          class="no-lightbox max-h-44 w-auto max-w-full"
          referrerpolicy="no-referrer"
        />
      </div>
      <div class="flex items-center justify-center rounded-md border border-gray-200/80 bg-[#1a1b27] p-3 dark:border-gray-800">
        <img
          src={proxyUrl(`https://github-readme-stats-fast.vercel.app/api/top-langs/?username=${GITHUB_USERNAME}&layout=compact&theme=tokyonight`)}
          alt="Top Languages"
          class="no-lightbox max-h-44 w-auto max-w-full"
          referrerpolicy="no-referrer"
        />
      </div>
    </div>

    <div class="flex w-full items-center justify-center rounded-md border border-gray-200/80 bg-[#1a1b27] p-3 dark:border-gray-800">
      <img
        src={proxyUrl(`https://streak-stats.demolab.com/?user=${GITHUB_USERNAME}&theme=tokyonight`)}
        alt="GitHub Streak"
        class="no-lightbox max-h-44 w-auto max-w-full"
        referrerpolicy="no-referrer"
      />
    </div>

    <a
      href={`https://tokscale.ai/u/${GITHUB_USERNAME}`}
      target="_blank"
      rel="noopener noreferrer"
      class="flex w-full justify-center rounded-md border border-gray-200/80 bg-gray-950 p-3 transition hover:border-indigo-500/60 dark:border-gray-800"
    >
      <img
        src={proxyUrl(`https://tokscale.ai/api/embed/${GITHUB_USERNAME}/svg?rank=percent&tokens=full&cost=full`)}
        alt={`Tokscale Stats for @${GITHUB_USERNAME}`}
        class="no-lightbox max-w-full rounded-sm"
        referrerpolicy="no-referrer"
      />
    </a>
  </div>
</div>
