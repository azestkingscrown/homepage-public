<script lang="ts">
  import Icon from "./Icon.svelte";

  const GITHUB_USERNAME = "your-github-username";
  const proxyUrl = (url: string) => `/api/proxy-image?url=${encodeURIComponent(url)}`;
</script>

<!-- GitHub & Tokscale AI Stats -->
<div class="rounded-md border border-oc-border bg-oc-surface p-6">
  <div class="mb-5 flex items-center justify-between gap-2">
    <div class="flex items-center gap-2">
      <Icon name="github" class="size-5 text-oc-strong" />
      <h3 class="text-base font-semibold text-oc-strong">
        GitHub &amp; AI Stats
      </h3>
    </div>
    <a
      href={`https://tokscale.ai/u/${GITHUB_USERNAME}`}
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 font-mono text-xs font-medium text-oc-muted transition hover:text-oc-strong hover:underline"
    >
      Tokscale Profile
      <Icon name="external" class="size-3.5" />
    </a>
  </div>

  <div class="flex flex-col items-center gap-5">
    <div class="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
      <div class="flex items-center justify-center rounded border border-oc-border bg-[#161616] p-3">
        <img
          src={proxyUrl(`https://github-readme-stats-fast.vercel.app/api?username=${GITHUB_USERNAME}&show_icons=true&bg_color=161616&title_color=fafafa&text_color=aeaeae&icon_color=dbdbdb&hide_border=true`)}
          alt="GitHub Stats"
          class="no-lightbox max-h-44 w-auto max-w-full"
          referrerpolicy="no-referrer"
        />
      </div>
      <div class="flex items-center justify-center rounded border border-oc-border bg-[#161616] p-3">
        <img
          src={proxyUrl(`https://github-readme-stats-fast.vercel.app/api/top-langs/?username=${GITHUB_USERNAME}&layout=compact&bg_color=161616&title_color=fafafa&text_color=aeaeae&icon_color=dbdbdb&hide_border=true`)}
          alt="Top Languages"
          class="no-lightbox max-h-44 w-auto max-w-full"
          referrerpolicy="no-referrer"
        />
      </div>
    </div>

    <div class="flex w-full items-center justify-center rounded border border-oc-border bg-[#161616] p-3">
      <img
        src={proxyUrl(`https://streak-stats.demolab.com/?user=${GITHUB_USERNAME}&background=161616&stroke=2e2e2e&ring=fafafa&fire=fafafa&currStreakNum=fafafa&sideNums=fafafa&currStreakLabel=aeaeae&sideLabels=aeaeae&dates=8f8f8f&hide_border=true`)}
        alt="GitHub Streak"
        class="no-lightbox max-h-44 w-auto max-w-full"
        referrerpolicy="no-referrer"
      />
    </div>

    <a
      href={`https://tokscale.ai/u/${GITHUB_USERNAME}`}
      target="_blank"
      rel="noopener noreferrer"
      class="flex w-full justify-center rounded border border-oc-border bg-[#161616] p-3 transition hover:border-oc-border-strong"
    >
      <img
        src="/api/tokscale-status?theme=dark&hide_border=true"
        alt={`Tokscale Stats for @${GITHUB_USERNAME}`}
        class="no-lightbox max-w-full rounded-xs"
        referrerpolicy="no-referrer"
      />
    </a>
  </div>
</div>
