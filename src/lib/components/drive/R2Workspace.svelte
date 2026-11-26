<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import Icon, { type IconName } from "#lib/components/Icon.svelte";
  import {
    AUDIO_PREVIEW_EXTS,
    CATEGORY_LABELS,
    formatBytes,
    formatDateKo,
    IMAGE_PREVIEW_EXTS,
    VIDEO_PREVIEW_EXTS,
    type DriveFileCategory,
    type DriveSortDir,
    type DriveSortField,
    type R2FileItem,
    type R2FolderItem,
    type R2ListResponse,
  } from "#lib/driveTypes.ts";

  interface R2UploadItem {
    uid: string;
    name: string;
    size: number;
    relativePath: string;
    status: "queued" | "uploading" | "done" | "error" | "cancelled";
    progress: number;
    chunkLabel?: string;
    uploadId?: string;
    error?: string;
    file: File;
    prefix: string;
  }

  interface DropEntry {
    isFile: boolean;
    isDirectory: boolean;
    name: string;
  }
  interface DropFileEntry extends DropEntry {
    file: (cb: (file: File) => void, err?: (e: unknown) => void) => void;
  }
  interface DropDirReader {
    readEntries: (
      cb: (entries: DropEntry[]) => void,
      err?: (e: unknown) => void,
    ) => void;
  }
  interface DropDirEntry extends DropEntry {
    createReader: () => DropDirReader;
  }

  const MAX_R2_FILE_SIZE = 4 * 1024 * 1024 * 1024; // 4GB per file
  const DIRECT_R2_THRESHOLD = 20 * 1024 * 1024; // <= 20MB direct PUT, > 20MB Multipart
  const R2_CHUNK_SIZE = 20 * 1024 * 1024;
  const MAX_CHUNK_RETRIES = 3;

  let {
    sessionToken,
    onSessionExpired,
  }: {
    sessionToken: string;
    onSessionExpired: () => void;
  } = $props();

  let currentPrefix = $state("");
  let searchQuery = $state("");
  let debouncedQuery = $state("");
  let sortField = $state<DriveSortField>("updated");
  let sortDir = $state<DriveSortDir>("desc");
  let displayMode = $state<"grid" | "list">("grid");
  let newMenuOpen = $state(false);

  let data = $state<R2ListResponse | null>(null);
  let loading = $state(true);
  let actionBusy = $state(false);

  let selectedKeys = $state<Record<string, true>>({});
  let selectedPrefixes = $state<Record<string, true>>({});

  let createModalOpen = $state(false);
  let newFolderName = $state("");
  let newFolderInputEl = $state<HTMLInputElement | null>(null);

  let deleteConfirm = $state<{
    keys: string[];
    prefixes: string[];
    label: string;
  } | null>(null);

  let previewFile = $state<R2FileItem | null>(null);

  let toast = $state<{ message: string; tone: "ok" | "error" | "info" } | null>(
    null,
  );
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  let uploadQueue = $state<R2UploadItem[]>([]);
  let uploadPanelExpanded = $state(true);
  let uploadRunnerActive = false;
  const uploadControllers = new Map<
    string,
    { xhr: XMLHttpRequest | null; cancelled: boolean }
  >();

  let isExternalFileDrag = $state(false);
  let dragDepth = 0;
  let destroyed = false;

  let fileInputEl = $state<HTMLInputElement | null>(null);
  let folderInputEl = $state<HTMLInputElement | null>(null);

  let folders = $derived(data?.folders ?? []);
  let files = $derived(data?.files ?? []);
  let breadcrumbs = $derived(
    data?.breadcrumbs ?? [{ prefix: "", name: "R2 루트" }],
  );
  let stats = $derived(data?.stats ?? null);

  let selectedKeyList = $derived(Object.keys(selectedKeys));
  let selectedPrefixList = $derived(Object.keys(selectedPrefixes));
  let selectedCount = $derived(
    selectedKeyList.length + selectedPrefixList.length,
  );
  let totalVisibleCount = $derived(folders.length + files.length);

  let usagePct = $derived.by(() => {
    if (!stats || stats.hardCapBytes <= 0) return 0;
    if (stats.usedBytes <= 0) return 0;
    return Math.min(
      100,
      Math.max(2, Math.round((stats.usedBytes / stats.hardCapBytes) * 100)),
    );
  });

  let uploadStats = $derived.by(() => {
    const activeItems = uploadQueue.filter((u) => u.status !== "cancelled");
    const total = activeItems.length;
    const done = activeItems.filter((u) => u.status === "done").length;
    const errors = activeItems.filter((u) => u.status === "error").length;
    const active = activeItems.some(
      (u) => u.status === "queued" || u.status === "uploading",
    );
    const totalBytes = activeItems.reduce((acc, u) => acc + u.size, 0);
    const loadedBytes = activeItems.reduce(
      (acc, u) =>
        acc +
        (u.status === "done"
          ? u.size
          : Math.round((u.size * u.progress) / 100)),
      0,
    );
    const pct =
      totalBytes > 0
        ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100))
        : 0;
    return { total, done, errors, active, pct };
  });

  $effect(() => {
    if (createModalOpen && newFolderInputEl) {
      newFolderInputEl.focus();
    }
  });

  function showToast(
    message: string,
    tone: "ok" | "error" | "info" = "info",
  ) {
    toast = { message, tone };
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast = null;
    }, 3200);
  }

  function categoryIcon(cat: DriveFileCategory): IconName {
    switch (cat) {
      case "image":
        return "image";
      case "video":
        return "video";
      case "audio":
        return "music";
      case "document":
        return "fileText";
      case "code":
        return "code";
      case "archive":
        return "archive";
      default:
        return "file";
    }
  }

  async function fetchR2(silent = false): Promise<void> {
    if (!silent) loading = true;
    try {
      const params = new URLSearchParams();
      if (currentPrefix) params.set("prefix", currentPrefix);
      if (debouncedQuery.trim()) params.set("q", debouncedQuery.trim());
      params.set("sort", sortField);
      params.set("dir", sortDir);

      const res = await fetch(`/api/r2?${params.toString()}`, {
        headers: { "x-session-token": sessionToken },
      });
      if (res.status === 401) {
        onSessionExpired();
        return;
      }
      const payload = (await res.json()) as R2ListResponse & { error?: string };
      if (!res.ok) {
        if (!silent)
          showToast(payload.error || "R2 목록 조회에 실패했습니다.", "error");
        return;
      }
      data = payload;
      selectedKeys = {};
      selectedPrefixes = {};
    } catch {
      if (!silent) showToast("R2 데이터를 불러오지 못했습니다.", "error");
    } finally {
      if (!silent) loading = false;
    }
  }

  function navigatePrefix(prefix: string) {
    currentPrefix = prefix;
    selectedKeys = {};
    selectedPrefixes = {};
    newMenuOpen = false;
    void fetchR2();
  }

  function openFolder(folder: R2FolderItem) {
    searchQuery = "";
    debouncedQuery = "";
    navigatePrefix(folder.prefix);
  }

  function setDisplayMode(mode: "grid" | "list") {
    displayMode = mode;
    try {
      localStorage.setItem("oc-r2-view-mode", mode);
    } catch {}
  }

  function handleSearchInput(value: string) {
    searchQuery = value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      debouncedQuery = value;
      void fetchR2();
    }, 250);
  }

  function clearSearch() {
    searchQuery = "";
    debouncedQuery = "";
    if (searchTimer) clearTimeout(searchTimer);
    void fetchR2();
  }

  function toggleSelectKey(key: string) {
    const next = { ...selectedKeys };
    if (next[key]) delete next[key];
    else next[key] = true;
    selectedKeys = next;
  }

  function toggleSelectPrefix(prefix: string) {
    const next = { ...selectedPrefixes };
    if (next[prefix]) delete next[prefix];
    else next[prefix] = true;
    selectedPrefixes = next;
  }

  function clearSelection() {
    selectedKeys = {};
    selectedPrefixes = {};
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} 복사됨`, "ok");
    } catch {
      showToast("클립보드 복사에 실패했습니다.", "error");
    }
  }

  function copyCdnUrl(file: R2FileItem) {
    void copyText(file.url, "CDN URL");
  }

  function copyMarkdownLink(file: R2FileItem) {
    const md =
      file.category === "image"
        ? `![${file.name}](${file.url})`
        : `[${file.name}](${file.url})`;
    void copyText(md, "마크다운 링크");
  }

  async function handleCreateFolder(event: SubmitEvent) {
    event.preventDefault();
    const trimmed = newFolderName.trim();
    if (!trimmed || actionBusy) return;
    actionBusy = true;
    try {
      const res = await fetch("/api/r2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken,
        },
        body: JSON.stringify({
          action: "createFolder",
          prefix: currentPrefix,
          name: trimmed,
        }),
      });
      if (res.status === 401) {
        onSessionExpired();
        return;
      }
      const result = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast(result.error || "폴더 생성 실패", "error");
        return;
      }
      createModalOpen = false;
      newFolderName = "";
      showToast(`R2 폴더 '${trimmed}' 생성됨`, "ok");
      await fetchR2(true);
    } catch {
      showToast("폴더 생성 중 오류가 발생했습니다.", "error");
    } finally {
      actionBusy = false;
    }
  }

  async function confirmDeleteTargets() {
    if (!deleteConfirm || actionBusy) return;
    actionBusy = true;
    try {
      const res = await fetch("/api/r2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken,
        },
        body: JSON.stringify({
          action: "delete",
          keys: deleteConfirm.keys,
          prefixes: deleteConfirm.prefixes,
        }),
      });
      if (res.status === 401) {
        onSessionExpired();
        return;
      }
      const result = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast(result.error || "R2 삭제 실패", "error");
        return;
      }
      if (previewFile && deleteConfirm.keys.includes(previewFile.key)) {
        previewFile = null;
      }
      deleteConfirm = null;
      clearSelection();
      showToast("R2에서 영구 삭제되었습니다.", "ok");
      await fetchR2(true);
    } catch {
      showToast("R2 삭제 중 오류가 발생했습니다.", "error");
    } finally {
      actionBusy = false;
    }
  }

  function updateQueueItem(uid: string, patch: Partial<R2UploadItem>) {
    uploadQueue = uploadQueue.map((q) => (q.uid === uid ? { ...q, ...patch } : q));
  }

  async function abortRemoteR2Upload(uploadId: string) {
    try {
      await fetch("/api/r2/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken,
        },
        body: JSON.stringify({ action: "abort", uploadId }),
      });
    } catch {}
  }

  function cancelUploadItem(uid: string) {
    const ctrl = uploadControllers.get(uid);
    if (ctrl) {
      ctrl.cancelled = true;
      ctrl.xhr?.abort();
      ctrl.xhr = null;
    }
    const item = uploadQueue.find((q) => q.uid === uid);
    if (item?.uploadId) {
      void abortRemoteR2Upload(item.uploadId);
    }
    updateQueueItem(uid, {
      status: "cancelled",
      error: "취소됨",
      chunkLabel: undefined,
    });
  }

  function enqueueUploads(entries: { file: File; relativePath: string }[]) {
    if (entries.length === 0 || !data?.configured) return;
    const prefix = currentPrefix;
    const items: R2UploadItem[] = entries.map(({ file, relativePath }) => {
      if (file.size > MAX_R2_FILE_SIZE) {
        return {
          uid: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          relativePath,
          status: "error",
          progress: 0,
          error: "4GB 제한 초과",
          file,
          prefix,
        };
      }
      if (file.size === 0) {
        return {
          uid: crypto.randomUUID(),
          name: file.name,
          size: 0,
          relativePath,
          status: "error",
          progress: 0,
          error: "빈 파일 업로드 불가",
          file,
          prefix,
        };
      }
      return {
        uid: crypto.randomUUID(),
        name: file.name,
        size: file.size,
        relativePath,
        status: "queued",
        progress: 0,
        file,
        prefix,
      };
    });

    for (const item of items) {
      if (item.status === "queued") {
        uploadControllers.set(item.uid, { xhr: null, cancelled: false });
      }
    }

    uploadQueue = [...uploadQueue, ...items];
    uploadPanelExpanded = true;
    void processUploadQueue();
  }

  function uploadDirectItem(item: R2UploadItem): Promise<boolean> {
    return new Promise((resolve) => {
      const ctrl = uploadControllers.get(item.uid);
      if (ctrl?.cancelled) {
        resolve(false);
        return;
      }

      const formData = new FormData();
      formData.append("file", item.file);
      if (item.prefix) formData.append("prefix", item.prefix);
      if (item.relativePath) formData.append("relativePath", item.relativePath);

      const xhr = new XMLHttpRequest();
      if (ctrl) ctrl.xhr = xhr;
      xhr.open("POST", "/api/r2/upload", true);
      xhr.setRequestHeader("x-session-token", sessionToken);

      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable || ctrl?.cancelled) return;
        const pct = Math.min(100, Math.round((ev.loaded / ev.total) * 100));
        updateQueueItem(item.uid, { status: "uploading", progress: pct });
      };

      xhr.onabort = () => {
        if (ctrl) ctrl.xhr = null;
        updateQueueItem(item.uid, { status: "cancelled", error: "취소됨" });
        resolve(false);
      };

      xhr.onload = () => {
        if (ctrl) ctrl.xhr = null;
        if (ctrl?.cancelled) {
          resolve(false);
          return;
        }
        if (xhr.status === 401) {
          onSessionExpired();
          updateQueueItem(item.uid, { status: "error", error: "세션 만료" });
          resolve(false);
          return;
        }
        try {
          const parsed = JSON.parse(xhr.responseText || "{}") as {
            error?: string;
          };
          if (xhr.status >= 200 && xhr.status < 300) {
            updateQueueItem(item.uid, { status: "done", progress: 100 });
            resolve(true);
          } else {
            updateQueueItem(item.uid, {
              status: "error",
              error: parsed.error || "업로드 실패",
            });
            resolve(false);
          }
        } catch {
          updateQueueItem(item.uid, { status: "error", error: "응답 오류" });
          resolve(false);
        }
      };

      xhr.onerror = () => {
        if (ctrl) ctrl.xhr = null;
        if (!ctrl?.cancelled) {
          updateQueueItem(item.uid, { status: "error", error: "네트워크 오류" });
        }
        resolve(false);
      };

      xhr.send(formData);
    });
  }

  function sendR2ChunkXhr(opts: {
    uid: string;
    uploadId: string;
    index: number;
    blob: Blob;
    onProgress: (loaded: number) => void;
  }): Promise<{ ok: boolean; retryable: boolean; status: number; error?: string }> {
    return new Promise((resolve) => {
      const ctrl = uploadControllers.get(opts.uid);
      if (ctrl?.cancelled) {
        resolve({ ok: false, retryable: false, status: 0, error: "취소됨" });
        return;
      }

      const xhr = new XMLHttpRequest();
      if (ctrl) ctrl.xhr = xhr;
      xhr.open(
        "PUT",
        `/api/r2/upload?uploadId=${encodeURIComponent(opts.uploadId)}&index=${opts.index}`,
        true,
      );
      xhr.setRequestHeader("x-session-token", sessionToken);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");

      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable || ctrl?.cancelled) return;
        opts.onProgress(ev.loaded);
      };

      xhr.onabort = () => {
        if (ctrl) ctrl.xhr = null;
        resolve({ ok: false, retryable: false, status: 0, error: "취소됨" });
      };

      xhr.onload = () => {
        if (ctrl) ctrl.xhr = null;
        if (xhr.status === 401) {
          resolve({
            ok: false,
            retryable: false,
            status: 401,
            error: "세션 만료",
          });
          return;
        }
        let parsed: { error?: string } = {};
        try {
          parsed = JSON.parse(xhr.responseText || "{}") as { error?: string };
        } catch {}
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({ ok: true, retryable: false, status: xhr.status });
        } else {
          const retryable = xhr.status >= 500 || xhr.status === 429;
          resolve({
            ok: false,
            retryable,
            status: xhr.status,
            error: parsed.error || `파트 오류 (${xhr.status})`,
          });
        }
      };

      xhr.onerror = () => {
        if (ctrl) ctrl.xhr = null;
        resolve({
          ok: false,
          retryable: true,
          status: 0,
          error: "네트워크 오류",
        });
      };

      xhr.send(opts.blob);
    });
  }

  async function uploadMultipartItem(item: R2UploadItem): Promise<boolean> {
    const ctrl = uploadControllers.get(item.uid);
    let uploadId: string | undefined;

    try {
      const initRes = await fetch("/api/r2/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken,
        },
        body: JSON.stringify({
          action: "init",
          fileName: item.name,
          totalSize: item.size,
          chunkSize: R2_CHUNK_SIZE,
          prefix: item.prefix,
          relativePath: item.relativePath || undefined,
        }),
      });
      if (initRes.status === 401) {
        onSessionExpired();
        updateQueueItem(item.uid, { status: "error", error: "세션 만료" });
        return false;
      }
      const initData = (await initRes.json()) as {
        uploadId?: string;
        chunkSize?: number;
        totalChunks?: number;
        error?: string;
      };
      if (
        !initRes.ok ||
        !initData.uploadId ||
        !initData.chunkSize ||
        !initData.totalChunks
      ) {
        updateQueueItem(item.uid, {
          status: "error",
          error: initData.error || "R2 업로드 초기화 실패",
        });
        return false;
      }

      uploadId = initData.uploadId;
      const chunkSize = initData.chunkSize;
      const totalChunks = initData.totalChunks;

      updateQueueItem(item.uid, {
        uploadId,
        status: "uploading",
        progress: 0,
        chunkLabel: `0/${totalChunks} 파트`,
      });

      for (let idx = 0; idx < totalChunks; idx += 1) {
        if (ctrl?.cancelled || destroyed) {
          await abortRemoteR2Upload(uploadId);
          updateQueueItem(item.uid, {
            status: "cancelled",
            error: "취소됨",
            chunkLabel: undefined,
          });
          return false;
        }

        const start = idx * chunkSize;
        const end = Math.min(item.size, start + chunkSize);
        const sliceBlob = item.file.slice(start, end);

        let chunkOk = false;
        let lastErr = "파트 업로드 실패";

        for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES; attempt += 1) {
          if (ctrl?.cancelled || destroyed) break;
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt - 1)));
          }
          const chunkRes = await sendR2ChunkXhr({
            uid: item.uid,
            uploadId,
            index: idx,
            blob: sliceBlob,
            onProgress: (loadedBytes) => {
              const overall = Math.min(
                99,
                Math.round(((start + loadedBytes) / item.size) * 100),
              );
              updateQueueItem(item.uid, {
                progress: overall,
                chunkLabel: `${idx + 1}/${totalChunks} 파트`,
              });
            },
          });
          if (chunkRes.ok) {
            chunkOk = true;
            break;
          }
          if (chunkRes.status === 401) {
            onSessionExpired();
            await abortRemoteR2Upload(uploadId);
            updateQueueItem(item.uid, {
              status: "error",
              error: "세션 만료",
              chunkLabel: undefined,
            });
            return false;
          }
          lastErr = chunkRes.error || lastErr;
          if (!chunkRes.retryable) break;
        }

        if (!chunkOk) {
          await abortRemoteR2Upload(uploadId);
          updateQueueItem(item.uid, {
            status: ctrl?.cancelled ? "cancelled" : "error",
            error: ctrl?.cancelled ? "취소됨" : lastErr,
            chunkLabel: undefined,
          });
          return false;
        }
      }

      if (ctrl?.cancelled || destroyed) {
        await abortRemoteR2Upload(uploadId);
        updateQueueItem(item.uid, {
          status: "cancelled",
          error: "취소됨",
          chunkLabel: undefined,
        });
        return false;
      }

      const compRes = await fetch("/api/r2/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken,
        },
        body: JSON.stringify({ action: "complete", uploadId }),
      });
      if (compRes.status === 401) {
        onSessionExpired();
        updateQueueItem(item.uid, { status: "error", error: "세션 만료" });
        return false;
      }
      const compData = (await compRes.json()) as { error?: string };
      if (!compRes.ok) {
        await abortRemoteR2Upload(uploadId);
        updateQueueItem(item.uid, {
          status: "error",
          error: compData.error || "R2 업로드 완료 실패",
          chunkLabel: undefined,
        });
        return false;
      }

      updateQueueItem(item.uid, {
        status: "done",
        progress: 100,
        chunkLabel: undefined,
      });
      return true;
    } catch {
      if (uploadId) await abortRemoteR2Upload(uploadId);
      updateQueueItem(item.uid, {
        status: "error",
        error: "R2 분할 업로드 오류",
        chunkLabel: undefined,
      });
      return false;
    }
  }

  async function processUploadQueue() {
    if (uploadRunnerActive) return;
    uploadRunnerActive = true;
    let anyOk = false;
    try {
      while (!destroyed) {
        const nextItem = uploadQueue.find((q) => q.status === "queued");
        if (!nextItem) break;
        updateQueueItem(nextItem.uid, { status: "uploading" });
        const ok =
          nextItem.size > DIRECT_R2_THRESHOLD
            ? await uploadMultipartItem(nextItem)
            : await uploadDirectItem(nextItem);
        uploadControllers.delete(nextItem.uid);
        if (ok) anyOk = true;
      }
      if (anyOk) await fetchR2(true);
    } finally {
      uploadRunnerActive = false;
    }
  }

  function handleFileInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const entries = Array.from(input.files).map((file) => ({
      file,
      relativePath: "",
    }));
    input.value = "";
    enqueueUploads(entries);
  }

  function handleFolderInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const entries = Array.from(input.files).map((file) => ({
      file,
      relativePath: file.webkitRelativePath || "",
    }));
    input.value = "";
    enqueueUploads(entries);
  }

  function readAllDirEntries(dirEntry: DropDirEntry): Promise<DropEntry[]> {
    return new Promise((resolve) => {
      const reader = dirEntry.createReader();
      const all: DropEntry[] = [];
      function readBatch() {
        reader.readEntries(
          (batch) => {
            if (batch.length === 0) resolve(all);
            else {
              all.push(...batch);
              readBatch();
            }
          },
          () => resolve(all),
        );
      }
      readBatch();
    });
  }

  async function traverseDropEntry(
    entry: DropEntry,
    prefix: string,
  ): Promise<{ file: File; relativePath: string }[]> {
    if (entry.isFile) {
      return new Promise((resolve) => {
        (entry as DropFileEntry).file(
          (file) => {
            const rel = prefix ? `${prefix}/${file.name}` : "";
            resolve([{ file, relativePath: rel }]);
          },
          () => resolve([]),
        );
      });
    }
    if (entry.isDirectory) {
      const dirEntry = entry as DropDirEntry;
      const nextPrefix = prefix ? `${prefix}/${dirEntry.name}` : dirEntry.name;
      const children = await readAllDirEntries(dirEntry);
      const collected: { file: File; relativePath: string }[] = [];
      for (const child of children) {
        collected.push(...(await traverseDropEntry(child, nextPrefix)));
      }
      return collected;
    }
    return [];
  }

  async function handleWorkspaceDrop(event: DragEvent) {
    event.preventDefault();
    dragDepth = 0;
    isExternalFileDrag = false;
    if (!event.dataTransfer || !data?.configured) return;

    const items = event.dataTransfer.items;
    if (items && items.length > 0) {
      const collected: { file: File; relativePath: string }[] = [];
      let usedEntries = false;
      for (const item of Array.from(items)) {
        if (item.kind !== "file") continue;
        const getter = item as DataTransferItem & {
          webkitGetAsEntry?: () => DropEntry | null;
        };
        const entry = getter.webkitGetAsEntry?.();
        if (entry) {
          usedEntries = true;
          collected.push(...(await traverseDropEntry(entry, "")));
        }
      }
      if (usedEntries && collected.length > 0) {
        enqueueUploads(collected);
        return;
      }
    }

    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      enqueueUploads(
        Array.from(event.dataTransfer.files).map((file) => ({
          file,
          relativePath: "",
        })),
      );
    }
  }

  function handleWorkspaceDragEnter(event: DragEvent) {
    if (!data?.configured || !event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    dragDepth += 1;
    isExternalFileDrag = true;
  }

  function handleWorkspaceDragOver(event: DragEvent) {
    if (!data?.configured || !event.dataTransfer?.types.includes("Files")) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }

  function handleWorkspaceDragLeave() {
    if (!isExternalFileDrag) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) isExternalFileDrag = false;
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (deleteConfirm) deleteConfirm = null;
      else if (createModalOpen) createModalOpen = false;
      else if (previewFile) previewFile = null;
      else if (newMenuOpen) newMenuOpen = false;
      else if (selectedCount > 0) clearSelection();
    }
  }

  function handleGlobalPaste(event: ClipboardEvent) {
    if (deleteConfirm || createModalOpen || previewFile || !data?.configured) return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable)
    ) {
      return;
    }
    const pastedFiles = event.clipboardData?.files;
    if (!pastedFiles || pastedFiles.length === 0) return;
    enqueueUploads(
      Array.from(pastedFiles).map((file) => ({ file, relativePath: "" })),
    );
  }

  onMount(() => {
    try {
      const saved = localStorage.getItem("oc-r2-view-mode");
      if (saved === "grid" || saved === "list") displayMode = saved;
    } catch {}
    void fetchR2();
  });

  onDestroy(() => {
    destroyed = true;
    for (const ctrl of uploadControllers.values()) {
      ctrl.cancelled = true;
      ctrl.xhr?.abort();
    }
    uploadControllers.clear();
    if (toastTimer) clearTimeout(toastTimer);
    if (searchTimer) clearTimeout(searchTimer);
  });
</script>

<svelte:window onkeydown={handleGlobalKeydown} onpaste={handleGlobalPaste} />

<input
  bind:this={fileInputEl}
  type="file"
  multiple
  class="hidden"
  onchange={handleFileInputChange}
/>
<input
  bind:this={folderInputEl}
  type="file"
  multiple
  class="hidden"
  onchange={handleFolderInputChange}
  {...({ webkitdirectory: true, directory: true } as Record<string, boolean>)}
/>

{#if loading && !data}
  <div class="rounded-lg border border-oc-border bg-oc-surface p-12 text-center text-sm text-oc-muted">
    <Icon name="loader" class="mx-auto mb-2 size-6 animate-spin" />
    Cloudflare R2 버킷 상태를 확인하는 중...
  </div>
{:else if data && !data.configured}
  <div class="rounded-lg border border-oc-border bg-oc-surface p-6">
    <div class="flex items-start gap-3">
      <div class="flex size-10 shrink-0 items-center justify-center rounded-lg border border-oc-border bg-oc-subtle text-oc-strong">
        <Icon name="globe" class="size-5" />
      </div>
      <div class="space-y-2">
        <h2 class="text-base font-semibold text-oc-strong">
          Cloudflare R2가 아직 연결되지 않았습니다
        </h2>
        <p class="text-xs leading-relaxed text-oc-muted">
          외부 CDN 배포용 버킷을 사용하려면 서버의 <code class="font-mono text-oc-text">.env.local</code> 파일에 아래 5개 환경변수를 추가한 뒤
          <code class="font-mono text-oc-text">pm2 restart homepage</code>를 실행하세요. 무료 티어(10GB) 초과 방지를 위해 기본
          <strong class="text-oc-strong">9.0 GB 하드 캡</strong>이 자동 적용됩니다.
        </p>
        <div class="mt-3 rounded border border-oc-border bg-oc-bg p-3 font-mono text-xs text-oc-text">
          <p>R2_ACCOUNT_ID=...</p>
          <p>R2_ACCESS_KEY_ID=...</p>
          <p>R2_SECRET_ACCESS_KEY=...</p>
          <p>R2_BUCKET_NAME=...</p>
          <p>R2_PUBLIC_URL=https://cdn.your-domain.com</p>
          <p class="text-oc-faint"># 선택: R2_HARD_CAP_GB=9 (최대 9.5)</p>
        </div>
      </div>
    </div>
  </div>
{:else}
  <div
    class="relative grid grid-cols-1 gap-5 lg:grid-cols-[224px_minmax(0,1fr)]"
    ondragenter={handleWorkspaceDragEnter}
    ondragover={handleWorkspaceDragOver}
    ondragleave={handleWorkspaceDragLeave}
    ondrop={handleWorkspaceDrop}
    role="region"
    aria-label="R2 CDN 작업 공간"
  >
    {#if isExternalFileDrag}
      <div class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-xs">
        <div class="rounded-xl border-2 border-dashed border-oc-strong bg-oc-surface px-8 py-7 text-center shadow-2xl">
          <Icon name="upload" class="mx-auto size-10 text-oc-strong" />
          <p class="mt-3 text-base font-semibold text-oc-strong">
            여기에 놓아 Cloudflare R2에 업로드
          </p>
          <p class="mt-1 text-xs text-oc-muted">
            20MB 초과는 자동 멀티파트 분할 업로드되며 9.0 GB 한도를 넘지 않습니다
          </p>
        </div>
      </div>
    {/if}

    <!-- Left R2 Sidebar -->
    <aside class="space-y-4">
      <div class="rounded-lg border border-oc-border bg-oc-surface p-3">
        <div class="relative">
          <button
            type="button"
            onclick={() => (newMenuOpen = !newMenuOpen)}
            class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-oc-strong px-3 py-2.5 text-sm font-semibold text-oc-inverted transition hover:bg-oc-strong-hover"
          >
            <Icon name="add" class="size-4" />
            <span>R2에 올리기</span>
          </button>

          {#if newMenuOpen}
            <div class="mt-2 space-y-1 rounded-md border border-oc-border bg-oc-bg p-1.5">
              <button
                type="button"
                onclick={() => {
                  newMenuOpen = false;
                  newFolderName = "";
                  createModalOpen = true;
                }}
                class="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left text-xs font-medium text-oc-strong transition hover:bg-oc-hover"
              >
                <Icon name="folderPlus" class="size-4 text-oc-muted" />
                새 R2 폴더
              </button>
              <button
                type="button"
                onclick={() => {
                  newMenuOpen = false;
                  fileInputEl?.click();
                }}
                class="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left text-xs font-medium text-oc-strong transition hover:bg-oc-hover"
              >
                <Icon name="upload" class="size-4 text-oc-muted" />
                파일 업로드 (다중 선택)
              </button>
              <button
                type="button"
                onclick={() => {
                  newMenuOpen = false;
                  folderInputEl?.click();
                }}
                class="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left text-xs font-medium text-oc-strong transition hover:bg-oc-hover"
              >
                <Icon name="uploadFolder" class="size-4 text-oc-muted" />
                폴더 업로드
              </button>
            </div>
          {/if}
        </div>

        {#if stats}
          <div class="mt-3 rounded border border-oc-border bg-oc-bg px-2.5 py-2 text-[11px]">
            <p class="font-medium text-oc-strong">연결된 CDN 도메인</p>
            <p class="mt-0.5 truncate font-mono text-[10px] text-[#54d483]">
              {stats.publicUrl.replace("https://", "")}
            </p>
            <p class="mt-1 font-mono text-[10px] text-oc-faint">
              버킷: {stats.bucketName}
            </p>
          </div>
        {/if}
      </div>

      <!-- R2 Free-tier Hard Cap Card -->
      {#if stats}
        <div class="rounded-lg border border-oc-border bg-oc-surface p-3.5 text-xs">
          <div class="flex items-center justify-between text-oc-strong">
            <span class="flex items-center gap-1.5 font-semibold">
              <Icon name="shield" class="size-3.5 text-[#54d483]" />
              무료 한도 보호
            </span>
            <span class="font-mono text-[11px] text-oc-muted">{usagePct}%</span>
          </div>

          <div class="mt-2.5">
            <svg
              viewBox="0 0 100 6"
              preserveAspectRatio="none"
              class="h-1.5 w-full overflow-hidden rounded-full bg-oc-bg"
              aria-label="R2 안전 한도 사용률"
            >
              <rect
                x="0"
                y="0"
                width={usagePct}
                height="6"
                class={usagePct >= 90 ? "fill-amber-400" : "fill-[#54d483]"}
              />
            </svg>
          </div>

          <dl class="mt-3 space-y-1 text-[11px] text-oc-muted">
            <div class="flex justify-between">
              <dt>현재 사용량</dt>
              <dd class="font-mono text-oc-strong">
                {formatBytes(stats.usedBytes)}
              </dd>
            </div>
            <div class="flex justify-between">
              <dt>앱 안전 상한</dt>
              <dd class="font-mono">{formatBytes(stats.hardCapBytes)}</dd>
            </div>
            <div class="flex justify-between">
              <dt>무료 티어</dt>
              <dd class="font-mono">
                {formatBytes(stats.freeTierBytes)} (송신 $0)
              </dd>
            </div>
            <div class="flex justify-between border-t border-oc-border pt-1.5">
              <dt>저장된 개체</dt>
              <dd class="font-mono">{stats.objectCount}개</dd>
            </div>
          </dl>
        </div>
      {/if}
    </aside>

    <!-- Main R2 Workspace -->
    <section class="min-w-0 space-y-4">
      <div class="flex flex-wrap items-center gap-2 rounded-lg border border-oc-border bg-oc-surface p-3.5">
        <div class="relative min-w-[200px] flex-1">
          <Icon
            name="search"
            class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-oc-faint"
          />
          <input
            type="text"
            value={searchQuery}
            oninput={(e) =>
              handleSearchInput((e.currentTarget as HTMLInputElement).value)}
            placeholder="R2 버킷에서 파일 검색..."
            class="w-full rounded border border-oc-border bg-oc-bg py-1.5 pl-9 pr-8 text-sm text-oc-strong placeholder:text-oc-faint focus:border-oc-border-strong focus:outline-none"
          />
          {#if searchQuery}
            <button
              type="button"
              onclick={clearSearch}
              aria-label="검색어 지우기"
              class="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer rounded p-0.5 text-oc-faint hover:text-oc-strong"
            >
              <Icon name="close" class="size-3.5" />
            </button>
          {/if}
        </div>

        <div class="flex items-center gap-1.5">
          <div class="relative">
            <select
              aria-label="정렬 기준"
              value={sortField}
              onchange={(e) => {
                sortField = (e.currentTarget as HTMLSelectElement)
                  .value as DriveSortField;
                sortDir = sortField === "name" ? "asc" : "desc";
                void fetchR2();
              }}
              class="cursor-pointer appearance-none rounded border border-oc-border bg-oc-bg py-1.5 pl-2.5 pr-8 text-xs text-oc-strong focus:border-oc-border-strong focus:outline-none"
            >
              <option value="updated">수정일순</option>
              <option value="name">이름순</option>
              <option value="size">크기순</option>
            </select>
            <Icon
              name="chevronDown"
              class="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-oc-muted"
            />
          </div>

          <button
            type="button"
            onclick={() => {
              sortDir = sortDir === "asc" ? "desc" : "asc";
              void fetchR2();
            }}
            aria-label="정렬 방향 전환"
            class="cursor-pointer rounded border border-oc-border bg-oc-bg p-1.5 text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
          >
            <Icon
              name={sortDir === "asc" ? "arrowUp" : "arrowDown"}
              class="size-4"
            />
          </button>

          <div class="flex rounded border border-oc-border bg-oc-bg p-0.5">
            <button
              type="button"
              onclick={() => setDisplayMode("grid")}
              aria-label="그리드 보기"
              class="cursor-pointer rounded px-2 py-1 transition {displayMode === 'grid'
                ? 'bg-oc-subtle text-oc-strong'
                : 'text-oc-muted hover:text-oc-strong'}"
            >
              <Icon name="grid" class="size-3.5" />
            </button>
            <button
              type="button"
              onclick={() => setDisplayMode("list")}
              aria-label="목록 보기"
              class="cursor-pointer rounded px-2 py-1 transition {displayMode === 'list'
                ? 'bg-oc-subtle text-oc-strong'
                : 'text-oc-muted hover:text-oc-strong'}"
            >
              <Icon name="list" class="size-3.5" />
            </button>
          </div>

          <button
            type="button"
            onclick={() => fetchR2()}
            aria-label="새로고침"
            class="cursor-pointer rounded border border-oc-border bg-oc-bg p-1.5 text-oc-muted transition hover:bg-oc-hover hover:text-oc-strong"
          >
            <Icon
              name="refresh"
              class="size-4 {loading ? 'animate-spin' : ''}"
            />
          </button>
        </div>
      </div>

      <!-- Breadcrumbs + quick upload -->
      <div class="flex flex-wrap items-center justify-between gap-2 px-1">
        <nav aria-label="R2 경로" class="flex flex-wrap items-center gap-1 text-sm">
          {#each breadcrumbs as crumb, idx (crumb.prefix || `root-${idx}`)}
            {#if idx > 0}
              <Icon name="chevronRight" class="size-3.5 text-oc-faint" />
            {/if}
            <button
              type="button"
              onclick={() => navigatePrefix(crumb.prefix)}
              class="cursor-pointer rounded px-2 py-1 transition {idx === breadcrumbs.length - 1
                ? 'font-semibold text-oc-strong'
                : 'text-oc-muted hover:bg-oc-subtle hover:text-oc-strong'}"
            >
              {crumb.name}
            </button>
          {/each}
        </nav>

        <button
          type="button"
          onclick={() => fileInputEl?.click()}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-oc-border bg-oc-surface px-2.5 py-1 text-xs font-medium text-oc-strong transition hover:border-oc-border-strong hover:bg-oc-hover"
        >
          <Icon name="upload" class="size-3.5" />
          R2 파일 올리기
        </button>
      </div>

      {#if selectedCount > 0}
        <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-oc-border-strong bg-oc-surface px-4 py-2.5">
          <div class="flex items-center gap-3 text-xs">
            <span class="inline-flex items-center gap-1.5 font-semibold text-oc-strong">
              <Icon name="checkSquare" class="size-4" />
              {selectedCount}개 선택됨
            </span>
            <button
              type="button"
              onclick={clearSelection}
              class="cursor-pointer text-oc-muted hover:text-oc-strong"
            >
              선택 해제
            </button>
          </div>
          <button
            type="button"
            onclick={() =>
              (deleteConfirm = {
                keys: selectedKeyList,
                prefixes: selectedPrefixList,
                label: `선택한 R2 항목 ${selectedCount}개`,
              })}
            class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/20"
          >
            <Icon name="trash" class="size-3.5" />
            영구 삭제
          </button>
        </div>
      {/if}

      {#if totalVisibleCount === 0}
        <div class="rounded-lg border border-dashed border-oc-border bg-oc-surface p-12 text-center">
          <Icon name="globe" class="mx-auto size-10 text-oc-faint" />
          <p class="mt-3 text-sm font-medium text-oc-strong">
            {debouncedQuery
              ? "검색과 일치하는 R2 개체가 없습니다."
              : "이 R2 경로가 비어 있습니다."}
          </p>
          <p class="mt-1 text-xs text-oc-muted">
            외부에 공개 배포할 이미지나 정적 파일을 드래그 앤 드롭하거나, 로컬 드라이브에서 'R2 배포'로 복제할 수 있습니다.
          </p>
        </div>
      {:else if displayMode === "grid"}
        <div class="space-y-6">
          {#if folders.length > 0}
            <div>
              <h2 class="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wider text-oc-muted">
                폴더 ({folders.length})
              </h2>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {#each folders as folder (folder.prefix)}
                  {@const checked = Boolean(selectedPrefixes[folder.prefix])}
                  <div
                    role="group"
                    aria-label={`R2 폴더 ${folder.name}`}
                    class="flex items-center justify-between gap-2 rounded-lg border p-3 transition {checked
                      ? 'border-oc-border-strong bg-oc-subtle'
                      : 'border-oc-border bg-oc-surface hover:border-oc-border-strong'}"
                  >
                    <div class="flex min-w-0 flex-1 items-center gap-2.5">
                      <input
                        type="checkbox"
                        {checked}
                        onchange={() => toggleSelectPrefix(folder.prefix)}
                        aria-label={`${folder.name} 선택`}
                        class="size-3.5 shrink-0 cursor-pointer accent-oc-strong"
                      />
                      <button
                        type="button"
                        onclick={() => openFolder(folder)}
                        class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                      >
                        <Icon name="folder" class="size-5 shrink-0 text-oc-strong" />
                        <span class="truncate text-sm font-medium text-oc-strong">
                          {folder.name}
                        </span>
                      </button>
                    </div>
                    <button
                      type="button"
                      onclick={() =>
                        (deleteConfirm = {
                          keys: [],
                          prefixes: [folder.prefix],
                          label: `R2 폴더 '${folder.name}' 및 하위 모든 개체`,
                        })}
                      title="폴더 삭제"
                      aria-label="R2 폴더 삭제"
                      class="cursor-pointer rounded p-1 text-oc-faint hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Icon name="trash" class="size-3.5" />
                    </button>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if files.length > 0}
            <div>
              <h2 class="mb-2.5 px-1 text-xs font-semibold uppercase tracking-wider text-oc-muted">
                개체 ({files.length})
              </h2>
              <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {#each files as file (file.key)}
                  {@const checked = Boolean(selectedKeys[file.key])}
                  {@const isImg = IMAGE_PREVIEW_EXTS.has(file.ext.toLowerCase())}
                  <div
                    role="group"
                    aria-label={`R2 파일 ${file.name}`}
                    class="group flex flex-col overflow-hidden rounded-lg border transition {checked
                      ? 'border-oc-border-strong bg-oc-subtle'
                      : 'border-oc-border bg-oc-surface hover:border-oc-border-strong'}"
                  >
                    <div class="flex items-center justify-between gap-2 border-b border-oc-border/70 px-2.5 py-2">
                      <div class="flex items-center gap-2">
                        <input
                          type="checkbox"
                          {checked}
                          onchange={() => toggleSelectKey(file.key)}
                          aria-label={`${file.name} 선택`}
                          class="size-3.5 cursor-pointer accent-oc-strong"
                        />
                        <span class="rounded bg-oc-bg px-1.5 py-0.5 font-mono text-[10px] uppercase text-oc-muted">
                          {file.ext.replace(".", "") || "file"}
                        </span>
                      </div>
                      <span class="rounded border border-[#54d483]/40 bg-[#54d483]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#239f50] dark:text-[#54d483]">
                        CDN
                      </span>
                    </div>

                    <button
                      type="button"
                      onclick={() => (previewFile = file)}
                      class="flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden bg-oc-bg"
                    >
                      {#if isImg}
                        <img
                          src={file.url}
                          alt={file.name}
                          loading="lazy"
                          class="h-full w-full object-cover"
                        />
                      {:else}
                        <div class="flex flex-col items-center gap-2 p-4 text-oc-muted">
                          <Icon
                            name={categoryIcon(file.category)}
                            class="size-9 text-oc-text"
                          />
                          <span class="font-mono text-[11px] text-oc-faint">
                            {CATEGORY_LABELS[file.category]}
                          </span>
                        </div>
                      {/if}
                    </button>

                    <div class="flex flex-1 flex-col justify-between p-3">
                      <div>
                        <button
                          type="button"
                          onclick={() => (previewFile = file)}
                          title={file.name}
                          class="block w-full cursor-pointer truncate text-left text-xs font-semibold text-oc-strong hover:underline"
                        >
                          {file.name}
                        </button>
                        <div class="mt-1 flex items-center justify-between text-[11px] text-oc-muted">
                          <span class="font-mono">{formatBytes(file.size)}</span>
                          <span>{formatDateKo(file.lastModified).split(" ")[0]}</span>
                        </div>
                        {#if file.folderLabel}
                          <p class="mt-1 truncate text-[10px] text-oc-faint">
                            {file.folderLabel}
                          </p>
                        {/if}
                      </div>

                      <div class="mt-3 flex items-center justify-between gap-1 border-t border-oc-border/70 pt-2">
                        <button
                          type="button"
                          onclick={() => copyCdnUrl(file)}
                          class="inline-flex cursor-pointer items-center gap-1 rounded border border-oc-border bg-oc-bg px-2 py-1 text-[11px] font-medium text-oc-strong hover:bg-oc-hover"
                        >
                          <Icon name="copy" class="size-3" />
                          CDN 링크
                        </button>
                        <div class="flex items-center gap-0.5">
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="새 탭에서 열기"
                            class="rounded p-1 text-oc-muted hover:bg-oc-hover hover:text-oc-strong"
                          >
                            <Icon name="external" class="size-3.5" />
                          </a>
                          <button
                            type="button"
                            onclick={() => copyMarkdownLink(file)}
                            title="마크다운 복사"
                            class="cursor-pointer rounded p-1 text-oc-muted hover:bg-oc-hover hover:text-oc-strong"
                          >
                            <Icon name="code" class="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onclick={() =>
                              (deleteConfirm = {
                                keys: [file.key],
                                prefixes: [],
                                label: `R2 개체 '${file.name}'`,
                              })}
                            title="삭제"
                            class="cursor-pointer rounded p-1 text-oc-muted hover:bg-red-500/10 hover:text-red-400"
                          >
                            <Icon name="trash" class="size-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {:else}
        <div class="overflow-x-auto rounded-lg border border-oc-border bg-oc-surface">
          <table class="w-full border-collapse text-left text-xs">
            <thead>
              <tr class="border-b border-oc-border bg-oc-subtle/60 text-oc-muted">
                <th class="w-9 px-3 py-2.5"></th>
                <th class="px-3 py-2.5 font-semibold">이름 / 키</th>
                <th class="hidden px-3 py-2.5 font-semibold md:table-cell">수정일</th>
                <th class="px-3 py-2.5 text-right font-semibold">크기</th>
                <th class="px-3 py-2.5 text-right font-semibold">작업</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-oc-border">
              {#each folders as folder (folder.prefix)}
                {@const checked = Boolean(selectedPrefixes[folder.prefix])}
                <tr class="hover:bg-oc-subtle/40">
                  <td class="px-3 py-2.5">
                    <input
                      type="checkbox"
                      {checked}
                      onchange={() => toggleSelectPrefix(folder.prefix)}
                      class="size-3.5 cursor-pointer accent-oc-strong"
                    />
                  </td>
                  <td class="px-3 py-2.5">
                    <button
                      type="button"
                      onclick={() => openFolder(folder)}
                      class="flex cursor-pointer items-center gap-2 font-medium text-oc-strong hover:underline"
                    >
                      <Icon name="folder" class="size-4 text-oc-strong" />
                      <span>{folder.name}</span>
                    </button>
                  </td>
                  <td class="hidden px-3 py-2.5 text-oc-faint md:table-cell">-</td>
                  <td class="px-3 py-2.5 text-right text-oc-faint">폴더</td>
                  <td class="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onclick={() =>
                        (deleteConfirm = {
                          keys: [],
                          prefixes: [folder.prefix],
                          label: `R2 폴더 '${folder.name}' 및 하위 모든 개체`,
                        })}
                      class="cursor-pointer rounded p-1 text-oc-muted hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Icon name="trash" class="size-3.5" />
                    </button>
                  </td>
                </tr>
              {/each}
              {#each files as file (file.key)}
                {@const checked = Boolean(selectedKeys[file.key])}
                <tr class="hover:bg-oc-subtle/40">
                  <td class="px-3 py-2.5">
                    <input
                      type="checkbox"
                      {checked}
                      onchange={() => toggleSelectKey(file.key)}
                      class="size-3.5 cursor-pointer accent-oc-strong"
                    />
                  </td>
                  <td class="max-w-[260px] px-3 py-2.5">
                    <button
                      type="button"
                      onclick={() => (previewFile = file)}
                      class="flex min-w-0 cursor-pointer items-center gap-2 text-left font-medium text-oc-strong hover:underline"
                    >
                      <Icon
                        name={categoryIcon(file.category)}
                        class="size-4 shrink-0 text-oc-muted"
                      />
                      <span class="truncate">{file.name}</span>
                    </button>
                  </td>
                  <td class="hidden px-3 py-2.5 font-mono text-[11px] text-oc-muted md:table-cell">
                    {formatDateKo(file.lastModified)}
                  </td>
                  <td class="px-3 py-2.5 text-right font-mono text-oc-muted">
                    {formatBytes(file.size)}
                  </td>
                  <td class="px-3 py-2.5 text-right">
                    <div class="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onclick={() => copyCdnUrl(file)}
                        title="CDN URL 복사"
                        class="cursor-pointer rounded p-1 text-oc-strong hover:bg-oc-hover"
                      >
                        <Icon name="copy" class="size-3.5" />
                      </button>
                      <a
                        href={file.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="새 탭에서 열기"
                        class="rounded p-1 text-oc-muted hover:bg-oc-hover hover:text-oc-strong"
                      >
                        <Icon name="external" class="size-3.5" />
                      </a>
                      <button
                        type="button"
                        onclick={() =>
                          (deleteConfirm = {
                            keys: [file.key],
                            prefixes: [],
                            label: `R2 개체 '${file.name}'`,
                          })}
                        title="삭제"
                        class="cursor-pointer rounded p-1 text-oc-muted hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Icon name="trash" class="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  </div>
{/if}

<!-- Upload Queue Dock -->
{#if uploadQueue.length > 0}
  <div class="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-oc-border bg-oc-surface shadow-2xl">
    <div class="flex items-center justify-between gap-2 border-b border-oc-border bg-oc-subtle px-3.5 py-2.5 text-xs">
      <span class="font-semibold text-oc-strong">
        {#if uploadStats.active}
          R2 업로드 중 ({uploadStats.done}/{uploadStats.total}) · {uploadStats.pct}%
        {:else if uploadStats.errors > 0}
          R2 업로드 완료 (실패 {uploadStats.errors}건)
        {:else}
          {uploadStats.total}개 R2 업로드 완료
        {/if}
      </span>
      <div class="flex items-center gap-1">
        <button
          type="button"
          onclick={() => (uploadPanelExpanded = !uploadPanelExpanded)}
          class="cursor-pointer rounded px-1.5 py-0.5 text-[11px] text-oc-muted hover:bg-oc-hover hover:text-oc-strong"
        >
          {uploadPanelExpanded ? "접기" : "펼치기"}
        </button>
        {#if !uploadStats.active}
          <button
            type="button"
            onclick={() => (uploadQueue = [])}
            aria-label="업로드 목록 닫기"
            class="cursor-pointer rounded p-1 text-oc-muted hover:bg-oc-hover hover:text-oc-strong"
          >
            <Icon name="close" class="size-3.5" />
          </button>
        {/if}
      </div>
    </div>

    <svg
      viewBox="0 0 100 4"
      preserveAspectRatio="none"
      class="h-1 w-full bg-oc-bg"
    >
      <rect
        x="0"
        y="0"
        width={uploadStats.pct}
        height="4"
        class={uploadStats.errors > 0 ? "fill-amber-400" : "fill-[#54d483]"}
      />
    </svg>

    {#if uploadPanelExpanded}
      <div class="max-h-56 divide-y divide-oc-border overflow-y-auto">
        {#each uploadQueue as item (item.uid)}
          <div class="px-3.5 py-2 text-xs">
            <div class="flex items-center justify-between gap-2">
              <span class="truncate font-medium text-oc-strong">
                {item.name}
              </span>
              <div class="flex shrink-0 items-center gap-1.5 font-mono text-[10px]">
                {#if item.status === "done"}
                  <span class="text-[#54d483]">완료</span>
                {:else if item.status === "cancelled"}
                  <span class="text-oc-faint">취소됨</span>
                {:else if item.status === "error"}
                  <span class="text-red-400">{item.error || "오류"}</span>
                {:else if item.status === "uploading"}
                  <span class="text-oc-strong">
                    {item.chunkLabel ? `${item.chunkLabel} · ${item.progress}%` : `${item.progress}%`}
                  </span>
                {:else}
                  <span class="text-oc-faint">대기</span>
                {/if}
                {#if item.status === "queued" || item.status === "uploading"}
                  <button
                    type="button"
                    onclick={() => cancelUploadItem(item.uid)}
                    aria-label={`${item.name} 업로드 취소`}
                    class="cursor-pointer rounded p-0.5 text-oc-faint hover:bg-oc-hover hover:text-oc-strong"
                  >
                    <Icon name="close" class="size-3" />
                  </button>
                {/if}
              </div>
            </div>
            {#if item.status === "uploading"}
              <svg
                viewBox="0 0 100 3"
                preserveAspectRatio="none"
                class="mt-1.5 h-1 w-full rounded bg-oc-bg"
              >
                <rect x="0" y="0" width={item.progress} height="3" class="fill-[#54d483]" />
              </svg>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<!-- Create Folder Modal -->
{#if createModalOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
    <button
      type="button"
      aria-label="모달 닫기"
      onclick={() => (createModalOpen = false)}
      class="fixed inset-0 bg-black/70 backdrop-blur-xs"
    ></button>
    <div class="relative z-10 w-full max-w-md rounded-lg border border-oc-border bg-oc-surface p-5 shadow-2xl">
      <h3 class="flex items-center gap-2 text-sm font-semibold text-oc-strong">
        <Icon name="folderPlus" class="size-4" />
        새 R2 폴더 만들기
      </h3>
      <form onsubmit={handleCreateFolder} class="mt-4 space-y-4">
        <input
          bind:this={newFolderInputEl}
          bind:value={newFolderName}
          type="text"
          maxlength="120"
          required
          placeholder="예: banners"
          class="w-full rounded border border-oc-border bg-oc-bg px-3 py-2 text-sm text-oc-strong placeholder:text-oc-faint focus:border-oc-border-strong focus:outline-none"
        />
        <div class="flex justify-end gap-2">
          <button
            type="button"
            onclick={() => (createModalOpen = false)}
            class="cursor-pointer rounded border border-oc-border bg-oc-bg px-3 py-1.5 text-xs text-oc-text hover:bg-oc-hover"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={actionBusy || !newFolderName.trim()}
            class="cursor-pointer rounded bg-oc-strong px-3.5 py-1.5 text-xs font-medium text-oc-inverted hover:bg-oc-strong-hover disabled:opacity-50"
          >
            {actionBusy ? "생성 중..." : "만들기"}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

<!-- Delete Confirm Modal -->
{#if deleteConfirm}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
    <button
      type="button"
      aria-label="모달 닫기"
      onclick={() => (deleteConfirm = null)}
      class="fixed inset-0 bg-black/70 backdrop-blur-xs"
    ></button>
    <div class="relative z-10 w-full max-w-md rounded-lg border border-oc-border bg-oc-surface p-5 shadow-2xl">
      <h3 class="flex items-center gap-2 text-sm font-semibold text-red-400">
        <Icon name="alert" class="size-4" />
        R2 영구 삭제 확인
      </h3>
      <p class="mt-3 text-xs leading-relaxed text-oc-text">
        <strong class="text-oc-strong">{deleteConfirm.label}</strong>을(를) Cloudflare R2 버킷에서 즉시 삭제합니다. 이 작업은 되돌릴 수 없습니다.
      </p>
      <div class="mt-5 flex justify-end gap-2">
        <button
          type="button"
          onclick={() => (deleteConfirm = null)}
          class="cursor-pointer rounded border border-oc-border bg-oc-bg px-3 py-1.5 text-xs text-oc-text hover:bg-oc-hover"
        >
          취소
        </button>
        <button
          type="button"
          disabled={actionBusy}
          onclick={confirmDeleteTargets}
          class="cursor-pointer rounded bg-red-600 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {actionBusy ? "삭제 중..." : "영구 삭제"}
        </button>
      </div>
    </div>
  </div>
{/if}

<!-- R2 Preview Modal -->
{#if previewFile}
  {@const pExt = previewFile.ext.toLowerCase()}
  <div class="fixed inset-0 z-50 flex flex-col bg-black/85 backdrop-blur-sm" role="dialog" aria-modal="true">
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-oc-border bg-oc-surface/95 px-4 py-2.5">
      <div class="flex min-w-0 items-center gap-2.5">
        <button
          type="button"
          onclick={() => (previewFile = null)}
          aria-label="미리보기 닫기"
          class="cursor-pointer rounded p-1.5 text-oc-muted hover:bg-oc-hover hover:text-oc-strong"
        >
          <Icon name="close" class="size-4" />
        </button>
        <div class="min-w-0">
          <p class="truncate text-sm font-semibold text-oc-strong">{previewFile.name}</p>
          <p class="font-mono text-[11px] text-oc-muted">
            {formatBytes(previewFile.size)} · {previewFile.mime}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onclick={() => copyCdnUrl(previewFile!)}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-oc-border bg-oc-bg px-2.5 py-1.5 text-xs font-medium text-oc-strong hover:bg-oc-hover"
        >
          <Icon name="copy" class="size-3.5" />
          CDN 링크 복사
        </button>
        <button
          type="button"
          onclick={() => copyMarkdownLink(previewFile!)}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-oc-border bg-oc-bg px-2.5 py-1.5 text-xs text-oc-text hover:bg-oc-hover hover:text-oc-strong"
        >
          <Icon name="code" class="size-3.5" />
          마크다운
        </button>
        <a
          href={previewFile.url}
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 rounded bg-oc-strong px-3 py-1.5 text-xs font-medium text-oc-inverted hover:bg-oc-strong-hover"
        >
          <Icon name="external" class="size-3.5" />
          새 탭 열기
        </a>
        <button
          type="button"
          onclick={() =>
            (deleteConfirm = {
              keys: [previewFile!.key],
              prefixes: [],
              label: `R2 개체 '${previewFile!.name}'`,
            })}
          class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20"
        >
          <Icon name="trash" class="size-3.5" />
          삭제
        </button>
      </div>
    </div>

    <div class="flex min-h-0 flex-1 items-center justify-center p-4 sm:p-8">
      {#if IMAGE_PREVIEW_EXTS.has(pExt)}
        <img
          src={previewFile.url}
          alt={previewFile.name}
          class="max-h-full max-w-full rounded border border-oc-border bg-oc-bg object-contain shadow-2xl"
        />
      {:else if VIDEO_PREVIEW_EXTS.has(pExt)}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          src={previewFile.url}
          controls
          class="max-h-full max-w-full rounded border border-oc-border bg-black shadow-2xl"
        ></video>
      {:else if AUDIO_PREVIEW_EXTS.has(pExt)}
        <div class="w-full max-w-md rounded-lg border border-oc-border bg-oc-surface p-6 text-center">
          <p class="mb-4 truncate text-sm font-medium text-oc-strong">{previewFile.name}</p>
          <audio src={previewFile.url} controls class="w-full"></audio>
        </div>
      {:else}
        <div class="w-full max-w-md rounded-lg border border-oc-border bg-oc-surface p-6 text-center">
          <Icon name="file" class="mx-auto size-10 text-oc-strong" />
          <p class="mt-3 break-all text-sm font-semibold text-oc-strong">{previewFile.name}</p>
          <code class="mt-2 block break-all rounded border border-oc-border bg-oc-bg px-2.5 py-2 font-mono text-[11px] text-oc-muted">
            {previewFile.url}
          </code>
          <a
            href={previewFile.url}
            target="_blank"
            rel="noopener noreferrer"
            class="mt-4 inline-flex items-center gap-1.5 rounded bg-oc-strong px-4 py-2 text-xs font-medium text-oc-inverted hover:bg-oc-strong-hover"
          >
            <Icon name="download" class="size-4" />
            CDN에서 받기 ({formatBytes(previewFile.size)})
          </a>
        </div>
      {/if}
    </div>
  </div>
{/if}

{#if toast}
  <div
    role="status"
    class="fixed bottom-4 left-4 z-40 max-w-sm rounded-md border px-3.5 py-2.5 text-xs font-medium shadow-xl {toast.tone === 'error'
      ? 'border-red-500/40 bg-oc-surface text-red-400'
      : toast.tone === 'ok'
        ? 'border-[#54d483]/40 bg-oc-surface text-[#239f50] dark:text-[#54d483]'
        : 'border-oc-border bg-oc-surface text-oc-strong'}"
  >
    {toast.message}
  </div>
{/if}
