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
        <span class="rounded border border-oc-border bg-oc-subtle px-2 py-0.5 font-mono text-xs font-medium text-oc-text">
          Admin Only
        </span>
        {#if isAuthenticated}
          <span class="rounded border border-[#54d483]/30 bg-[#54d483]/10 px-2 py-0.5 font-mono text-xs font-semibold text-[#239f50] dark:text-[#54d483]">
            세션 활성 · 30분
          </span>
        {/if}
      </div>
      <h1 class="mt-2 flex items-center gap-2 text-2xl font-bold tracking-tight text-oc-strong">
        <Icon name="upload" class="size-6 text-oc-strong" />
        Private File Hosting
      </h1>
      <p class="mt-1 text-sm text-oc-muted">
        외부에 노출되지 않는 관리자 전용 파일 업로드 및 URL 호스팅 공간입니다.
      </p>
    </div>

    <div>
      {#if isAuthenticated}
        <button
          type="button"
          onclick={handleLogout}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-oc-border bg-oc-bg px-3 py-1.5 text-xs font-medium text-oc-strong transition hover:border-oc-border-strong hover:bg-oc-hover"
        >
          <Icon name="logout" class="size-4" />
          로그아웃
        </button>
      {:else}
        <a
          href="/"
          class="inline-flex items-center gap-1.5 rounded border border-oc-border bg-oc-bg px-3 py-1.5 text-xs font-medium text-oc-strong transition hover:border-oc-border-strong hover:bg-oc-hover"
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
