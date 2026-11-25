<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import type { AdminDataState } from "#lib/ddnsHelpers.ts";

  let {
    adminData,
    adminLoading,
    currentUserId,
    copiedField,
    onRefresh,
    onOpenAddUser,
    onCopy,
    onOpenRegen,
    onRemoveUser,
  }: {
    adminData: AdminDataState | null;
    adminLoading: boolean;
    currentUserId?: string;
    copiedField: string | null;
    onRefresh: () => void;
    onOpenAddUser: () => void;
    onCopy: (text: string, field: string) => void;
    onOpenRegen: (user: { id: string; name: string }) => void;
    onRemoveUser: (discordId: string, name: string) => void;
  } = $props();
</script>

<div class="space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h2 class="text-base font-semibold text-gray-900 dark:text-gray-50">
        DDNS 이용 유저 및 화이트리스트 관리
      </h2>
      <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        화이트리스트 등록 유저는 Discord 로그인으로 즉시 접속 가능하며, 고유 개인 토큰이 자동 발급됩니다.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onclick={onRefresh}
        disabled={adminLoading}
        class="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50"
      >
        <Icon name="refresh" class="size-4" />
        {adminLoading ? "새로고침 중..." : "새로고침"}
      </button>
      <button
        type="button"
        onclick={onOpenAddUser}
        class="inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 dark:bg-indigo-500"
      >
        <Icon name="add" class="size-4" />
        새 유저 등록
      </button>
    </div>
  </div>

  {#if adminData?.whitelist && adminData.whitelist.length > 0}
    <div class="w-full overflow-x-auto">
      <table class="w-full border-b border-gray-200 text-left text-sm dark:border-gray-800">
        <thead>
          <tr class="border-b border-gray-200 text-xs font-semibold uppercase tracking-wider text-gray-600 dark:border-gray-800 dark:text-gray-400">
            <th class="px-4 py-3">유저 닉네임</th>
            <th class="px-4 py-3">Discord 고유 ID</th>
            <th class="px-4 py-3">권한</th>
            <th class="px-4 py-3">개인 DDNS 토큰</th>
            <th class="px-4 py-3">보유 기기</th>
            <th class="px-4 py-3 text-right">관리</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200 dark:divide-gray-800">
          {#each adminData.whitelist as w (w.id)}
            {@const u = adminData.users.find((user) => user.discordId === w.id)}
            {@const userDomains = adminData.domains.filter((d) => d.ownerId === w.id)}
            {@const isUserAdmin = u?.role === "admin"}
            {@const copyKey = `usr-token-${w.id}`}
            <tr class="transition-colors hover:bg-gray-50 dark:hover:bg-gray-900/50">
              <td class="px-4 py-3.5">
                <div class="flex items-center gap-2">
                  <Icon
                    name={isUserAdmin ? "admin" : "user"}
                    class="size-4 {isUserAdmin ? 'text-amber-500' : 'text-indigo-500'}"
                  />
                  <span class="font-semibold text-gray-900 dark:text-gray-50">{w.name}</span>
                  {#if w.id === currentUserId}
                    <span class="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-400">
                      나
                    </span>
                  {/if}
                </div>
              </td>
              <td class="px-4 py-3.5 font-mono text-xs text-gray-500 dark:text-gray-400">{w.id}</td>
              <td class="px-4 py-3.5">
                <span
                  class={isUserAdmin
                    ? "rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-400/10 dark:text-amber-400"
                    : "rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-400"}
                >
                  {isUserAdmin ? "관리자" : "일반 유저"}
                </span>
              </td>
              <td class="px-4 py-3.5">
                <div class="flex items-center gap-1.5">
                  <span class="font-mono text-xs text-indigo-600 dark:text-indigo-400">
                    {u?.token ? `${u.token.slice(0, 8)}...${u.token.slice(-6)}` : "미발급"}
                  </span>
                  {#if u?.token}
                    <button
                      type="button"
                      onclick={() => onCopy(u.token, copyKey)}
                      class="cursor-pointer rounded border border-gray-300 bg-white p-1 text-gray-700 hover:bg-gray-50 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-300"
                    >
                      <Icon name={copiedField === copyKey ? "check" : "copy"} class="size-3.5 {copiedField === copyKey ? 'text-emerald-500' : ''}" />
                    </button>
                  {/if}
                  <button
                    type="button"
                    onclick={() => onOpenRegen({ id: w.id, name: w.name })}
                    class="inline-flex cursor-pointer items-center gap-1 rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800 hover:bg-gray-200 dark:bg-gray-900 dark:text-gray-200"
                  >
                    <Icon name="refresh" class="size-3" />
                    재발급
                  </button>
                </div>
              </td>
              <td class="px-4 py-3.5 font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {userDomains.length}개
              </td>
              <td class="px-4 py-3.5 text-right">
                {#if !isUserAdmin}
                  <button
                    type="button"
                    onclick={() => onRemoveUser(w.id, w.name)}
                    class="inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                  >
                    <Icon name="trash" class="size-3.5" />
                    삭제
                  </button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    <div class="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
      {adminLoading ? "유저 목록을 불러오는 중입니다..." : "등록된 유저가 없습니다."}
    </div>
  {/if}
</div>
