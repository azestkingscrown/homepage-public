<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import {
    buildLinuxCommand,
    buildWindowsCommand,
    type DomainState,
    getDeviceOs,
    maskDomain,
  } from "#lib/ddnsHelpers.ts";

  let {
    domains,
    guideDomain,
    onChangeGuideDomain,
    authToken,
    maskSensitive,
    currentUserId,
    isAdmin,
    copiedField,
    onCopy,
    onUpdateOs,
  }: {
    domains: DomainState[];
    guideDomain: string;
    onChangeGuideDomain: (d: string) => void;
    authToken: string;
    maskSensitive: boolean;
    currentUserId?: string;
    isAdmin?: boolean;
    copiedField: string | null;
    onCopy: (text: string, field: string) => void;
    onUpdateOs: (domain: string, os: "windows" | "linux") => void;
  } = $props();

  let activeItem = $derived(
    domains.find((d) => d.domain === guideDomain) || domains[0],
  );
  let activeDomain = $derived(activeItem?.domain || "");
  let activeLabel = $derived(activeItem?.label || "기기");
  let isWindows = $derived(activeItem ? getDeviceOs(activeItem) === "windows" : true);
  let isOwner = $derived(
    activeItem
      ? !activeItem.ownerId || activeItem.ownerId === currentUserId || Boolean(isAdmin)
      : false,
  );
  let displayDomain = $derived(maskDomain(activeDomain, maskSensitive));
  let displayToken = $derived(maskSensitive ? "••••••••••••••••••••••••" : authToken);
  let displayCmd = $derived(
    isWindows
      ? `# PowerShell에서 실행 (기존 파일 삭제 후 재생성 + PM2 등록 및 저장)\n${buildWindowsCommand(displayDomain, displayToken)}`
      : buildLinuxCommand(displayDomain, displayToken),
  );
  let rawCmd = $derived(
    isWindows
      ? buildWindowsCommand(activeDomain, authToken)
      : buildLinuxCommand(activeDomain, authToken),
  );
  let copyKey = $derived(isWindows ? "win-guide-cmd" : "linux-guide-cmd");
</script>

{#if domains.length > 0 && activeItem}
  <div id="setup-guide-section" class="space-y-4 rounded-md border border-oc-border bg-oc-surface p-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-base font-semibold text-oc-strong">
          기기별 자동 갱신 설정 가이드
        </h2>
        <p class="mt-0.5 text-xs text-oc-muted">
          선택한 기기의 OS(Windows / Linux)에 맞춘 PM2 1줄 실행 명령어가 자동 생성됩니다.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <span class="shrink-0 text-xs font-medium text-oc-muted">대상 기기:</span>
        <select
          value={activeDomain}
          onchange={(e) => onChangeGuideDomain(e.currentTarget.value)}
          class="rounded border border-oc-border bg-oc-bg px-3 py-1.5 font-mono text-xs text-oc-strong outline-none focus:border-oc-strong"
        >
          {#each domains as d (d.domain)}
            {@const osText = getDeviceOs(d) === "windows" ? "Windows" : "Linux"}
            <option value={d.domain}>
              {d.label
                ? `${d.label} [${osText}] (${maskDomain(d.domain, maskSensitive)})`
                : `${maskDomain(d.domain, maskSensitive)} [${osText}]`}
            </option>
          {/each}
        </select>
      </div>
    </div>

    <div class="flex flex-wrap items-center justify-between gap-3 rounded border border-oc-border bg-oc-subtle px-4 py-3">
      <div class="flex flex-wrap items-center gap-2">
        <span
          class={isWindows
            ? "rounded border border-oc-border-strong bg-oc-surface px-2 py-0.5 font-mono text-xs font-semibold text-oc-strong"
            : "rounded border border-[#54d483]/30 bg-[#54d483]/10 px-2 py-0.5 font-mono text-xs font-semibold text-[#239f50] dark:text-[#54d483]"}
        >
          {isWindows ? "Windows 전용" : "Linux 전용"}
        </span>
        <span class="text-sm font-semibold text-oc-strong">{activeLabel}</span>
        <span class="font-mono text-xs text-oc-muted">{displayDomain}</span>
      </div>

      {#if isOwner}
        <div class="flex items-center gap-1.5">
          <span class="text-xs text-oc-muted">OS 변경:</span>
          <button
            type="button"
            onclick={() => onUpdateOs(activeDomain, "windows")}
            class={isWindows
              ? "inline-flex cursor-pointer items-center gap-1 rounded bg-oc-strong px-2.5 py-1 text-xs font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
              : "inline-flex cursor-pointer items-center gap-1 rounded border border-oc-border bg-oc-bg px-2.5 py-1 text-xs font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"}
          >
            <Icon name="monitor" class="size-3.5" />
            Windows
          </button>
          <button
            type="button"
            onclick={() => onUpdateOs(activeDomain, "linux")}
            class={!isWindows
              ? "inline-flex cursor-pointer items-center gap-1 rounded bg-oc-strong px-2.5 py-1 text-xs font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
              : "inline-flex cursor-pointer items-center gap-1 rounded border border-oc-border bg-oc-bg px-2.5 py-1 text-xs font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"}
          >
            <Icon name="terminal" class="size-3.5" />
            Linux
          </button>
        </div>
      {/if}
    </div>

    <div class="space-y-2">
      <p class="text-xs text-oc-muted">
        {isWindows
          ? "Windows PowerShell을 열고 아래 1줄 명령어를 붙여넣으면 백그라운드(PM2)에서 10분마다 자동 갱신됩니다."
          : "Linux 터미널을 열고 아래 명령어를 실행하면 PM2가 10분마다 백그라운드 자동 갱신합니다."}
      </p>

      <div class="rounded border border-oc-border bg-[#0c0c0c] p-4">
        <div class="mb-2 flex justify-end">
          <button
            type="button"
            onclick={() => onCopy(rawCmd, copyKey)}
            class="inline-flex cursor-pointer items-center gap-1 rounded border border-[#2e2e2e] bg-[#161616] px-2.5 py-1 text-xs font-medium text-[#fafafa] transition hover:bg-[#242424]"
          >
            <Icon name={copiedField === copyKey ? "check" : "copy"} class="size-3.5 {copiedField === copyKey ? 'text-[#54d483]' : ''}" />
            {copiedField === copyKey ? "복사됨!" : isWindows ? "PowerShell 명령어 복사" : "코드 복사"}
          </button>
        </div>
        <pre class="overflow-x-auto whitespace-pre font-mono text-xs leading-relaxed text-[#fafafa]">{displayCmd}</pre>
      </div>
    </div>
  </div>
{/if}
