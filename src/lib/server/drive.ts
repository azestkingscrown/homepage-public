import crypto from "node:crypto";
import fs from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  classifyFile,
  type DriveBreadcrumb,
  type DriveCategoryFilter,
  type DriveFile,
  type DriveFileItem,
  type DriveFolder,
  type DriveFolderItem,
  type DriveFolderTreeNode,
  type DriveItemRef,
  type DriveListResponse,
  type DriveSortDir,
  type DriveSortField,
  type DriveStorageStats,
  type DriveView,
} from "#lib/driveTypes.ts";

const MAX_FOLDER_DEPTH = 12;
const MAX_TOTAL_FOLDERS = 2000;
const MAX_DISPLAY_NAME_LEN = 120;
const MAX_BATCH_ITEMS = 200;

interface DriveIndexData {
  version: 1;
  folders: Record<string, DriveFolder>;
  files: Record<string, DriveFile>;
}

/** Domain error carrying an HTTP status code for API handlers. */
export class DriveError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "DriveError";
    this.status = status;
  }
}

function getUploadsDir(): string {
  return path.resolve(process.cwd(), "public", "uploads");
}

function getDataDir(): string {
  return path.resolve(process.cwd(), "data");
}

function getIndexFilePath(): string {
  return path.resolve(getDataDir(), "drive-index.json");
}

// Serialize all metadata reads/reconciles/writes to avoid lost updates under concurrency.
let lockChain: Promise<void> = Promise.resolve();

