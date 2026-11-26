<script lang="ts">
  import Icon from "#lib/components/Icon.svelte";
  import {
    AUDIO_PREVIEW_EXTS,
    CATEGORY_LABELS,
    formatBytes,
    formatDateKo,
    IMAGE_PREVIEW_EXTS,
    isTextPreviewableExt,
    type DriveFileItem,
    VIDEO_PREVIEW_EXTS,
  } from "#lib/driveTypes.ts";

  let {
    file,
    sessionToken,
    hasPrev = false,
    hasNext = false,
    onClose,
    onPrev,
    onNext,
    onToggleShare,
    onCopyLink,
    onCopyMarkdown,
    onDownload,
    onToggleStar,
    onRename,
    onMove,
    onTrash,
    onRestore,
    onDeletePermanent,
    onSessionExpired,
  }: {
    file: DriveFileItem | null;
    sessionToken: string;
    hasPrev?: boolean;
    hasNext?: boolean;
    onClose: () => void;
    onPrev: () => void;
    onNext: () => void;
    onToggleShare: (file: DriveFileItem) => void;
    onCopyLink: (file: DriveFileItem) => void;
    onCopyMarkdown: (file: DriveFileItem) => void;
    onDownload: (file: DriveFileItem) => void;
    onToggleStar: (file: DriveFileItem) => void;
    onRename: (file: DriveFileItem) => void;
    onMove: (file: DriveFileItem) => void;
    onTrash: (file: DriveFileItem) => void;
    onRestore: (file: DriveFileItem) => void;
    onDeletePermanent: (file: DriveFileItem) => void;
    onSessionExpired: () => void;
  } = $props();

  let loading = $state(false);
  let loadError = $state("");
  let blobUrl = $state<string | null>(null);
  let directImageUrl = $state<string | null>(null);
  let textContent = $state<string | null>(null);
  let textTruncated = $state(false);
  let showDetails = $state(true);

  let ext = $derived(file?.ext.toLowerCase() ?? "");
  let isImage = $derived(Boolean(file && IMAGE_PREVIEW_EXTS.has(ext)));
  let isVideo = $derived(Boolean(file && VIDEO_PREVIEW_EXTS.has(ext)));
  let isAudio = $derived(Boolean(file && AUDIO_PREVIEW_EXTS.has(ext)));
  let isText = $derived(Boolean(file && isTextPreviewableExt(ext)));

  $effect(() => {
    const current = file;
    const token = sessionToken;

    loadError = "";
    textContent = null;
    textTruncated = false;
    directImageUrl = null;

    if (!current) {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
        blobUrl = null;
      }
      loading = false;
      return;
    }

    const controller = new AbortController();
    let createdObjectUrl: string | null = null;

    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrl = null;
    }

    const lowerExt = current.ext.toLowerCase();

    if (IMAGE_PREVIEW_EXTS.has(lowerExt) && current.shared && !current.trashedAt) {
      directImageUrl = current.url;
      loading = false;
      return () => {
        controller.abort();
      };
    }

    if (
      IMAGE_PREVIEW_EXTS.has(lowerExt) ||
      VIDEO_PREVIEW_EXTS.has(lowerExt) ||
      AUDIO_PREVIEW_EXTS.has(lowerExt)
    ) {
      loading = true;
      fetch(`/api/drive/content/${current.id}`, {
        headers: { "x-session-token": token },
        signal: controller.signal,
      })
        .then(async (res) => {
          if (res.status === 401) {
            onSessionExpired();
            throw new Error("세션이 만료되었습니다.");
          }
          if (!res.ok) throw new Error("미리보기를 불러올 수 없습니다.");
          const blob = await res.blob();
          if (controller.signal.aborted) return;
          createdObjectUrl = URL.createObjectURL(blob);
          blobUrl = createdObjectUrl;
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          loadError =
            err instanceof Error ? err.message : "미리보기에 실패했습니다.";
        })
        .finally(() => {
          if (!controller.signal.aborted) loading = false;
        });
    } else if (isTextPreviewableExt(lowerExt)) {
      loading = true;
      fetch(`/api/drive/content/${current.id}?mode=text`, {
        headers: { "x-session-token": token },
        signal: controller.signal,
      })
        .then(async (res) => {
          if (res.status === 401) {
            onSessionExpired();
            throw new Error("세션이 만료되었습니다.");
          }
          if (!res.ok) throw new Error("텍스트 미리보기를 불러올 수 없습니다.");
          const data = (await res.json()) as {
            text: string;
            truncated: boolean;
          };
          if (controller.signal.aborted) return;
          textContent = data.text;
          textTruncated = Boolean(data.truncated);
        })
        .catch((err) => {
          if (controller.signal.aborted) return;
          loadError =
            err instanceof Error ? err.message : "미리보기에 실패했습니다.";
        })
        .finally(() => {
          if (!controller.signal.aborted) loading = false;
        });
    } else {
      loading = false;
    }

    return () => {
      controller.abort();
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  });

  function handleWindowKeydown(event: KeyboardEvent) {
    if (!file) return;
    if (event.key === "ArrowLeft" && hasPrev) {
      event.preventDefault();
      onPrev();
    } else if (event.key === "ArrowRight" && hasNext) {
      event.preventDefault();
      onNext();
    }
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if file}
  <div
    class="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
  >
    <!-- Top bar -->
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-oc-border bg-oc-surface/95 px-4 py-2.5">
      <div class="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onclick={onClose}
          aria-label="미리보기 닫기"
          class="cursor-pointer rounded p-1.5 text-oc-muted transition hover:bg-oc-hover hover:text-oc-strong"
        >
          <Icon name="close" class="size-4" />
        </button>
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-oc-strong">
            {file.name}
          </p>
          <p class="font-mono text-[11px] text-oc-muted">
            {formatBytes(file.size)} · {file.mime}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        {#if !file.trashedAt}
          <button
            type="button"
            onclick={() => onToggleStar(file)}
            title={file.starred ? "별표 해제" : "별표 추가"}
            class="inline-flex cursor-pointer items-center gap-1 rounded border border-oc-border bg-oc-bg px-2.5 py-1.5 text-xs text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
          >
            <Icon
              name={file.starred ? "starFilled" : "star"}
              class="size-3.5 {file.starred ? 'text-amber-400' : ''}"
            />
          </button>

          <button
            type="button"
            onclick={() => onToggleShare(file)}
            class="inline-flex cursor-pointer items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-medium transition {file.shared
              ? 'border-[#54d483]/40 bg-[#54d483]/10 text-[#239f50] dark:text-[#54d483]'
              : 'border-oc-border bg-oc-bg text-oc-muted hover:text-oc-strong'}"
          >
            <Icon name={file.shared ? "unlock" : "lock"} class="size-3.5" />
            {file.shared ? "공개 링크 켜짐" : "비공개"}
          </button>

          {#if file.shared}
            <button
              type="button"
              onclick={() => onCopyLink(file)}
              class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-oc-border bg-oc-bg px-2.5 py-1.5 text-xs font-medium text-oc-strong transition hover:bg-oc-hover"
            >
              <Icon name="copy" class="size-3.5" />
              링크 복사
            </button>
          {/if}
        {:else}
          <button
            type="button"
            onclick={() => onRestore(file)}
            class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-oc-border bg-oc-bg px-2.5 py-1.5 text-xs font-medium text-oc-strong transition hover:bg-oc-hover"
          >
            <Icon name="restore" class="size-3.5" />
            복원
          </button>
          <button
            type="button"
            onclick={() => onDeletePermanent(file)}
            class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-500/20"
          >
            <Icon name="trash" class="size-3.5" />
            영구 삭제
          </button>
        {/if}

        <button
          type="button"
          onclick={() => onDownload(file)}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded bg-oc-strong px-3 py-1.5 text-xs font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
        >
          <Icon name="download" class="size-3.5" />
          다운로드
        </button>

        <button
          type="button"
          onclick={() => (showDetails = !showDetails)}
          title="세부 정보 패널"
          class="inline-flex cursor-pointer items-center gap-1 rounded border border-oc-border bg-oc-bg px-2.5 py-1.5 text-xs transition {showDetails
            ? 'border-oc-border-strong text-oc-strong'
            : 'text-oc-muted hover:text-oc-strong'}"
        >
          <Icon name="info" class="size-3.5" />
        </button>
      </div>
    </div>

    <!-- Content + side details -->
    <div class="relative flex min-h-0 flex-1 flex-col lg:flex-row">
      <div class="relative flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8">
        {#if hasPrev}
          <button
            type="button"
            onclick={onPrev}
            aria-label="이전 파일"
            class="absolute left-3 top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full border border-oc-border bg-oc-surface/90 p-2.5 text-oc-strong transition hover:bg-oc-hover"
          >
            <Icon name="arrowLeft" class="size-4" />
          </button>
        {/if}

        {#if hasNext}
          <button
            type="button"
            onclick={onNext}
            aria-label="다음 파일"
            class="absolute right-3 top-1/2 z-10 -translate-y-1/2 cursor-pointer rounded-full border border-oc-border bg-oc-surface/90 p-2.5 text-oc-strong transition hover:bg-oc-hover"
          >
            <Icon name="chevronRight" class="size-4" />
          </button>
        {/if}

        {#if loading}
          <div class="flex flex-col items-center gap-2 text-oc-muted">
            <Icon name="loader" class="size-7 animate-spin" />
            <span class="text-xs">미리보기 로딩 중...</span>
          </div>
        {:else if loadError}
          <div class="rounded-lg border border-oc-border bg-oc-surface p-6 text-center text-sm text-red-400">
            {loadError}
          </div>
        {:else if isImage && (directImageUrl || blobUrl)}
          <img
            src={directImageUrl || blobUrl}
            alt={file.name}
            class="max-h-full max-w-full rounded border border-oc-border bg-oc-bg object-contain shadow-2xl"
          />
        {:else if isVideo && blobUrl}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            src={blobUrl}
            controls
            class="max-h-full max-w-full rounded border border-oc-border bg-black shadow-2xl"
          ></video>
        {:else if isAudio && blobUrl}
          <div class="w-full max-w-md rounded-lg border border-oc-border bg-oc-surface p-6 text-center">
            <div class="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-oc-border bg-oc-subtle text-oc-strong">
              <Icon name="music" class="size-6" />
            </div>
            <p class="mb-4 truncate text-sm font-medium text-oc-strong">
              {file.name}
            </p>
            <audio src={blobUrl} controls class="w-full"></audio>
          </div>
        {:else if isText && textContent !== null}
          <div class="flex h-full max-h-[75vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-oc-border bg-oc-surface">
            {#if textTruncated}
              <div class="border-b border-oc-border bg-oc-subtle px-4 py-2 text-xs text-amber-400">
                파일 크기가 커서 앞부분 512 KB만 미리보기로 표시합니다.
              </div>
            {/if}
            <pre class="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words text-oc-text">{textContent}</pre>
          </div>
        {:else}
          <div class="flex w-full max-w-sm flex-col items-center gap-4 rounded-lg border border-oc-border bg-oc-surface p-8 text-center">
            <div class="flex size-16 items-center justify-center rounded-lg border border-oc-border bg-oc-subtle text-oc-strong">
              <Icon name="file" class="size-8" />
            </div>
            <div>
              <p class="break-all text-sm font-semibold text-oc-strong">
                {file.name}
              </p>
              <p class="mt-1 text-xs text-oc-muted">
                이 파일 형식은 인라인 미리보기를 지원하지 않습니다.
              </p>
            </div>
            <button
              type="button"
              onclick={() => onDownload(file)}
              class="inline-flex cursor-pointer items-center gap-1.5 rounded bg-oc-strong px-4 py-2 text-xs font-medium text-oc-inverted transition hover:bg-oc-strong-hover"
            >
              <Icon name="download" class="size-4" />
              파일 다운로드 ({formatBytes(file.size)})
            </button>
          </div>
        {/if}
      </div>

      {#if showDetails}
        <aside class="w-full shrink-0 overflow-y-auto border-t border-oc-border bg-oc-surface p-4 lg:w-72 lg:border-l lg:border-t-0">
          <h4 class="text-xs font-semibold uppercase tracking-wider text-oc-muted">
            파일 정보
          </h4>

          <dl class="mt-3 space-y-3 text-xs">
            <div>
              <dt class="text-oc-faint">표시 이름</dt>
              <dd class="mt-0.5 break-all font-medium text-oc-strong">
                {file.name}
              </dd>
            </div>
            <div>
              <dt class="text-oc-faint">저장 키</dt>
              <dd class="mt-0.5 break-all font-mono text-[11px] text-oc-muted">
                {file.storageName}
              </dd>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div>
                <dt class="text-oc-faint">분류</dt>
                <dd class="mt-0.5 text-oc-text">
                  {CATEGORY_LABELS[file.category]}
                </dd>
              </div>
              <div>
                <dt class="text-oc-faint">크기</dt>
                <dd class="mt-0.5 font-mono text-oc-text">
                  {formatBytes(file.size)}
                </dd>
              </div>
            </div>
            <div>
              <dt class="text-oc-faint">수정일</dt>
              <dd class="mt-0.5 text-oc-text">{formatDateKo(file.updatedAt)}</dd>
            </div>
            <div>
              <dt class="text-oc-faint">생성일</dt>
              <dd class="mt-0.5 text-oc-text">{formatDateKo(file.createdAt)}</dd>
            </div>
            <div>
              <dt class="text-oc-faint">외부 공유 링크</dt>
              <dd class="mt-1">
                {#if file.shared && !file.trashedAt}
                  <code class="block break-all rounded border border-oc-border bg-oc-bg px-2 py-1.5 font-mono text-[11px] text-oc-text">
                    {file.url}
                  </code>
                {:else}
                  <span class="text-oc-muted">
                    {file.trashedAt
                      ? "휴지통 항목은 외부 접근이 차단됩니다."
                      : "비공개 상태 (외부 /uploads 접근 차단)"}
                  </span>
                {/if}
              </dd>
            </div>
          </dl>

          {#if !file.trashedAt}
            <div class="mt-5 space-y-1.5 border-t border-oc-border pt-4">
              {#if file.shared}
                <button
                  type="button"
                  onclick={() => onCopyMarkdown(file)}
                  class="flex w-full cursor-pointer items-center gap-2 rounded border border-oc-border bg-oc-bg px-3 py-1.5 text-xs text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
                >
                  <Icon name="code" class="size-3.5" />
                  마크다운 링크 복사
                </button>
              {/if}
              <button
                type="button"
                onclick={() => onRename(file)}
                class="flex w-full cursor-pointer items-center gap-2 rounded border border-oc-border bg-oc-bg px-3 py-1.5 text-xs text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
              >
                <Icon name="edit" class="size-3.5" />
                이름 변경
              </button>
              <button
                type="button"
                onclick={() => onMove(file)}
                class="flex w-full cursor-pointer items-center gap-2 rounded border border-oc-border bg-oc-bg px-3 py-1.5 text-xs text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
              >
                <Icon name="move" class="size-3.5" />
                폴더 이동
              </button>
              <button
                type="button"
                onclick={() => onTrash(file)}
                class="flex w-full cursor-pointer items-center gap-2 rounded border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs text-red-400 transition hover:bg-red-500/15"
              >
                <Icon name="trash" class="size-3.5" />
                휴지통으로 이동
              </button>
            </div>
          {/if}
        </aside>
      {/if}
    </div>
  </div>
{/if}
