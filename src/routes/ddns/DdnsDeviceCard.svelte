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

<div class="flex flex-col justify-between gap-4 rounded-md border border-oc-border bg-oc-surface p-5 transition hover:border-oc-border-strong">
  <!-- Header -->
  <div class="flex flex-wrap items-start justify-between gap-2">
    <div class="flex flex-wrap items-center gap-2">
      <span
        class={isWindows
          ? "inline-flex items-center gap-1 rounded border border-oc-border-strong bg-oc-subtle px-2 py-0.5 font-mono text-xs font-semibold text-oc-strong"
          : "inline-flex items-center gap-1 rounded border border-[#54d483]/30 bg-[#54d483]/10 px-2 py-0.5 font-mono text-xs font-semibold text-[#239f50] dark:text-[#54d483]"}
      >
        <Icon name={isWindows ? "monitor" : "terminal"} class="size-3" />
        {isWindows ? "Windows" : "Linux"}
      </span>
      <span class="text-sm font-semibold text-oc-strong">{labelName}</span>
      {#if showOwner && item.ownerName}
        <span class="inline-flex items-center gap-1 rounded border border-oc-border bg-oc-subtle px-2 py-0.5 text-xs font-medium text-oc-text">
          <Icon name="user" class="size-3" />
          {item.ownerName}
        </span>
      {/if}
    </div>

    <div class="flex items-center gap-1.5">
      {#if item.isIpMatching}
        <span class="rounded border border-[#54d483]/30 bg-[#54d483]/10 px-2 py-0.5 font-mono text-xs font-semibold text-[#239f50] dark:text-[#54d483]">
          현재 IP 일치
        </span>
      {/if}
      {#if isOwner}
        <button
          type="button"
          disabled={isDeleting}
          onclick={() => onOpenDelete(item.domain, labelName)}
          class="inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[#db2424] transition hover:bg-red-500/10 disabled:opacity-40 dark:text-[#ed5a5a]"
        >
          <Icon name="trash" class="size-3.5" />
          {isDeleting ? "삭제 중..." : "삭제"}
        </button>
      {/if}
    </div>
  </div>

  <!-- Domain -->
  <div class="rounded border border-oc-border bg-oc-subtle p-3">
    <p class="font-mono text-[11px] font-semibold uppercase tracking-wider text-oc-muted">
      연결 도메인 주소
    </p>
    <div class="mt-1 flex items-center justify-between gap-2">
      <span class="break-all font-mono text-sm font-semibold text-oc-strong">
        {maskDomain(item.domain, maskSensitive, revealedItems[domainKey])}
      </span>
      <div class="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onclick={() => onToggleReveal(domainKey)}
          title={revealedItems[domainKey] ? "도메인 가리기" : "도메인 보기"}
          class="cursor-pointer rounded p-1.5 text-oc-muted transition hover:bg-oc-hover hover:text-oc-strong"
        >
          <Icon name={revealedItems[domainKey] ? "eyeOff" : "eye"} class="size-3.5" />
        </button>
        <button
          type="button"
          onclick={() => onCopy(item.domain, domainKey)}
          class="inline-flex cursor-pointer items-center gap-1 rounded border border-oc-border bg-oc-bg px-2 py-1 text-xs font-medium text-oc-strong transition hover:bg-oc-hover"
        >
          <Icon name={copiedField === domainKey ? "check" : "copy"} class="size-3.5 {copiedField === domainKey ? 'text-[#239f50] dark:text-[#54d483]' : ''}" />
          {copiedField === domainKey ? "복사됨" : "복사"}
        </button>
      </div>
    </div>
  </div>

  <!-- IP -->
  <div class="rounded border border-oc-border bg-oc-subtle p-3">
    <p class="font-mono text-[11px] font-semibold uppercase tracking-wider text-oc-muted">
      현재 등록된 공인 IP
    </p>
    <div class="mt-1 flex items-center justify-between gap-2">
      <span class="font-mono text-base font-bold tabular-nums text-[#239f50] dark:text-[#54d483]">
        {maskIp(item.currentIp, maskSensitive, revealedItems[ipKey])}
      </span>
      {#if item.currentIp}
        <div class="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onclick={() => onToggleReveal(ipKey)}
            title={revealedItems[ipKey] ? "IP 가리기" : "IP 보기"}
            class="cursor-pointer rounded p-1.5 text-oc-muted transition hover:bg-oc-hover hover:text-oc-strong"
          >
            <Icon name={revealedItems[ipKey] ? "eyeOff" : "eye"} class="size-3.5" />
          </button>
          <button
            type="button"
            onclick={() => onCopy(item.currentIp!, ipKey)}
            class="inline-flex cursor-pointer items-center gap-1 rounded border border-oc-border bg-oc-bg px-2 py-1 text-xs font-medium text-oc-strong transition hover:bg-oc-hover"
          >
            <Icon name={copiedField === ipKey ? "check" : "copy"} class="size-3.5 {copiedField === ipKey ? 'text-[#239f50] dark:text-[#54d483]' : ''}" />
            {copiedField === ipKey ? "복사됨" : "복사"}
          </button>
        </div>
      {/if}
    </div>
  </div>

  <!-- Timestamps -->
  <div class="space-y-1 border-t border-oc-border pt-3 text-xs text-oc-muted">
    <div class="flex items-center justify-between">
      <span>최근 통신 확인</span>
      <span class={item.lastChecked ? "font-semibold text-[#239f50] dark:text-[#54d483]" : "text-oc-faint"}>
        {formatTimeAgo(item.lastChecked)}
      </span>
    </div>
    <div class="flex items-center justify-between">
      <span>마지막 IP 변경</span>
      <span class="font-medium text-oc-text">{formatTimeAgo(item.lastUpdated)}</span>
    </div>
  </div>

  <!-- Footer -->
  <div class="flex flex-wrap items-center justify-between gap-2 border-t border-oc-border pt-3">
    {#if isOwner}
      <button
        type="button"
        onclick={() => onUpdateOs(item.domain, isWindows ? "linux" : "windows")}
        class="cursor-pointer rounded border border-oc-border bg-oc-subtle px-2.5 py-1 text-xs font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
      >
        {isWindows ? "Linux로 전환" : "Windows로 전환"}
      </button>
    {:else}
      <span></span>
    {/if}

    <button
      type="button"
      onclick={() => onOpenGuide(item.domain)}
      class="inline-flex cursor-pointer items-center gap-1 rounded border border-oc-border bg-oc-bg px-2.5 py-1 text-xs font-medium text-oc-strong transition hover:border-oc-border-strong hover:bg-oc-hover"
    >
      <Icon name="terminal" class="size-3.5 text-oc-strong" />
      설정 가이드
    </button>
  </div>
</div>
