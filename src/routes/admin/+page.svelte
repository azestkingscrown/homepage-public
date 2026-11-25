<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import TripleOtpForm from "#lib/components/TripleOtpForm.svelte";

  interface ServerLog {
    action: string;
    ip?: string;
    user?: string;
    time: string;
  }

  interface WhitelistItem {
    id: string;
    name: string;
  }

  let otpTokens = $state<[string, string, string]>(["", "", ""]);
  let token = $state("");
  let logs = $state<ServerLog[]>([]);
  let whitelist = $state<WhitelistItem[]>([]);
  let isAuthenticated = $state(false);
  let loginLoading = $state(false);

  let newId = $state("");
  let newName = $state("");
  let editingId = $state<string | null>(null);
  let editingName = $state("");

  async function handleLogin() {
    if (otpTokens.some((code) => code.length !== 6)) return;
    loginLoading = true;
    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", otpTokens }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        alert(data.message || "OTP 코드가 올바르지 않습니다.");
        return;
      }
      if (data.role !== "admin") {
        alert("관리자 권한이 필요합니다.");
        await fetch("/api/server", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "logout", token: data.token }),
        });
        return;
      }
      token = data.token;
      await fetchLogs(data.token);
      await fetchWhitelist(data.token);
      isAuthenticated = true;
      otpTokens = ["", "", ""];
    } catch {
      alert("데이터를 가져오는데 실패했습니다.");
    } finally {
      loginLoading = false;
    }
  }

  async function fetchLogs(useToken?: string) {
    const activeToken = useToken || token;
    if (!activeToken) return;
    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getLogs", token: activeToken }),
      });
      if (res.status === 401) {
        alert("세션이 만료되었습니다. 다시 로그인해주세요.");
        await handleLogout();
        return;
      }
      const data = await res.json();
      if (res.ok) logs = data.logs || [];
      else alert("로그를 가져오는데 실패했습니다.");
    } catch {
      alert("데이터를 가져오는데 실패했습니다.");
    }
  }

  async function fetchWhitelist(useToken?: string) {
    const activeToken = useToken || token;
    if (!activeToken) return;
    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "getWhitelist", token: activeToken }),
      });
      if (res.ok) {
        const data = await res.json();
        whitelist = data.whitelist || [];
      }
    } catch {}
  }

  async function handleAddWhitelist() {
    if (!newId || !newName) {
      alert("ID와 이름을 모두 입력해주세요.");
      return;
    }
    if (!/^\d{17,19}$/.test(newId)) {
      alert("올바른 18자리 디스코드 고유 ID 숫자를 입력해주세요.");
      return;
    }
    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addWhitelist",
          token,
          whitelistItem: { id: newId, name: newName },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        whitelist = data.whitelist;
        newId = "";
        newName = "";
        alert("화이트리스트에 성공적으로 추가되었습니다.");
      } else {
        alert(data.message || "추가 실패");
      }
    } catch {
      alert("통신 중 오류가 발생했습니다.");
    }
  }

  async function handleRemoveWhitelist(targetId: string) {
    if (!confirm("정말 삭제하시겠습니까?")) return;
    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "removeWhitelist", token, targetId }),
      });
      const data = await res.json();
      if (res.ok) {
        whitelist = data.whitelist;
        alert("성공적으로 삭제되었습니다.");
      } else {
        alert(data.message || "삭제 실패");
      }
    } catch {
      alert("통신 중 오류가 발생했습니다.");
    }
  }

  async function handleUpdateWhitelist(targetId: string) {
    if (!editingName.trim()) {
      alert("이름을 입력해주세요.");
      return;
    }
    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "updateWhitelist",
          token,
          targetId,
          whitelistItem: { name: editingName },
        }),
      });
      const data = await res.json();
      if (res.ok) {
        whitelist = data.whitelist;
        editingId = null;
        editingName = "";
        alert("성공적으로 수정되었습니다.");
      } else {
        alert(data.message || "수정 실패");
      }
    } catch {
      alert("통신 중 오류가 발생했습니다.");
    }
  }

  async function handleLogout() {
    if (token) {
      try {
        await fetch("/api/server", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "logout", token }),
        });
      } catch {}
    }
    token = "";
    isAuthenticated = false;
    otpTokens = ["", "", ""];
    logs = [];
    whitelist = [];
  }
</script>

