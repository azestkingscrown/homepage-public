<script lang="ts">
  import { invalidateAll } from "$app/navigation";
  import { onMount } from "svelte";
  import Icon from "#lib/components/Icon.svelte";
  import {
    type AdminDataState,
    buildLinuxCommand,
    buildWindowsCommand,
    type DdnsApiResponse,
    maskDomain,
    maskIp,
  } from "#lib/ddnsHelpers.ts";
  import DdnsAdminUsersPanel from "./DdnsAdminUsersPanel.svelte";
  import DdnsDeviceCard from "./DdnsDeviceCard.svelte";
  import DdnsSetupGuide from "./DdnsSetupGuide.svelte";

  let { data: layoutData } = $props();

  let authToken = $state("");
  let tokenInput = $state("");
  let ddnsData = $state<DdnsApiResponse | null>(null);
  let clientIp = $state("");
  let loading = $state(true);
  let authError = $state("");
  let copiedField = $state<string | null>(null);
  let selectedDomain = $state("");
  let guideDomain = $state("");
  let updateResult = $state<{ success: boolean; message: string } | null>(null);
  let isUpdating = $state(false);

  // 탭 & 토큰
  let activeTab = $state<"my" | "all" | "admin">("my");
  let showTokenValue = $state(false);
  let isRegenModalOpen = $state(false);
  let isRegenerating = $state(false);
  let regenTargetUser = $state<{ id: string; name: string } | null>(null);

  // 관리자
  let adminData = $state<AdminDataState | null>(null);
  let adminLoading = $state(false);
  let isAddUserModalOpen = $state(false);
  let newDiscordId = $state("");
  let newDiscordName = $state("");
  let isSubmittingUser = $state(false);

  // 기기 추가/삭제
  let isAddModalOpen = $state(false);
  let newPrefix = $state("");
  let newLabel = $state("");
  let newOs = $state<"windows" | "linux">("windows");
  let newIp = $state("");
  let targetOwnerId = $state("");
  let isSubmittingAdd = $state(false);
  let deletingDomain = $state<string | null>(null);
  let targetDelete = $state<{ domain: string; label: string } | null>(null);
  let deleteConfirmText = $state("");
  let createdGuide = $state<{ domain: string; label: string } | null>(null);
  let createdGuideTab = $state<"windows" | "linux">("windows");
  let feedbackMsg = $state<{ text: string; type: "success" | "error" } | null>(null);

  // 마스킹 & 보안 안내
  let maskSensitive = $state(true);
  let revealedItems = $state<Record<string, boolean>>({});
  let showSecurityModal = $state(false);
  let dontShowToday = $state(false);

  let session = $derived(layoutData.session);
  let displayDomains = $derived(
    ddnsData
      ? activeTab === "all" && ddnsData.allDomains
        ? ddnsData.allDomains
        : ddnsData.domains
      : [],
  );

  function toggleRevealItem(key: string) {
    revealedItems = { ...revealedItems, [key]: !revealedItems[key] };
  }

  function copyToClipboard(text: string, fieldName: string) {
    navigator.clipboard.writeText(text);
    copiedField = fieldName;
    setTimeout(() => {
      if (copiedField === fieldName) copiedField = null;
    }, 2000);
  }

  function generateRandomSubdomain() {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    let res = "";
    for (let i = 0; i < 7; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    newPrefix = res;
  }

  function handleCloseSecurityModal() {
    if (dontShowToday) {
      try {
        localStorage.setItem(
          "ddns_hide_security_notice_date",
          new Date().toISOString().slice(0, 10),
        );
      } catch {}
    }
    showSecurityModal = false;
  }

  async function fetchStatus(tokenToUse?: string) {
    try {
      loading = true;
      authError = "";
      const activeTok = tokenToUse ?? authToken;
      const headers: Record<string, string> = activeTok
        ? { Authorization: `Bearer ${activeTok}` }
        : {};
      const res = await fetch("/api/ddns", { headers, cache: "no-store" });
      const json = (await res.json()) as DdnsApiResponse & { message?: string };

      if (!res.ok || !json.success) {
        authError = json.message || "인증 권한이 없습니다.";
        ddnsData = null;
        if (json.clientIp) clientIp = json.clientIp;
        return;
      }

      ddnsData = json;
      clientIp = json.clientIp;
      if (json.authToken) authToken = json.authToken;
      if (json.domains?.length) {
        if (!json.domains.some((d) => d.domain === selectedDomain)) {
          selectedDomain = json.domains[0].domain;
        }
        if (!json.domains.some((d) => d.domain === guideDomain)) {
          guideDomain = json.domains[0].domain;
        }
      }
    } catch {
      authError = "서버와 통신할 수 없습니다.";
    } finally {
      loading = false;
    }
  }

  async function fetchAdminData() {
    try {
      adminLoading = true;
      const headers: Record<string, string> = authToken
        ? { Authorization: `Bearer ${authToken}` }
        : {};
      const res = await fetch("/api/ddns?view=admin", {
        headers,
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok && json.success) {
        adminData = {
          users: json.users || [],
          whitelist: json.whitelist || [],
          domains: json.domains || [],
        };
      }
    } catch (err) {
      console.error("관리자 데이터 조회 실패:", err);
    } finally {
      adminLoading = false;
    }
  }

  onMount(() => {
    let initialTok = "";
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      initialTok = urlToken;
      authToken = urlToken;
      localStorage.setItem("ddns_access_token", urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    } else {
      const saved = localStorage.getItem("ddns_access_token");
      if (saved) {
        initialTok = saved;
        authToken = saved;
      }
    }

    try {
      const hideDate = localStorage.getItem("ddns_hide_security_notice_date");
      const today = new Date().toISOString().slice(0, 10);
      if (hideDate !== today) showSecurityModal = true;
    } catch {
      showSecurityModal = true;
    }

    if (session || initialTok) {
      void fetchStatus(initialTok || undefined);
    } else {
      // 비인증 상태라도 내 공인 IP 조회용 1회 요청
      void fetchStatus();
    }

    const interval = setInterval(() => {
      if (ddnsData) void fetchStatus(authToken || undefined);
    }, 30000);
    return () => clearInterval(interval);
  });

  function handleLoginSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    const tok = tokenInput.trim();
    authToken = tok;
    localStorage.setItem("ddns_access_token", tok);
    void fetchStatus(tok);
  }

  async function handleLogout() {
    localStorage.removeItem("ddns_access_token");
    authToken = "";
    ddnsData = null;
    authError = "";
    tokenInput = "";
    if (session) {
      await fetch("/api/auth/signout", { method: "POST" });
      await invalidateAll();
    }
  }

  async function handleManualUpdate() {
    if (!authToken) return;
    try {
      isUpdating = true;
      updateResult = null;
      const target = selectedDomain || ddnsData?.domains[0]?.domain || "";
      const res = await fetch(
        `/api/ddns/update?domain=${encodeURIComponent(target)}`,
        { headers: { Authorization: `Bearer ${authToken}` }, cache: "no-store" },
      );
      const result = await res.json();
      if (res.ok && result.success) {
        updateResult = {
          success: true,
          message: result.updated
            ? `[${target}] IP가 성공적으로 갱신되었습니다.`
            : `[${target}] 이미 최신 IP로 유지 중입니다.`,
        };
        await fetchStatus(authToken);
      } else {
        updateResult = {
          success: false,
          message: result.message || "IP 갱신에 실패했습니다.",
        };
      }
    } catch (err: unknown) {
      updateResult = {
        success: false,
        message: `통신 오류: ${err instanceof Error ? err.message : "알 수 없음"}`,
      };
    } finally {
      isUpdating = false;
    }
  }

  async function handleAddDomain(e: SubmitEvent) {
    e.preventDefault();
    if (!newPrefix.trim()) {
      feedbackMsg = { text: "서브도메인 영문 이름을 입력해주세요.", type: "error" };
      return;
    }
    isSubmittingAdd = true;
    feedbackMsg = null;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      };
      const finalLabel =
        newLabel.trim() || (newOs === "windows" ? "Windows PC" : "Linux Mini PC");
      const res = await fetch("/api/ddns", {
        method: "POST",
        headers,
        body: JSON.stringify({
          domain: newPrefix.trim(),
          label: finalLabel,
          os: newOs,
          ip: newIp.trim() || clientIp || undefined,
          ownerId: targetOwnerId || undefined,
        }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        feedbackMsg = {
          text: `${result.domain} 기기가 성공적으로 등록되었습니다.`,
          type: "success",
        };
        createdGuide = { domain: result.domain, label: finalLabel };
        createdGuideTab = newOs;
        guideDomain = result.domain;
        newPrefix = "";
        newLabel = "";
        newIp = "";
        targetOwnerId = "";
        isAddModalOpen = false;
        await fetchStatus(authToken || undefined);
        if (ddnsData?.isAdmin) await fetchAdminData();
      } else {
        feedbackMsg = { text: result.message || "등록에 실패했습니다.", type: "error" };
      }
    } catch {
      feedbackMsg = { text: "네트워크 오류가 발생했습니다.", type: "error" };
    } finally {
      isSubmittingAdd = false;
    }
  }

  async function handleUpdateDeviceOs(domain: string, os: "windows" | "linux") {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      };
      const res = await fetch("/api/ddns", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "update_os", domain, os }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        feedbackMsg = {
          text: `[${domain}] 기기 OS가 ${os === "windows" ? "Windows" : "Linux"}로 변경되었습니다.`,
          type: "success",
        };
        await fetchStatus(authToken || undefined);
      } else {
        feedbackMsg = { text: result.message || "OS 변경에 실패했습니다.", type: "error" };
      }
    } catch {
      feedbackMsg = { text: "통신 오류가 발생했습니다.", type: "error" };
    }
  }

  async function executeDeleteDomain() {
    if (!targetDelete) return;
    const domainToDelete = targetDelete.domain;
    deletingDomain = domainToDelete;
    feedbackMsg = null;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      };
      const res = await fetch("/api/ddns", {
        method: "DELETE",
        headers,
        body: JSON.stringify({ domain: domainToDelete }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        feedbackMsg = { text: `[${domainToDelete}] 가 영구 삭제되었습니다.`, type: "success" };
        targetDelete = null;
        await fetchStatus(authToken || undefined);
      } else {
        feedbackMsg = { text: result.message || "삭제에 실패했습니다.", type: "error" };
      }
    } catch {
      feedbackMsg = { text: "삭제 중 오류가 발생했습니다.", type: "error" };
    } finally {
      deletingDomain = null;
    }
  }

  async function handleAddWhitelistUser(e: SubmitEvent) {
    e.preventDefault();
    if (!newDiscordId.trim() || !newDiscordName.trim()) {
      feedbackMsg = { text: "Discord ID와 닉네임을 모두 입력해주세요.", type: "error" };
      return;
    }
    isSubmittingUser = true;
    feedbackMsg = null;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      };
      const res = await fetch("/api/ddns", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "add_whitelist",
          discordId: newDiscordId.trim(),
          name: newDiscordName.trim(),
        }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        feedbackMsg = {
          text: `[${newDiscordName.trim()}] 님이 화이트리스트에 등록되었습니다.`,
          type: "success",
        };
        newDiscordId = "";
        newDiscordName = "";
        isAddUserModalOpen = false;
        await fetchAdminData();
      } else {
        feedbackMsg = { text: result.message || "등록에 실패했습니다.", type: "error" };
      }
    } catch {
      feedbackMsg = { text: "통신 오류가 발생했습니다.", type: "error" };
    } finally {
      isSubmittingUser = false;
    }
  }

  async function handleRemoveWhitelistUser(discordId: string, name: string) {
    if (
      !confirm(
        `정말로 [${name}] 님을 화이트리스트에서 삭제하시겠습니까?\n삭제 시 즉시 DDNS 접근 권한이 상실됩니다.`,
      )
    ) {
      return;
    }
    feedbackMsg = null;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      };
      const res = await fetch("/api/ddns", {
        method: "POST",
        headers,
        body: JSON.stringify({ action: "remove_whitelist", discordId }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        feedbackMsg = {
          text: `[${name}] 님이 화이트리스트에서 삭제되었습니다.`,
          type: "success",
        };
        await fetchAdminData();
      } else {
        feedbackMsg = { text: result.message || "삭제에 실패했습니다.", type: "error" };
      }
    } catch {
      feedbackMsg = { text: "통신 오류가 발생했습니다.", type: "error" };
    }
  }

  async function handleRegenerateToken(targetId?: string) {
    isRegenerating = true;
    feedbackMsg = null;
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      };
      const res = await fetch("/api/ddns", {
        method: "POST",
        headers,
        body: JSON.stringify({
          action: "regenerate_token",
          targetDiscordId: targetId,
        }),
      });
      const result = await res.json();
      if (res.ok && result.success) {
        if (!targetId || targetId === ddnsData?.user?.id) {
          authToken = result.token;
          localStorage.setItem("ddns_access_token", result.token);
        }
        feedbackMsg = {
          text: "새로운 개인 보안 토큰이 성공적으로 발급되었습니다.",
          type: "success",
        };
        isRegenModalOpen = false;
        regenTargetUser = null;
        await fetchStatus(result.token);
        if (ddnsData?.isAdmin) await fetchAdminData();
      } else {
        feedbackMsg = { text: result.message || "토큰 재발급에 실패했습니다.", type: "error" };
      }
    } catch {
      feedbackMsg = { text: "통신 오류가 발생했습니다.", type: "error" };
    } finally {
      isRegenerating = false;
    }
  }
