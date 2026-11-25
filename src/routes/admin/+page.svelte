<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";

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

  let otpToken = $state("");
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
    if (!otpToken) return;
    loginLoading = true;
    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", otpToken }),
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
    otpToken = "";
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
        <span class="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-500/30 dark:bg-indigo-400/10 dark:text-indigo-400">
          Admin Console
        </span>
        {#if isAuthenticated}
          <span class="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-600/30 dark:bg-emerald-400/10 dark:text-emerald-400">
            관리 세션 활성
          </span>
        {/if}
      </div>
      <h1 class="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
        <Icon name="admin" class="size-6 text-indigo-600 dark:text-indigo-400" />
        마인크래프트 관리자 대시보드
      </h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
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
          class="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 shadow-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:hover:bg-gray-900"
        >
          <Icon name="refresh" class="size-4" />
          새로고침
        </button>
        <button
          type="button"
          onclick={handleLogout}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white shadow-xs transition hover:bg-red-700"
        >
          <Icon name="logout" class="size-4" />
          로그아웃
        </button>
      {/if}
      <a
        href="/minecraft"
        class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 shadow-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:hover:bg-gray-900"
      >
        <Icon name="arrowLeft" class="size-4" />
        제어 페이지
      </a>
    </div>
  </div>

  {#if !isAuthenticated}
    <div class="flex justify-center pt-4">
      <div class="w-full max-w-md space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
        <div class="flex items-center gap-3">
          <div class="flex size-10 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
            <Icon name="lock" class="size-5" />
          </div>
          <div>
            <h2 class="text-base font-semibold text-gray-900 dark:text-gray-50">
              Google OTP 인증
            </h2>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              대시보드 접근을 위해 6자리 인증코드를 입력하세요.
            </p>
          </div>
        </div>

        <form
          onsubmit={(e) => {
            e.preventDefault();
            void handleLogin();
          }}
          class="space-y-3"
        >
          <input
            type="text"
            inputmode="numeric"
            maxlength="6"
            placeholder="000000"
            value={otpToken}
            oninput={(e) => {
              otpToken = e.currentTarget.value.replaceAll(/\D/g, "");
            }}
            class="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-center font-mono text-lg tracking-[0.3em] text-gray-900 shadow-xs outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:focus:border-indigo-700 dark:focus:ring-indigo-700/30"
          />
          <button
            type="submit"
            disabled={loginLoading || !otpToken}
            class="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            <Icon name="shield" class="size-4" />
            {loginLoading ? "인증 중..." : "인증 확인"}
          </button>
        </form>
      </div>
    </div>
  {:else}
    <div class="space-y-6">
      <!-- KPI Strip -->
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div class="rounded-lg border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400">화이트리스트 계정</p>
          <p class="mt-1.5 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-50">
            {whitelist.length}명
          </p>
        </div>
        <div class="rounded-lg border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400">최근 제어 기록</p>
          <p class="mt-1.5 text-2xl font-bold tabular-nums text-gray-900 dark:text-gray-50">
            {logs.length}건
          </p>
        </div>
        <div class="rounded-lg border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400">세션 자동 만료</p>
          <p class="mt-1.5 text-2xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
            30분
          </p>
        </div>
      </div>

      <!-- Whitelist Table -->
      <div class="space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
        <div class="flex items-center gap-2 border-b border-gray-100 pb-3 dark:border-gray-800">
          <Icon name="users" class="size-5 text-indigo-600 dark:text-indigo-400" />
          <h2 class="text-base font-semibold text-gray-900 dark:text-gray-50">
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
            class="block rounded-md border border-gray-300 bg-white px-3 py-2 font-mono text-sm text-gray-900 shadow-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 sm:flex-[2]"
          />
          <input
            type="text"
            placeholder="사용자명 / 설명"
            bind:value={newName}
            class="block rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-xs outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 sm:flex-1"
          />
          <button
            type="button"
            onclick={handleAddWhitelist}
            class="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition hover:bg-indigo-500 dark:bg-indigo-500"
          >
            <Icon name="add" class="size-4" />
            추가
          </button>
        </div>

        <div class="w-full overflow-x-auto">
          <table class="w-full border-b border-gray-200 text-left text-sm dark:border-gray-800">
            <thead>
              <tr class="border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:border-gray-800 dark:text-gray-400">
                <th class="px-4 py-3">디스코드 고유 ID</th>
                <th class="px-4 py-3">사용자 닉네임 / 설명</th>
                <th class="w-36 px-4 py-3 text-right">작업</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              {#if whitelist.length > 0}
                {#each whitelist as item (item.id)}
                  <tr class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td class="px-4 py-3.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                      {item.id}
                    </td>
                    <td class="px-4 py-3.5 font-medium text-gray-900 dark:text-gray-100">
                      {#if editingId === item.id}
                        <input
                          type="text"
                          bind:value={editingName}
                          class="max-w-xs rounded-md border border-indigo-500 bg-white px-2.5 py-1 text-sm text-gray-900 outline-none dark:bg-gray-950 dark:text-gray-50"
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
                            class="inline-flex cursor-pointer items-center gap-1 rounded-md bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-500"
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
                            class="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
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
                            class="inline-flex cursor-pointer items-center gap-1 rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
                          >
                            <Icon name="edit" class="size-3.5" />
                            수정
                          </button>
                          <button
                            type="button"
                            onclick={() => handleRemoveWhitelist(item.id)}
                            class="inline-flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
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
                  <td colspan="3" class="py-8 text-center text-gray-500">
                    등록된 화이트리스트가 없습니다.
                  </td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Recent Control Logs -->
      <div class="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 pb-3 dark:border-gray-800">
          <div class="flex items-center gap-2">
            <Icon name="history" class="size-5 text-indigo-600 dark:text-indigo-400" />
            <h2 class="text-base font-semibold text-gray-900 dark:text-gray-50">
              최근 제어 기록 (최근 20개)
            </h2>
          </div>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            세션은 마지막 로그인으로부터 30분 후 자동 만료됩니다.
          </span>
        </div>

        <div class="w-full overflow-x-auto">
          <table class="w-full border-b border-gray-200 text-left text-sm dark:border-gray-800">
            <thead>
              <tr class="border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:border-gray-800 dark:text-gray-400">
                <th class="px-4 py-3">시간</th>
                <th class="px-4 py-3">작업</th>
                <th class="px-4 py-3">디스코드 닉네임</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
              {#if logs.length > 0}
                {#each logs as log, index (`${log.time}-${log.action}-${index}`)}
                  <tr class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50">
                    <td class="whitespace-nowrap px-4 py-3.5 font-mono text-xs text-gray-500 dark:text-gray-400">
                      {log.time}
                    </td>
                    <td class="px-4 py-3.5">
                      <span
                        class={log.action.toLowerCase().includes("start") || log.action.includes("켜")
                          ? "inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-400/10 dark:text-emerald-400"
                          : log.action.toLowerCase().includes("stop") || log.action.includes("끄")
                            ? "inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800 dark:bg-red-400/10 dark:text-red-400"
                            : "inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300"}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td class="px-4 py-3.5 font-semibold text-indigo-600 dark:text-indigo-400">
                      {log.user || log.ip || "Unknown"}
                    </td>
                  </tr>
                {/each}
              {:else}
                <tr>
                  <td colspan="3" class="py-8 text-center text-gray-500">기록이 없습니다.</td>
                </tr>
              {/if}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  {/if}
</div>
