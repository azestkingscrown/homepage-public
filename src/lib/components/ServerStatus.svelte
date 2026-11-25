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
        track: "bg-gray-200 dark:bg-gray-800",
        fill: "bg-gray-600 dark:bg-gray-400",
      };
    }
    if (pct >= 90) {
      return {
        track: "bg-red-100 dark:bg-red-500/20",
        fill: "bg-red-600 dark:bg-red-500",
      };
    }
    if (pct >= 75) {
      return {
        track: "bg-amber-100 dark:bg-amber-500/20",
        fill: "bg-amber-500 dark:bg-amber-500",
      };
    }
    return {
      track: "bg-indigo-100 dark:bg-indigo-500/20",
      fill: "bg-indigo-600 dark:bg-indigo-500",
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
        class="animate-pulse rounded-lg border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <Icon name="server" class="size-4 text-gray-300 dark:text-gray-700" />
            <div class="h-4 w-32 rounded bg-gray-200 dark:bg-gray-800"></div>
          </div>
          <div class="h-5 w-14 rounded bg-gray-200 dark:bg-gray-800"></div>
        </div>
        <div class="mt-5 space-y-2.5">
          <div class="h-2 w-full rounded bg-gray-200 dark:bg-gray-800"></div>
          <div class="h-2 w-4/5 rounded bg-gray-200 dark:bg-gray-800"></div>
        </div>
        <div class="mt-5 grid grid-cols-2 gap-3">
          <div class="h-16 rounded-md bg-gray-100 dark:bg-gray-900"></div>
          <div class="h-16 rounded-md bg-gray-100 dark:bg-gray-900"></div>
        </div>
      </div>
    {/each}
  </div>
{:else}
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    {#each servers as server (server.name)}
      {#if server.error}
        <div
          class="rounded-lg border border-red-200/80 bg-red-50/40 p-5 shadow-xs dark:border-red-900/60 dark:bg-red-950/15"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2">
              <Icon name="alert" class="size-4 shrink-0 text-red-600 dark:text-red-400" />
              <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-50">
                {server.name}
              </h3>
            </div>
            <span
              class="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-inset ring-red-600/20 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20"
            >
              Offline
            </span>
          </div>
          <div class="mt-3 flex items-center justify-between text-xs text-red-700 dark:text-red-400">
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
          class="flex flex-col justify-between gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-xs transition hover:border-indigo-300 dark:border-gray-800/90 dark:bg-[#090E1A] dark:hover:border-indigo-500/40"
        >
          <!-- Header -->
          <div class="flex items-start justify-between gap-2 border-b border-gray-100 pb-3 dark:border-gray-800/80">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <span class="size-2 shrink-0 rounded-full bg-emerald-500 ring-4 ring-emerald-500/15"></span>
                <h3 class="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">
                  {server.name}
                </h3>
              </div>
              {#if server.totalOutbound}
                <p class="mt-1 font-mono text-[11px] text-gray-500 dark:text-gray-400">
                  TX Total:
                  <span class="font-semibold text-indigo-600 dark:text-indigo-400">
                    {server.totalOutbound}
                  </span>
                </p>
              {/if}
            </div>
            <span
              class="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-600/30 dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20"
            >
              {server.availability ? `${server.availability}%` : "Online"}
            </span>
          </div>

          <!-- CPU Cores -->
          {#if server.cpus && server.cpus.length > 0}
            <div>
              <div class="mb-2 flex items-center justify-between text-xs">
                <span class="inline-flex items-center gap-1 font-medium text-gray-600 dark:text-gray-400">
                  <Icon name="cpu" class="size-3.5" />
                  CPU ({server.cpus.length} cores)
                </span>
                <span class="font-mono font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                  Avg {avgCpu(server.cpus)}%
                </span>
              </div>
              <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {#each server.cpus as core (core.id)}
                  {@const pct = parsePercent(core.usage)}
                  {@const c = barColors(pct)}
                  <div class="flex items-center gap-2 font-mono text-[11px]">
                    <span class="w-4 shrink-0 text-right text-gray-400 dark:text-gray-500">{core.id}</span>
                    <div class="relative flex h-2 flex-1 overflow-hidden rounded-full {c.track}">
                      <div
                        class="h-full rounded-full transition-all duration-300 ease-out {c.fill}"
                        style="width: {pct}%"
                      ></div>
                    </div>
                    <span class="w-9 shrink-0 text-right tabular-nums text-gray-700 dark:text-gray-300">
                      {core.usage}%
                    </span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- RAM & Secondary -->
          <div class="grid grid-cols-2 gap-3 border-t border-gray-100 pt-3 dark:border-gray-800/80">
            {#if server.memory}
              <div class="rounded-md bg-gray-50 p-2.5 dark:bg-gray-900/60">
                <div class="mb-1.5 flex items-center justify-between text-xs">
                  <span class="font-semibold text-gray-600 dark:text-gray-400">RAM</span>
                  <span class="font-mono font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                    {server.memory.percentage}%
                  </span>
                </div>
                <div class="relative flex h-2 w-full overflow-hidden rounded-full {memColor.track}">
                  <div
                    class="h-full rounded-full transition-all duration-300 ease-out {memColor.fill}"
                    style="width: {memPct}%"
                  ></div>
                </div>
                <p class="mt-1.5 font-mono text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                  {server.memory.usedGB}G / {server.memory.totalGB}G
                </p>
              </div>
            {/if}

            {#if secondary}
              {@const secPct = parsePercent(secondary.data.percentage)}
              {@const secColor = barColors(secPct, secondary.neutral)}
              <div class="rounded-md bg-gray-50 p-2.5 dark:bg-gray-900/60">
                <div class="mb-1.5 flex items-center justify-between text-xs">
                  <span class="inline-flex items-center gap-1 font-semibold text-gray-600 dark:text-gray-400">
                    <Icon name="drive" class="size-3" />
                    {secondary.label}
                  </span>
                  <span class="font-mono font-semibold tabular-nums text-gray-900 dark:text-gray-50">
                    {secondary.data.percentage}%
                  </span>
                </div>
                <div class="relative flex h-2 w-full overflow-hidden rounded-full {secColor.track}">
                  <div
                    class="h-full rounded-full transition-all duration-300 ease-out {secColor.fill}"
                    style="width: {secPct}%"
                  ></div>
                </div>
                <p class="mt-1.5 font-mono text-[11px] tabular-nums text-gray-500 dark:text-gray-400">
                  {secondary.data.usedGB}G / {secondary.data.totalGB}G
                </p>
              </div>
            {/if}
          </div>

          <!-- Footer -->
          <div class="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2.5 font-mono text-[11px] text-gray-500 dark:border-gray-800/80 dark:text-gray-400">
            {#if server.network}
              <div class="flex items-center gap-2.5 tabular-nums">
                <span class="inline-flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400">
                  <Icon name="arrowDown" class="size-3" />
                  {server.network.down}
                </span>
                <span class="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400">
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
