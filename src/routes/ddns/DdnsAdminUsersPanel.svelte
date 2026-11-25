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

<div class="space-y-5 rounded-md border border-oc-border bg-oc-surface p-6">
  <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h2 class="text-base font-semibold text-oc-strong">
        DDNS 이용 유저 및 화이트리스트 관리
      </h2>
      <p class="mt-0.5 text-xs text-oc-muted">
        화이트리스트 등록 유저는 Discord 로그인으로 즉시 접속 가능하며, 고유 개인 토큰이 자동 발급됩니다.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onclick={onRefresh}
        disabled={adminLoading}
        class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-oc-border bg-oc-bg px-3 py-1.5 text-xs font-medium text-oc-strong transition hover:border-oc-border-strong hover:bg-oc-hover disabled:opacity-50"
      >
        <Icon name="refresh" class="size-4" />
        {adminLoading ? "새로고침 중..." : "새로고침"}
      </button>
      <button
        type="button"
        onclick={onOpenAddUser}
        class="inline-flex cursor-pointer items-center gap-1.5 rounded bg-oc-strong px-3 py-1.5 text-xs font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
      >
        <Icon name="add" class="size-4" />
        새 유저 등록
      </button>
    </div>
  </div>

  {#if adminData?.whitelist && adminData.whitelist.length > 0}
    <div class="w-full overflow-x-auto">
      <table class="w-full border-b border-oc-border text-left text-sm">
        <thead>
          <tr class="border-b border-oc-border font-mono text-xs font-semibold uppercase tracking-wider text-oc-muted">
            <th class="px-4 py-3">유저 닉네임</th>
            <th class="px-4 py-3">Discord 고유 ID</th>
            <th class="px-4 py-3">권한</th>
            <th class="px-4 py-3">개인 DDNS 토큰</th>
            <th class="px-4 py-3">보유 기기</th>
            <th class="px-4 py-3 text-right">관리</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-oc-border">
          {#each adminData.whitelist as w (w.id)}
            {@const u = adminData.users.find((user) => user.discordId === w.id)}
            {@const userDomains = adminData.domains.filter((d) => d.ownerId === w.id)}
            {@const isUserAdmin = u?.role === "admin"}
            {@const copyKey = `usr-token-${w.id}`}
            <tr class="transition-colors hover:bg-oc-subtle">
              <td class="px-4 py-3.5">
                <div class="flex items-center gap-2">
                  <Icon
                    name={isUserAdmin ? "admin" : "user"}
                    class="size-4 {isUserAdmin ? 'text-[#eb980a] dark:text-[#f4b434]' : 'text-oc-strong'}"
                  />
                  <span class="font-semibold text-oc-strong">{w.name}</span>
                  {#if w.id === currentUserId}
                    <span class="rounded border border-[#54d483]/30 bg-[#54d483]/10 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#239f50] dark:text-[#54d483]">
                      나
                    </span>
                  {/if}
                </div>
              </td>
              <td class="px-4 py-3.5 font-mono text-xs text-oc-muted">{w.id}</td>
              <td class="px-4 py-3.5">
                <span
                  class={isUserAdmin
                    ? "rounded border border-[#f4b434]/30 bg-[#f4b434]/10 px-2 py-0.5 font-mono text-xs font-semibold text-[#eb980a] dark:text-[#f4b434]"
                    : "rounded border border-oc-border bg-oc-subtle px-2 py-0.5 font-mono text-xs font-medium text-oc-text"}
                >
                  {isUserAdmin ? "관리자" : "일반 유저"}
                </span>
              </td>
              <td class="px-4 py-3.5">
                <div class="flex items-center gap-1.5">
                  <span class="font-mono text-xs text-oc-strong">
                    {u?.token ? `${u.token.slice(0, 8)}...${u.token.slice(-6)}` : "미발급"}
                  </span>
                  {#if u?.token}
                    <button
                      type="button"
                      onclick={() => onCopy(u.token, copyKey)}
                      class="cursor-pointer rounded border border-oc-border bg-oc-bg p-1 text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
                    >
                      <Icon name={copiedField === copyKey ? "check" : "copy"} class="size-3.5 {copiedField === copyKey ? 'text-[#239f50] dark:text-[#54d483]' : ''}" />
                    </button>
                  {/if}
                  <button
                    type="button"
                    onclick={() => onOpenRegen({ id: w.id, name: w.name })}
                    class="inline-flex cursor-pointer items-center gap-1 rounded border border-oc-border bg-oc-subtle px-2 py-1 text-xs font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
                  >
                    <Icon name="refresh" class="size-3" />
                    재발급
                  </button>
                </div>
              </td>
              <td class="px-4 py-3.5 font-mono font-semibold tabular-nums text-[#239f50] dark:text-[#54d483]">
                {userDomains.length}개
              </td>
              <td class="px-4 py-3.5 text-right">
                {#if !isUserAdmin}
                  <button
                    type="button"
                    onclick={() => onRemoveUser(w.id, w.name)}
                    class="inline-flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[#db2424] transition hover:bg-red-500/10 dark:text-[#ed5a5a]"
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
    <div class="py-10 text-center text-sm text-oc-muted">
      {adminLoading ? "유저 목록을 불러오는 중입니다..." : "등록된 유저가 없습니다."}
    </div>
  {/if}
</div>