<svelte:head>
  <title>마인크래프트 관리자 대시보드 | Azest_Kingscrown</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <div class="flex items-center gap-2">
        <span class="rounded border border-oc-border bg-oc-subtle px-2 py-0.5 font-mono text-xs font-medium text-oc-text">
          Admin Console
        </span>
        {#if isAuthenticated}
          <span class="rounded border border-[#54d483]/30 bg-[#54d483]/10 px-2 py-0.5 font-mono text-xs font-semibold text-[#239f50] dark:text-[#54d483]">
            관리 세션 활성
          </span>
        {/if}
      </div>
      <h1 class="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight text-oc-strong">
        <Icon name="admin" class="size-6 text-oc-strong" />
        마인크래프트 관리자 대시보드
      </h1>
      <p class="mt-1 text-sm text-oc-muted">
        Discord 화이트리스트 접근 권한 및 서버 제어 이력 관리
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      {#if isAuthenticated}
        <button
          type="button"
          onclick={() => {
            void fetchLogs();
            void fetchWhitelist();
          }}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-oc-border bg-oc-bg px-3 py-1.5 text-xs font-medium text-oc-strong transition hover:border-oc-border-strong hover:bg-oc-hover"
        >
          <Icon name="refresh" class="size-4" />
          새로고침
        </button>
        <button
          type="button"
          onclick={handleLogout}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded bg-red-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-red-700"
        >
          <Icon name="logout" class="size-4" />
          로그아웃
        </button>
      {/if}
      <a
        href="/minecraft"
        class="inline-flex items-center gap-1.5 rounded border border-oc-border bg-oc-bg px-3 py-1.5 text-xs font-medium text-oc-strong transition hover:border-oc-border-strong hover:bg-oc-hover"
      >
        <Icon name="arrowLeft" class="size-4" />
        제어 페이지
      </a>
    </div>
  </div>

  {#if !isAuthenticated}
    <TripleOtpForm
      title="Google OTP 3단계 인증"
      subtitle="대시보드 접근을 위해 3개의 6자리 인증코드를 모두 입력하세요."
      submitLabel="인증 확인"
      loadingLabel="인증 중..."
      loading={loginLoading}
      bind:tokens={otpTokens}
      onSubmit={handleLogin}
    />
  {:else}
    <div class="space-y-6">
      <!-- KPI Strip -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div class="rounded-md border border-oc-border bg-oc-surface p-5">
          <p class="text-xs font-medium text-oc-muted">화이트리스트 계정</p>
          <p class="mt-1.5 font-mono text-2xl font-bold tabular-nums text-oc-strong">
            {whitelist.length}명
          </p>
        </div>
        <div class="rounded-md border border-oc-border bg-oc-surface p-5">
          <p class="text-xs font-medium text-oc-muted">최근 제어 기록</p>
          <p class="mt-1.5 font-mono text-2xl font-bold tabular-nums text-oc-strong">
            {logs.length}건
          </p>
        </div>
        <div class="rounded-md border border-oc-border bg-oc-surface p-5">
          <p class="text-xs font-medium text-oc-muted">세션 자동 만료</p>
          <p class="mt-1.5 font-mono text-2xl font-bold tabular-nums text-oc-strong">
            30분
          </p>
        </div>
      </div>

      <!-- Whitelist Table -->
      <div class="space-y-5 rounded-md border border-oc-border bg-oc-surface p-6">
        <div class="flex items-center gap-2 border-b border-oc-border pb-3">
          <Icon name="users" class="size-5 text-oc-strong" />
          <h2 class="text-base font-semibold text-oc-strong">
            Discord 화이트리스트 구성
          </h2>
        </div>

        <div class="flex flex-col gap-2.5 sm:flex-row">
          <input
            type="text"
            placeholder="디스코드 고유 ID (17~19자리 숫자)"
            value={newId}
            oninput={(e) => {
              newId = e.currentTarget.value.replaceAll(/\D/g, "");
            }}
            class="block rounded border border-oc-border bg-oc-bg px-3 py-2 font-mono text-sm text-oc-strong outline-none transition placeholder:text-oc-faint focus:border-oc-strong focus:ring-1 focus:ring-oc-border-strong sm:flex-[2]"
          />
          <input
            type="text"
            placeholder="사용자명 / 설명"
            bind:value={newName}
            class="block rounded border border-oc-border bg-oc-bg px-3 py-2 text-sm text-oc-strong outline-none transition placeholder:text-oc-faint focus:border-oc-strong focus:ring-1 focus:ring-oc-border-strong sm:flex-1"
          />
          <button
            type="button"
            onclick={handleAddWhitelist}
            class="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded bg-oc-strong px-4 py-2 text-sm font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
          >
            <Icon name="add" class="size-4" />
            추가
          </button>
        </div>

        <div class="w-full overflow-x-auto">
          <table class="w-full border-b border-oc-border text-left text-sm">
            <thead>
              <tr class="border-b border-oc-border font-mono text-xs font-semibold uppercase tracking-wider text-oc-muted">
                <th class="px-4 py-3">디스코드 고유 ID</th>
                <th class="px-4 py-3">사용자 닉네임 / 설명</th>
                <th class="w-36 px-4 py-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-oc-border">
              {#if whitelist.length > 0}
                {#each whitelist as item (item.id)}
                  <tr class="transition-colors hover:bg-oc-subtle">
                    <td class="px-4 py-3.5 font-mono text-xs text-oc-muted">
                      {item.id}
                    </td>
                    <td class="px-4 py-3.5 font-medium text-oc-strong">
                      {#if editingId === item.id}
                        <input
                          type="text"
                          bind:value={editingName}
                          class="max-w-xs rounded border border-oc-strong bg-oc-bg px-2.5 py-1 text-sm text-oc-strong outline-none"
                        />
                      {:else}
                        {item.name}
                      {/if}
                    </td>
                    <td class="px-4 py-3.5 text-right">
                      {#if editingId === item.id}
                        <div class="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onclick={() => handleUpdateWhitelist(item.id)}
                            class="inline-flex cursor-pointer items-center gap-1 rounded bg-oc-strong px-2 py-1 text-xs font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
                          >
                            <Icon name="check" class="size-3.5" />
                            저장
                          </button>
                          <button
                            type="button"
                            onclick={() => {
                              editingId = null;
                              editingName = "";
                            }}
                            class="inline-flex cursor-pointer items-center gap-1 rounded border border-oc-border bg-oc-bg px-2 py-1 text-xs font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
                          >
                            <Icon name="close" class="size-3.5" />
                            취소
                          </button>
                        </div>
                      {:else}
                        <div class="flex justify-end gap-1.5">
                          <button
                            type="button"
                            onclick={() => {
                              editingId = item.id;
                              editingName = item.name;
                            }}
                            class="inline-flex cursor-pointer items-center gap-1 rounded border border-oc-border bg-oc-bg px-2 py-1 text-xs font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
                          >
                            <Icon name="edit" class="size-3.5" />
                            수정
                          </button>
                          <button
                            type="button"
                            onclick={() => handleRemoveWhitelist(item.id)}
                            class="inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[#db2424] transition hover:bg-red-500/10 dark:text-[#ed5a5a]"
                          >
                            <Icon name="trash" class="size-3.5" />
                            삭제
                          </button>
                        </div>
                      {/if}
                    </td>
                  </tr>
                {/each}
              {:else}
                <tr>
                  <td colspan="3" class="py-8 text-center text-oc-muted">
                    등록된 화이트리스트가 없습니다.
                  </td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Recent Control Logs -->
      <div class="space-y-4 rounded-md border border-oc-border bg-oc-surface p-6">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-oc-border pb-3">
          <div class="flex items-center gap-2">
            <Icon name="history" class="size-5 text-oc-strong" />
            <h2 class="text-base font-semibold text-oc-strong">
              최근 제어 기록 (최근 20개)
            </h2>
          </div>
          <span class="text-xs text-oc-muted">
            세션은 마지막 로그인으로부터 30분 후 자동 만료됩니다.
          </span>
        </div>

        <div class="w-full overflow-x-auto">
          <table class="w-full border-b border-oc-border text-left text-sm">
            <thead>
              <tr class="border-b border-oc-border font-mono text-xs font-semibold uppercase tracking-wider text-oc-muted">
                <th class="px-4 py-3">시간</th>
                <th class="px-4 py-3">작업</th>
                <th class="px-4 py-3">디스코드 닉네임</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-oc-border">
              {#if logs.length > 0}
                {#each logs as log, index (`${log.time}-${log.action}-${index}`)}
                  <tr class="transition-colors hover:bg-oc-subtle">
                    <td class="whitespace-nowrap px-4 py-3.5 font-mono text-xs text-oc-muted">
                      {log.time}
                    </td>
                    <td class="px-4 py-3.5">
                      <span
                        class={log.action.toLowerCase().includes("start") || log.action.includes("켜")
                          ? "inline-flex items-center rounded border border-[#54d483]/30 bg-[#54d483]/10 px-2 py-0.5 text-xs font-semibold text-[#239f50] dark:text-[#54d483]"
                          : log.action.toLowerCase().includes("stop") || log.action.includes("끄")
                            ? "inline-flex items-center rounded border border-[#ed5a5a]/30 bg-[#ed5a5a]/10 px-2 py-0.5 text-xs font-semibold text-[#db2424] dark:text-[#ed5a5a]"
                            : "inline-flex items-center rounded border border-oc-border bg-oc-subtle px-2 py-0.5 text-xs font-semibold text-oc-text"}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td class="px-4 py-3.5 font-semibold text-oc-strong">
                      {log.user || log.ip || "Unknown"}
                    </td>
                  </tr>
                {/each}
              {:else}
                <tr>
                  <td colspan="3" class="py-8 text-center text-oc-muted">기록이 없습니다.</td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  {/if}
</div>
