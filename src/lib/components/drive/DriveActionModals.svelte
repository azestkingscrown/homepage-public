<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import type {
    DriveFolderTreeNode,
    DriveItemRef,
  } from "#lib/driveTypes.ts";

  export type DriveActionModalState =
    | null
    | { type: "createFolder"; parentId: string | null }
    | { type: "rename"; kind: "folder" | "file"; id: string; currentName: string }
    | { type: "move"; items: DriveItemRef[]; title: string }
    | {
        type: "confirmDelete";
        mode: "permanent" | "emptyTrash";
        items?: DriveItemRef[];
        countLabel: string;
      };

  const DEPTH_PADDING_CLASSES = [
    "pl-3",
    "pl-6",
    "pl-9",
    "pl-12",
    "pl-14",
    "pl-16",
    "pl-20",
    "pl-24",
  ];

  let {
    modal,
    folderTree,
    busy = false,
    onClose,
    onCreateFolder,
    onRename,
    onMove,
    onConfirmDelete,
  }: {
    modal: DriveActionModalState;
    folderTree: DriveFolderTreeNode[];
    busy?: boolean;
    onClose: () => void;
    onCreateFolder: (name: string, parentId: string | null) => Promise<void>;
    onRename: (
      kind: "folder" | "file",
      id: string,
      newName: string,
    ) => Promise<void>;
    onMove: (
      items: DriveItemRef[],
      targetFolderId: string | null,
    ) => Promise<void>;
    onConfirmDelete: (
      mode: "permanent" | "emptyTrash",
      items?: DriveItemRef[],
    ) => Promise<void>;
  } = $props();

  let inputValue = $state("");
  let selectedTargetFolderId = $state<string | null>(null);
  let inputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (!modal) return;
    if (modal.type === "createFolder") {
      inputValue = "";
    } else if (modal.type === "rename") {
      inputValue = modal.currentName;
    } else if (modal.type === "move") {
      selectedTargetFolderId = null;
    }
  });

  $effect(() => {
    if (
      modal &&
      (modal.type === "createFolder" || modal.type === "rename") &&
      inputEl
    ) {
      inputEl.focus();
      inputEl.select();
    }
  });

  let disabledMoveTargets = $derived.by(() => {
    const disabled = new Set<string>();
    if (!modal || modal.type !== "move") return disabled;

    const movingFolders = new Set(
      modal.items.filter((i) => i.kind === "folder").map((i) => i.id),
    );
    if (movingFolders.size === 0) return disabled;

    const childrenByParent = new Map<string, string[]>();
    for (const node of folderTree) {
      if (node.parentId) {
        const list = childrenByParent.get(node.parentId) || [];
        list.push(node.id);
        childrenByParent.set(node.parentId, list);
      }
    }

    const queue = [...movingFolders];
    for (const id of queue) disabled.add(id);
    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const childId of childrenByParent.get(curr) || []) {
        if (!disabled.has(childId)) {
          disabled.add(childId);
          queue.push(childId);
        }
      }
    }
    return disabled;
  });

  function paddingClassForDepth(depth: number): string {
    return DEPTH_PADDING_CLASSES[
      Math.min(Math.max(depth, 0), DEPTH_PADDING_CLASSES.length - 1)
    ];
  }

  async function submitTextModal(event: SubmitEvent) {
    event.preventDefault();
    if (!modal || busy) return;
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    if (modal.type === "createFolder") {
      await onCreateFolder(trimmed, modal.parentId);
    } else if (modal.type === "rename") {
      await onRename(modal.kind, modal.id, trimmed);
    }
  }

  async function submitMove() {
    if (!modal || modal.type !== "move" || busy) return;
    if (
      selectedTargetFolderId !== null &&
      disabledMoveTargets.has(selectedTargetFolderId)
    ) {
      return;
    }
    await onMove(modal.items, selectedTargetFolderId);
  }

  async function submitDelete() {
    if (!modal || modal.type !== "confirmDelete" || busy) return;
    await onConfirmDelete(modal.mode, modal.items);
  }
</script>