function withDriveLock<T>(fn: () => Promise<T>): Promise<T> {
  const result = lockChain.then(fn, fn);
  lockChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

// Lightweight mtime cache used primarily by public /uploads/[filename] lookups.
let cachedIndexPath = "";
let cachedMtimeMs = -1;
let cachedIndex: DriveIndexData | null = null;

/** Validate storage filename placed directly inside public/uploads. */
export function isSafeStorageName(filename: string): boolean {
  if (!filename || typeof filename !== "string") return false;
  if (filename === "." || filename === ".." || filename.includes("..")) {
    return false;
  }
  return /^[a-zA-Z0-9._-]+$/.test(filename);
}

/** Validate and normalize a user-visible file or folder name. */
export function validateDisplayName(rawName: unknown): string {
  if (typeof rawName !== "string") {
    throw new DriveError("이름은 문자열이어야 합니다.", 400);
  }
  const trimmed = rawName.trim();
  if (!trimmed || trimmed.length > MAX_DISPLAY_NAME_LEN) {
    throw new DriveError(
      `이름은 1~${MAX_DISPLAY_NAME_LEN}자 사이여야 합니다.`,
      400,
    );
  }
  if (trimmed === "." || trimmed === "..") {
    throw new DriveError("'.' 또는 '..'는 이름으로 사용할 수 없습니다.", 400);
  }
  for (let i = 0; i < trimmed.length; i += 1) {
    const code = trimmed.charCodeAt(i);
    if (
      code < 0x20 ||
      code === 0x7f ||
      trimmed[i] === "/" ||
      trimmed[i] === "\\"
    ) {
      throw new DriveError(
        "이름에 '/', '\\' 또는 제어 문자를 포함할 수 없습니다.",
        400,
      );
    }
  }
  return trimmed;
}

function deriveLegacyDisplayName(storageName: string): string {
  const stripped = storageName.replace(/^\d{13}-(?:[0-9a-f]{4}-)?/, "");
  if (stripped && stripped !== "." && stripped !== "..") {
    try {
      return validateDisplayName(stripped);
    } catch {
      return storageName;
    }
  }
  return storageName;
}

/** Build an RFC 5987 Content-Disposition header with sanitized ASCII fallback. */
export function buildContentDisposition(
  dispositionType: "inline" | "attachment",
  displayName: string,
): string {
  const safeBase = displayName.replace(/[\r\n"\\]/g, "_").trim() || "download";
  const asciiFallback =
    safeBase.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "download";
  const encoded = encodeURIComponent(safeBase);
  return `${dispositionType}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

/** Resolve and verify an upload path inside public/uploads using lstat + realpath. */
export async function resolveSafeUploadPath(
  storageName: string,
): Promise<{ uploadsDir: string; realFilePath: string; size: number } | null> {
  if (!isSafeStorageName(storageName)) return null;
  const uploadsDir = getUploadsDir();
  const filePath = path.resolve(uploadsDir, storageName);
  if (!filePath.startsWith(uploadsDir + path.sep)) return null;

  const fileStat = await lstat(filePath).catch(() => null);
  if (!fileStat || !fileStat.isFile() || fileStat.isSymbolicLink()) {
    return null;
  }

  const [realUploadsDir, realFilePath] = await Promise.all([
    realpath(uploadsDir),
    realpath(filePath),
  ]);
  if (!realFilePath.startsWith(realUploadsDir + path.sep)) {
    return null;
  }

  return { uploadsDir, realFilePath, size: fileStat.size };
}

function createEmptyIndex(): DriveIndexData {
  return { version: 1, folders: {}, files: {} };
}

async function readIndexRaw(): Promise<DriveIndexData> {
  const indexPath = getIndexFilePath();
  try {
    const raw = await readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<DriveIndexData>;
    if (!parsed || typeof parsed !== "object") return createEmptyIndex();
    return {
      version: 1,
      folders:
        parsed.folders && typeof parsed.folders === "object"
          ? { ...parsed.folders }
          : {},
      files:
        parsed.files && typeof parsed.files === "object"
          ? { ...parsed.files }
          : {},
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") return createEmptyIndex();
    console.error("[Drive] Failed to read drive-index.json:", error);
    return createEmptyIndex();
  }
}

async function readIndexCached(): Promise<DriveIndexData> {
  const indexPath = getIndexFilePath();
  const fileStat = await stat(indexPath).catch(() => null);
  if (!fileStat) {
    cachedIndex = createEmptyIndex();
    cachedMtimeMs = -1;
    cachedIndexPath = indexPath;
    return cachedIndex;
  }
  if (
    cachedIndex &&
    cachedIndexPath === indexPath &&
    cachedMtimeMs === fileStat.mtimeMs
  ) {
    return cachedIndex;
  }
  const index = await readIndexRaw();
  const afterStat = await stat(indexPath).catch(() => fileStat);
  cachedIndex = index;
  cachedMtimeMs = afterStat.mtimeMs;
  cachedIndexPath = indexPath;
  return index;
}

async function saveIndex(index: DriveIndexData): Promise<void> {
  const dataDir = getDataDir();
  const indexPath = getIndexFilePath();
  await mkdir(dataDir, { recursive: true, mode: 0o700 });

  const tmpPath = path.join(
    dataDir,
    `.drive-index.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`,
  );
  const payload = JSON.stringify(index, null, 2);
  await writeFile(tmpPath, payload, { encoding: "utf8", mode: 0o600 });
  await chmod(tmpPath, 0o600).catch(() => undefined);
  await rename(tmpPath, indexPath);

  const nextStat = await stat(indexPath).catch(() => null);
  cachedIndex = index;
  cachedIndexPath = indexPath;
  cachedMtimeMs = nextStat ? nextStat.mtimeMs : Date.now();
}

function getFolderDepth(index: DriveIndexData, folderId: string | null): number {
  let depth = 0;
  let currentId = folderId;
  const seen = new Set<string>();
  while (currentId) {
    if (seen.has(currentId)) break;
    seen.add(currentId);
    const folder = index.folders[currentId];
    if (!folder) break;
    depth += 1;
    currentId = folder.parentId;
  }
  return depth;
}

function getMaxSubtreeDepth(index: DriveIndexData, folderId: string): number {
  const childrenByParent = new Map<string, string[]>();
  for (const folder of Object.values(index.folders)) {
    if (folder.parentId) {
      const list = childrenByParent.get(folder.parentId) || [];
      list.push(folder.id);
      childrenByParent.set(folder.parentId, list);
    }
  }
  const visited = new Set<string>();
  function dfs(id: string): number {
    if (visited.has(id)) return 0;
    visited.add(id);
    const children = childrenByParent.get(id) || [];
    let maxChild = 0;
    for (const childId of children) {
      maxChild = Math.max(maxChild, 1 + dfs(childId));
    }
    return maxChild;
  }
  return dfs(folderId);
}

function isFolderAncestorOrSelf(
  index: DriveIndexData,
  candidateParentId: string | null,
  movingFolderId: string,
): boolean {
  let curr = candidateParentId;
  const seen = new Set<string>();
  while (curr) {
    if (curr === movingFolderId) return true;
    if (seen.has(curr)) break;
    seen.add(curr);
    curr = index.folders[curr]?.parentId ?? null;
  }
  return false;
}

/** Check whether a folder or file is trashed directly or via any ancestor folder. */
export function isEffectivelyTrashed(
  index: DriveIndexData,
  item: Pick<DriveFolder, "trashedAt" | "parentId"> | Pick<DriveFile, "trashedAt" | "folderId">,
): boolean {
  if (item.trashedAt !== null) return true;
  let curr: string | null =
    "parentId" in item ? item.parentId : item.folderId;
  const seen = new Set<string>();
  while (curr) {
    if (seen.has(curr)) break;
    seen.add(curr);
    const folder = index.folders[curr];
    if (!folder) break;
    if (folder.trashedAt !== null) return true;
    curr = folder.parentId;
  }
  return false;
}

function hasTrashedAncestor(
  index: DriveIndexData,
  parentId: string | null,
): boolean {
  let curr = parentId;
  const seen = new Set<string>();
  while (curr) {
    if (seen.has(curr)) break;
    seen.add(curr);
    const folder = index.folders[curr];
    if (!folder) break;
    if (folder.trashedAt !== null) return true;
    curr = folder.parentId;
  }
  return false;
}

function getFolderPathLabel(
  index: DriveIndexData,
  folderId: string | null,
): string {
  if (!folderId) return "내 드라이브";
  const parts: string[] = [];
  let curr: string | null = folderId;
  const seen = new Set<string>();
  while (curr) {
    if (seen.has(curr)) break;
    seen.add(curr);
    const folder: DriveFolder | undefined = index.folders[curr];
    if (!folder) break;
    parts.unshift(folder.name);
    curr = folder.parentId;
  }
  return parts.length > 0 ? `내 드라이브 / ${parts.join(" / ")}` : "내 드라이브";
}

async function reconcileIndex(index: DriveIndexData): Promise<boolean> {
  let changed = false;
  const uploadsDir = getUploadsDir();
  const dirEntries = await readdir(uploadsDir).catch(() => []);

  const diskFiles = new Map<
    string,
    { size: number; birthtimeMs: number; mtimeMs: number }
  >();

  const realUploadsDir = await realpath(uploadsDir).catch(() => uploadsDir);

  for (const entry of dirEntries) {
    if (entry.startsWith(".") || !isSafeStorageName(entry)) continue;
    const fullPath = path.resolve(uploadsDir, entry);
    if (!fullPath.startsWith(uploadsDir + path.sep)) continue;
    const fileStat = await lstat(fullPath).catch(() => null);
    if (!fileStat || !fileStat.isFile() || fileStat.isSymbolicLink()) continue;
    const realFilePath = await realpath(fullPath).catch(() => "");
    if (!realFilePath || !realFilePath.startsWith(realUploadsDir + path.sep)) {
      continue;
    }
    diskFiles.set(entry, {
      size: fileStat.size,
      birthtimeMs: fileStat.birthtimeMs,
      mtimeMs: fileStat.mtimeMs,
    });
  }

  // Repair dangling or cyclic folder parents
  for (const folder of Object.values(index.folders)) {
    if (folder.parentId !== null && !index.folders[folder.parentId]) {
      folder.parentId = null;
      changed = true;
    }
    const seen = new Set<string>([folder.id]);
    let curr = folder.parentId;
    while (curr) {
      if (seen.has(curr)) {
        folder.parentId = null;
        changed = true;
        break;
      }
      seen.add(curr);
      curr = index.folders[curr]?.parentId ?? null;
    }
  }

  // Remove stale file records no longer present on disk and track registered storage names
  const registeredByStorage = new Set<string>();
  for (const [id, file] of Object.entries(index.files)) {
    const diskInfo = diskFiles.get(file.storageName);
    if (!diskInfo) {
      delete index.files[id];
      changed = true;
      continue;
    }
    registeredByStorage.add(file.storageName);
    if (file.folderId !== null && !index.folders[file.folderId]) {
      file.folderId = null;
      changed = true;
    }
    if (file.size !== diskInfo.size) {
      file.size = diskInfo.size;
      changed = true;
    }
  }

  // Auto-register legacy or externally added files in public/uploads as public shared items at root
  for (const [storageName, diskInfo] of diskFiles.entries()) {
    if (registeredByStorage.has(storageName)) continue;
    const ext = path.extname(storageName).toLowerCase();
    const { mime, category } = classifyFile(ext);
    const createdIso = new Date(
      diskInfo.birthtimeMs || diskInfo.mtimeMs || Date.now(),
    ).toISOString();
    const updatedIso = new Date(
      diskInfo.mtimeMs || Date.now(),
    ).toISOString();
    const id = crypto.randomUUID();
    index.files[id] = {
      id,
      storageName,
      name: deriveLegacyDisplayName(storageName),
      folderId: null,
      size: diskInfo.size,
      ext,
      mime,
      category,
      starred: false,
      shared: true,
      trashedAt: null,
      createdAt: createdIso,
      updatedAt: updatedIso,
    };
    changed = true;
  }

  return changed;
}

async function loadReconciledIndex(persist = true): Promise<DriveIndexData> {
  const index = await readIndexRaw();
  const changed = await reconcileIndex(index);
  if (changed && persist) {
    await saveIndex(index);
  }
  return index;
}

function buildFolderTree(index: DriveIndexData): DriveFolderTreeNode[] {
  const activeFolders = Object.values(index.folders).filter(
    (folder) => !isEffectivelyTrashed(index, folder),
  );
  const childrenMap = new Map<string | null, DriveFolder[]>();
  for (const folder of activeFolders) {
    const key = folder.parentId;
    const list = childrenMap.get(key) || [];
    list.push(folder);
    childrenMap.set(key, list);
  }
  for (const list of childrenMap.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }

  const result: DriveFolderTreeNode[] = [];
  const visited = new Set<string>();
  function walk(parentId: string | null, depth: number) {
    const children = childrenMap.get(parentId) || [];
    for (const child of children) {
      if (visited.has(child.id)) continue;
      visited.add(child.id);
      result.push({
        id: child.id,
        name: child.name,
        parentId: child.parentId,
        depth,
      });
      walk(child.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

function buildBreadcrumbs(
  index: DriveIndexData,
  folderId: string | null,
): DriveBreadcrumb[] {
  const crumbs: DriveBreadcrumb[] = [{ id: null, name: "내 드라이브" }];
  if (!folderId) return crumbs;
  const trail: DriveBreadcrumb[] = [];
  let curr: string | null = folderId;
  const seen = new Set<string>();
  while (curr) {
    if (seen.has(curr)) break;
    seen.add(curr);
    const folder: DriveFolder | undefined = index.folders[curr];
    if (!folder) break;
    trail.unshift({ id: folder.id, name: folder.name });
    curr = folder.parentId;
  }
  return [...crumbs, ...trail];
}

function computeStats(index: DriveIndexData): DriveStorageStats {
  let usedBytes = 0;
  let activeFiles = 0;
  let activeFolders = 0;
  let trashBytes = 0;
  let trashItems = 0;

  for (const folder of Object.values(index.folders)) {
    if (isEffectivelyTrashed(index, folder)) {
      if (
        folder.trashedAt !== null &&
        !hasTrashedAncestor(index, folder.parentId)
      ) {
        trashItems += 1;
      }
    } else {
      activeFolders += 1;
    }
  }

  for (const file of Object.values(index.files)) {
    if (isEffectivelyTrashed(index, file)) {
      trashBytes += file.size;
      if (
        file.trashedAt !== null &&
        !hasTrashedAncestor(index, file.folderId)
      ) {
        trashItems += 1;
      }
    } else {
      usedBytes += file.size;
      activeFiles += 1;
    }
  }

  let diskFreeBytes: number | null = null;
  let diskTotalBytes: number | null = null;
  try {
    const targetDir = fs.existsSync(getUploadsDir())
      ? getUploadsDir()
      : process.cwd();
    const fsStats = fs.statfsSync(targetDir);
    const bsize = Number(fsStats.bsize);
    diskFreeBytes = Number(fsStats.bavail) * bsize;
    diskTotalBytes = Number(fsStats.blocks) * bsize;
  } catch {
    diskFreeBytes = null;
    diskTotalBytes = null;
  }

  return {
    usedBytes,
    activeFiles,
    activeFolders,
    trashBytes,
    trashItems,
    diskFreeBytes,
    diskTotalBytes,
  };
}

function matchesCategoryFilter(
  file: DriveFile,
  category: DriveCategoryFilter,
): boolean {
  if (category === "all") return true;
  if (category === "media") {
    return file.category === "video" || file.category === "audio";
  }
  return file.category === category;
}

function compareBySort<T extends { name: string; updatedAt: string; size?: number }>(
  a: T,
  b: T,
  sort: DriveSortField,
  dir: DriveSortDir,
): number {
  const mult = dir === "asc" ? 1 : -1;
  if (sort === "name") {
    return a.name.localeCompare(b.name, "ko") * mult;
  }
  if (sort === "size") {
    const diff = ((a.size ?? 0) - (b.size ?? 0)) * mult;
    if (diff !== 0) return diff;
  }
  const timeDiff =
    (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * mult;
  if (timeDiff !== 0) return timeDiff;
  return a.name.localeCompare(b.name, "ko");
}

function countDirectActiveChildren(
  index: DriveIndexData,
  folderId: string,
): number {
  let count = 0;
  for (const f of Object.values(index.folders)) {
    if (f.parentId === folderId && !isEffectivelyTrashed(index, f)) count += 1;
  }
  for (const file of Object.values(index.files)) {
    if (file.folderId === folderId && !isEffectivelyTrashed(index, file)) {
      count += 1;
    }
  }
  return count;
}

export interface ListDriveOptions {
  view?: DriveView;
  folderId?: string | null;
  q?: string;
  category?: DriveCategoryFilter;
  sort?: DriveSortField;
  dir?: DriveSortDir;
}

/** Query folders, files, breadcrumbs, tree, and disk usage for a Drive view. */
export function listDriveView(
  options: ListDriveOptions = {},
): Promise<DriveListResponse> {
  return withDriveLock(async () => {
    const index = await loadReconciledIndex(true);
    const view: DriveView = options.view || "my-drive";
    const query = (options.q || "").trim().toLowerCase();
    const category: DriveCategoryFilter = options.category || "all";
    const sort: DriveSortField = options.sort || "updated";
    const dir: DriveSortDir = options.dir || (sort === "name" ? "asc" : "desc");

    let currentFolderId: string | null =
      view === "my-drive" && options.folderId ? options.folderId : null;
    if (currentFolderId) {
      const target = index.folders[currentFolderId];
      if (!target || isEffectivelyTrashed(index, target)) {
        throw new DriveError("요청한 폴더를 찾을 수 없습니다.", 404);
      }
    }

    const breadcrumbs =
      view === "my-drive" && !query
        ? buildBreadcrumbs(index, currentFolderId)
        : [
            {
              id: null,
              name:
                view === "recent"
                  ? "최근 항목"
                  : view === "starred"
                    ? "중요 문서함"
                    : view === "shared"
                      ? "공유 링크됨"
                      : view === "trash"
                        ? "휴지통"
                        : "내 드라이브",
            },
          ];

    let rawFolders: DriveFolder[] = [];
    let rawFiles: DriveFile[] = [];

    if (view === "my-drive") {
      if (query) {
        rawFolders = Object.values(index.folders).filter(
          (f) =>
            !isEffectivelyTrashed(index, f) &&
            f.name.toLowerCase().includes(query),
        );
        rawFiles = Object.values(index.files).filter(
          (file) =>
            !isEffectivelyTrashed(index, file) &&
            file.name.toLowerCase().includes(query),
        );
      } else {
        rawFolders = Object.values(index.folders).filter(
          (f) =>
            f.parentId === currentFolderId && !isEffectivelyTrashed(index, f),
        );
        rawFiles = Object.values(index.files).filter(
          (file) =>
            file.folderId === currentFolderId &&
            !isEffectivelyTrashed(index, file),
        );
      }
    } else if (view === "recent") {
      rawFiles = Object.values(index.files).filter(
        (file) => !isEffectivelyTrashed(index, file),
      );
    } else if (view === "starred") {
      rawFolders = Object.values(index.folders).filter(
        (f) => f.starred && !isEffectivelyTrashed(index, f),
      );
      rawFiles = Object.values(index.files).filter(
        (file) => file.starred && !isEffectivelyTrashed(index, file),
      );
    } else if (view === "shared") {
      rawFiles = Object.values(index.files).filter(
        (file) => file.shared && !isEffectivelyTrashed(index, file),
      );
    } else if (view === "trash") {
      rawFolders = Object.values(index.folders).filter(
        (f) => f.trashedAt !== null && !hasTrashedAncestor(index, f.parentId),
      );
      rawFiles = Object.values(index.files).filter(
        (file) =>
          file.trashedAt !== null && !hasTrashedAncestor(index, file.folderId),
      );
    }

    if (query && view !== "my-drive") {
      rawFolders = rawFolders.filter((f) =>
        f.name.toLowerCase().includes(query),
      );
      rawFiles = rawFiles.filter((file) =>
        file.name.toLowerCase().includes(query),
      );
    }

    if (category !== "all") {
      // Category filter targets specific file types; hide folders unless browsing all.
      rawFolders = [];
      rawFiles = rawFiles.filter((file) => matchesCategoryFilter(file, category));
    }

    const showPathLabel = view !== "my-drive" || Boolean(query);

    const folders: DriveFolderItem[] = rawFolders
      .map((f) => ({
        ...f,
        itemCount: countDirectActiveChildren(index, f.id),
        pathLabel: showPathLabel
          ? getFolderPathLabel(index, f.parentId)
          : undefined,
      }))
      .sort((a, b) => compareBySort(a, b, sort === "size" ? "name" : sort, dir));

    const files: DriveFileItem[] = rawFiles
      .map((file) => ({
        ...file,
        url: `/uploads/${file.storageName}`,
        pathLabel: showPathLabel
          ? getFolderPathLabel(index, file.folderId)
          : undefined,
      }))
      .sort((a, b) => compareBySort(a, b, sort, dir));

    return {
      view,
      currentFolderId,
      breadcrumbs,
      folders,
      files: view === "recent" && !query && category === "all" ? files.slice(0, 100) : files,
      folderTree: buildFolderTree(index),
      stats: computeStats(index),
    };
  });
}

/** Return active image files matching legacy GET /api/images shape. */
export function listLegacyImages(): Promise<
  { name: string; url: string; size: number; mtime: string }[]
> {
  return withDriveLock(async () => {
    const index = await loadReconciledIndex(true);
    return Object.values(index.files)
      .filter(
        (file) =>
          file.category === "image" &&
          [".jpg", ".jpeg", ".png", ".gif", ".webp"].includes(
            file.ext.toLowerCase(),
          ) &&
          !isEffectivelyTrashed(index, file),
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      )
      .map((file) => ({
        name: file.storageName,
        url: `/uploads/${file.storageName}`,
        size: file.size,
        mtime: file.updatedAt,
      }));
  });
}

/** Create a new folder under parentId (or root when null). */
export function createFolder(
  rawName: unknown,
  parentId: string | null = null,
): Promise<DriveFolder> {
  return withDriveLock(async () => {
    const name = validateDisplayName(rawName);
    const index = await loadReconciledIndex(true);

    if (Object.keys(index.folders).length >= MAX_TOTAL_FOLDERS) {
      throw new DriveError(
        `최대 폴더 수(${MAX_TOTAL_FOLDERS}개)를 초과할 수 없습니다.`,
        400,
      );
    }

    if (parentId !== null) {
      const parent = index.folders[parentId];
      if (!parent || isEffectivelyTrashed(index, parent)) {
        throw new DriveError("상위 폴더를 찾을 수 없습니다.", 404);
      }
      if (getFolderDepth(index, parentId) >= MAX_FOLDER_DEPTH) {
        throw new DriveError(
          `폴더 깊이는 최대 ${MAX_FOLDER_DEPTH}단계까지 생성할 수 있습니다.`,
          400,
        );
      }
    }

    const duplicate = Object.values(index.folders).find(
      (f) =>
        f.parentId === parentId &&
        !isEffectivelyTrashed(index, f) &&
        f.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      throw new DriveError(
        "같은 위치에 동일한 이름의 폴더가 이미 있습니다.",
        409,
      );
    }

    const now = new Date().toISOString();
    const folder: DriveFolder = {
      id: crypto.randomUUID(),
      name,
      parentId,
      starred: false,
      trashedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    index.folders[folder.id] = folder;
    await saveIndex(index);
    return folder;
  });
}

/** Find or create nested folders along relative segments for folder upload. */
export function ensureFolderPath(
  baseParentId: string | null,
  rawSegments: string[],
): Promise<string | null> {
  return withDriveLock(async () => {
    const segments = rawSegments
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && s !== ".");
    if (segments.length === 0) return baseParentId;

    const index = await loadReconciledIndex(true);
    let currentParentId = baseParentId;
    if (currentParentId !== null) {
      const base = index.folders[currentParentId];
      if (!base || isEffectivelyTrashed(index, base)) {
        throw new DriveError("대상 상위 폴더를 찾을 수 없습니다.", 404);
      }
    }

    let currentDepth = getFolderDepth(index, currentParentId);
    let modified = false;

    for (const seg of segments) {
      const validSeg = validateDisplayName(seg);
      const existing = Object.values(index.folders).find(
        (f) =>
          f.parentId === currentParentId &&
          !isEffectivelyTrashed(index, f) &&
          f.name.toLowerCase() === validSeg.toLowerCase(),
      );
      if (existing) {
        currentParentId = existing.id;
        currentDepth += 1;
        continue;
      }
      if (Object.keys(index.folders).length >= MAX_TOTAL_FOLDERS) {
        throw new DriveError(
          `최대 폴더 수(${MAX_TOTAL_FOLDERS}개)를 초과할 수 없습니다.`,
          400,
        );
      }
      if (currentDepth >= MAX_FOLDER_DEPTH) {
        throw new DriveError(
          `폴더 깊이는 최대 ${MAX_FOLDER_DEPTH}단계까지 생성할 수 있습니다.`,
          400,
        );
      }
      const now = new Date().toISOString();
      const created: DriveFolder = {
        id: crypto.randomUUID(),
        name: validSeg,
        parentId: currentParentId,
        starred: false,
        trashedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      index.folders[created.id] = created;
      currentParentId = created.id;
      currentDepth += 1;
      modified = true;
    }

    if (modified) {
      await saveIndex(index);
    }
    return currentParentId;
  });
}

/** Register a newly uploaded disk file in drive-index.json. */
export function registerUploadedFile(input: {
  storageName: string;
  displayName: string;
  size: number;
  ext: string;
  folderId: string | null;
  shared: boolean;
}): Promise<DriveFileItem> {
  return withDriveLock(async () => {
    const index = await loadReconciledIndex(false);
    let targetFolderId = input.folderId;
    if (targetFolderId !== null) {
      const folder = index.folders[targetFolderId];
      if (!folder || isEffectivelyTrashed(index, folder)) {
        targetFolderId = null;
      }
    }

    let existingEntry = Object.values(index.files).find(
      (f) => f.storageName === input.storageName,
    );
    const { mime, category } = classifyFile(input.ext);
    const now = new Date().toISOString();
    let displayName: string;
    try {
      displayName = validateDisplayName(input.displayName);
    } catch {
      displayName = input.storageName;
    }

    if (existingEntry) {
      existingEntry.name = displayName;
      existingEntry.folderId = targetFolderId;
      existingEntry.size = input.size;
      existingEntry.ext = input.ext.toLowerCase();
      existingEntry.mime = mime;
      existingEntry.category = category;
      existingEntry.shared = input.shared;
      existingEntry.trashedAt = null;
      existingEntry.updatedAt = now;
    } else {
      existingEntry = {
        id: crypto.randomUUID(),
        storageName: input.storageName,
        name: displayName,
        folderId: targetFolderId,
        size: input.size,
        ext: input.ext.toLowerCase(),
        mime,
        category,
        starred: false,
        shared: input.shared,
        trashedAt: null,
        createdAt: now,
        updatedAt: now,
      };
      index.files[existingEntry.id] = existingEntry;
    }

    await saveIndex(index);
    return {
      ...existingEntry,
      url: `/uploads/${existingEntry.storageName}`,
    };
  });
}

/** Rename a folder or file (display name only; public storageName remains unchanged). */
export function renameItem(
  kind: "folder" | "file",
  id: string,
  rawName: unknown,
): Promise<void> {
  return withDriveLock(async () => {
    const newName = validateDisplayName(rawName);
    const index = await loadReconciledIndex(true);
    const now = new Date().toISOString();

    if (kind === "folder") {
      const folder = index.folders[id];
      if (!folder) throw new DriveError("폴더를 찾을 수 없습니다.", 404);
      const duplicate = Object.values(index.folders).find(
        (f) =>
          f.id !== id &&
          f.parentId === folder.parentId &&
          !isEffectivelyTrashed(index, f) &&
          f.name.toLowerCase() === newName.toLowerCase(),
      );
      if (duplicate) {
        throw new DriveError(
          "같은 위치에 동일한 이름의 폴더가 이미 있습니다.",
          409,
        );
      }
      folder.name = newName;
      folder.updatedAt = now;
    } else {
      const file = index.files[id];
      if (!file) throw new DriveError("파일을 찾을 수 없습니다.", 404);
      file.name = newName;
      file.updatedAt = now;
    }

    await saveIndex(index);
  });
}

function validateBatchItems(items: DriveItemRef[]): DriveItemRef[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw new DriveError("선택된 항목이 없습니다.", 400);
  }
  if (items.length > MAX_BATCH_ITEMS) {
    throw new DriveError(
      `한 번에 최대 ${MAX_BATCH_ITEMS}개 항목까지 처리할 수 있습니다.`,
      400,
    );
  }
  const unique = new Map<string, DriveItemRef>();
  for (const item of items) {
    if (
      !item ||
      (item.kind !== "folder" && item.kind !== "file") ||
      typeof item.id !== "string" ||
      !item.id
    ) {
      throw new DriveError("잘못된 항목 형식입니다.", 400);
    }
    unique.set(`${item.kind}:${item.id}`, item);
  }
  return [...unique.values()];
}

/** Move files and folders to targetFolderId (or null for root), preventing cycles. */
export function moveItems(
  rawItems: DriveItemRef[],
  targetFolderId: string | null,
): Promise<void> {
  return withDriveLock(async () => {
    const items = validateBatchItems(rawItems);
    const index = await loadReconciledIndex(true);

    let targetDepth = 0;
    if (targetFolderId !== null) {
      const targetFolder = index.folders[targetFolderId];
      if (!targetFolder || isEffectivelyTrashed(index, targetFolder)) {
        throw new DriveError("이동할 대상 폴더를 찾을 수 없습니다.", 404);
      }
      targetDepth = getFolderDepth(index, targetFolderId);
    }

    const now = new Date().toISOString();

    for (const item of items) {
      if (item.kind === "folder") {
        const folder = index.folders[item.id];
        if (!folder || isEffectivelyTrashed(index, folder)) {
          throw new DriveError("이동하려는 폴더를 찾을 수 없습니다.", 404);
        }
        if (isFolderAncestorOrSelf(index, targetFolderId, folder.id)) {
          throw new DriveError(
            "폴더를 자기 자신 또는 하위 폴더로 이동할 수 없습니다.",
            400,
          );
        }
        const subtreeDepth = getMaxSubtreeDepth(index, folder.id);
        if (targetDepth + 1 + subtreeDepth > MAX_FOLDER_DEPTH) {
          throw new DriveError(
            `폴더 깊이는 최대 ${MAX_FOLDER_DEPTH}단계까지만 허용됩니다.`,
            400,
          );
        }
        const duplicate = Object.values(index.folders).find(
          (f) =>
            f.id !== folder.id &&
            f.parentId === targetFolderId &&
            !isEffectivelyTrashed(index, f) &&
            f.name.toLowerCase() === folder.name.toLowerCase(),
        );
        if (duplicate) {
          throw new DriveError(
            `대상 폴더에 '${folder.name}' 폴더가 이미 있습니다.`,
            409,
          );
        }
        folder.parentId = targetFolderId;
        folder.updatedAt = now;
      } else {
        const file = index.files[item.id];
        if (!file || isEffectivelyTrashed(index, file)) {
          throw new DriveError("이동하려는 파일을 찾을 수 없습니다.", 404);
        }
        file.folderId = targetFolderId;
        file.updatedAt = now;
      }
    }

    await saveIndex(index);
  });
}

/** Set or toggle starred state on selected folders/files. */
export function toggleStar(
  rawItems: DriveItemRef[],
  starred?: boolean,
): Promise<void> {
  return withDriveLock(async () => {
    const items = validateBatchItems(rawItems);
    const index = await loadReconciledIndex(true);

    for (const item of items) {
      const target =
        item.kind === "folder" ? index.folders[item.id] : index.files[item.id];
      if (!target) {
        throw new DriveError("대상 항목을 찾을 수 없습니다.", 404);
      }
      target.starred =
        typeof starred === "boolean" ? starred : !target.starred;
    }

    await saveIndex(index);
  });
}

/** Set or toggle public link sharing state on selected files. */
export function toggleShare(
  fileIds: string[],
  shared?: boolean,
): Promise<{ shared: boolean } | void> {
  return withDriveLock(async () => {
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      throw new DriveError("대상 파일이 없습니다.", 400);
    }
    if (fileIds.length > MAX_BATCH_ITEMS) {
      throw new DriveError(
        `한 번에 최대 ${MAX_BATCH_ITEMS}개 파일까지 변경할 수 있습니다.`,
        400,
      );
    }
    const index = await loadReconciledIndex(true);
    let lastShared = false;
    for (const id of new Set(fileIds)) {
      const file = index.files[id];
      if (!file) throw new DriveError("파일을 찾을 수 없습니다.", 404);
      file.shared = typeof shared === "boolean" ? shared : !file.shared;
      lastShared = file.shared;
    }
    await saveIndex(index);
    if (fileIds.length === 1) return { shared: lastShared };
  });
}

/** Soft-delete items to trash. */
export function trashItems(rawItems: DriveItemRef[]): Promise<void> {
  return withDriveLock(async () => {
    const items = validateBatchItems(rawItems);
    const index = await loadReconciledIndex(true);
    const now = new Date().toISOString();

    for (const item of items) {
      const target =
        item.kind === "folder" ? index.folders[item.id] : index.files[item.id];
      if (!target) continue;
      if (target.trashedAt === null) {
        target.trashedAt = now;
        target.updatedAt = now;
      }
    }

    await saveIndex(index);
  });
}

/** Restore items from trash (moving orphaned children to root if parent stays trashed/missing). */
export function restoreItems(rawItems: DriveItemRef[]): Promise<void> {
  return withDriveLock(async () => {
    const items = validateBatchItems(rawItems);
    const index = await loadReconciledIndex(true);
    const now = new Date().toISOString();

    const folderItems = items.filter((i) => i.kind === "folder");
    const fileItems = items.filter((i) => i.kind === "file");

    // Restore folders first so child items moving out with their parent stay nested.
    for (const item of folderItems) {
      const folder = index.folders[item.id];
      if (!folder) continue;
      folder.trashedAt = null;
      folder.updatedAt = now;
    }

    for (const item of folderItems) {
      const folder = index.folders[item.id];
      if (!folder) continue;
      if (
        folder.parentId !== null &&
        (!index.folders[folder.parentId] ||
          isEffectivelyTrashed(index, index.folders[folder.parentId]))
      ) {
        folder.parentId = null;
      }
      // Avoid duplicate active folder names in restored destination
      const siblingConflict = Object.values(index.folders).find(
        (other) =>
          other.id !== folder.id &&
          other.parentId === folder.parentId &&
          !isEffectivelyTrashed(index, other) &&
          other.name.toLowerCase() === folder.name.toLowerCase(),
      );
      if (siblingConflict) {
        folder.name = `${folder.name} (복원)`;
      }
    }

    for (const item of fileItems) {
      const file = index.files[item.id];
      if (!file) continue;
      file.trashedAt = null;
      file.updatedAt = now;
      if (
        file.folderId !== null &&
        (!index.folders[file.folderId] ||
          isEffectivelyTrashed(index, index.folders[file.folderId]))
      ) {
        file.folderId = null;
      }
    }

    await saveIndex(index);
  });
}

function collectFoldersAndFilesToDelete(
  index: DriveIndexData,
  seedItems: DriveItemRef[],
): { folderIds: Set<string>; fileIds: Set<string> } {
  const folderIds = new Set<string>();
  const fileIds = new Set<string>();

  const queue: string[] = [];
  for (const item of seedItems) {
    if (item.kind === "folder" && index.folders[item.id]) {
      if (!folderIds.has(item.id)) {
        folderIds.add(item.id);
        queue.push(item.id);
      }
    } else if (item.kind === "file" && index.files[item.id]) {
      fileIds.add(item.id);
    }
  }

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const folder of Object.values(index.folders)) {
      if (folder.parentId === parentId && !folderIds.has(folder.id)) {
        folderIds.add(folder.id);
        queue.push(folder.id);
      }
    }
    for (const file of Object.values(index.files)) {
      if (file.folderId === parentId) {
        fileIds.add(file.id);
      }
    }
  }

  return { folderIds, fileIds };
}

async function unlinkStorageFileSafely(storageName: string): Promise<void> {
  const resolved = await resolveSafeUploadPath(storageName);
  if (!resolved) return;
  try {
    await unlink(resolved.realFilePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") throw error;
  }
}

/** Permanently delete selected items (recursively for folders) from disk and index. */
export function deletePermanent(
  rawItems: DriveItemRef[],
): Promise<{ deletedFiles: number; deletedFolders: number }> {
  return withDriveLock(async () => {
    const items = validateBatchItems(rawItems);
    const index = await loadReconciledIndex(true);
    const { folderIds, fileIds } = collectFoldersAndFilesToDelete(index, items);

    for (const fileId of fileIds) {
      const file = index.files[fileId];
      if (!file) continue;
      await unlinkStorageFileSafely(file.storageName);
      delete index.files[fileId];
    }
    for (const folderId of folderIds) {
      delete index.folders[folderId];
    }

    await saveIndex(index);
    return { deletedFiles: fileIds.size, deletedFolders: folderIds.size };
  });
}

/** Empty all items currently in the trash permanently. */
export function emptyTrash(): Promise<{
  deletedFiles: number;
  deletedFolders: number;
}> {
  return withDriveLock(async () => {
    const index = await loadReconciledIndex(true);
    const trashedSeeds: DriveItemRef[] = [];
    for (const folder of Object.values(index.folders)) {
      if (folder.trashedAt !== null) {
        trashedSeeds.push({ kind: "folder", id: folder.id });
      }
    }
    for (const file of Object.values(index.files)) {
      if (file.trashedAt !== null) {
        trashedSeeds.push({ kind: "file", id: file.id });
      }
    }
    if (trashedSeeds.length === 0) {
      return { deletedFiles: 0, deletedFolders: 0 };
    }

    const { folderIds, fileIds } = collectFoldersAndFilesToDelete(
      index,
      trashedSeeds,
    );

    for (const fileId of fileIds) {
      const file = index.files[fileId];
      if (!file) continue;
      await unlinkStorageFileSafely(file.storageName);
      delete index.files[fileId];
    }
    for (const folderId of folderIds) {
      delete index.folders[folderId];
    }

    await saveIndex(index);
    return { deletedFiles: fileIds.size, deletedFolders: folderIds.size };
  });
}

/** Sync metadata when legacy POST /api/delete removes a file directly. */
export function removeFileRecordByStorageName(
  storageName: string,
): Promise<void> {
  return withDriveLock(async () => {
    const index = await readIndexRaw();
    let removed = false;
    for (const [id, file] of Object.entries(index.files)) {
      if (file.storageName === storageName) {
        delete index.files[id];
        removed = true;
      }
    }
    if (removed) {
      await saveIndex(index);
    }
  });
}

/** Look up a file by ID for authenticated content preview/download. */
export function getFileById(id: string): Promise<DriveFile | null> {
  return withDriveLock(async () => {
    const index = await loadReconciledIndex(true);
    return index.files[id] ?? null;
  });
}

/** Fast check for public /uploads/[filename] serving. */
export async function getPublicFileAccess(
  storageName: string,
): Promise<{ allowed: boolean; displayName?: string }> {
  const index = await readIndexCached();
  const match = Object.values(index.files).find(
    (file) => file.storageName === storageName,
  );
  if (!match) {
    // Legacy file written before index existed stays readable unless marked private later.
    return { allowed: true };
  }
  if (!match.shared || isEffectivelyTrashed(index, match)) {
    return { allowed: false };
  }
  return { allowed: true, displayName: match.name };
}
