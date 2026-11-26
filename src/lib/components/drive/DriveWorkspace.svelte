<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import Icon, { type IconName } from "#lib/components/Icon.svelte";
  import DriveActionModals, {
    type DriveActionModalState,
  } from "./DriveActionModals.svelte";
  import DrivePreviewModal from "./DrivePreviewModal.svelte";
  import {
    CATEGORY_LABELS,
    formatBytes,
    formatDateKo,
    IMAGE_PREVIEW_EXTS,
    type DriveCategoryFilter,
    type DriveFileCategory,
    type DriveFileItem,
    type DriveFolderItem,
    type DriveItemRef,
    type DriveListResponse,
    type DriveSortDir,
    type DriveSortField,
    type DriveView,
  } from "#lib/driveTypes.ts";

  interface UploadQueueItem {
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
    targetFolderId: string | null;
    shared: boolean;
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

  const MAX_CLIENT_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB
  const CHUNK_UPLOAD_SIZE = 20 * 1024 * 1024; // 20MB (Cloudflare Tunnel 100MB 회피)
  const MAX_CHUNK_RETRIES = 3;
  const DRAG_MIME_TYPE = "application/x-oc-drive-item";

  const VIEW_NAV: { id: DriveView; label: string; icon: IconName }[] = [
    { id: "my-drive", label: "내 드라이브", icon: "drive" },
    { id: "recent", label: "최근 항목", icon: "clock" },
    { id: "starred", label: "중요 문서함", icon: "star" },
    { id: "shared", label: "공유 링크됨", icon: "link" },
    { id: "trash", label: "휴지통", icon: "trash" },
  ];

  const CATEGORY_CHIPS: { id: DriveCategoryFilter; label: string }[] = [
    { id: "all", label: "전체" },
    { id: "image", label: "이미지" },
    { id: "document", label: "문서" },
    { id: "media", label: "미디어" },
    { id: "code", label: "코드/설정" },
    { id: "archive", label: "압축" },
    { id: "other", label: "기타" },
  ];

  let {
    sessionToken,
    r2Configured = false,
    onCopiedToR2,
    onSessionExpired,
  }: {
    sessionToken: string;
    r2Configured?: boolean;
    onCopiedToR2?: () => void;
    onSessionExpired: () => void;
  } = $props();

  let currentView = $state<DriveView>("my-drive");
  let currentFolderId = $state<string | null>(null);
  let searchQuery = $state("");
  let debouncedQuery = $state("");
  let categoryFilter = $state<DriveCategoryFilter>("all");
  let sortField = $state<DriveSortField>("updated");
  let sortDir = $state<DriveSortDir>("desc");
  let displayMode = $state<"grid" | "list">("grid");
  let uploadAsShared = $state(false);
  let newMenuOpen = $state(false);

  let data = $state<DriveListResponse | null>(null);
  let loading = $state(true);
  let actionBusy = $state(false);

  let selectedMap = $state<Record<string, DriveItemRef>>({});
  let actionModal = $state<DriveActionModalState>(null);
  let previewFile = $state<DriveFileItem | null>(null);

  let toast = $state<{ message: string; tone: "ok" | "error" | "info" } | null>(
    null,
  );
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let searchTimer: ReturnType<typeof setTimeout> | null = null;

  let uploadQueue = $state<UploadQueueItem[]>([]);
  let uploadPanelExpanded = $state(true);
  let uploadRunnerActive = false;
  const uploadControllers = new Map<
    string,
    { xhr: XMLHttpRequest | null; cancelled: boolean }
  >();

  let isExternalFileDrag = $state(false);
  let dragDepth = 0;
  let dragOverFolderId = $state<string | "root" | null>(null);

  let fileInputEl = $state<HTMLInputElement | null>(null);
  let folderInputEl = $state<HTMLInputElement | null>(null);

  let thumbUrls = $state<Record<string, string>>({});
  let failedThumbs = new Set<string>();
  let thumbQueue: DriveFileItem[] = [];
  let activeThumbWorkers = 0;
  let destroyed = false;

  let folders = $derived(data?.folders ?? []);
  let files = $derived(data?.files ?? []);
  let breadcrumbs = $derived(data?.breadcrumbs ?? [{ id: null, name: "내 드라이브" }]);
  let folderTree = $derived(data?.folderTree ?? []);
  let stats = $derived(
    data?.stats ?? {
      usedBytes: 0,
      activeFiles: 0,
      activeFolders: 0,
      trashBytes: 0,
      trashItems: 0,
      diskFreeBytes: null,
      diskTotalBytes: null,
    },
  );

  let selectedItems = $derived(Object.values(selectedMap));
  let selectedCount = $derived(selectedItems.length);
  let totalVisibleCount = $derived(folders.length + files.length);
  let allVisibleSelected = $derived.by(() => {
    if (totalVisibleCount === 0) return false;
    for (const f of folders) {
      if (!selectedMap[`folder:${f.id}`]) return false;
    }
    for (const file of files) {
      if (!selectedMap[`file:${file.id}`]) return false;
    }
    return true;
  });

  let diskUsedPct = $derived.by(() => {
    if (!stats.diskTotalBytes || stats.diskTotalBytes <= 0 || stats.diskFreeBytes === null) {
      return stats.usedBytes > 0 ? 5 : 0;
    }
    const used = Math.max(0, stats.diskTotalBytes - stats.diskFreeBytes);
    return Math.min(100, Math.max(2, Math.round((used / stats.diskTotalBytes) * 100)));
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
        acc + (u.status === "done" ? u.size : Math.round((u.size * u.progress) / 100)),
      0,
    );
    const pct =
      totalBytes > 0 ? Math.min(100, Math.round((loadedBytes / totalBytes) * 100)) : 0;
    return { total, done, errors, active, pct };
  });

  let previewIndex = $derived.by(() => {
    if (!previewFile) return -1;
    return files.findIndex((f) => f.id === previewFile!.id);
  });

  function showToast(
    message: string,
    tone: "ok" | "error" | "info" = "info",
  ): void {
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

  function thumbKey(file: DriveFileItem): string {
    return `${file.id}:${file.updatedAt}`;
  }

  function revokeUnusedThumbs(currentFiles: DriveFileItem[]) {
    const keepKeys = new Set(currentFiles.map(thumbKey));
    const next: Record<string, string> = {};
    let changed = false;
    for (const [k, url] of Object.entries(thumbUrls)) {
      if (keepKeys.has(k)) {
        next[k] = url;
      } else {
        URL.revokeObjectURL(url);
        changed = true;
      }
    }
    if (changed) thumbUrls = next;
  }

  function pumpThumbQueue() {
    while (activeThumbWorkers < 4 && thumbQueue.length > 0 && !destroyed) {
      const nextFile = thumbQueue.shift()!;
      const key = thumbKey(nextFile);
      if (thumbUrls[key] || failedThumbs.has(key)) continue;

      activeThumbWorkers += 1;
      fetch(`/api/drive/content/${nextFile.id}`, {
        headers: { "x-session-token": sessionToken },
      })
        .then(async (res) => {
          if (res.status === 401) {
            onSessionExpired();
            return;
          }
          if (!res.ok) {
            failedThumbs.add(key);
            return;
          }
          const blob = await res.blob();
          if (destroyed) return;
          const objectUrl = URL.createObjectURL(blob);
          thumbUrls = { ...thumbUrls, [key]: objectUrl };
        })
        .catch(() => {
          failedThumbs.add(key);
        })
        .finally(() => {
          activeThumbWorkers -= 1;
          pumpThumbQueue();
        });
    }
  }

  function schedulePrivateThumbnails(currentFiles: DriveFileItem[]) {
    revokeUnusedThumbs(currentFiles);
    const pendingIds = new Set(thumbQueue.map(thumbKey));
    for (const file of currentFiles) {
      const lowerExt = file.ext.toLowerCase();
      const needsAuthThumb =
        IMAGE_PREVIEW_EXTS.has(lowerExt) &&
        (!file.shared || Boolean(file.trashedAt));
      if (!needsAuthThumb) continue;
      const key = thumbKey(file);
      if (!thumbUrls[key] && !failedThumbs.has(key) && !pendingIds.has(key)) {
        thumbQueue.push(file);
        pendingIds.add(key);
      }
    }
    pumpThumbQueue();
  }

  function pruneSelection(nextData: DriveListResponse) {
    const valid = new Set<string>();
    for (const f of nextData.folders) valid.add(`folder:${f.id}`);
    for (const file of nextData.files) valid.add(`file:${file.id}`);
    const nextSel: Record<string, DriveItemRef> = {};
    let changed = false;
    for (const [k, ref] of Object.entries(selectedMap)) {
      if (valid.has(k)) {
        nextSel[k] = ref;
      } else {
        changed = true;
      }
    }
    if (changed) selectedMap = nextSel;
  }

  async function fetchDrive(silent = false): Promise<void> {
    if (!silent) loading = true;
    try {
      const params = new URLSearchParams();
      params.set("view", currentView);
      if (currentView === "my-drive" && currentFolderId) {
        params.set("folderId", currentFolderId);
      }
      if (debouncedQuery.trim()) {
        params.set("q", debouncedQuery.trim());
      }
      if (categoryFilter !== "all") {
        params.set("category", categoryFilter);
      }
      params.set("sort", sortField);
      params.set("dir", sortDir);

      const res = await fetch(`/api/drive?${params.toString()}`, {
        headers: { "x-session-token": sessionToken },
      });

      if (res.status === 401) {
        onSessionExpired();
        return;
      }

      if (res.status === 404 && currentFolderId !== null) {
        currentFolderId = null;
        await fetchDrive(silent);
        return;
      }

      const payload = (await res.json()) as DriveListResponse & { error?: string };
      if (!res.ok) {
        if (!silent) showToast(payload.error || "목록 조회에 실패했습니다.", "error");
        return;
      }

      data = payload;
      pruneSelection(payload);
      schedulePrivateThumbnails(payload.files);

      if (previewFile) {
        const updatedPreview = payload.files.find((f) => f.id === previewFile!.id);
        previewFile = updatedPreview || null;
      }
    } catch {
      if (!silent) showToast("드라이브 데이터를 불러오지 못했습니다.", "error");
    } finally {
      if (!silent) loading = false;
    }
  }

  async function callDriveAction(
    body: Record<string, unknown>,
    successMsg?: string,
  ): Promise<boolean> {
    actionBusy = true;
    try {
      const res = await fetch("/api/drive", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken,
        },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        onSessionExpired();
        return false;
      }
      const result = (await res.json()) as { error?: string };
      if (!res.ok) {
        showToast(result.error || "작업을 처리하지 못했습니다.", "error");
        return false;
      }
      if (successMsg) showToast(successMsg, "ok");
      await fetchDrive(true);
      return true;
    } catch {
      showToast("서버 요청 중 오류가 발생했습니다.", "error");
      return false;
    } finally {
      actionBusy = false;
    }
  }

  function switchView(view: DriveView, folderId: string | null = null) {
    currentView = view;
    currentFolderId = view === "my-drive" ? folderId : null;
    selectedMap = {};
    newMenuOpen = false;
    fetchDrive();
  }

  function openFolder(folder: DriveFolderItem) {
    if (folder.trashedAt) return;
    currentView = "my-drive";
    currentFolderId = folder.id;
    searchQuery = "";
    debouncedQuery = "";
    selectedMap = {};
    fetchDrive();
  }

  function setDisplayMode(mode: "grid" | "list") {
    displayMode = mode;
    try {
      localStorage.setItem("oc-drive-view-mode", mode);
    } catch {}
  }

  function handleSearchInput(value: string) {
    searchQuery = value;
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      debouncedQuery = value;
      fetchDrive();
    }, 250);
  }

  function clearSearch() {
    searchQuery = "";
    debouncedQuery = "";
    if (searchTimer) clearTimeout(searchTimer);
    fetchDrive();
  }

  function setCategoryFilter(next: DriveCategoryFilter) {
    categoryFilter = next;
    fetchDrive();
  }

  function setSort(field: DriveSortField) {
    if (sortField === field) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortField = field;
      sortDir = field === "name" ? "asc" : "desc";
    }
    fetchDrive();
  }

  function toggleSelect(kind: "folder" | "file", id: string) {
    const key = `${kind}:${id}`;
    const next = { ...selectedMap };
    if (next[key]) {
      delete next[key];
    } else {
      next[key] = { kind, id };
    }
    selectedMap = next;
  }

  function toggleSelectAll() {
    if (allVisibleSelected) {
      selectedMap = {};
      return;
    }
    const next: Record<string, DriveItemRef> = {};
    for (const f of folders) next[`folder:${f.id}`] = { kind: "folder", id: f.id };
    for (const file of files) next[`file:${file.id}`] = { kind: "file", id: file.id };
    selectedMap = next;
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} 복사됨`, "ok");
    } catch {
      showToast("클립보드 복사에 실패했습니다.", "error");
    }
  }

  function copyPublicUrl(file: DriveFileItem) {
    if (!file.shared || file.trashedAt) {
      showToast(
        "비공개 파일입니다. 먼저 '비공개' 버튼을 눌러 공개 링크를 활성화하세요.",
        "info",
      );
      return;
    }
    const fullUrl = `${window.location.origin}${file.url}`;
    copyText(fullUrl, "URL");
  }

  function copyMarkdownLink(file: DriveFileItem) {
    if (!file.shared || file.trashedAt) {
      showToast("공개 링크가 켜진 파일만 마크다운 링크를 복사할 수 있습니다.", "info");
      return;
    }
    const fullUrl = `${window.location.origin}${file.url}`;
    const md =
      file.category === "image"
        ? `![${file.name}](${fullUrl})`
        : `[${file.name}](${fullUrl})`;
    copyText(md, "마크다운 링크");
  }

  async function downloadFile(file: DriveFileItem) {
    try {
      const res = await fetch("/api/drive/ticket", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken,
        },
        body: JSON.stringify({ fileId: file.id, purpose: "download" }),
      });
      if (res.status === 401) {
        onSessionExpired();
        return;
      }
      const ticketData = (await res.json()) as {
        url?: string;
        error?: string;
      };
      if (!res.ok || !ticketData.url) {
        showToast(
          ticketData.error || "다운로드 티켓 발급에 실패했습니다.",
          "error",
        );
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = ticketData.url;
      anchor.download = file.name;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      showToast("파일 다운로드 중 오류가 발생했습니다.", "error");
    }
  }

  async function handleCreateFolder(name: string, parentId: string | null) {
    const ok = await callDriveAction(
      { action: "createFolder", name, parentId },
      `폴더 '${name}' 생성됨`,
    );
    if (ok) actionModal = null;
  }

  async function handleRename(
    kind: "folder" | "file",
    id: string,
    newName: string,
  ) {
    const ok = await callDriveAction(
      { action: "rename", kind, id, name: newName },
      "이름이 변경되었습니다.",
    );
    if (ok) actionModal = null;
  }

  async function handleMove(
    items: DriveItemRef[],
    targetFolderId: string | null,
  ) {
    const ok = await callDriveAction(
      { action: "move", items, targetFolderId },
      `${items.length}개 항목 이동됨`,
    );
    if (ok) {
      actionModal = null;
      selectedMap = {};
    }
  }

  async function handleConfirmDelete(
    mode: "permanent" | "emptyTrash",
    items?: DriveItemRef[],
  ) {
    if (mode === "emptyTrash") {
      const ok = await callDriveAction(
        { action: "emptyTrash" },
        "휴지통을 비웠습니다.",
      );
      if (ok) {
        actionModal = null;
        selectedMap = {};
        previewFile = null;
      }
    } else if (items && items.length > 0) {
      const ok = await callDriveAction(
        { action: "deletePermanent", items },
        "영구 삭제되었습니다.",
      );
      if (ok) {
        actionModal = null;
        selectedMap = {};
        if (
          previewFile &&
          items.some((i) => i.kind === "file" && i.id === previewFile!.id)
        ) {
          previewFile = null;
        }
      }
    }
  }

  async function handleToggleShare(file: DriveFileItem) {
    const nextShared = !file.shared;
    await callDriveAction(
      { action: "toggleShare", fileIds: [file.id], shared: nextShared },
      nextShared ? "공개 링크가 켜졌습니다." : "파일이 비공개로 전환되었습니다.",
    );
  }

  async function handleToggleStar(items: DriveItemRef[], starred?: boolean) {
    await callDriveAction({ action: "toggleStar", items, starred });
  }

  async function handleTrash(items: DriveItemRef[]) {
    const ok = await callDriveAction(
      { action: "trash", items },
      `${items.length}개 항목을 휴지통으로 보냈습니다.`,
    );
    if (ok) {
      selectedMap = {};
      if (
        previewFile &&
        items.some((i) => i.kind === "file" && i.id === previewFile!.id)
      ) {
        previewFile = null;
      }
    }
  }

  async function handleRestore(items: DriveItemRef[]) {
    const ok = await callDriveAction(
      { action: "restore", items },
      `${items.length}개 항목을 복원했습니다.`,
    );
    if (ok) selectedMap = {};
  }

  async function copyFilesToR2(fileIds: string[]) {
    if (!r2Configured || fileIds.length === 0 || actionBusy) return;
    actionBusy = true;
    showToast("R2 CDN으로 파일을 복제하는 중...", "info");
    try {
      const res = await fetch("/api/r2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken,
        },
        body: JSON.stringify({ action: "copyFromLocal", fileIds }),
      });
      if (res.status === 401) {
        onSessionExpired();
        return;
      }
      const result = (await res.json()) as {
        copied?: { url: string; name: string }[];
        error?: string;
      };
      if (!res.ok || !result.copied) {
        showToast(result.error || "R2 복제에 실패했습니다.", "error");
        return;
      }
      if (result.copied.length === 1) {
        try {
          await navigator.clipboard.writeText(result.copied[0].url);
          showToast("R2 CDN 복제 및 URL 복사 완료", "ok");
        } catch {
          showToast("R2 CDN으로 복제되었습니다.", "ok");
        }
      } else {
        showToast(
          `${result.copied.length}개 파일을 R2 CDN으로 복제했습니다.`,
          "ok",
        );
      }
      onCopiedToR2?.();
    } catch {
      showToast("R2 복제 중 오류가 발생했습니다.", "error");
    } finally {
      actionBusy = false;
    }
  }

  // Upload queue & drag/drop directory traversal
  function enqueueUploads(entries: { file: File; relativePath: string }[]) {
    if (entries.length === 0) return;
    const targetFolder = currentView === "my-drive" ? currentFolderId : null;
    const shared = uploadAsShared;
    const newItems: UploadQueueItem[] = entries.map(({ file, relativePath }) => {
      if (file.size > MAX_CLIENT_FILE_SIZE) {
        return {
          uid: crypto.randomUUID(),
          name: file.name,
          size: file.size,
          relativePath,
          status: "error",
          progress: 0,
          error: "10GB 제한 초과",
          file,
          targetFolderId: targetFolder,
          shared,
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
          targetFolderId: targetFolder,
          shared,
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
        targetFolderId: targetFolder,
        shared,
      };
    });

    for (const item of newItems) {
      if (item.status === "queued") {
        uploadControllers.set(item.uid, { xhr: null, cancelled: false });
      }
    }

    uploadQueue = [...uploadQueue, ...newItems];
    uploadPanelExpanded = true;
    void processUploadQueue();
  }

  function updateQueueItem(uid: string, patch: Partial<UploadQueueItem>) {
    uploadQueue = uploadQueue.map((q) => (q.uid === uid ? { ...q, ...patch } : q));
  }

  async function abortServerUploadSession(uploadId: string) {
    try {
      await fetch("/api/drive/upload", {
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
      void abortServerUploadSession(item.uploadId);
    }
    updateQueueItem(uid, {
      status: "cancelled",
      error: "취소됨",
      chunkLabel: undefined,
    });
  }

  function uploadSingleItem(item: UploadQueueItem): Promise<boolean> {
    return new Promise((resolve) => {
      const ctrl = uploadControllers.get(item.uid);
      if (ctrl?.cancelled) {
        resolve(false);
        return;
      }

      const formData = new FormData();
      formData.append("file", item.file);
      if (item.targetFolderId) {
        formData.append("folderId", item.targetFolderId);
      }
      if (item.relativePath) {
        formData.append("relativePath", item.relativePath);
      }
      formData.append("shared", item.shared ? "true" : "false");

      const xhr = new XMLHttpRequest();
      if (ctrl) ctrl.xhr = xhr;
      xhr.open("POST", "/api/upload", true);
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
          const resData = JSON.parse(xhr.responseText || "{}") as {
            error?: string;
          };
          if (xhr.status >= 200 && xhr.status < 300) {
            updateQueueItem(item.uid, { status: "done", progress: 100 });
            resolve(true);
          } else {
            updateQueueItem(item.uid, {
              status: "error",
              error: resData.error || "업로드 실패",
            });
            resolve(false);
          }
        } catch {
          updateQueueItem(item.uid, {
            status: "error",
            error: "응답 파싱 오류",
          });
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

  function sendChunkXhr(opts: {
    uid: string;
    uploadId: string;
    index: number;
    blob: Blob;
    onProgress: (loadedBytes: number) => void;
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
        `/api/drive/upload?uploadId=${encodeURIComponent(opts.uploadId)}&index=${opts.index}`,
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
            error: parsed.error || `청크 오류 (${xhr.status})`,
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

  async function uploadChunkedItem(item: UploadQueueItem): Promise<boolean> {
    const ctrl = uploadControllers.get(item.uid);
    let uploadId: string | undefined;

    try {
      const initRes = await fetch("/api/drive/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken,
        },
        body: JSON.stringify({
          action: "init",
          fileName: item.name,
          totalSize: item.size,
          chunkSize: CHUNK_UPLOAD_SIZE,
          folderId: item.targetFolderId,
          relativePath: item.relativePath || undefined,
          shared: item.shared,
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
      if (!initRes.ok || !initData.uploadId || !initData.chunkSize || !initData.totalChunks) {
        updateQueueItem(item.uid, {
          status: "error",
          error: initData.error || "업로드 초기화 실패",
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
        chunkLabel: `0/${totalChunks} 청크`,
      });

      for (let idx = 0; idx < totalChunks; idx += 1) {
        if (ctrl?.cancelled || destroyed) {
          await abortServerUploadSession(uploadId);
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
        let lastError = "청크 전송 실패";

        for (let attempt = 0; attempt <= MAX_CHUNK_RETRIES; attempt += 1) {
          if (ctrl?.cancelled || destroyed) break;
          if (attempt > 0) {
            await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt - 1)));
          }

          const chunkRes = await sendChunkXhr({
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
                chunkLabel: `${idx + 1}/${totalChunks} 청크`,
              });
            },
          });

          if (chunkRes.ok) {
            chunkOk = true;
            break;
          }
          if (chunkRes.status === 401) {
            onSessionExpired();
            await abortServerUploadSession(uploadId);
            updateQueueItem(item.uid, {
              status: "error",
              error: "세션 만료",
              chunkLabel: undefined,
            });
            return false;
          }
          lastError = chunkRes.error || lastError;
          if (!chunkRes.retryable) break;
        }

        if (!chunkOk) {
          await abortServerUploadSession(uploadId);
          if (ctrl?.cancelled) {
            updateQueueItem(item.uid, {
              status: "cancelled",
              error: "취소됨",
              chunkLabel: undefined,
            });
          } else {
            updateQueueItem(item.uid, {
              status: "error",
              error: lastError,
              chunkLabel: undefined,
            });
          }
          return false;
        }
      }

      if (ctrl?.cancelled || destroyed) {
        await abortServerUploadSession(uploadId);
        updateQueueItem(item.uid, {
          status: "cancelled",
          error: "취소됨",
          chunkLabel: undefined,
        });
        return false;
      }

      const completeRes = await fetch("/api/drive/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-token": sessionToken,
        },
        body: JSON.stringify({ action: "complete", uploadId }),
      });

      if (completeRes.status === 401) {
        onSessionExpired();
        updateQueueItem(item.uid, { status: "error", error: "세션 만료" });
        return false;
      }

      const completeData = (await completeRes.json()) as { error?: string };
      if (!completeRes.ok) {
        await abortServerUploadSession(uploadId);
        updateQueueItem(item.uid, {
          status: "error",
          error: completeData.error || "파일 조립 실패",
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
      if (uploadId) await abortServerUploadSession(uploadId);
      updateQueueItem(item.uid, {
        status: "error",
        error: "분할 업로드 오류",
        chunkLabel: undefined,
      });
      return false;
    }
  }

  async function processUploadQueue() {
    if (uploadRunnerActive) return;
    uploadRunnerActive = true;
    let uploadedAny = false;
    try {
      while (!destroyed) {
        const nextItem = uploadQueue.find((q) => q.status === "queued");
        if (!nextItem) break;
        updateQueueItem(nextItem.uid, { status: "uploading" });
        const ok =
          nextItem.size > CHUNK_UPLOAD_SIZE
            ? await uploadChunkedItem(nextItem)
            : await uploadSingleItem(nextItem);
        uploadControllers.delete(nextItem.uid);
        if (ok) uploadedAny = true;
      }
      if (uploadedAny) {
        await fetchDrive(true);
      }
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
            if (batch.length === 0) {
              resolve(all);
            } else {
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
      const fileEntry = entry as DropFileEntry;
      return new Promise((resolve) => {
        fileEntry.file(
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
    if (!event.dataTransfer) return;

    // Internal drag moves are handled by folder/breadcrumb drop targets.
    if (event.dataTransfer.types.includes(DRAG_MIME_TYPE)) return;

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
    if (!event.dataTransfer) return;
    const isInternal = event.dataTransfer.types.includes(DRAG_MIME_TYPE);
    const hasFiles = event.dataTransfer.types.includes("Files");
    if (!isInternal && hasFiles) {
      event.preventDefault();
      dragDepth += 1;
      isExternalFileDrag = true;
    }
  }

  function handleWorkspaceDragOver(event: DragEvent) {
    if (!event.dataTransfer) return;
    if (
      !event.dataTransfer.types.includes(DRAG_MIME_TYPE) &&
      event.dataTransfer.types.includes("Files")
    ) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  }

  function handleWorkspaceDragLeave() {
    if (!isExternalFileDrag) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) isExternalFileDrag = false;
  }

  // Internal item drag-and-drop into folder cards / rows / breadcrumbs
  function handleItemDragStart(
    event: DragEvent,
    kind: "folder" | "file",
    id: string,
  ) {
    if (currentView === "trash") {
      event.preventDefault();
      return;
    }
    const key = `${kind}:${id}`;
    const payload: DriveItemRef[] =
      selectedMap[key] && selectedCount > 1
        ? selectedItems
        : [{ kind, id }];
    event.dataTransfer?.setData(DRAG_MIME_TYPE, JSON.stringify(payload));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
    }
  }

  function handleFolderTargetDragOver(
    event: DragEvent,
    targetId: string | "root",
  ) {
    if (!event.dataTransfer?.types.includes(DRAG_MIME_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    dragOverFolderId = targetId;
  }

  function handleFolderTargetDragLeave(targetId: string | "root") {
    if (dragOverFolderId === targetId) dragOverFolderId = null;
  }

  async function handleFolderTargetDrop(
    event: DragEvent,
    targetFolderId: string | null,
  ) {
    dragOverFolderId = null;
    if (!event.dataTransfer?.types.includes(DRAG_MIME_TYPE)) return;
    event.preventDefault();
    event.stopPropagation();
    const raw = event.dataTransfer.getData(DRAG_MIME_TYPE);
    if (!raw) return;
    try {
      const items = JSON.parse(raw) as DriveItemRef[];
      if (!Array.isArray(items) || items.length === 0) return;
      if (
        targetFolderId !== null &&
        items.some((i) => i.kind === "folder" && i.id === targetFolderId)
      ) {
        showToast("폴더를 자기 자신으로 이동할 수 없습니다.", "error");
        return;
      }
      await handleMove(items, targetFolderId);
    } catch {}
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    return (
      tag === "INPUT" ||
      tag === "TEXTAREA" ||
      tag === "SELECT" ||
      target.isContentEditable
    );
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      if (actionModal) {
        actionModal = null;
      } else if (previewFile) {
        previewFile = null;
      } else if (newMenuOpen) {
        newMenuOpen = false;
      } else if (selectedCount > 0) {
        selectedMap = {};
      }
      return;
    }

    if (
      event.key === "Delete" &&
      !actionModal &&
      !previewFile &&
      selectedCount > 0 &&
      !isTypingTarget(event.target)
    ) {
      event.preventDefault();
      if (currentView === "trash") {
        actionModal = {
          type: "confirmDelete",
          mode: "permanent",
          items: selectedItems,
          countLabel: `선택한 ${selectedCount}개 항목`,
        };
      } else {
        void handleTrash(selectedItems);
      }
    }
  }

  function handleGlobalPaste(event: ClipboardEvent) {
    if (isTypingTarget(event.target) || actionModal || previewFile) return;
    const pastedFiles = event.clipboardData?.files;
    if (!pastedFiles || pastedFiles.length === 0) return;
    enqueueUploads(
      Array.from(pastedFiles).map((file) => ({ file, relativePath: "" })),
    );
  }

  onMount(() => {
    try {
      const savedMode = localStorage.getItem("oc-drive-view-mode");
      if (savedMode === "grid" || savedMode === "list") {
        displayMode = savedMode;
      }
    } catch {}

    void fetchDrive();
    const timer = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        !actionModal &&
        !previewFile &&
        !uploadStats.active
      ) {
        void fetchDrive(true);
      }
    }, 15_000);

    return () => clearInterval(timer);
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
    for (const url of Object.values(thumbUrls)) {
      URL.revokeObjectURL(url);
    }
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

<div
  class="relative grid grid-cols-1 gap-5 lg:grid-cols-[224px_minmax(0,1fr)]"
  ondragenter={handleWorkspaceDragEnter}
  ondragover={handleWorkspaceDragOver}
  ondragleave={handleWorkspaceDragLeave}
  ondrop={handleWorkspaceDrop}
  role="region"
  aria-label="개인 드라이브 작업 공간"
>
  {#if isExternalFileDrag}
    <div class="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-xs">
      <div class="rounded-xl border-2 border-dashed border-oc-strong bg-oc-surface px-8 py-7 text-center shadow-2xl">
        <Icon name="upload" class="mx-auto size-10 text-oc-strong" />
        <p class="mt-3 text-base font-semibold text-oc-strong">
          여기에 파일 또는 폴더를 놓아 업로드
        </p>
        <p class="mt-1 text-xs text-oc-muted">
          폴더를 놓으면 하위 구조가 그대로 생성됩니다 (대용량 자동 분할 업로드 · 최대 10GB)
        </p>
      </div>
    </div>
  {/if}

  <!-- Left Drive Sidebar -->
  <aside class="space-y-4">
    <div class="rounded-lg border border-oc-border bg-oc-surface p-3">
      <div class="relative">
        <button
          type="button"
          onclick={() => (newMenuOpen = !newMenuOpen)}
          class="flex w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-oc-strong px-3 py-2.5 text-sm font-semibold text-oc-inverted transition hover:bg-oc-strong-hover"
        >
          <Icon name="add" class="size-4" />
          <span>새로 만들기</span>
        </button>

        {#if newMenuOpen}
          <div class="mt-2 space-y-1 rounded-md border border-oc-border bg-oc-bg p-1.5">
            <button
              type="button"
              onclick={() => {
                newMenuOpen = false;
                actionModal = {
                  type: "createFolder",
                  parentId: currentView === "my-drive" ? currentFolderId : null,
                };
              }}
              class="flex w-full cursor-pointer items-center gap-2 rounded px-2.5 py-2 text-left text-xs font-medium text-oc-strong transition hover:bg-oc-hover"
            >
              <Icon name="folderPlus" class="size-4 text-oc-muted" />
              새 폴더
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

      <!-- Default upload visibility toggle -->
      <div class="mt-3 flex items-center justify-between gap-2 rounded border border-oc-border bg-oc-bg px-2.5 py-2">
        <div class="min-w-0">
          <p class="text-[11px] font-medium text-oc-strong">업로드 시 공개 링크</p>
          <p class="text-[10px] text-oc-faint">
            {uploadAsShared ? "즉시 /uploads URL 허용" : "비공개로 저장 (권장)"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={uploadAsShared}
          aria-label="업로드 시 공개 링크 기본 활성화 전환"
          onclick={() => (uploadAsShared = !uploadAsShared)}
          class="cursor-pointer rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold transition {uploadAsShared
            ? 'border-[#54d483]/40 bg-[#54d483]/15 text-[#239f50] dark:text-[#54d483]'
            : 'border-oc-border bg-oc-subtle text-oc-muted'}"
        >
          {uploadAsShared ? "ON" : "OFF"}
        </button>
      </div>

      <!-- View Navigation -->
      <nav class="mt-3 flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {#each VIEW_NAV as navItem (navItem.id)}
          {@const active = currentView === navItem.id}
          <button
            type="button"
            onclick={() => switchView(navItem.id, null)}
            class="flex shrink-0 cursor-pointer items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs font-medium transition {active
              ? 'border-oc-border bg-oc-subtle text-oc-strong'
              : 'border-transparent text-oc-muted hover:bg-oc-subtle hover:text-oc-strong'}"
          >
            <span class="flex items-center gap-2">
              <Icon name={navItem.icon} class="size-4" />
              <span>{navItem.label}</span>
            </span>
            {#if navItem.id === "trash" && stats.trashItems > 0}
              <span class="rounded bg-oc-bg px-1.5 py-0.5 font-mono text-[10px] text-oc-muted">
                {stats.trashItems}
              </span>
            {/if}
          </button>
        {/each}
      </nav>
    </div>

    <!-- Storage Quota Card -->
    <div class="rounded-lg border border-oc-border bg-oc-surface p-3.5 text-xs">
      <div class="flex items-center justify-between text-oc-strong">
        <span class="flex items-center gap-1.5 font-semibold">
          <Icon name="server" class="size-3.5 text-oc-muted" />
          저장용량
        </span>
        <span class="font-mono text-[11px] text-oc-muted">{diskUsedPct}%</span>
      </div>

      <div class="mt-2.5">
        <svg
          viewBox="0 0 100 6"
          preserveAspectRatio="none"
          class="h-1.5 w-full overflow-hidden rounded-full bg-oc-bg"
          aria-label="디스크 사용량"
        >
          <rect
            x="0"
            y="0"
            width={diskUsedPct}
            height="6"
            class="fill-oc-strong"
          />
        </svg>
      </div>

      <dl class="mt-3 space-y-1 text-[11px] text-oc-muted">
        <div class="flex justify-between">
          <dt>드라이브 사용</dt>
          <dd class="font-mono text-oc-strong">
            {formatBytes(stats.usedBytes)}
          </dd>
        </div>
        <div class="flex justify-between">
          <dt>활성 항목</dt>
          <dd class="font-mono">
            폴더 {stats.activeFolders} · 파일 {stats.activeFiles}
          </dd>
        </div>
        {#if stats.trashBytes > 0}
          <div class="flex justify-between">
            <dt>휴지통</dt>
            <dd class="font-mono">{formatBytes(stats.trashBytes)}</dd>
          </div>
        {/if}
        {#if stats.diskFreeBytes !== null && stats.diskTotalBytes !== null}
          <div class="flex justify-between border-t border-oc-border pt-1.5">
            <dt>서버 여유</dt>
            <dd class="font-mono">
              {formatBytes(stats.diskFreeBytes)} / {formatBytes(stats.diskTotalBytes)}
            </dd>
          </div>
        {/if}
      </dl>
    </div>
  </aside>

  <!-- Main Workspace -->
  <section class="min-w-0 space-y-4">
    <!-- Top Search & Controls -->
    <div class="flex flex-col gap-3 rounded-lg border border-oc-border bg-oc-surface p-3.5">
      <div class="flex flex-wrap items-center gap-2">
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
            placeholder="드라이브에서 파일 또는 폴더 검색..."
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
          <select
            aria-label="정렬 기준"
            value={sortField}
            onchange={(e) =>
              setSort((e.currentTarget as HTMLSelectElement).value as DriveSortField)}
            class="cursor-pointer rounded border border-oc-border bg-oc-bg px-2.5 py-1.5 text-xs text-oc-strong focus:border-oc-border-strong focus:outline-none"
          >
            <option value="updated">수정일순</option>
            <option value="name">이름순</option>
            <option value="size">크기순</option>
          </select>

          <button
            type="button"
            onclick={() => {
              sortDir = sortDir === "asc" ? "desc" : "asc";
              fetchDrive();
            }}
            title={sortDir === "asc" ? "오름차순" : "내림차순"}
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
              title="그리드 보기"
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
              title="목록 보기"
              class="cursor-pointer rounded px-2 py-1 transition {displayMode === 'list'
                ? 'bg-oc-subtle text-oc-strong'
                : 'text-oc-muted hover:text-oc-strong'}"
            >
              <Icon name="list" class="size-3.5" />
            </button>
          </div>

          <button
            type="button"
            onclick={() => fetchDrive()}
            title="새로고침"
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

      <!-- Category chips -->
      <div class="flex flex-wrap items-center gap-1.5">
        {#each CATEGORY_CHIPS as chip (chip.id)}
          <button
            type="button"
            onclick={() => setCategoryFilter(chip.id)}
            class="cursor-pointer rounded-full border px-2.5 py-0.5 text-xs transition {categoryFilter === chip.id
              ? 'border-oc-strong bg-oc-strong font-medium text-oc-inverted'
              : 'border-oc-border bg-oc-bg text-oc-muted hover:border-oc-border-strong hover:text-oc-strong'}"
          >
            {chip.label}
          </button>
        {/each}
      </div>
    </div>

    <!-- Breadcrumbs + Quick upload strip -->
    <div class="flex flex-wrap items-center justify-between gap-2 px-1">
      <nav aria-label="폴더 경로" class="flex flex-wrap items-center gap-1 text-sm">
        {#each breadcrumbs as crumb, idx (`${crumb.id ?? 'root'}-${idx}`)}
          {#if idx > 0}
            <Icon name="chevronRight" class="size-3.5 text-oc-faint" />
          {/if}
          {@const isLast = idx === breadcrumbs.length - 1}
          {@const dropKey = crumb.id === null ? "root" : crumb.id}
          <button
            type="button"
            onclick={() => {
              if (currentView === "my-drive") {
                switchView("my-drive", crumb.id);
              }
            }}
            ondragover={(e) => {
              if (currentView === "my-drive" && !isLast) {
                handleFolderTargetDragOver(e, dropKey);
              }
            }}
            ondragleave={() => handleFolderTargetDragLeave(dropKey)}
            ondrop={(e) => {
              if (currentView === "my-drive" && !isLast) {
                void handleFolderTargetDrop(e, crumb.id);
              }
            }}
            class="cursor-pointer rounded px-2 py-1 transition {dragOverFolderId === dropKey
              ? 'border border-oc-strong bg-oc-hover text-oc-strong'
              : isLast
                ? 'font-semibold text-oc-strong'
                : 'text-oc-muted hover:bg-oc-subtle hover:text-oc-strong'}"
          >
            {crumb.name}
          </button>
        {/each}

        {#if debouncedQuery}
          <span class="ml-1 rounded border border-oc-border bg-oc-subtle px-2 py-0.5 text-xs text-oc-muted">
            검색: "{debouncedQuery}"
          </span>
        {/if}
      </nav>

      <div class="flex items-center gap-2">
        {#if currentView === "trash" && (folders.length > 0 || files.length > 0)}
          <button
            type="button"
            onclick={() =>
              (actionModal = {
                type: "confirmDelete",
                mode: "emptyTrash",
                countLabel: `휴지통의 모든 항목(${stats.trashItems}개)`,
              })}
            class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-red-500/40 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/20"
          >
            <Icon name="trash" class="size-3.5" />
            휴지통 비우기
          </button>
        {:else if currentView === "my-drive"}
          <button
            type="button"
            onclick={() => fileInputEl?.click()}
            class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-oc-border bg-oc-surface px-2.5 py-1 text-xs font-medium text-oc-strong transition hover:border-oc-border-strong hover:bg-oc-hover"
          >
            <Icon name="upload" class="size-3.5" />
            파일 올리기
          </button>
        {/if}
      </div>
    </div>

    {#if currentView === "trash"}
      <div class="rounded-lg border border-oc-border bg-oc-subtle/70 px-4 py-2.5 text-xs text-oc-muted">
        휴지통에 있는 파일은 외부 공개 URL(`/uploads/...`)에서 자동으로 차단됩니다. 복원하거나 영구 삭제할 수 있습니다.
      </div>
    {/if}

    <!-- Multi-select bulk toolbar -->
    {#if selectedCount > 0}
      <div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-oc-border-strong bg-oc-surface px-4 py-2.5">
        <div class="flex items-center gap-3 text-xs">
          <button
            type="button"
            onclick={toggleSelectAll}
            class="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-oc-strong"
          >
            <Icon name="checkSquare" class="size-4" />
            {selectedCount}개 선택됨
          </button>
          <button
            type="button"
            onclick={() => (selectedMap = {})}
            class="cursor-pointer text-oc-muted hover:text-oc-strong"
          >
            선택 해제
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          {#if currentView === "trash"}
            <button
              type="button"
              disabled={actionBusy}
              onclick={() => handleRestore(selectedItems)}
              class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-oc-border bg-oc-bg px-2.5 py-1 text-xs font-medium text-oc-strong transition hover:bg-oc-hover"
            >
              <Icon name="restore" class="size-3.5" />
              복원
            </button>
            <button
              type="button"
              disabled={actionBusy}
              onclick={() =>
                (actionModal = {
                  type: "confirmDelete",
                  mode: "permanent",
                  items: selectedItems,
                  countLabel: `선택한 ${selectedCount}개 항목`,
                })}
              class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 transition hover:bg-red-500/20"
            >
              <Icon name="trash" class="size-3.5" />
              영구 삭제
            </button>
          {:else}
            <button
              type="button"
              disabled={actionBusy}
              onclick={() => handleToggleStar(selectedItems)}
              class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-oc-border bg-oc-bg px-2.5 py-1 text-xs text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
            >
              <Icon name="star" class="size-3.5" />
              별표 전환
            </button>
            <button
              type="button"
              disabled={actionBusy}
              onclick={() =>
                (actionModal = {
                  type: "move",
                  items: selectedItems,
                  title: `${selectedCount}개 항목 이동`,
                })}
              class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-oc-border bg-oc-bg px-2.5 py-1 text-xs text-oc-text transition hover:bg-oc-hover hover:text-oc-strong"
            >
              <Icon name="move" class="size-3.5" />
              이동
            </button>
            {#if r2Configured && selectedItems.some((i) => i.kind === "file")}
              <button
                type="button"
                disabled={actionBusy}
                onclick={() =>
                  copyFilesToR2(
                    selectedItems
                      .filter((i) => i.kind === "file")
                      .map((i) => i.id)
                      .slice(0, 20),
                  )}
                class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-[#54d483]/40 bg-[#54d483]/10 px-2.5 py-1 text-xs font-medium text-[#239f50] transition hover:bg-[#54d483]/20 dark:text-[#54d483]"
              >
                <Icon name="globe" class="size-3.5" />
                R2 배포
              </button>
            {/if}
            <button
              type="button"
              disabled={actionBusy}
              onclick={() => handleTrash(selectedItems)}
              class="inline-flex cursor-pointer items-center gap-1.5 rounded border border-red-500/30 bg-red-500/5 px-2.5 py-1 text-xs text-red-400 transition hover:bg-red-500/15"
            >
              <Icon name="trash" class="size-3.5" />
              휴지통
            </button>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Main Content Area -->
    {#if loading && !data}
      <div class="rounded-lg border border-oc-border bg-oc-surface p-12 text-center text-sm text-oc-muted">
        <Icon name="loader" class="mx-auto mb-2 size-6 animate-spin" />
        드라이브를 불러오는 중...
      </div>
    {:else if totalVisibleCount === 0}
      <div class="rounded-lg border border-dashed border-oc-border bg-oc-surface p-12 text-center">
        <Icon name="folderOpen" class="mx-auto size-10 text-oc-faint" />
        <p class="mt-3 text-sm font-medium text-oc-strong">
          {#if debouncedQuery}
            검색 조건과 일치하는 항목이 없습니다.
          {:else if currentView === "trash"}
            휴지통이 비어 있습니다.
          {:else if currentView === "starred"}
            별표 표시한 항목이 없습니다.
          {:else if currentView === "shared"}
            공개 링크가 활성화된 파일이 없습니다.
          {:else}
            이 폴더는 비어 있습니다.
          {/if}
        </p>
        <p class="mt-1 text-xs text-oc-muted">
          파일이나 폴더를 이 화면으로 드래그 앤 드롭하거나 Ctrl+V로 바로 업로드할 수 있습니다.
        </p>
      </div>
    {:else if displayMode === "grid"}
      <div class="space-y-6">
        <!-- Folders Grid -->
        {#if folders.length > 0}
          <div>
            <div class="mb-2.5 flex items-center justify-between px-1">
              <h2 class="text-xs font-semibold uppercase tracking-wider text-oc-muted">
                폴더 ({folders.length})
              </h2>
              <button
                type="button"
                onclick={toggleSelectAll}
                class="cursor-pointer text-xs text-oc-muted hover:text-oc-strong"
              >
                {allVisibleSelected ? "전체 해제" : "전체 선택"}
              </button>
            </div>
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {#each folders as folder (folder.id)}
                {@const isChecked = Boolean(selectedMap[`folder:${folder.id}`])}
                <div
                  role="group"
                  aria-label={`폴더 ${folder.name}`}
                  draggable={currentView !== "trash"}
                  ondragstart={(e) => handleItemDragStart(e, "folder", folder.id)}
                  ondragover={(e) => {
                    if (!folder.trashedAt) handleFolderTargetDragOver(e, folder.id);
                  }}
                  ondragleave={() => handleFolderTargetDragLeave(folder.id)}
                  ondrop={(e) => {
                    if (!folder.trashedAt) void handleFolderTargetDrop(e, folder.id);
                  }}
                  class="group relative flex flex-col justify-between rounded-lg border p-3 transition {dragOverFolderId === folder.id
                    ? 'border-oc-strong bg-oc-hover'
                    : isChecked
                      ? 'border-oc-border-strong bg-oc-subtle'
                      : 'border-oc-border bg-oc-surface hover:border-oc-border-strong'}"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex min-w-0 flex-1 items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onchange={() => toggleSelect("folder", folder.id)}
                        aria-label={`${folder.name} 선택`}
                        class="size-3.5 shrink-0 cursor-pointer accent-oc-strong"
                      />
                      <button
                        type="button"
                        onclick={() => openFolder(folder)}
                        class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                      >
                        <Icon
                          name="folder"
                          class="size-5 shrink-0 text-oc-strong"
                        />
                        <span class="truncate text-sm font-medium text-oc-strong">
                          {folder.name}
                        </span>
                      </button>
                    </div>

                    {#if !folder.trashedAt}
                      <button
                        type="button"
                        onclick={() =>
                          handleToggleStar([{ kind: "folder", id: folder.id }])}
                        title={folder.starred ? "별표 해제" : "별표"}
                        aria-label="별표 전환"
                        class="cursor-pointer rounded p-1 text-oc-faint transition hover:bg-oc-hover hover:text-oc-strong"
                      >
                        <Icon
                          name={folder.starred ? "starFilled" : "star"}
                          class="size-3.5 {folder.starred ? 'text-amber-400' : ''}"
                        />
                      </button>
                    {/if}
                  </div>

                  <div class="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-oc-muted">
                    <span class="truncate">
                      {folder.pathLabel
                        ? folder.pathLabel
                        : `항목 ${folder.itemCount}개`}
                    </span>

                    <div class="flex shrink-0 items-center gap-1">
                      {#if currentView === "trash"}
                        <button
                          type="button"
                          onclick={() =>
                            handleRestore([{ kind: "folder", id: folder.id }])}
                          title="복원"
                          class="cursor-pointer rounded border border-oc-border bg-oc-bg px-2 py-0.5 text-[11px] text-oc-strong hover:bg-oc-hover"
                        >
                          복원
                        </button>
                        <button
                          type="button"
                          onclick={() =>
                            (actionModal = {
                              type: "confirmDelete",
                              mode: "permanent",
                              items: [{ kind: "folder", id: folder.id }],
                              countLabel: `폴더 '${folder.name}' 및 하위 항목`,
                            })}
                          title="영구 삭제"
                          class="cursor-pointer rounded border border-red-500/30 bg-red-500/5 px-2 py-0.5 text-[11px] text-red-400 hover:bg-red-500/15"
                        >
                          삭제
                        </button>
                      {:else}
                        <button
                          type="button"
                          onclick={() =>
                            (actionModal = {
                              type: "rename",
                              kind: "folder",
                              id: folder.id,
                              currentName: folder.name,
                            })}
                          title="이름 변경"
                          aria-label="폴더 이름 변경"
                          class="cursor-pointer rounded p-1 text-oc-faint hover:bg-oc-hover hover:text-oc-strong"
                        >
                          <Icon name="edit" class="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onclick={() =>
                            (actionModal = {
                              type: "move",
                              items: [{ kind: "folder", id: folder.id }],
                              title: `'${folder.name}' 이동`,
                            })}
                          title="이동"
                          aria-label="폴더 이동"
                          class="cursor-pointer rounded p-1 text-oc-faint hover:bg-oc-hover hover:text-oc-strong"
                        >
                          <Icon name="move" class="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onclick={() =>
                            handleTrash([{ kind: "folder", id: folder.id }])}
                          title="휴지통으로 이동"
                          aria-label="폴더 휴지통 이동"
                          class="cursor-pointer rounded p-1 text-oc-faint hover:bg-red-500/10 hover:text-red-400"
                        >
                          <Icon name="trash" class="size-3.5" />
                        </button>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}

        <!-- Files Grid -->
        {#if files.length > 0}
          <div>
            <div class="mb-2.5 flex items-center justify-between px-1">
              <h2 class="text-xs font-semibold uppercase tracking-wider text-oc-muted">
                파일 ({files.length})
              </h2>
              {#if folders.length === 0}
                <button
                  type="button"
                  onclick={toggleSelectAll}
                  class="cursor-pointer text-xs text-oc-muted hover:text-oc-strong"
                >
                  {allVisibleSelected ? "전체 해제" : "전체 선택"}
                </button>
              {/if}
            </div>

            <div class="grid grid-cols-1 gap-3.5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {#each files as file (file.id)}
                {@const isChecked = Boolean(selectedMap[`file:${file.id}`])}
                {@const lowerExt = file.ext.toLowerCase()}
                {@const isImg = IMAGE_PREVIEW_EXTS.has(lowerExt)}
                {@const thumbSrc = isImg
                  ? file.shared && !file.trashedAt
                    ? file.url
                    : thumbUrls[thumbKey(file)] || null
                  : null}

                <div
                  role="group"
                  aria-label={`파일 ${file.name}`}
                  draggable={currentView !== "trash"}
                  ondragstart={(e) => handleItemDragStart(e, "file", file.id)}
                  class="group flex flex-col overflow-hidden rounded-lg border transition {isChecked
                    ? 'border-oc-border-strong bg-oc-subtle'
                    : 'border-oc-border bg-oc-surface hover:border-oc-border-strong'}"
                >
                  <!-- Top bar inside card -->
                  <div class="flex items-center justify-between gap-2 border-b border-oc-border/70 px-2.5 py-2">
                    <div class="flex min-w-0 items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onchange={() => toggleSelect("file", file.id)}
                        aria-label={`${file.name} 선택`}
                        class="size-3.5 shrink-0 cursor-pointer accent-oc-strong"
                      />
                      <span class="rounded bg-oc-bg px-1.5 py-0.5 font-mono text-[10px] uppercase text-oc-muted">
                        {file.ext.replace(".", "") || "file"}
                      </span>
                    </div>

                    <div class="flex items-center gap-1">
                      {#if !file.trashedAt}
                        <button
                          type="button"
                          onclick={() => handleToggleShare(file)}
                          title={file.shared
                            ? "공개 링크 켜짐 (클릭하여 비공개)"
                            : "비공개 (클릭하여 공개 링크 켜기)"}
                          class="cursor-pointer rounded border px-1.5 py-0.5 text-[10px] font-medium transition {file.shared
                            ? 'border-[#54d483]/40 bg-[#54d483]/10 text-[#239f50] dark:text-[#54d483]'
                            : 'border-oc-border bg-oc-bg text-oc-faint hover:text-oc-strong'}"
                        >
                          {file.shared ? "공개" : "비공개"}
                        </button>
                        <button
                          type="button"
                          onclick={() =>
                            handleToggleStar([{ kind: "file", id: file.id }])}
                          title={file.starred ? "별표 해제" : "별표"}
                          aria-label="별표 전환"
                          class="cursor-pointer rounded p-1 text-oc-faint transition hover:bg-oc-hover hover:text-oc-strong"
                        >
                          <Icon
                            name={file.starred ? "starFilled" : "star"}
                            class="size-3.5 {file.starred ? 'text-amber-400' : ''}"
                          />
                        </button>
                      {/if}
                    </div>
                  </div>

                  <!-- Preview Button Area -->
                  <button
                    type="button"
                    onclick={() => (previewFile = file)}
                    class="flex aspect-[4/3] w-full cursor-pointer items-center justify-center overflow-hidden bg-oc-bg transition group-hover:bg-oc-subtle/60"
                  >
                    {#if thumbSrc}
                      <img
                        src={thumbSrc}
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

                  <!-- Meta & Actions -->
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
                        <span>{formatDateKo(file.updatedAt).split(" ")[0]}</span>
                      </div>
                      {#if file.pathLabel}
                        <p class="mt-1 truncate text-[10px] text-oc-faint">
                          {file.pathLabel}
                        </p>
                      {/if}
                    </div>

                    <div class="mt-3 flex items-center justify-between gap-1 border-t border-oc-border/70 pt-2">
                      {#if currentView === "trash"}
                        <button
                          type="button"
                          onclick={() =>
                            handleRestore([{ kind: "file", id: file.id }])}
                          class="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded border border-oc-border bg-oc-bg py-1 text-[11px] font-medium text-oc-strong hover:bg-oc-hover"
                        >
                          <Icon name="restore" class="size-3" />
                          복원
                        </button>
                        <button
                          type="button"
                          onclick={() =>
                            (actionModal = {
                              type: "confirmDelete",
                              mode: "permanent",
                              items: [{ kind: "file", id: file.id }],
                              countLabel: `파일 '${file.name}'`,
                            })}
                          class="inline-flex flex-1 cursor-pointer items-center justify-center gap-1 rounded border border-red-500/30 bg-red-500/5 py-1 text-[11px] font-medium text-red-400 hover:bg-red-500/15"
                        >
                          <Icon name="trash" class="size-3" />
                          영구 삭제
                        </button>
                      {:else}
                        <button
                          type="button"
                          onclick={() => copyPublicUrl(file)}
                          title={file.shared
                            ? "공개 URL 복사"
                            : "공개 링크를 먼저 켜주세요"}
                          class="inline-flex cursor-pointer items-center gap-1 rounded border border-oc-border bg-oc-bg px-2 py-1 text-[11px] font-medium transition {file.shared
                            ? 'text-oc-strong hover:bg-oc-hover'
                            : 'text-oc-faint hover:text-oc-text'}"
                        >
                          <Icon name="copy" class="size-3" />
                          링크
                        </button>

                        <div class="flex items-center gap-0.5">
                          {#if r2Configured}
                            <button
                              type="button"
                              onclick={() => copyFilesToR2([file.id])}
                              title="R2 CDN으로 복제"
                              aria-label="R2 CDN 복제"
                              class="cursor-pointer rounded p-1 text-oc-muted hover:bg-[#54d483]/15 hover:text-[#239f50] dark:hover:text-[#54d483]"
                            >
                              <Icon name="globe" class="size-3.5" />
                            </button>
                          {/if}
                          <button
                            type="button"
                            onclick={() => downloadFile(file)}
                            title="다운로드"
                            aria-label="다운로드"
                            class="cursor-pointer rounded p-1 text-oc-muted hover:bg-oc-hover hover:text-oc-strong"
                          >
                            <Icon name="download" class="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onclick={() =>
                              (actionModal = {
                                type: "rename",
                                kind: "file",
                                id: file.id,
                                currentName: file.name,
                              })}
                            title="이름 변경"
                            aria-label="이름 변경"
                            class="cursor-pointer rounded p-1 text-oc-muted hover:bg-oc-hover hover:text-oc-strong"
                          >
                            <Icon name="edit" class="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onclick={() =>
                              (actionModal = {
                                type: "move",
                                items: [{ kind: "file", id: file.id }],
                                title: `'${file.name}' 이동`,
                              })}
                            title="이동"
                            aria-label="이동"
                            class="cursor-pointer rounded p-1 text-oc-muted hover:bg-oc-hover hover:text-oc-strong"
                          >
                            <Icon name="move" class="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onclick={() =>
                              handleTrash([{ kind: "file", id: file.id }])}
                            title="휴지통으로 이동"
                            aria-label="휴지통 이동"
                            class="cursor-pointer rounded p-1 text-oc-muted hover:bg-red-500/10 hover:text-red-400"
                          >
                            <Icon name="trash" class="size-3.5" />
                          </button>
                        </div>
                      {/if}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <!-- List View -->
      <div class="overflow-x-auto rounded-lg border border-oc-border bg-oc-surface">
        <table class="w-full border-collapse text-left text-xs">
          <thead>
            <tr class="border-b border-oc-border bg-oc-subtle/60 text-oc-muted">
              <th class="w-9 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onchange={toggleSelectAll}
                  aria-label="전체 항목 선택"
                  class="size-3.5 cursor-pointer accent-oc-strong"
                />
              </th>
              <th class="px-3 py-2.5 font-semibold">이름</th>
              <th class="hidden px-3 py-2.5 font-semibold sm:table-cell">공유</th>
              <th class="hidden px-3 py-2.5 font-semibold md:table-cell">수정일</th>
              <th class="px-3 py-2.5 text-right font-semibold">크기</th>
              <th class="px-3 py-2.5 text-right font-semibold">작업</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-oc-border">
            {#each folders as folder (folder.id)}
              {@const isChecked = Boolean(selectedMap[`folder:${folder.id}`])}
              <tr
                draggable={currentView !== "trash"}
                ondragstart={(e) => handleItemDragStart(e, "folder", folder.id)}
                ondragover={(e) => {
                  if (!folder.trashedAt) handleFolderTargetDragOver(e, folder.id);
                }}
                ondragleave={() => handleFolderTargetDragLeave(folder.id)}
                ondrop={(e) => {
                  if (!folder.trashedAt) void handleFolderTargetDrop(e, folder.id);
                }}
                class="transition {dragOverFolderId === folder.id
                  ? 'bg-oc-hover'
                  : isChecked
                    ? 'bg-oc-subtle'
                    : 'hover:bg-oc-subtle/40'}"
              >
                <td class="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onchange={() => toggleSelect("folder", folder.id)}
                    aria-label={`${folder.name} 선택`}
                    class="size-3.5 cursor-pointer accent-oc-strong"
                  />
                </td>
                <td class="max-w-[260px] px-3 py-2.5">
                  <div class="flex items-center gap-2">
                    <button
                      type="button"
                      onclick={() => openFolder(folder)}
                      class="flex min-w-0 cursor-pointer items-center gap-2 text-left font-medium text-oc-strong hover:underline"
                    >
                      <Icon name="folder" class="size-4 shrink-0 text-oc-strong" />
                      <span class="truncate">{folder.name}</span>
                    </button>
                    {#if folder.pathLabel}
                      <span class="hidden truncate text-[10px] text-oc-faint xl:inline">
                        {folder.pathLabel}
                      </span>
                    {/if}
                  </div>
                </td>
                <td class="hidden px-3 py-2.5 text-oc-faint sm:table-cell">폴더</td>
                <td class="hidden px-3 py-2.5 font-mono text-[11px] text-oc-muted md:table-cell">
                  {formatDateKo(folder.updatedAt)}
                </td>
                <td class="px-3 py-2.5 text-right font-mono text-oc-faint">
                  {folder.itemCount}개 항목
                </td>
                <td class="px-3 py-2.5 text-right">
                  <div class="inline-flex items-center gap-1">
                    {#if currentView === "trash"}
                      <button
                        type="button"
                        onclick={() =>
                          handleRestore([{ kind: "folder", id: folder.id }])}
                        class="cursor-pointer rounded border border-oc-border bg-oc-bg px-2 py-1 text-[11px] text-oc-strong hover:bg-oc-hover"
                      >
                        복원
                      </button>
                      <button
                        type="button"
                        onclick={() =>
                          (actionModal = {
                            type: "confirmDelete",
                            mode: "permanent",
                            items: [{ kind: "folder", id: folder.id }],
                            countLabel: `폴더 '${folder.name}' 및 하위 항목`,
                          })}
                        class="cursor-pointer rounded border border-red-500/30 bg-red-500/5 px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/15"
                      >
                        삭제
                      </button>
                    {:else}
                      <button
                        type="button"
                        onclick={() =>
                          handleToggleStar([{ kind: "folder", id: folder.id }])}
                        title="별표"
                        class="cursor-pointer rounded p-1 text-oc-faint hover:bg-oc-hover hover:text-oc-strong"
                      >
                        <Icon
                          name={folder.starred ? "starFilled" : "star"}
                          class="size-3.5 {folder.starred ? 'text-amber-400' : ''}"
                        />
                      </button>
                      <button
                        type="button"
                        onclick={() =>
                          (actionModal = {
                            type: "rename",
                            kind: "folder",
                            id: folder.id,
                            currentName: folder.name,
                          })}
                        title="이름 변경"
                        class="cursor-pointer rounded p-1 text-oc-muted hover:bg-oc-hover hover:text-oc-strong"
                      >
                        <Icon name="edit" class="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onclick={() =>
                          (actionModal = {
                            type: "move",
                            items: [{ kind: "folder", id: folder.id }],
                            title: `'${folder.name}' 이동`,
                          })}
                        title="이동"
                        class="cursor-pointer rounded p-1 text-oc-muted hover:bg-oc-hover hover:text-oc-strong"
                      >
                        <Icon name="move" class="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onclick={() =>
                          handleTrash([{ kind: "folder", id: folder.id }])}
                        title="휴지통"
                        class="cursor-pointer rounded p-1 text-oc-muted hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Icon name="trash" class="size-3.5" />
                      </button>
                    {/if}
                  </div>
                </td>
              </tr>
            {/each}

            {#each files as file (file.id)}
              {@const isChecked = Boolean(selectedMap[`file:${file.id}`])}
              <tr
                draggable={currentView !== "trash"}
                ondragstart={(e) => handleItemDragStart(e, "file", file.id)}
                class="transition {isChecked
                  ? 'bg-oc-subtle'
                  : 'hover:bg-oc-subtle/40'}"
              >
                <td class="px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onchange={() => toggleSelect("file", file.id)}
                    aria-label={`${file.name} 선택`}
                    class="size-3.5 cursor-pointer accent-oc-strong"
                  />
                </td>
                <td class="max-w-[260px] px-3 py-2.5">
                  <div class="flex items-center gap-2">
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
                    {#if file.pathLabel}
                      <span class="hidden truncate text-[10px] text-oc-faint xl:inline">
                        {file.pathLabel}
                      </span>
                    {/if}
                  </div>
                </td>
                <td class="hidden px-3 py-2.5 sm:table-cell">
                  {#if !file.trashedAt}
                    <button
                      type="button"
                      onclick={() => handleToggleShare(file)}
                      class="cursor-pointer rounded border px-1.5 py-0.5 text-[10px] font-medium transition {file.shared
                        ? 'border-[#54d483]/40 bg-[#54d483]/10 text-[#239f50] dark:text-[#54d483]'
                        : 'border-oc-border bg-oc-bg text-oc-faint hover:text-oc-strong'}"
                    >
                      {file.shared ? "공개 링크" : "비공개"}
                    </button>
                  {:else}
                    <span class="text-oc-faint">차단됨</span>
                  {/if}
                </td>
                <td class="hidden px-3 py-2.5 font-mono text-[11px] text-oc-muted md:table-cell">
                  {formatDateKo(file.updatedAt)}
                </td>
                <td class="px-3 py-2.5 text-right font-mono text-oc-muted">
                  {formatBytes(file.size)}
                </td>
                <td class="px-3 py-2.5 text-right">
                  <div class="inline-flex items-center gap-1">
                    {#if currentView === "trash"}
                      <button
                        type="button"
                        onclick={() =>
                          handleRestore([{ kind: "file", id: file.id }])}
                        class="cursor-pointer rounded border border-oc-border bg-oc-bg px-2 py-1 text-[11px] text-oc-strong hover:bg-oc-hover"
                      >
                        복원
                      </button>
                      <button
                        type="button"
                        onclick={() =>
                          (actionModal = {
                            type: "confirmDelete",
                            mode: "permanent",
                            items: [{ kind: "file", id: file.id }],
                            countLabel: `파일 '${file.name}'`,
                          })}
                        class="cursor-pointer rounded border border-red-500/30 bg-red-500/5 px-2 py-1 text-[11px] text-red-400 hover:bg-red-500/15"
                      >
                        삭제
                      </button>
                    {:else}
                      <button
                        type="button"
                        onclick={() =>
                          handleToggleStar([{ kind: "file", id: file.id }])}
                        title="별표"
                        class="cursor-pointer rounded p-1 text-oc-faint hover:bg-oc-hover hover:text-oc-strong"
                      >
                        <Icon
                          name={file.starred ? "starFilled" : "star"}
                          class="size-3.5 {file.starred ? 'text-amber-400' : ''}"
                        />
                      </button>
                      <button
                        type="button"
                        onclick={() => copyPublicUrl(file)}
                        title="URL 복사"
                        class="cursor-pointer rounded p-1 {file.shared
                          ? 'text-oc-strong hover:bg-oc-hover'
                          : 'text-oc-faint hover:text-oc-text'}"
                      >
                        <Icon name="copy" class="size-3.5" />
                      </button>
                      {#if r2Configured}
                        <button
                          type="button"
                          onclick={() => copyFilesToR2([file.id])}
                          title="R2 CDN으로 복제"
                          class="cursor-pointer rounded p-1 text-oc-muted hover:bg-[#54d483]/15 hover:text-[#239f50] dark:hover:text-[#54d483]"
                        >
                          <Icon name="globe" class="size-3.5" />
                        </button>
                      {/if}
                      <button
                        type="button"
                        onclick={() => downloadFile(file)}
                        title="다운로드"
                        class="cursor-pointer rounded p-1 text-oc-muted hover:bg-oc-hover hover:text-oc-strong"
                      >
                        <Icon name="download" class="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onclick={() =>
                          (actionModal = {
                            type: "rename",
                            kind: "file",
                            id: file.id,
                            currentName: file.name,
                          })}
                        title="이름 변경"
                        class="cursor-pointer rounded p-1 text-oc-muted hover:bg-oc-hover hover:text-oc-strong"
                      >
                        <Icon name="edit" class="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onclick={() =>
                          (actionModal = {
                            type: "move",
                            items: [{ kind: "file", id: file.id }],
                            title: `'${file.name}' 이동`,
                          })}
                        title="이동"
                        class="cursor-pointer rounded p-1 text-oc-muted hover:bg-oc-hover hover:text-oc-strong"
                      >
                        <Icon name="move" class="size-3.5" />
                      </button>
                      <button
                        type="button"
                        onclick={() =>
                          handleTrash([{ kind: "file", id: file.id }])}
                        title="휴지통"
                        class="cursor-pointer rounded p-1 text-oc-muted hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Icon name="trash" class="size-3.5" />
                      </button>
                    {/if}
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

<!-- Upload Queue Dock -->
{#if uploadQueue.length > 0}
  <div class="fixed bottom-4 right-4 z-40 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-oc-border bg-oc-surface shadow-2xl">
    <div class="flex items-center justify-between gap-2 border-b border-oc-border bg-oc-subtle px-3.5 py-2.5 text-xs">
      <span class="font-semibold text-oc-strong">
        {#if uploadStats.active}
          업로드 중 ({uploadStats.done}/{uploadStats.total}) · {uploadStats.pct}%
        {:else if uploadStats.errors > 0}
          업로드 완료 (실패 {uploadStats.errors}건)
        {:else}
          {uploadStats.total}개 업로드 완료
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
      aria-label="전체 업로드 진행률"
    >
      <rect
        x="0"
        y="0"
        width={uploadStats.pct}
        height="4"
        class={uploadStats.errors > 0 ? "fill-amber-400" : "fill-oc-strong"}
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
                    title="업로드 취소"
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
                <rect x="0" y="0" width={item.progress} height="3" class="fill-oc-strong" />
              </svg>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<!-- Toast notification -->
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

<DriveActionModals
  modal={actionModal}
  {folderTree}
  busy={actionBusy}
  onClose={() => (actionModal = null)}
  onCreateFolder={handleCreateFolder}
  onRename={handleRename}
  onMove={handleMove}
  onConfirmDelete={handleConfirmDelete}
/>

<DrivePreviewModal
  file={previewFile}
  {sessionToken}
  {r2Configured}
  hasPrev={previewIndex > 0}
  hasNext={previewIndex >= 0 && previewIndex < files.length - 1}
  onClose={() => (previewFile = null)}
  onPrev={() => {
    if (previewIndex > 0) previewFile = files[previewIndex - 1];
  }}
  onNext={() => {
    if (previewIndex >= 0 && previewIndex < files.length - 1) {
      previewFile = files[previewIndex + 1];
    }
  }}
  onToggleShare={handleToggleShare}
  onCopyLink={copyPublicUrl}
  onCopyMarkdown={copyMarkdownLink}
  onDownload={downloadFile}
  onCopyToR2={(f) => void copyFilesToR2([f.id])}
  onToggleStar={(f) => handleToggleStar([{ kind: "file", id: f.id }])}
  onRename={(f) =>
    (actionModal = {
      type: "rename",
      kind: "file",
      id: f.id,
      currentName: f.name,
    })}
  onMove={(f) =>
    (actionModal = {
      type: "move",
      items: [{ kind: "file", id: f.id }],
      title: `'${f.name}' 이동`,
    })}
  onTrash={(f) => handleTrash([{ kind: "file", id: f.id }])}
  onRestore={(f) => handleRestore([{ kind: "file", id: f.id }])}
  onDeletePermanent={(f) =>
    (actionModal = {
      type: "confirmDelete",
      mode: "permanent",
      items: [{ kind: "file", id: f.id }],
      countLabel: `파일 '${f.name}'`,
    })}
  {onSessionExpired}
/>