{#if modal}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4"
    role="dialog"
    aria-modal="true"
  >
    <button
      type="button"
      aria-label="대화상자 닫기"
      onclick={onClose}
      class="fixed inset-0 bg-black/70 backdrop-blur-xs"
    ></button>

    <div class="relative z-10 w-full max-w-md rounded-lg border border-oc-border bg-oc-surface p-5 shadow-2xl">
      {#if modal.type === "createFolder" || modal.type === "rename"}
        <div class="flex items-center justify-between gap-2 border-b border-oc-border pb-3">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-oc-strong">
            <Icon
              name={modal.type === "createFolder" ? "folderPlus" : "edit"}
              class="size-4"
            />
            {modal.type === "createFolder" ? "새 폴더 만들기" : "이름 변경"}
          </h3>
          <button
            type="button"
            onclick={onClose}
            aria-label="닫기"
            class="cursor-pointer rounded p-1 text-oc-muted transition hover:bg-oc-hover hover:text-oc-strong"
          >
            <Icon name="close" class="size-4" />
          </button>
        </div>

        <form onsubmit={submitTextModal} class="mt-4 space-y-4">
          <div>
            <label
              for="drive-modal-name-input"
              class="block text-xs font-medium text-oc-muted"
            >
              {modal.type === "createFolder"
                ? "폴더 이름"
                : modal.kind === "folder"
                  ? "새 폴더 이름"
                  : "새 파일 이름 (표시명)"}
            </label>
            <input
              id="drive-modal-name-input"
              bind:this={inputEl}
              bind:value={inputValue}
              type="text"
              maxlength="120"
              required
              placeholder={modal.type === "createFolder"
                ? "예: 프로젝트 스크린샷"
                : "이름을 입력하세요"}
              class="mt-1.5 w-full rounded border border-oc-border bg-oc-bg px-3 py-2 text-sm text-oc-strong placeholder:text-oc-faint focus:border-oc-border-strong focus:outline-none"
            />
            {#if modal.type === "rename" && modal.kind === "file"}
              <p class="mt-1.5 text-xs text-oc-faint">
                표시 이름만 변경되며 기존 공개 URL(`/uploads/...`) 링크는 그대로 유지됩니다.
              </p>
            {/if}
          </div>

          <div class="flex justify-end gap-2">
            <button
              type="button"
              onclick={onClose}
              disabled={busy}
              class="cursor-pointer rounded border border-oc-border bg-oc-bg px-3 py-1.5 text-xs font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={busy || !inputValue.trim()}
              class="cursor-pointer rounded bg-oc-strong px-3.5 py-1.5 text-xs font-medium text-oc-inverted transition hover:bg-oc-strong-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "처리 중..." : modal.type === "createFolder" ? "만들기" : "저장"}
            </button>
          </div>
        </form>
      {:else if modal.type === "move"}
        <div class="flex items-center justify-between gap-2 border-b border-oc-border pb-3">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-oc-strong">
            <Icon name="move" class="size-4" />
            {modal.title}
          </h3>
          <button
            type="button"
            onclick={onClose}
            aria-label="닫기"
            class="cursor-pointer rounded p-1 text-oc-muted transition hover:bg-oc-hover hover:text-oc-strong"
          >
            <Icon name="close" class="size-4" />
          </button>
        </div>

        <p class="mt-3 text-xs text-oc-muted">
          이동할 대상 폴더를 선택하세요.
        </p>

        <div class="mt-2.5 max-h-64 overflow-y-auto rounded border border-oc-border bg-oc-bg p-1.5">
          <button
            type="button"
            onclick={() => (selectedTargetFolderId = null)}
            class="flex w-full cursor-pointer items-center gap-2 rounded px-3 py-2 text-left text-xs font-medium transition {selectedTargetFolderId === null
              ? 'bg-oc-strong text-oc-inverted'
              : 'text-oc-strong hover:bg-oc-hover'}"
          >
            <Icon name="drive" class="size-4 shrink-0" />
            <span>내 드라이브 (최상위)</span>
          </button>

          {#each folderTree as node (node.id)}
            {@const isDisabled = disabledMoveTargets.has(node.id)}
            {@const isSelected = selectedTargetFolderId === node.id}
            <button
              type="button"
              disabled={isDisabled}
              onclick={() => (selectedTargetFolderId = node.id)}
              class="mt-0.5 flex w-full items-center gap-2 rounded py-2 pr-3 text-left text-xs transition {paddingClassForDepth(node.depth + 1)} {isDisabled
                ? 'cursor-not-allowed text-oc-faint opacity-45'
                : isSelected
                  ? 'cursor-pointer bg-oc-strong font-medium text-oc-inverted'
                  : 'cursor-pointer text-oc-text hover:bg-oc-hover hover:text-oc-strong'}"
            >
              <Icon name="folder" class="size-3.5 shrink-0" />
              <span class="truncate">{node.name}</span>
            </button>
          {/each}
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onclick={onClose}
            disabled={busy}
            class="cursor-pointer rounded border border-oc-border bg-oc-bg px-3 py-1.5 text-xs font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onclick={submitMove}
            disabled={busy}
            class="cursor-pointer rounded bg-oc-strong px-3.5 py-1.5 text-xs font-medium text-oc-inverted transition hover:bg-oc-strong-hover disabled:opacity-50"
          >
            {busy ? "이동 중..." : "여기로 이동"}
          </button>
        </div>
      {:else if modal.type === "confirmDelete"}
        <div class="flex items-center justify-between gap-2 border-b border-oc-border pb-3">
          <h3 class="flex items-center gap-2 text-sm font-semibold text-red-500 dark:text-red-400">
            <Icon name="alert" class="size-4" />
            {modal.mode === "emptyTrash" ? "휴지통 비우기" : "영구 삭제 확인"}
          </h3>
          <button
            type="button"
            onclick={onClose}
            aria-label="닫기"
            class="cursor-pointer rounded p-1 text-oc-muted transition hover:bg-oc-hover hover:text-oc-strong"
          >
            <Icon name="close" class="size-4" />
          </button>
        </div>

        <div class="mt-4 space-y-2 text-xs leading-relaxed text-oc-text">
          <p>
            <strong class="text-oc-strong">{modal.countLabel}</strong>을(를) 영구적으로 삭제합니다.
          </p>
          <p class="text-red-500 dark:text-red-400">
            이 작업은 되돌릴 수 없으며 서버 디스크의 실제 파일과 하위 폴더 항목까지 완전히 제거됩니다.
          </p>
        </div>

        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onclick={onClose}
            disabled={busy}
            class="cursor-pointer rounded border border-oc-border bg-oc-bg px-3 py-1.5 text-xs font-medium text-oc-text transition hover:bg-oc-hover hover:text-oc-strong disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            onclick={submitDelete}
            disabled={busy}
            class="cursor-pointer rounded bg-red-600 px-3.5 py-1.5 text-xs font-medium text-white transition hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "삭제 중..." : "영구 삭제"}
          </button>
        </div>
      {/if}
    </div>
  </div>
{/if}
