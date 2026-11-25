<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
</script>

<svelte:head>
  <title>접근 권한 없음 | Azest_Kingscrown</title>
</svelte:head>

<div class="flex min-h-[70vh] items-center justify-center">
  <div class="w-full max-w-md space-y-5 rounded-lg border border-gray-200 bg-white p-6 text-center shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
    <div class="mx-auto flex size-14 items-center justify-center rounded-full bg-red-50 text-red-600 ring-1 ring-red-200 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/30">
      <Icon name="shield" class="size-7" />
    </div>

    <div class="space-y-2">
      <span class="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-800 ring-1 ring-inset ring-red-600/20 dark:bg-red-400/10 dark:text-red-400">
        403 Forbidden
      </span>
      <h1 class="text-xl font-bold text-gray-900 dark:text-gray-50">
        접근 권한이 없습니다
      </h1>
      <p class="break-keep text-sm leading-relaxed text-gray-600 dark:text-gray-400">
        죄송합니다. 등록된 디스코드 화이트리스트 계정만 이 대시보드를 제어할 수 있습니다.
        관리자에게 화이트리스트 등록을 요청하시거나 다른 계정으로 로그인해 주세요.
      </p>
    </div>

    <div class="flex flex-col gap-2.5 pt-2">
      <a
        href="/minecraft"
        class="inline-flex w-full items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition hover:bg-indigo-500 dark:bg-indigo-500"
      >
        제어 페이지로 돌아가기
      </a>
      <a
        href="/"
        class="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 shadow-xs transition hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:hover:bg-gray-900"
      >
        <Icon name="home" class="size-4" />
        메인 페이지로 이동
      </a>
    </div>
  </div>
</div>
