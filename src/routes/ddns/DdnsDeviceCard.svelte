<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import {
    type DomainState,
    formatTimeAgo,
    getDeviceOs,
    maskDomain,
    maskIp,
  } from "#lib/ddnsHelpers.ts";

  let {
    item,
    showOwner,
    isOwner,
    isDeleting,
    maskSensitive,
    revealedItems,
    copiedField,
    onToggleReveal,
    onCopy,
    onUpdateOs,
    onOpenGuide,
    onOpenDelete,
  }: {
    item: DomainState;
    showOwner: boolean;
    isOwner: boolean;
    isDeleting: boolean;
    maskSensitive: boolean;
    revealedItems: Record<string, boolean>;
    copiedField: string | null;
    onToggleReveal: (key: string) => void;
    onCopy: (text: string, field: string) => void;
    onUpdateOs: (domain: string, os: "windows" | "linux") => void;
    onOpenGuide: (domain: string) => void;
    onOpenDelete: (domain: string, label: string) => void;
  } = $props();

  let labelName = $derived(item.label || "기기");
  let isWindows = $derived(getDeviceOs(item) === "windows");
  let domainKey = $derived(`domain-${item.domain}`);
  let ipKey = $derived(`ip-${item.domain}`);
</script>

<div class="flex flex-col justify-between gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-xs transition hover:border-indigo-300 dark:border-gray-800/90 dark:bg-[#090E1A] dark:hover:border-indigo-500/40">
  <!-- Header -->
  <div class="flex flex-wrap items-start justify-between gap-2">
    <div class="flex flex-wrap items-center gap-2">
      <span
        class={isWindows
          ? "inline-flex items-center gap-1 rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-500/30 dark:bg-indigo-400/10 dark:text-indigo-400"
          : "inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-600/30 dark:bg-emerald-400/10 dark:text-emerald-400"}
      >
        <Icon name={isWindows ? "monitor" : "terminal"} class="size-3" />
        {isWindows ? "Windows" : "Linux"}
      </span>
      <span class="text-sm font-semibold text-gray-900 dark:text-gray-50">{labelName}</span>
      {#if showOwner && item.ownerName}
        <span class="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          <Icon name="user" class="size-3" />
          {item.ownerName}
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-1.5">
      {#if item.isIpMatching}
        <span class="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-400">
          현재 IP 일치
        </span>
      {/if}
      {#if isOwner}
        <button
          type="button"
          disabled={isDeleting}
          onclick={() => onOpenDelete(item.domain, labelName)}
          class="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-950/40"
        >
          <Icon name="trash" class="size-3.5" />
          {isDeleting ? "삭제 중..." : "삭제"}
        </button>
      {/if}
    </div>
  </div>

  <!-- Domain -->
  <div class="rounded-md bg-gray-50 p-3 dark:bg-gray-900/60">
    <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
      연결 도메인 주소
    </p>
    <div class="mt-1 flex items-center justify-between gap-2">
      <span class="break-all font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400">
        {maskDomain(item.domain, maskSensitive, revealedItems[domainKey])}
      </span>
      <div class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onclick={() => onToggleReveal(domainKey)}
          title={revealedItems[domainKey] ? "도메인 가리기" : "도메인 보기"}
          class="cursor-pointer rounded-md p-1.5 text-gray-500 hover:bg-gray-200/70 dark:text-gray-400 dark:hover:bg-gray-800"
        >
          <Icon name={revealedItems[domainKey] ? "eyeOff" : "eye"} class="size-3.5" />
        </button>
        <button
          type="button"
          onclick={() => onCopy(item.domain, domainKey)}
          class="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
        >
          <Icon name={copiedField === domainKey ? "check" : "copy"} class="size-3.5 {copiedField === domainKey ? 'text-emerald-500' : ''}" />
          {copiedField === domainKey ? "복사됨" : "복사"}
        </button>
      </div>
    </div>
  </div>

  <!-- IP -->
  <div class="rounded-md bg-gray-50 p-3 dark:bg-gray-900/60">
    <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
      현재 등록된 공인 IP
    </p>
    <div class="mt-1 flex items-center justify-between gap-2">
      <span class="font-mono text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
        {maskIp(item.currentIp, maskSensitive, revealedItems[ipKey])}
      </span>
      {#if item.currentIp}
        <div class="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onclick={() => onToggleReveal(ipKey)}
            title={revealedItems[ipKey] ? "IP 가리기" : "IP 보기"}
            class="cursor-pointer rounded-md p-1.5 text-gray-500 hover:bg-gray-200/70 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <Icon name={revealedItems[ipKey] ? "eyeOff" : "eye"} class="size-3.5" />
          </button>
          <button
            type="button"
            onclick={() => onCopy(item.currentIp!, ipKey)}
            class="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
          >
            <Icon name={copiedField === ipKey ? "check" : "copy"} class="size-3.5 {copiedField === ipKey ? 'text-emerald-500' : ''}" />
            {copiedField === ipKey ? "복사됨" : "복사"}
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Timestamps -->
  <div class="space-y-1 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-800/80 dark:text-gray-400">
    <div class="flex items-center justify-between">
      <span>최근 통신 확인</span>
      <span class={item.lastChecked ? "font-semibold text-emerald-600 dark:text-emerald-400" : "text-gray-400"}>
        {formatTimeAgo(item.lastChecked)}
      </span>
    </div>
    <div class="flex items-center justify-between">
      <span>마지막 IP 변경</span>
      <span class="font-medium text-gray-700 dark:text-gray-300">{formatTimeAgo(item.lastUpdated)}</span>
    </div>
  </div>

  <!-- Footer -->
  <div class="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 dark:border-gray-800/80">
    {#if isOwner}
      <button
        type="button"
        onclick={() => onUpdateOs(item.domain, isWindows ? "linux" : "windows")}
        class="cursor-pointer rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-800 transition hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
      >
        {isWindows ? "Linux로 전환" : "Windows로 전환"}
      </button>
    {:else}
      <span></span>
    {/if}

    <button
      type="button"
      onclick={() => onOpenGuide(item.domain)}
      class="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-800 transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-200"
    >
      <Icon name="terminal" class="size-3.5 text-indigo-600 dark:text-indigo-400" />
      설정 가이드
    </button>
  </div>
</div>
