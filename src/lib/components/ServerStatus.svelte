<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "./Icon.svelte";

  interface CpuCore {
    id: number;
    usage: string;
  }

  interface ServerData {
    name: string;
    error?: string;
    cpus?: CpuCore[];
    memory?: { usedGB: string; totalGB: string; percentage: string };
    disk?: { usedGB: string; totalGB: string; percentage: string; read: string; write: string };
    network?: { down: string; up: string };
    swap?: { usedGB: string; totalGB: string; percentage: string };
    zram?: { usedGB: string; totalGB: string; percentage: string };
    totalOutbound?: string;
    uptime?: string;
    availability?: string;
    arch?: string;
  }

  let servers = $state<ServerData[] | null>(null);

  function parsePercent(val?: string): number {
    const num = Number.parseFloat(val || "0");
    return Number.isFinite(num) ? Math.min(100, Math.max(0, num)) : 0;
  }

  function barColors(pct: number, neutral = false): { track: string; fill: string } {
    if (neutral) {
      return {
        track: "bg-oc-hover",
        fill: "fill-oc-muted",
      };
    }
    if (pct >= 90) {
      return {
        track: "bg-red-500/15",
        fill: "fill-[#db2424] dark:fill-[#ed5a5a]",
      };
    }
    if (pct >= 75) {
      return {
        track: "bg-amber-500/15",
        fill: "fill-[#eb980a] dark:fill-[#f4b434]",
      };
    }
    return {
      track: "bg-oc-hover",
      fill: "fill-oc-strong",
    };
  }

  function avgCpu(cpus?: CpuCore[]): string {
    if (!cpus || cpus.length === 0) return "0.0";
    const sum = cpus.reduce((acc, c) => acc + parsePercent(c.usage), 0);
    return (sum / cpus.length).toFixed(1);
  }

  onMount(() => {
    let active = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/status");
        const json = await res.json();
        if (active && Array.isArray(json.servers)) {
          servers = json.servers;
        }
      } catch (err) {
        console.error("Failed to fetch status:", err);
      }
    };
    void fetchStatus();
    const interval = setInterval(() => void fetchStatus(), 1000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  });
</script>

