<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { onMount } from "svelte";
  import Icon from "#lib/components/Icon.svelte";
  import ServerStatus from "#lib/components/ServerStatus.svelte";

  let { data } = $props();

  let status = $state("checking...");
  let health = $state("");
  let isLoading = $state(false);
  let loadingMessage = $state("");
  let isStarting = false;

  let session = $derived(data.session);

  let displayStatus = $derived.by(() => {
    if (status === "running") {
      return health === "healthy" ? "온라인 (정상)" : "실행 중 (로딩 중...)";
    }
    if (status === "exited") return "오프라인 (꺼짐)";
    if (status === "error") return "오류 발생";
    return status;
  });

  let badgeClass = $derived.by(() => {
    if (status === "running") {
      return health === "healthy"
        ? "bg-emerald-50 text-emerald-800 ring-emerald-600/30 dark:bg-emerald-400/10 dark:text-emerald-400"
        : "bg-amber-50 text-amber-800 ring-amber-600/30 dark:bg-amber-400/10 dark:text-amber-400";
    }
    if (status === "exited" || status === "error") {
      return "bg-red-50 text-red-800 ring-red-600/20 dark:bg-red-400/10 dark:text-red-400";
    }
    return "bg-gray-100 text-gray-700 ring-gray-500/25 dark:bg-gray-800 dark:text-gray-300";
  });

  let dotClass = $derived.by(() => {
    if (status === "running") {
      return health === "healthy"
        ? "bg-emerald-500 ring-emerald-500/20"
        : "bg-amber-400 ring-amber-400/20 animate-pulse";
    }
    return "bg-red-500 ring-red-500/20";
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
          loadingMessage = "";
          alert("마인크래프트 서버가 완전히 켜졌습니다!");
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
    loadingMessage =
      action === "start"
        ? "서버가 켜지는 중입니다. 잠시만 기다려주세요..."
        : "서버를 종료하는 중입니다...";
    if (action === "start") isStarting = true;

    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (res.status === 401) {
        alert("세션이 만료되었거나 접근 권한이 없습니다.");
        isLoading = false;
        isStarting = false;
        return;
      }
      if (!res.ok) {
        alert(json.message || "오류가 발생했습니다.");
        isLoading = false;
        isStarting = false;
      } else if (action === "stop") {
        alert(json.message);
        isLoading = false;
      }
    } catch {
      alert("통신 오류가 발생했습니다.");
      isLoading = false;
      isStarting = false;
    }
  }

  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    await invalidateAll();
  }
</script>

<svelte:head>
  <title>마인크래프트 서버 대시보드 | Azest_Kingscrown</title>
</svelte:head>

<div class="space-y-8">
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <div class="flex items-center gap-2">
        <span class="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-500/30 dark:bg-indigo-400/10 dark:text-indigo-400">
          Discord Auth
        </span>
        <span class="rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset {badgeClass}">
          {displayStatus}
        </span>
      </div>
      <h1 class="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
        <Icon name="gamepad" class="size-6 text-indigo-600 dark:text-indigo-400" />
        마인크래프트 서버 대시보드
      </h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        화이트리스트 인증 사용자의 원격 서버 시작/종료 제어 및 리소스 모니터링
      </p>
    </div>

    <a
      href="/admin"
      class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 shadow-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:hover:bg-gray-900"
    >
      <Icon name="admin" class="size-4" />
      관리자 로그 확인
    </a>
  </div>

  <!-- Control Panel -->
  <div class="grid grid-cols-1 gap-4 lg:grid-cols-12">
    <div class="flex flex-col justify-between gap-4 rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A] lg:col-span-5">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          Server Status
        </span>
        <span class="font-mono text-[11px] text-gray-400">3s polling</span>
      </div>

      <div class="flex items-center gap-3 py-2">
        <span class="size-3.5 shrink-0 rounded-full ring-4 {dotClass}"></span>
        <span class="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
          {displayStatus}
        </span>
      </div>

      <p class="text-xs text-gray-500 dark:text-gray-400">
        컨테이너 상태: <span class="font-mono font-semibold text-gray-700 dark:text-gray-300">{status}</span>
        {health ? ` · Health: ${health}` : ""}
      </p>
    </div>

    <div class="flex flex-col justify-between gap-4 rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A] lg:col-span-7">
      {#if !session}
        <div class="flex flex-1 flex-col items-start justify-between gap-4">
          <div>
            <h2 class="text-base font-semibold text-gray-900 dark:text-gray-50">
              서버 제어 인증 필요
            </h2>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
              화이트리스트에 등록된 Discord 계정으로 로그인하면 서버 시작/종료 버튼을 사용할 수 있습니다.
            </p>
          </div>
          <a
            href="/api/auth/signin?callbackUrl=/minecraft"
            data-sveltekit-reload
            class="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#5865F2] px-4 py-2.5 text-sm font-medium text-white shadow-xs transition hover:bg-[#4752C4] sm:w-auto"
          >
            <Icon name="discord" class="size-4" />
            Discord로 로그인
          </a>
        </div>
      {:else}
        <div class="space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-gray-200 bg-gray-50 px-3.5 py-2.5 dark:border-gray-800 dark:bg-gray-900/50">
            <div class="flex items-center gap-2">
              <span class="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-400">
                인증됨
              </span>
              <span class="text-sm font-semibold text-gray-900 dark:text-gray-100">
                {session.user.name} 님 환영합니다
              </span>
            </div>
            <button
              type="button"
              onclick={handleSignOut}
              class="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              <Icon name="logout" class="size-3.5" />
              로그아웃
            </button>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              onclick={() => handleAction("start")}
              disabled={isLoading || (status === "running" && health === "healthy")}
              class="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-xs transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="play" class="size-4" />
              서버 켜기
            </button>
            <button
              type="button"
              onclick={() => handleAction("stop")}
              disabled={isLoading || status === "exited" || status === "offline"}
              class="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-xs transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon name="stop" class="size-4" />
              서버 끄기
            </button>
          </div>

          {#if isLoading}
            <div class="flex items-center gap-2 rounded-md border border-indigo-200 bg-indigo-50/70 px-3.5 py-2.5 text-xs font-medium text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-300">
              <Icon name="loader" class="size-4 shrink-0 animate-spin" />
              <span>{loadingMessage}</span>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <div class="h-px w-full bg-gray-200 dark:bg-gray-800"></div>

  <section class="space-y-4">
    <div class="flex items-center gap-2">
      <Icon name="server" class="size-5 text-indigo-600 dark:text-indigo-400" />
      <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-50">시스템 리소스 상태</h2>
    </div>
    <ServerStatus />
  </section>
</div>
