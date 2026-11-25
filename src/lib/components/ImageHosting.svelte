<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "./Icon.svelte";

  interface ImageData {
    name: string;
    url: string;
    size: number;
    mtime: string;
  }

  let { sessionToken }: { sessionToken: string } = $props();

  const MAX_UPLOAD_SIZE = 95 * 1024 * 1024;

  let images = $state<ImageData[]>([]);
  let loading = $state(true);
  let uploading = $state(false);
  let uploadProgress = $state(0);
  let copiedName = $state<string | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);

  let totalSize = $derived(images.reduce((acc, item) => acc + item.size, 0));

  async function fetchImages() {
    if (!sessionToken) return;
    try {
      const res = await fetch("/api/images", {
        headers: { "x-session-token": sessionToken },
      });
      if (res.status === 401) return;
      const data = await res.json();
      if (data.images) images = data.images;
    } catch (error) {
      console.error("Failed to fetch images:", error);
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    void fetchImages();
    const interval = setInterval(() => void fetchImages(), 5000);
    return () => clearInterval(interval);
  });

  function handleUpload(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > MAX_UPLOAD_SIZE) {
      alert(
        "Cloudflare Tunnel 제한(100MB)으로 인해 최대 95MB 이하의 파일만 업로드할 수 있습니다.",
      );
      input.value = "";
      return;
    }

    uploading = true;
    uploadProgress = 0;
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload", true);
    xhr.setRequestHeader("x-session-token", sessionToken);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        uploadProgress = Math.round((event.loaded / event.total) * 100);
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.success) {
            void fetchImages();
          } else {
            alert(`업로드 실패: ${data.error}`);
          }
        } catch {
          alert("서버 응답을 처리할 수 없습니다.");
        }
      } else {
        let errorMsg =
          xhr.status === 413
            ? "파일 용량이 너무 큽니다. Cloudflare Tunnel 제한으로 최대 95MB까지만 업로드할 수 있습니다."
            : "서버 오류가 발생했습니다.";
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.error) errorMsg = data.error;
        } catch {}
        alert(`업로드 실패: ${errorMsg}`);
      }
      uploading = false;
      uploadProgress = 0;
      input.value = "";
    };

    xhr.onerror = () => {
      alert("업로드 중 오류가 발생했습니다.");
      uploading = false;
      uploadProgress = 0;
      input.value = "";
    };

    xhr.send(formData);
  }

  function copyToClipboard(url: string, name: string) {
    const fullUrl = `${window.location.origin}${url}`;
    navigator.clipboard.writeText(fullUrl);
    copiedName = name;
    setTimeout(() => {
      if (copiedName === name) copiedName = null;
    }, 1800);
  }

  async function handleDelete(filename: string) {
    if (!confirm("정말로 이 파일을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch("/api/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken,
        },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json();
      if (data.success) {
        void fetchImages();
      } else {
        alert(`삭제 실패: ${data.error}`);
      }
    } catch {
      alert("삭제 중 오류가 발생했습니다.");
    }
  }

  function formatSize(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }
</script>

