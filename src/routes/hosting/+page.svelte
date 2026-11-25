<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import ImageHosting from "#lib/components/ImageHosting.svelte";
  import TripleOtpForm from "#lib/components/TripleOtpForm.svelte";

  let otpTokens = $state<[string, string, string]>(["", "", ""]);
  let sessionToken = $state("");
  let isAuthenticated = $state(false);
  let loginLoading = $state(false);
  let authError = $state("");

  async function handleLogin() {
    if (otpTokens.some((code) => code.length !== 6)) return;
    loginLoading = true;
    authError = "";
    try {
      const res = await fetch("/api/server", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", otpTokens }),
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
      otpTokens = ["", "", ""];
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
    otpTokens = ["", "", ""];
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
    <TripleOtpForm
      title="관리자 3단계 OTP 인증"
      subtitle="Google Authenticator 3개의 6자리 코드를 모두 입력하세요."
      submitLabel="인증 및 입장"
      loadingLabel="인증 확인 중..."
      loading={loginLoading}
      errorMessage={authError}
      bind:tokens={otpTokens}
      onSubmit={handleLogin}
    />
  {:else}
    <ImageHosting {sessionToken} />
  {/if}
</div>
