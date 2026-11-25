<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import ImageHosting from "#lib/components/ImageHosting.svelte";

  let otpToken = $state("");
  let sessionToken = $state("");
  let isAuthenticated = $state(false);
  let loginLoading = $state(false);
  let authError = $state("");

  async function handleLogin() {
    if (!otpToken) return;
    loginLoading = true;
    authError = "";
    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", otpToken }),
      });
      const data = await res.json();

      if (!res.ok || !data.token) {
        authError = data.message || "OTP 코드가 올바르지 않습니다.";
        return;
      }

      if (data.role !== "admin") {
        authError = "관리자 권한이 필요합니다.";
        await fetch("/api/server", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "logout", token: data.token }),
        });
        return;
      }

      sessionToken = data.token;
      isAuthenticated = true;
      otpToken = "";
    } catch {
      authError = "서버 연결에 실패했습니다.";
    } finally {
      loginLoading = false;
    }
  }

  async function handleLogout() {
    if (sessionToken) {
      try {
        await fetch("/api/server", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "logout", token: sessionToken }),
        });
      } catch {}
    }
    sessionToken = "";
    isAuthenticated = false;
    otpToken = "";
  }
</script>

<svelte:head>
  <title>Private File Hosting | Azest_Kingscrown</title>
</svelte:head>

<div class="space-y-6">
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <div class="flex items-center gap-2">
        <span class="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-500/30 dark:bg-indigo-400/10 dark:text-indigo-400">
          Admin Only
        </span>
        {#if isAuthenticated}
          <span class="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-600/30 dark:bg-emerald-400/10 dark:text-emerald-400">
            세션 활성 · 30분
          </span>
        {/if}
      </div>
      <h1 class="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-50">
        <Icon name="upload" class="size-6 text-indigo-600 dark:text-indigo-400" />
        Private File Hosting
      </h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        외부에 노출되지 않는 관리자 전용 파일 업로드 및 URL 호스팅 공간입니다.
      </p>
    </div>

    <div>
      {#if isAuthenticated}
        <button
          type="button"
          onclick={handleLogout}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 shadow-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:hover:bg-gray-900"
        >
          <Icon name="logout" class="size-4" />
          로그아웃
        </button>
      {:else}
        <a
          href="/"
          class="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 shadow-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:hover:bg-gray-900"
        >
          <Icon name="arrowLeft" class="size-4" />
          메인으로
        </a>
      {/if}
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
              관리자 OTP 인증
            </h2>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Google Authenticator 6자리 코드를 입력하세요.
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

          {#if authError}
            <p class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-400">
              {authError}
            </p>
          {/if}

          <button
            type="submit"
            disabled={loginLoading || !otpToken}
            class="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
          >
            <Icon name="shield" class="size-4" />
            {loginLoading ? "인증 확인 중..." : "인증 및 입장"}
          </button>
        </form>
      </div>
    </div>
  {:else}
    <ImageHosting {sessionToken} />
  {/if}
</div>