{#if !servers}
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    {#each [0, 1, 2, 3] as i (i)}
      <div
        class="animate-pulse rounded-md border border-oc-border bg-oc-surface p-5"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Icon name="server" class="size-4 text-oc-faint" />
            <div class="h-4 w-32 rounded bg-oc-hover"></div>
          </div>
          <div class="h-5 w-14 rounded bg-oc-hover"></div>
        </div>
        <div class="mt-5 space-y-2.5">
          <div class="h-2 w-full rounded-sm bg-oc-hover"></div>
          <div class="h-2 w-4/5 rounded-sm bg-oc-hover"></div>
        </div>
        <div class="mt-5 grid grid-cols-2 gap-3">
          <div class="h-16 rounded border border-oc-border bg-oc-subtle"></div>
          <div class="h-16 rounded border border-oc-border bg-oc-subtle"></div>
        </div>
      </div>
    {/each}
  </div>
{:else}
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    {#each servers as server (server.name)}
      {#if server.error}
        <div
          class="rounded-md border border-red-500/30 bg-red-500/5 p-5"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2">
              <Icon name="alert" class="size-4 shrink-0 text-[#db2424] dark:text-[#ed5a5a]" />
              <h3 class="text-sm font-semibold text-oc-strong">
                {server.name}
              </h3>
            </div>
            <span
              class="inline-flex items-center rounded border border-[#ed5a5a]/30 bg-[#ed5a5a]/10 px-2 py-0.5 font-mono text-xs font-semibold text-[#db2424] dark:text-[#ed5a5a]"
            >
              Offline
            </span>
          </div>
          <div class="mt-3 flex items-center justify-between text-xs text-[#db2424] dark:text-[#ed5a5a]">
            <span>Status: {server.error}</span>
            {#if server.availability}
              <span class="font-mono tabular-nums">AV: {server.availability}%</span>
            {/if}
          </div>
        </div>
      {:else}
        {@const memPct = parsePercent(server.memory?.percentage)}
        {@const memColor = barColors(memPct)}
        {@const secondary = server.zram
          ? { label: "ZRAM", data: server.zram, neutral: true }
          : server.swap
            ? { label: "SWAP", data: server.swap, neutral: true }
            : server.disk
              ? { label: "DISK", data: server.disk, neutral: false }
              : null}
        <div
          class="flex flex-col justify-between gap-4 rounded-md border border-oc-border bg-oc-surface p-5 transition hover:border-oc-border-strong"
        >
          <!-- Header -->
          <div class="flex items-start justify-between gap-2 border-b border-oc-border pb-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="size-2 shrink-0 rounded-full bg-[#239f50] ring-4 ring-[#54d483]/15 dark:bg-[#54d483]"></span>
                <h3 class="truncate text-sm font-semibold text-oc-strong">
                  {server.name}
                </h3>
              </div>
              {#if server.totalOutbound}
                <p class="mt-1 font-mono text-[11px] text-oc-muted">
                  TX Total:
                  <span class="font-semibold text-oc-strong">
                    {server.totalOutbound}
                  </span>
                </p>
              {/if}
            </div>
            <span
              class="inline-flex items-center rounded border border-[#54d483]/30 bg-[#54d483]/10 px-2 py-0.5 font-mono text-xs font-semibold text-[#239f50] dark:text-[#54d483]"
            >
              {server.availability ? `${server.availability}%` : "Online"}
            </span>
          </div>

          <!-- CPU Cores -->
          {#if server.cpus && server.cpus.length > 0}
            <div>
              <div class="mb-2 flex items-center justify-between text-xs">
                <span class="inline-flex items-center gap-1 font-medium text-oc-muted">
                  <Icon name="cpu" class="size-3.5" />
                  CPU ({server.cpus.length} cores)
                </span>
                <span class="font-mono font-semibold tabular-nums text-oc-strong">
                  Avg {avgCpu(server.cpus)}%
                </span>
              </div>
              <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {#each server.cpus as core (core.id)}
                  {@const pct = parsePercent(core.usage)}
                  {@const c = barColors(pct)}
                  <div class="flex items-center gap-2 font-mono text-[11px]">
                    <span class="w-4 shrink-0 text-right text-oc-faint">{core.id}</span>
                    <div class="relative flex h-1.5 flex-1 overflow-hidden rounded-xs {c.track}">
                      <svg viewBox="0 0 100 6" preserveAspectRatio="none" class="block h-full w-full" aria-hidden="true">
                        <rect x="0" y="0" width={pct} height="6" class="transition-all duration-300 ease-out {c.fill}" />
                      </svg>
                    </div>
                    <span class="w-9 shrink-0 text-right tabular-nums text-oc-text">
                      {core.usage}%
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- RAM & Secondary -->
          <div class="grid grid-cols-2 gap-3 border-t border-oc-border pt-3">
            {#if server.memory}
              <div class="rounded border border-oc-border bg-oc-subtle p-2.5">
                <div class="mb-1.5 flex items-center justify-between text-xs">
                  <span class="font-mono font-semibold text-oc-muted">RAM</span>
                  <span class="font-mono font-semibold tabular-nums text-oc-strong">
                    {server.memory.percentage}%
                  </span>
                </div>
                <div class="relative flex h-1.5 w-full overflow-hidden rounded-xs {memColor.track}">
                  <svg viewBox="0 0 100 6" preserveAspectRatio="none" class="block h-full w-full" aria-hidden="true">
                    <rect x="0" y="0" width={memPct} height="6" class="transition-all duration-300 ease-out {memColor.fill}" />
                  </svg>
                </div>
                <p class="mt-1.5 font-mono text-[11px] tabular-nums text-oc-muted">
                  {server.memory.usedGB}G / {server.memory.totalGB}G
                </p>
              </div>
            {/if}

            {#if secondary}
              {@const secPct = parsePercent(secondary.data.percentage)}
              {@const secColor = barColors(secPct, secondary.neutral)}
              <div class="rounded border border-oc-border bg-oc-subtle p-2.5">
                <div class="mb-1.5 flex items-center justify-between text-xs">
                  <span class="inline-flex items-center gap-1 font-mono font-semibold text-oc-muted">
                    <Icon name="drive" class="size-3" />
                    {secondary.label}
                  </span>
                  <span class="font-mono font-semibold tabular-nums text-oc-strong">
                    {secondary.data.percentage}%
                  </span>
                </div>
                <div class="relative flex h-1.5 w-full overflow-hidden rounded-xs {secColor.track}">
                  <svg viewBox="0 0 100 6" preserveAspectRatio="none" class="block h-full w-full" aria-hidden="true">
                    <rect x="0" y="0" width={secPct} height="6" class="transition-all duration-300 ease-out {secColor.fill}" />
                  </svg>
                </div>
                <p class="mt-1.5 font-mono text-[11px] tabular-nums text-oc-muted">
                  {secondary.data.usedGB}G / {secondary.data.totalGB}G
                </p>
              </div>
            {/if}
          </div>

          <!-- Footer -->
          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-oc-border pt-2.5 font-mono text-[11px] text-oc-muted">
            {#if server.network}
              <div class="flex items-center gap-2.5 tabular-nums">
                <span class="inline-flex items-center gap-0.5 text-oc-strong">
                  <Icon name="arrowDown" class="size-3" />
                  {server.network.down}
                </span>
                <span class="inline-flex items-center gap-0.5 text-[#239f50] dark:text-[#54d483]">
                  <Icon name="arrowUp" class="size-3" />
                  {server.network.up}
                </span>
              </div>
            {:else}
              <span></span>
            {/if}
            {#if server.uptime}
              <span class="inline-flex items-center gap-1 tabular-nums">
                <Icon name="clock" class="size-3" />
                {server.uptime}
              </span>
            {/if}
          </div>
        </div>
      {/if}
    {/each}
  </div>
{/if}