</script>

<svelte:head>
  <title>DDNS Access Verification | Azest_Kingscrown</title>
  <meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>

{#if loading && !ddnsData}
  <div class="flex min-h-[65vh] items-center justify-center">
    <div class="flex w-full max-w-md flex-col items-center justify-center rounded-md border border-oc-border bg-oc-surface py-12 text-center">
      <Icon name="loader" class="size-7 animate-spin text-oc-strong" />
      <p class="mt-3 text-sm font-semibold text-oc-strong">인증 상태 확인 중...</p>
      <p class="mt-1 text-xs text-oc-muted">잠시만 기다려주십시오.</p>
    </div>
  </div>
{:else if !ddnsData}
  <!-- Login Gate -->
  <div class="flex min-h-[70vh] items-center justify-center py-6">
    <div class="w-full max-w-md space-y-5 rounded-md border border-oc-border bg-oc-surface p-6 text-center">
      <div class="mx-auto flex size-12 items-center justify-center rounded-md border border-oc-border bg-oc-subtle text-oc-strong">
        <Icon name="lock" class="size-6" />
      </div>

      <div class="space-y-1.5">
        <span class="rounded border border-oc-border bg-oc-subtle px-2 py-0.5 font-mono text-xs font-medium text-oc-text">
          Private Network
        </span>
        <h1 class="text-xl font-bold text-oc-strong">Private DDNS Service</h1>
        <p class="break-keep text-xs leading-relaxed text-oc-muted">
          인가된 사용자 전용 DDNS 모니터링 시스템입니다.<br />
          Discord 계정으로 로그인하거나 비밀 인증 토큰을 입력하십시오.
        </p>
      </div>

      {#if clientIp}
        <div class="rounded border border-oc-border bg-oc-subtle px-3 py-2 font-mono text-xs text-oc-muted">
          내 접속 공인 IP: <strong class="font-semibold text-oc-strong">{clientIp}</strong>
        </div>
      {/if}

      <div class="space-y-2">
        <a
          href="/api/auth/signin?callbackUrl=/ddns"
          data-sveltekit-reload
          class="inline-flex w-full items-center justify-center gap-2 rounded bg-[#5865F2] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#4752C4]"
        >
          <Icon name="discord" class="size-4" />
          Discord로 로그인
        </a>
        <p class="text-[11px] text-oc-muted">
          화이트리스트 등록 계정으로 원클릭 로그인 가능
        </p>
      </div>

      <div class="flex items-center gap-3 text-xs text-oc-faint">
        <div class="h-px flex-1 bg-oc-border"></div>
        <span>또는 비밀 토큰으로 접속</span>
        <div class="h-px flex-1 bg-oc-border"></div>
      </div>

      <form onsubmit={handleLoginSubmit} class="space-y-3 text-left">
        <input
          type="password"
          placeholder="인증 비밀 토큰 입력"
          bind:value={tokenInput}
          class="block w-full rounded border border-oc-border bg-oc-bg px-3 py-2 text-center font-mono text-sm text-oc-strong outline-none transition placeholder:text-oc-faint focus:border-oc-strong focus:ring-1 focus:ring-oc-border-strong"
        />

        {#if authError && tokenInput}
          <div class="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-[#db2424] dark:text-[#ed5a5a]">
            {authError}
          </div>
        {/if}

        <button
          type="submit"
          disabled={loading}
          class="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded bg-oc-strong px-4 py-2 text-sm font-medium text-oc-inverted transition hover:bg-oc-strong-hover disabled:opacity-50"
        >
          <Icon name="key" class="size-4" />
          {loading ? "인증 확인 중..." : "토큰으로 보안 로그인"}
        </button>
      </form>

      <p class="pt-1 font-mono text-[11px] text-oc-faint">
        Protected by Cloudflare DNS &amp; Azest Kingscrown
      </p>
    </div>
  </div>
{:else}
  <!-- Authenticated DDNS Dashboard -->
  <div class="space-y-6">
    <!-- Top Header -->
    <div class="flex flex-col gap-4 border-b border-oc-border pb-5 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div class="flex flex-wrap items-center gap-2">
          <span class="size-2.5 rounded-full bg-[#239f50] ring-4 ring-[#54d483]/20 dark:bg-[#54d483]"></span>
          <h1 class="flex items-center gap-2 text-2xl font-bold tracking-tight text-oc-strong">
            <Icon name="globe" class="size-6 text-oc-strong" />
            DDNS &amp; IP 연결 관리
          </h1>
          {#if ddnsData.user}
            <span
              class={ddnsData.isAdmin
                ? "rounded border border-[#f4b434]/30 bg-[#f4b434]/10 px-2 py-0.5 font-mono text-xs font-semibold text-[#eb980a] dark:text-[#f4b434]"
                : "rounded border border-oc-border bg-oc-subtle px-2 py-0.5 font-mono text-xs font-medium text-oc-text"}
            >
              {ddnsData.user.name} ({ddnsData.isAdmin
                ? "시스템 관리자"
                : ddnsData.authType === "discord"
                  ? "Discord 인증"
                  : "토큰 인증"})
            </span>
          {/if}
        </div>
        <p class="mt-1 text-sm text-oc-muted">
          등록된 기기들의 유동 공인 IP 실시간 연결 및 Cloudflare 고정 도메인 관리
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onclick={() => (maskSensitive = !maskSensitive)}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition {maskSensitive
            ? 'border-[#54d483]/30 bg-oc-bg text-[#239f50] hover:bg-oc-hover dark:text-[#54d483]'
            : 'border-[#f4b434]/40 bg-oc-bg text-[#eb980a] hover:bg-oc-hover dark:text-[#f4b434]'}"
        >
          <Icon name={maskSensitive ? "lock" : "unlock"} class="size-4" />
          {maskSensitive ? "민감정보 보호 중" : "민감정보 표시 중"}
        </button>

        <button
          type="button"
          onclick={() => (showSecurityModal = true)}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-oc-border bg-oc-bg px-3 py-1.5 text-xs font-medium text-oc-strong transition hover:border-oc-border-strong hover:bg-oc-hover"
        >
          <Icon name="shield" class="size-4" />
          보안 안내
        </button>

        <button
          type="button"
          onclick={() => {
            isAddModalOpen = true;
            generateRandomSubdomain();
            if (ddnsData?.isAdmin) void fetchAdminData();
          }}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded bg-oc-strong px-3 py-1.5 text-xs font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
        >
          <Icon name="add" class="size-4" />
          새 DDNS 기기 추가
        </button>

        <button
          type="button"
          onclick={() => {
            void fetchStatus(authToken || undefined);
            if (ddnsData?.isAdmin) void fetchAdminData();
          }}
          disabled={loading}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-oc-border bg-oc-bg px-3 py-1.5 text-xs font-medium text-oc-strong transition hover:border-oc-border-strong hover:bg-oc-hover disabled:opacity-50"
        >
          <Icon name="refresh" class="size-4" />
          {loading ? "갱신 중..." : "새로고침"}
        </button>

        <button
          type="button"
          onclick={handleLogout}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium text-oc-muted transition hover:bg-oc-hover hover:text-oc-strong"
        >
          <Icon name="logout" class="size-4" />
          로그아웃
        </button>
      </div>
    </div>

    <!-- Feedback Banner -->
    {#if feedbackMsg}
      <div
        class="flex items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm {feedbackMsg.type === 'success'
          ? 'border-[#54d483]/30 bg-[#54d483]/10 text-[#239f50] dark:text-[#54d483]'
          : 'border-[#ed5a5a]/30 bg-[#ed5a5a]/10 text-[#db2424] dark:text-[#ed5a5a]'}"
      >
        <span>{feedbackMsg.text}</span>
        <button
          type="button"
          onclick={() => (feedbackMsg = null)}
          aria-label="닫기"
          class="cursor-pointer rounded p-0.5 hover:bg-black/5 dark:hover:bg-white/10"
        >
          <Icon name="close" class="size-4" />
        </button>
      </div>
    {/if}

    <!-- Personal Secret Token Card -->
    <div class="space-y-4 rounded-md border border-oc-border bg-oc-surface p-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <Icon name="key" class="size-4 text-oc-strong" />
            <h2 class="text-sm font-semibold text-oc-strong">
              내 개인 DDNS 보안 토큰 (Personal Secret Token)
            </h2>
          </div>
          <p class="mt-1 text-xs text-oc-muted">
            본인 소유 DDNS 기기의 백그라운드 갱신 스크립트(PM2, PowerShell 등)에 사용되는 고유 보안 토큰입니다.
          </p>
        </div>
        <button
          type="button"
          onclick={() => {
            regenTargetUser = null;
            isRegenModalOpen = true;
          }}
          class="inline-flex cursor-pointer items-center gap-1 self-start rounded border border-oc-border bg-oc-bg px-2.5 py-1.5 text-xs font-medium text-oc-strong transition hover:border-oc-border-strong hover:bg-oc-hover sm:self-auto"
        >
          <Icon name="refresh" class="size-3.5 text-[#eb980a] dark:text-[#f4b434]" />
          토큰 재발급
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <div class="min-w-[240px] flex-1 overflow-x-auto whitespace-nowrap rounded border border-oc-border bg-oc-bg px-3.5 py-2 font-mono text-xs">
          <span class={showTokenValue ? "text-oc-strong" : "tracking-widest text-oc-faint"}>
            {showTokenValue
              ? authToken || "토큰 없음"
              : "••••••••••••••••••••••••••••••••••••••••••••"}
          </span>
        </div>

        <button
          type="button"
          onclick={() => (showTokenValue = !showTokenValue)}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-oc-border bg-oc-bg px-3 py-2 text-xs font-medium text-oc-strong transition hover:border-oc-border-strong hover:bg-oc-hover"
        >
          <Icon name={showTokenValue ? "eyeOff" : "eye"} class="size-4" />
          {showTokenValue ? "숨기기" : "토큰 보기"}
        </button>

        <button
          type="button"
          onclick={() => copyToClipboard(authToken, "my-personal-token")}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded bg-oc-strong px-3 py-2 text-xs font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
        >
          <Icon name={copiedField === "my-personal-token" ? "check" : "copy"} class="size-4" />
          {copiedField === "my-personal-token" ? "복사됨!" : "토큰 복사"}
        </button>
      </div>
    </div>

    <!-- Admin Tabs -->
    {#if ddnsData.isAdmin}
      <div class="flex flex-wrap gap-1 border-b border-oc-border">
        <button
          type="button"
          onclick={() => (activeTab = "my")}
          class="-mb-px inline-flex cursor-pointer items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition {activeTab === 'my'
            ? 'border-oc-strong text-oc-strong'
            : 'border-transparent text-oc-muted hover:text-oc-strong'}"
        >
          <Icon name="monitor" class="size-4" />
          내 DDNS 기기 ({ddnsData.domains.length}개)
        </button>
        <button
          type="button"
          onclick={() => (activeTab = "all")}
          class="-mb-px inline-flex cursor-pointer items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition {activeTab === 'all'
            ? 'border-oc-strong text-oc-strong'
            : 'border-transparent text-oc-muted hover:text-oc-strong'}"
        >
          <Icon name="admin" class="size-4" />
          전체 유저 기기 ({ddnsData.allDomains?.length || ddnsData.domains.length}개)
        </button>
        <button
          type="button"
          onclick={() => {
            activeTab = "admin";
            void fetchAdminData();
          }}
          class="-mb-px inline-flex cursor-pointer items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition {activeTab === 'admin'
            ? 'border-oc-strong text-oc-strong'
            : 'border-transparent text-oc-muted hover:text-oc-strong'}"
        >
          <Icon name="users" class="size-4" />
          유저 &amp; 화이트리스트 관리
        </button>
      </div>
    {/if}

    <!-- Main Tab Content -->
    {#if ddnsData.isAdmin && activeTab === "admin"}
      <DdnsAdminUsersPanel
        {adminData}
        {adminLoading}
        currentUserId={ddnsData.user?.id}
        {copiedField}
        onRefresh={() => void fetchAdminData()}
        onOpenAddUser={() => (isAddUserModalOpen = true)}
        onCopy={copyToClipboard}
        onOpenRegen={(u) => {
          regenTargetUser = u;
          isRegenModalOpen = true;
        }}
        onRemoveUser={(id, name) => void handleRemoveWhitelistUser(id, name)}
      />
    {:else}
      <div class="space-y-6">
        <!-- Client IP Banner -->
        <div class="flex flex-wrap items-center justify-between gap-4 rounded-md border border-oc-border bg-oc-surface p-5">
          <div>
            <p class="font-mono text-[11px] font-semibold uppercase tracking-wider text-oc-muted">
              현재 브라우저 접속 기기의 공인 IP
            </p>
            <div class="mt-1.5 flex flex-wrap items-center gap-2">
              <span class="font-mono text-lg font-bold tabular-nums text-oc-strong">
                {clientIp ? maskIp(clientIp, maskSensitive, revealedItems["client-ip"]) : "조회 중..."}
              </span>
              {#if clientIp}
                <button
                  type="button"
                  onclick={() => toggleRevealItem("client-ip")}
                  class="cursor-pointer rounded p-1.5 text-oc-muted transition hover:bg-oc-hover hover:text-oc-strong"
                >
                  <Icon name={revealedItems["client-ip"] ? "eyeOff" : "eye"} class="size-3.5" />
                </button>
                <button
                  type="button"
                  onclick={() => copyToClipboard(clientIp, "client-ip")}
                  class="cursor-pointer rounded border border-oc-border bg-oc-bg px-2.5 py-1 text-xs font-medium text-oc-strong transition hover:bg-oc-hover"
                >
                  {copiedField === "client-ip" ? "복사됨!" : "복사"}
                </button>
              {/if}
            </div>
          </div>

          {#if displayDomains.some((d) => d.isIpMatching)}
            <span class="rounded border border-[#54d483]/30 bg-[#54d483]/10 px-2.5 py-1 font-mono text-xs font-semibold text-[#239f50] dark:text-[#54d483]">
              ● 등록된 DDNS 기기에서 접속 중
            </span>
          {:else}
            <span class="rounded border border-oc-border bg-oc-subtle px-2.5 py-1 font-mono text-xs font-medium text-oc-muted">
              ○ 외부 네트워크에서 접속 중
            </span>
          {/if}
        </div>

        <!-- Device Grid -->
        {#if displayDomains.length === 0}
          <div class="rounded-md border border-dashed border-oc-border-strong bg-oc-surface py-12 text-center">
            <Icon name="monitor" class="mx-auto size-10 text-oc-faint" />
            <p class="mt-3 text-sm font-semibold text-oc-strong">
              {activeTab === "my" ? "등록된 내 DDNS 기기가 없습니다." : "등록된 DDNS 기기가 없습니다."}
            </p>
            <button
              type="button"
              onclick={() => {
                isAddModalOpen = true;
                generateRandomSubdomain();
                if (ddnsData?.isAdmin) void fetchAdminData();
              }}
              class="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded bg-oc-strong px-3.5 py-2 text-xs font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
            >
              <Icon name="add" class="size-4" />
              첫 번째 DDNS 기기 추가
            </button>
          </div>
        {:else}
          <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
            {#each displayDomains as item (item.domain)}
              {@const isOwner = !item.ownerId || item.ownerId === ddnsData.user?.id || Boolean(ddnsData.isAdmin)}
              <DdnsDeviceCard
                {item}
                showOwner={activeTab === "all"}
                {isOwner}
                isDeleting={deletingDomain === item.domain}
                {maskSensitive}
                {revealedItems}
                {copiedField}
                onToggleReveal={toggleRevealItem}
                onCopy={copyToClipboard}
                onUpdateOs={(d, os) => void handleUpdateDeviceOs(d, os)}
                onOpenGuide={(d) => {
                  guideDomain = d;
                  document.getElementById("setup-guide-section")?.scrollIntoView({ behavior: "smooth" });
                }}
                onOpenDelete={(domain, label) => {
                  targetDelete = { domain, label };
                  deleteConfirmText = "";
                }}
              />
            {/each}
          </div>
        {/if}

        <!-- One-click Manual Update -->
        {#if displayDomains.length > 0}
          <div class="space-y-4 rounded-md border border-oc-border bg-oc-surface p-6">
            <div>
              <h2 class="text-base font-semibold text-oc-strong">
                현재 접속 기기 IP로 원클릭 갱신
              </h2>
              <p class="mt-0.5 text-xs text-oc-muted">
                선택한 도메인의 DNS A 레코드를 현재 브라우저의 공인 IP로 즉시 업데이트합니다.
              </p>
            </div>

            <div class="flex flex-col gap-2.5 sm:flex-row">
              <select
                bind:value={selectedDomain}
                class="flex-1 rounded border border-oc-border bg-oc-bg px-3 py-2 font-mono text-sm text-oc-strong outline-none focus:border-oc-strong"
              >
                {#each displayDomains as d (d.domain)}
                  <option value={d.domain}>
                    {d.label
                      ? `[${d.label}] ${maskDomain(d.domain, maskSensitive)}`
                      : maskDomain(d.domain, maskSensitive)}
                  </option>
                {/each}
              </select>
              <button
                type="button"
                onclick={handleManualUpdate}
                disabled={isUpdating}
                class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded bg-oc-strong px-4 py-2 text-sm font-medium text-oc-inverted transition hover:bg-oc-strong-hover disabled:opacity-50"
              >
                <Icon name="refresh" class="size-4" />
                {isUpdating ? "갱신 중..." : "현재 접속 IP로 지금 갱신"}
              </button>
            </div>

            {#if updateResult}
              <div
                class="rounded border px-3.5 py-2.5 text-xs font-medium {updateResult.success
                  ? 'border-[#54d483]/30 bg-[#54d483]/10 text-[#239f50] dark:text-[#54d483]'
                  : 'border-[#ed5a5a]/30 bg-[#ed5a5a]/10 text-[#db2424] dark:text-[#ed5a5a]'}"
              >
                {updateResult.message}
              </div>
            {/if}
          </div>
        {/if}

        <!-- Setup Guide -->
        <DdnsSetupGuide
          domains={displayDomains}
          {guideDomain}
          onChangeGuideDomain={(d) => (guideDomain = d)}
          {authToken}
          {maskSensitive}
          currentUserId={ddnsData.user?.id}
          isAdmin={ddnsData.isAdmin}
          {copiedField}
          onCopy={copyToClipboard}
          onUpdateOs={(d, os) => void handleUpdateDeviceOs(d, os)}
        />
      </div>
    {/if}
  </div>

  <!-- ═══ MODALS ═══ -->

  <!-- 1. 새 기기 추가 모달 -->
  {#if isAddModalOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div class="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md border border-oc-border bg-oc-surface p-6 shadow-xl">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h3 class="text-lg font-semibold text-oc-strong">새 DDNS 기기(도메인) 등록</h3>
            <p class="mt-0.5 text-xs text-oc-muted">Cloudflare DNS A 레코드와 자동 갱신 구성을 함께 생성합니다.</p>
          </div>
          <button type="button" onclick={() => !isSubmittingAdd && (isAddModalOpen = false)} class="cursor-pointer rounded p-1 text-oc-faint transition hover:bg-oc-hover hover:text-oc-strong">
            <Icon name="close" class="size-5" />
          </button>
        </div>

        <form onsubmit={handleAddDomain} class="mt-4 space-y-4">
          <div>
            <p class="mb-1.5 text-xs font-semibold text-oc-text">기기 OS 환경</p>
            <div class="grid grid-cols-2 gap-2">
              <button
                type="button"
                onclick={() => {
                  newOs = "windows";
                  if (!newLabel || newLabel === "Linux PC") newLabel = "Windows PC";
                }}
                class={newOs === "windows"
                  ? "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded bg-oc-strong px-3 py-2 text-sm font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
                  : "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded border border-oc-border bg-oc-bg px-3 py-2 text-sm font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"}
              >
                <Icon name="monitor" class="size-4" />
                Windows
              </button>
              <button
                type="button"
                onclick={() => {
                  newOs = "linux";
                  if (!newLabel || newLabel === "Windows PC") newLabel = "Linux PC";
                }}
                class={newOs === "linux"
                  ? "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded bg-oc-strong px-3 py-2 text-sm font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
                  : "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded border border-oc-border bg-oc-bg px-3 py-2 text-sm font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"}
              >
                <Icon name="terminal" class="size-4" />
                Linux
              </button>
            </div>
          </div>

          <div>
            <label for="ddns-new-label" class="mb-1.5 block text-xs font-semibold text-oc-text">기기 별칭 (이름)</label>
            <input
              id="ddns-new-label"
              type="text"
              bind:value={newLabel}
              placeholder={newOs === "windows" ? "예: Windows PC" : "예: Linux PC, 미니PC"}
              class="block w-full rounded border border-oc-border bg-oc-bg px-3 py-2 text-sm text-oc-strong outline-none placeholder:text-oc-faint focus:border-oc-strong"
            />
          </div>

          <div>
            <label for="ddns-new-prefix" class="mb-1.5 block text-xs font-semibold text-oc-text">서브도메인 접두사</label>
            <div class="flex gap-2">
              <input
                id="ddns-new-prefix"
                type="text"
                required
                value={newPrefix}
                oninput={(e) => {
                  newPrefix = e.currentTarget.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                }}
                placeholder="예: mypc777"
                class="block flex-1 rounded border border-oc-border bg-oc-bg px-3 py-2 font-mono text-sm text-oc-strong outline-none placeholder:text-oc-faint focus:border-oc-strong"
              />
              <button
                type="button"
                onclick={generateRandomSubdomain}
                class="inline-flex cursor-pointer items-center gap-1 rounded border border-oc-border bg-oc-bg px-3 py-2 text-xs font-medium text-oc-strong transition hover:bg-oc-hover"
              >
                <Icon name="shuffle" class="size-4" />
                랜덤
              </button>
            </div>
            <p class="mt-1 font-mono text-xs text-oc-muted">
              등록 도메인: <span class="text-oc-strong">{newPrefix.trim() ? `${newPrefix.trim()}.example.com` : "(접두사를 입력하세요)"}</span>
            </p>
          </div>

          {#if ddnsData.isAdmin && adminData?.whitelist}
            <div>
              <label for="ddns-new-owner" class="mb-1.5 block text-xs font-semibold text-oc-text">기기 소유자 지정 (관리자 권한)</label>
              <select
                id="ddns-new-owner"
                bind:value={targetOwnerId}
                class="block w-full rounded border border-oc-border bg-oc-bg px-3 py-2 text-sm text-oc-strong outline-none focus:border-oc-strong"
              >
                <option value={ddnsData.user?.id || ""}>나 ({ddnsData.user?.name} - 관리자)</option>
                {#each adminData.whitelist.filter((w) => w.id !== ddnsData?.user?.id) as w (w.id)}
                  <option value={w.id}>{w.name} ({w.id})</option>
                {/each}
              </select>
            </div>
          {/if}

          <div>
            <label for="ddns-new-ip" class="mb-1.5 block text-xs font-semibold text-oc-text">초기 등록 공인 IP</label>
            <input
              id="ddns-new-ip"
              type="text"
              bind:value={newIp}
              placeholder={`기본값: 현재 내 공인 IP (${clientIp || "조회 중..."})`}
              class="block w-full rounded border border-oc-border bg-oc-bg px-3 py-2 font-mono text-sm text-oc-strong outline-none placeholder:text-oc-faint focus:border-oc-strong"
            />
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              disabled={isSubmittingAdd}
              onclick={() => (isAddModalOpen = false)}
              class="cursor-pointer rounded border border-oc-border bg-oc-bg px-4 py-2 text-sm font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmittingAdd}
              class="cursor-pointer rounded bg-oc-strong px-4 py-2 text-sm font-medium text-oc-inverted transition hover:bg-oc-strong-hover disabled:opacity-50"
            >
              {isSubmittingAdd ? "Cloudflare 등록 중..." : "등록 및 DNS 연결"}
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}

  <!-- 2. 등록 완료 가이드 모달 -->
  {#if createdGuide}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div class="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-md border border-oc-border bg-oc-surface p-6 shadow-xl">
        <h3 class="text-lg font-semibold text-[#239f50] dark:text-[#54d483]">새 DDNS 기기가 등록되었습니다</h3>
        <p class="mt-1 text-xs text-oc-muted">
          <strong class="text-oc-strong">{createdGuide.label}</strong> ({createdGuide.domain}) 기기에서 아래 명령어를 1회 실행하세요.
        </p>

        <div class="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onclick={() => (createdGuideTab = "windows")}
            class={createdGuideTab === "windows"
              ? "cursor-pointer rounded bg-oc-strong py-1.5 text-xs font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
              : "cursor-pointer rounded border border-oc-border bg-oc-bg py-1.5 text-xs font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"}
          >
            Windows (PowerShell)
          </button>
          <button
            type="button"
            onclick={() => (createdGuideTab = "linux")}
            class={createdGuideTab === "linux"
              ? "cursor-pointer rounded bg-oc-strong py-1.5 text-xs font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
              : "cursor-pointer rounded border border-oc-border bg-oc-bg py-1.5 text-xs font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"}
          >
            Linux (터미널)
          </button>
        </div>

        <div class="mt-3 rounded border border-oc-border bg-[#0c0c0c] p-4">
          <div class="mb-2 flex justify-end">
            <button
              type="button"
              onclick={() =>
                copyToClipboard(
                  createdGuideTab === "windows"
                    ? buildWindowsCommand(createdGuide!.domain, authToken)
                    : buildLinuxCommand(createdGuide!.domain, authToken),
                  "popup-cmd",
                )}
              class="inline-flex cursor-pointer items-center gap-1 rounded border border-[#2e2e2e] bg-[#161616] px-2.5 py-1 text-xs font-medium text-[#fafafa] transition hover:bg-[#242424]"
            >
              <Icon name={copiedField === "popup-cmd" ? "check" : "copy"} class="size-3.5 {copiedField === 'popup-cmd' ? 'text-[#54d483]' : ''}" />
              {copiedField === "popup-cmd" ? "복사됨!" : "명령어 복사"}
            </button>
          </div>
          <pre class="overflow-x-auto whitespace-pre font-mono text-xs leading-relaxed text-[#fafafa]">{createdGuideTab === "windows"
            ? buildWindowsCommand(createdGuide.domain, authToken)
            : buildLinuxCommand(createdGuide.domain, authToken)}</pre>
        </div>

        <div class="mt-5 flex justify-end">
          <button
            type="button"
            onclick={() => (createdGuide = null)}
            class="cursor-pointer rounded bg-oc-strong px-4 py-2 text-sm font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
          >
            확인 완료
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- 3. 영구 삭제 확인 모달 -->
  {#if targetDelete}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div class="w-full max-w-md space-y-4 rounded-md border border-[#ed5a5a]/40 bg-oc-surface p-6 shadow-xl">
        <div class="flex items-center gap-2 text-[#db2424] dark:text-[#ed5a5a]">
          <Icon name="alert" class="size-5" />
          <h3 class="text-lg font-semibold">DDNS 기기 영구 삭제 경고</h3>
        </div>

        <div class="rounded border border-oc-border bg-oc-subtle p-3">
          <p class="font-mono text-[11px] font-semibold uppercase text-oc-muted">삭제 대상</p>
          <p class="mt-0.5 text-sm font-bold text-oc-strong">{targetDelete.label}</p>
          <p class="font-mono text-xs text-oc-text">{targetDelete.domain}</p>
        </div>

        <div class="rounded border border-[#ed5a5a]/30 bg-[#ed5a5a]/10 p-3 text-xs leading-relaxed text-[#db2424] dark:text-[#ed5a5a]">
          Cloudflare DNS A 레코드가 즉시 영구 삭제되며 되돌릴 수 없습니다.
        </div>

        <div>
          <label for="ddns-delete-confirm" class="mb-1.5 block text-xs font-semibold text-oc-text">
            아래에 <span class="font-bold text-[#db2424] dark:text-[#ed5a5a]">삭제</span> 라고 입력하세요:
          </label>
          <input
            id="ddns-delete-confirm"
            type="text"
            placeholder="삭제"
            bind:value={deleteConfirmText}
            class="block w-full rounded border border-oc-border bg-oc-bg px-3 py-2 text-center text-sm font-bold tracking-widest text-oc-strong outline-none placeholder:text-oc-faint focus:border-[#ed5a5a]"
          />
        </div>

        <div class="flex justify-end gap-2">
          <button
            type="button"
            disabled={Boolean(deletingDomain)}
            onclick={() => (targetDelete = null)}
            class="cursor-pointer rounded border border-oc-border bg-oc-bg px-4 py-2 text-sm font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
          >
            취소
          </button>
          <button
            type="button"
            disabled={deleteConfirmText.trim() !== "삭제" || Boolean(deletingDomain)}
            onclick={executeDeleteDomain}
            class="cursor-pointer rounded bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deletingDomain ? "삭제 중..." : "확인 및 영구 삭제"}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- 4. 화이트리스트 유저 등록 모달 -->
  {#if isAddUserModalOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div class="w-full max-w-md rounded-md border border-oc-border bg-oc-surface p-6 shadow-xl">
        <h3 class="text-lg font-semibold text-oc-strong">새 DDNS 유저 등록</h3>
        <form onsubmit={handleAddWhitelistUser} class="mt-4 space-y-4">
          <div>
            <label for="ddns-user-id" class="mb-1.5 block text-xs font-semibold text-oc-text">Discord 고유 ID</label>
            <input
              id="ddns-user-id"
              type="text"
              required
              value={newDiscordId}
              oninput={(e) => {
                newDiscordId = e.currentTarget.value.replace(/[^0-9]/g, "");
              }}
              placeholder="예: 123456789012345678"
              class="block w-full rounded border border-oc-border bg-oc-bg px-3 py-2 font-mono text-sm text-oc-strong outline-none placeholder:text-oc-faint focus:border-oc-strong"
            />
          </div>
          <div>
            <label for="ddns-user-name" class="mb-1.5 block text-xs font-semibold text-oc-text">유저 닉네임</label>
            <input
              id="ddns-user-name"
              type="text"
              required
              bind:value={newDiscordName}
              placeholder="예: 사용자 닉네임"
              class="block w-full rounded border border-oc-border bg-oc-bg px-3 py-2 text-sm text-oc-strong outline-none placeholder:text-oc-faint focus:border-oc-strong"
            />
          </div>
          <div class="flex justify-end gap-2">
            <button
              type="button"
              disabled={isSubmittingUser}
              onclick={() => (isAddUserModalOpen = false)}
              class="cursor-pointer rounded border border-oc-border bg-oc-bg px-4 py-2 text-sm font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmittingUser}
              class="cursor-pointer rounded bg-oc-strong px-4 py-2 text-sm font-medium text-oc-inverted transition hover:bg-oc-strong-hover disabled:opacity-50"
            >
              {isSubmittingUser ? "등록 중..." : "화이트리스트 등록"}
            </button>
          </div>
        </form>
      </div>
    </div>
  {/if}

  <!-- 5. 토큰 재발급 확인 모달 -->
  {#if isRegenModalOpen}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div class="w-full max-w-md space-y-4 rounded-md border border-oc-border bg-oc-surface p-6 shadow-xl">
        <div>
          <h3 class="text-lg font-semibold text-[#eb980a] dark:text-[#f4b434]">보안 토큰 재발급 확인</h3>
          <p class="mt-0.5 text-xs text-oc-muted">
            {regenTargetUser ? `[${regenTargetUser.name}] 님의 토큰 재발급` : "개인 보안 토큰 재발급"}
          </p>
        </div>
        <div class="rounded border border-[#f4b434]/30 bg-[#f4b434]/10 p-3.5 text-xs leading-relaxed text-[#eb980a] dark:text-[#f4b434]">
          새 토큰을 발급하면 <strong>기존 토큰은 즉시 무효화</strong>됩니다.
          PM2 스크립트에 등록된 기존 갱신 명령어도 새 토큰으로 업데이트해야 합니다.
        </div>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            disabled={isRegenerating}
            onclick={() => {
              isRegenModalOpen = false;
              regenTargetUser = null;
            }}
            class="cursor-pointer rounded border border-oc-border bg-oc-bg px-4 py-2 text-sm font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
          >
            취소
          </button>
          <button
            type="button"
            disabled={isRegenerating}
            onclick={() => void handleRegenerateToken(regenTargetUser?.id)}
            class="cursor-pointer rounded bg-oc-strong px-4 py-2 text-sm font-medium text-oc-inverted transition hover:bg-oc-strong-hover disabled:opacity-50"
          >
            {isRegenerating ? "발급 중..." : "새 토큰 발급 진행"}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- 6. 보안 안내 모달 -->
  {#if showSecurityModal}
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-xs">
      <div class="w-full max-w-xl space-y-4 rounded-md border border-[#f4b434]/40 bg-oc-surface p-6 shadow-xl">
        <div class="flex items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-[#eb980a] dark:text-[#f4b434]">
            <Icon name="shield" class="size-5" />
            <h3 class="text-lg font-semibold">보안 및 개인정보 보호 안내</h3>
          </div>
          <button type="button" onclick={handleCloseSecurityModal} class="cursor-pointer rounded p-1 text-oc-faint transition hover:bg-oc-hover hover:text-oc-strong">
            <Icon name="close" class="size-5" />
          </button>
        </div>

        <div class="rounded border border-[#f4b434]/30 bg-[#f4b434]/10 p-3.5 text-xs leading-relaxed text-[#eb980a] dark:text-[#f4b434]">
          <strong>네트워크 및 개인정보 유출 방지 필수 수칙:</strong>
          본 페이지에는 실제 공인 IP, 고유 DDNS 서브도메인, 개인 인증 토큰이 포함되어 있습니다. 화면 공유/방송 시 노출에 주의하세요.
        </div>

        <ul class="space-y-2 text-xs leading-relaxed text-oc-text">
          <li>• <strong class="text-[#239f50] dark:text-[#54d483]">기본 마스킹 보호 자동 적용:</strong> 모든 공인 IP와 서브도메인은 기본적으로 가림 처리됩니다.</li>
          <li>• <strong class="text-oc-strong">안전한 원본 복사 지원:</strong> 마스킹된 상태에서도 [복사] 버튼으로 실제 원본 주소를 안전하게 복사할 수 있습니다.</li>
        </ul>

        <div class="flex flex-wrap items-center justify-between gap-3 border-t border-oc-border pt-4">
          <label class="flex cursor-pointer select-none items-center gap-2 text-xs text-oc-muted">
            <input type="checkbox" bind:checked={dontShowToday} class="size-4 accent-[#161616] dark:accent-[#fafafa]" />
            오늘 하루 동안 이 안내창 다시 보지 않기
          </label>
          <button
            type="button"
            onclick={handleCloseSecurityModal}
            class="inline-flex cursor-pointer items-center gap-1 rounded bg-oc-strong px-4 py-2 text-xs font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
          >
            <Icon name="check" class="size-4" />
            안전 수칙을 확인했습니다
          </button>
        </div>
      </div>
    </div>
  {/if}
{/if}
