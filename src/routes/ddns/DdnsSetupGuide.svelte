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
  <div id="setup-guide-section" class="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-base font-semibold text-gray-900 dark:text-gray-50">
          기기별 자동 갱신 설정 가이드
        </h2>
        <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
          선택한 기기의 OS(Windows / Linux)에 맞춘 PM2 1줄 실행 명령어가 자동 생성됩니다.
        </p>
      </div>

      <div class="flex items-center gap-2">
        <span class="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">대상 기기:</span>
        <select
          value={activeDomain}
          onchange={(e) => onChangeGuideDomain(e.currentTarget.value)}
          class="rounded-md border border-gray-300 bg-white px-3 py-1.5 font-mono text-xs text-gray-900 shadow-xs outline-none focus:border-indigo-500 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
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

    <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-gray-900/50">
      <div class="flex flex-wrap items-center gap-2">
        <span
          class={isWindows
            ? "rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-400"
            : "rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-400"}
        >
          {isWindows ? "Windows 전용" : "Linux 전용"}
        </span>
        <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">{activeLabel}</span>
        <span class="font-mono text-xs text-indigo-600 dark:text-indigo-400">{displayDomain}</span>
      </div>

      {#if isOwner}
        <div class="flex items-center gap-1.5">
          <span class="text-xs text-gray-500 dark:text-gray-400">OS 변경:</span>
          <button
            type="button"
            onclick={() => onUpdateOs(activeDomain, "windows")}
            class={isWindows
              ? "inline-flex cursor-pointer items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white"
              : "inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"}
          >
            <Icon name="monitor" class="size-3.5" />
            Windows
          </button>
          <button
            type="button"
            onclick={() => onUpdateOs(activeDomain, "linux")}
            class={!isWindows
              ? "inline-flex cursor-pointer items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white"
              : "inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"}
          >
            <Icon name="terminal" class="size-3.5" />
            Linux
          </button>
        </div>
      {/if}
    </div>

    <div class="space-y-2">
      <p class="text-xs text-gray-600 dark:text-gray-400">
        {isWindows
          ? "Windows PowerShell을 열고 아래 1줄 명령어를 붙여넣으면 백그라운드(PM2)에서 10분마다 자동 갱신됩니다."
          : "Linux 터미널을 열고 아래 명령어를 실행하면 PM2가 10분마다 백그라운드 자동 갱신합니다."}
      </p>

      <div class="rounded-md border border-gray-800 bg-gray-950 p-4">
        <div class="mb-2 flex justify-end">
          <button
            type="button"
            onclick={() => onCopy(rawCmd, copyKey)}
            class="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1 text-xs font-medium text-gray-100 hover:bg-gray-800"
          >
            <Icon name={copiedField === copyKey ? "check" : "copy"} class="size-3.5 {copiedField === copyKey ? 'text-emerald-400' : ''}" />
            {copiedField === copyKey ? "복사됨!" : isWindows ? "PowerShell 명령어 복사" : "코드 복사"}
          </button>
        </div>
        <pre class="overflow-x-auto whitespace-pre font-mono text-xs leading-relaxed text-indigo-300">{displayCmd}</pre>
      </div>
    </div>
  </div>
{/if}
