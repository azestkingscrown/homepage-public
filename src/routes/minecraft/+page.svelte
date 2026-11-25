<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { onMount } from "svelte";
  import Icon from "#lib/components/Icon.svelte";
  import ServerStatus from "#lib/components/ServerStatus.svelte";
  import { localeStore } from "#lib/locale.svelte.ts";

  let { data } = $props();

  let status = $state("checking");
  let health = $state("");
  let isLoading = $state(false);
  let pendingAction = $state<"start" | "stop" | null>(null);
  let isStarting = false;

  let session = $derived(data.session);
  let t = $derived(localeStore.t.minecraft);

  let loadingMessage = $derived(
    pendingAction === "start" ? t.startingMsg : t.stoppingMsg,
  );

  let displayStatus = $derived.by(() => {
    if (status === "checking") return t.checking;
    if (status === "running") {
      return health === "healthy" ? t.onlineHealthy : t.startingLoading;
    }
    if (status === "exited") return t.offlineStopped;
    if (status === "error") return t.statusError;
    return status;
  });

  let badgeClass = $derived.by(() => {
    if (status === "running") {
      return health === "healthy"
        ? "border-[#54d483]/30 bg-[#54d483]/10 text-[#239f50] dark:text-[#54d483]"
        : "border-[#f4b434]/30 bg-[#f4b434]/10 text-[#eb980a] dark:text-[#f4b434]";
    }
    if (status === "exited" || status === "error") {
      return "border-[#ed5a5a]/30 bg-[#ed5a5a]/10 text-[#db2424] dark:text-[#ed5a5a]";
    }
    return "border-oc-border bg-oc-subtle text-oc-muted";
  });

  let dotClass = $derived.by(() => {
    if (status === "running") {
      return health === "healthy"
        ? "bg-[#239f50] ring-[#54d483]/20 dark:bg-[#54d483]"
        : "bg-[#eb980a] ring-[#f4b434]/20 animate-pulse dark:bg-[#f4b434]";
    }
    return "bg-[#db2424] ring-[#ed5a5a]/20 dark:bg-[#ed5a5a]";
  });

  onMount(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch("/api/server");
        const json = await res.json();
        if (!active) return;
        status = json.status;
        health = json.health;
        if (isStarting && json.status === "running" && json.health === "healthy") {
          isStarting = false;
          isLoading = false;
          pendingAction = null;
          alert(localeStore.t.minecraft.startedAlert);
        }
      } catch {
        if (active) status = "error";
      }
    };
    void poll();
    const interval = setInterval(() => void poll(), 3000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  });

  async function handleAction(action: "start" | "stop") {
    isLoading = true;
    pendingAction = action;
    if (action === "start") isStarting = true;

    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (res.status === 401) {
        alert(localeStore.t.minecraft.unauthorizedAlert);
        isLoading = false;
        isStarting = false;
        pendingAction = null;
        return;
      }
      if (!res.ok) {
        alert(json.message || localeStore.t.minecraft.errorAlert);
        isLoading = false;
        isStarting = false;
        pendingAction = null;
      } else if (action === "stop") {
        alert(json.message);
        isLoading = false;
        pendingAction = null;
      }
    } catch {
      alert(localeStore.t.minecraft.networkErrorAlert);
      isLoading = false;
      isStarting = false;
      pendingAction = null;
    }
  }

  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    await invalidateAll();
  }
</script>

<svelte:head>
  <title>{t.pageTitle}</title>
</svelte:head>