<div class="space-y-6">
  <!-- Toolbar -->
  <div class="flex flex-col gap-4 rounded-md border border-oc-border bg-oc-surface p-6 sm:flex-row sm:items-center sm:justify-between">
    <div class="space-y-1">
      <div class="flex items-center gap-2">
        <h2 class="text-base font-semibold text-oc-strong">파일 목록</h2>
        <span class="rounded border border-oc-border bg-oc-subtle px-2 py-0.5 font-mono text-xs font-medium text-oc-text">
          {images.length}개
        </span>
        <span class="rounded border border-oc-border bg-oc-subtle px-2 py-0.5 font-mono text-xs font-medium text-oc-strong">
          {formatSize(totalSize)}
        </span>
      </div>
      <p class="text-xs text-oc-muted">
        최대 95MB · 5초마다 자동 갱신 · 이미지 클릭 시 확대 보기
      </p>
    </div>

    <div class="flex flex-col items-stretch gap-2 sm:items-end">
      <input
        type="file"
        bind:this={fileInput}
        onchange={handleUpload}
        class="hidden"
      />
      <button
        type="button"
        onclick={() => fileInput?.click()}
        disabled={uploading}
        class="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded bg-oc-strong px-3.5 py-2 text-sm font-medium text-oc-inverted transition hover:bg-oc-strong-hover disabled:cursor-not-allowed disabled:opacity-60"
      >
        <Icon name="upload" class="size-4" />
        {uploading ? `업로드 중 (${uploadProgress}%)` : "파일 업로드"}
      </button>
      {#if uploading}
        <div class="flex w-full items-center gap-2 sm:w-56">
          <div class="h-1.5 flex-1 overflow-hidden rounded-xs bg-oc-hover">
            <div class="h-full rounded-xs bg-oc-strong transition-all" style="width: {uploadProgress}%"></div>
          </div>
          <span class="font-mono text-xs font-semibold text-oc-strong">{uploadProgress}%</span>
        </div>
      {/if}
    </div>
  </div>

  <!-- Grid -->
  {#if loading}
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {#each [0, 1, 2, 3] as i (i)}
        <div class="animate-pulse space-y-3 rounded-md border border-oc-border bg-oc-surface p-4">
          <div class="h-36 rounded bg-oc-hover"></div>
          <div class="h-4 w-3/4 rounded bg-oc-hover"></div>
          <div class="h-8 rounded bg-oc-subtle"></div>
        </div>
      {/each}
    </div>
  {:else if images.length === 0}
    <div class="rounded-md border border-dashed border-oc-border-strong bg-oc-surface py-14 text-center">
      <Icon name="upload" class="mx-auto size-10 text-oc-faint" />
      <p class="mt-3 text-sm font-medium text-oc-strong">
        업로드된 파일이 없습니다.
      </p>
      <p class="mt-1 text-xs text-oc-muted">
        우측 상단의 [파일 업로드] 버튼을 눌러 파일을 추가해 보세요.
      </p>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {#each images as img (img.name)}
        {@const ext = img.name.split(".").pop()?.toLowerCase() || ""}
        {@const isImage = ["jpg", "jpeg", "png", "gif", "webp"].includes(ext)}
        <div
          class="flex flex-col justify-between gap-3 rounded-md border border-oc-border bg-oc-surface p-3.5 transition hover:border-oc-border-strong"
        >
          <div class="flex h-36 w-full items-center justify-center overflow-hidden rounded border border-oc-border bg-oc-bg">
            {#if isImage}
              <img
                src={img.url}
                alt={img.name}
                data-lightbox="true"
                class="max-h-full max-w-full object-contain"
              />
            {:else}
              <div class="flex flex-col items-center gap-1.5 text-oc-faint">
                <Icon name="file" class="size-9" />
                <span class="font-mono text-xs font-semibold uppercase">{ext || "FILE"}</span>
              </div>
            {/if}
          </div>

          <div class="min-w-0">
            <p class="truncate text-xs font-semibold text-oc-strong" title={img.name}>
              {img.name}
            </p>
            <p class="mt-0.5 font-mono text-[11px] text-oc-muted">
              {formatSize(img.size)}
            </p>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              onclick={() => copyToClipboard(img.url, img.name)}
              class="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded border border-oc-border bg-oc-bg px-2 py-1.5 text-xs font-medium text-oc-strong transition hover:bg-oc-hover"
            >
              {#if copiedName === img.name}
                <Icon name="check" class="size-3.5 text-[#239f50] dark:text-[#54d483]" />
                복사됨
              {:else}
                <Icon name="copy" class="size-3.5" />
                링크 복사
              {/if}
            </button>
            <button
              type="button"
              onclick={() => handleDelete(img.name)}
              aria-label={`${img.name} 삭제`}
              class="inline-flex cursor-pointer items-center justify-center rounded p-1.5 text-[#db2424] transition hover:bg-red-500/10 dark:text-[#ed5a5a]"
            >
              <Icon name="trash" class="size-3.5" />
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