<div class="space-y-8">
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <div class="flex items-center gap-2">
        <span class="rounded border border-oc-border bg-oc-subtle px-2 py-0.5 font-mono text-xs font-medium text-oc-text">
          Discord Auth
        </span>
        <span class="rounded border px-2 py-0.5 font-mono text-xs font-semibold {badgeClass}">
          {displayStatus}
        </span>
      </div>
      <h1 class="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight text-oc-strong">
        <Icon name="gamepad" class="size-6 text-oc-strong" />
        {t.heading}
      </h1>
      <p class="mt-1 text-sm text-oc-muted">
        {t.subheading}
      </p>
    </div>

    <a
      href="/admin"
      class="inline-flex items-center gap-1.5 rounded border border-oc-border bg-oc-bg px-3 py-1.5 text-xs font-medium text-oc-strong transition hover:border-oc-border-strong hover:bg-oc-hover"
    >
      <Icon name="admin" class="size-4" />
      {t.btnAdminLogs}
    </a>
  </div>

  <!-- Control Panel -->
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
    <div class="flex flex-col justify-between gap-4 rounded-md border border-oc-border bg-oc-surface p-6 lg:col-span-5">
      <div class="flex items-center justify-between">
        <span class="font-mono text-xs font-semibold uppercase tracking-wider text-oc-muted">
          Server Status
        </span>
        <span class="font-mono text-[11px] text-oc-faint">3s polling</span>
      </div>

      <div class="flex items-center gap-3 py-2">
        <span class="size-3.5 shrink-0 rounded-full ring-4 {dotClass}"></span>
        <span class="text-2xl font-bold tracking-tight text-oc-strong">
          {displayStatus}
        </span>
      </div>

      <p class="text-xs text-oc-muted">
        {t.containerStatus} <span class="font-mono font-semibold text-oc-strong">{status}</span>
        {health ? ` · Health: ${health}` : ""}
      </p>
    </div>

    <div class="flex flex-col justify-between gap-4 rounded-md border border-oc-border bg-oc-surface p-6 lg:col-span-7">
      {#if !session}
        <div class="flex flex-1 flex-col items-start justify-between gap-4">
          <div>
            <h2 class="text-base font-semibold text-oc-strong">
              {t.authRequiredTitle}
            </h2>
            <p class="mt-1 text-sm text-oc-muted">
              {t.authRequiredDesc}
            </p>
          </div>
          <a
            href="/api/auth/signin?callbackUrl=/minecraft"
            data-sveltekit-reload
            class="inline-flex w-full items-center justify-center gap-2 rounded bg-[#5865F2] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#4752C4] sm:w-auto"
          >
            <Icon name="discord" class="size-4" />
            {t.loginWithDiscord}
          </a>
        </div>
      {:else}
        <div class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 rounded border border-oc-border bg-oc-subtle px-3.5 py-2.5">
            <div class="flex items-center gap-2">
              <span class="rounded border border-[#54d483]/30 bg-[#54d483]/10 px-2 py-0.5 font-mono text-xs font-semibold text-[#239f50] dark:text-[#54d483]">
                {t.verifiedBadge}
              </span>
              <span class="text-sm font-semibold text-oc-strong">
                {session.user.name}{t.welcomeSuffix}
              </span>
            </div>
            <button
              type="button"
              onclick={handleSignOut}
              class="inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[#db2424] transition hover:bg-red-500/10 dark:text-[#ed5a5a]"
            >
              <Icon name="logout" class="size-3.5" />
              {t.signOut}
            </button>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onclick={() => handleAction("start")}
              disabled={isLoading || (status === "running" && health === "healthy")}
              class="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="play" class="size-4" />
              {t.btnStart}
            </button>
            <button
              type="button"
              onclick={() => handleAction("stop")}
              disabled={isLoading || status === "exited" || status === "offline"}
              class="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded bg-red-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="stop" class="size-4" />
              {t.btnStop}
            </button>
          </div>

          {#if isLoading}
            <div class="flex items-center gap-2 rounded border border-oc-border-strong bg-oc-subtle px-3.5 py-2.5 text-xs font-medium text-oc-strong">
              <Icon name="loader" class="size-4 shrink-0 animate-spin" />
              <span>{loadingMessage}</span>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <div class="h-px w-full bg-oc-border"></div>

  <section class="space-y-4">
    <div class="flex items-center gap-2">
      <Icon name="server" class="size-5 text-oc-strong" />
      <h2 class="text-lg font-semibold text-oc-strong">{t.systemResources}</h2>
    </div>
    <ServerStatus />
  </section>
</div>
