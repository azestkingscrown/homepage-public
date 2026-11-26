export type DriveView = "my-drive" | "recent" | "starred" | "shared" | "trash";

export type DriveFileCategory =
  | "image"
  | "video"
  | "audio"
  | "document"
  | "code"
  | "archive"
  | "other";

export type DriveCategoryFilter = "all" | "media" | DriveFileCategory;

export type DriveSortField = "updated" | "name" | "size";
export type DriveSortDir = "asc" | "desc";

export interface DriveItemRef {
  kind: "folder" | "file";
  id: string;
}

export interface DriveFolder {
  id: string;
  name: string;
  parentId: string | null;
  starred: boolean;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DriveFolderItem extends DriveFolder {
  itemCount: number;
  pathLabel?: string;
}

export interface DriveFile {
  id: string;
  storageName: string;
  name: string;
  folderId: string | null;
  size: number;
  ext: string;
  mime: string;
  category: DriveFileCategory;
  starred: boolean;
  shared: boolean;
  trashedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DriveFileItem extends DriveFile {
  url: string;
  pathLabel?: string;
}

export interface DriveBreadcrumb {
  id: string | null;
  name: string;
}

export interface DriveFolderTreeNode {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
}

export interface DriveStorageStats {
  usedBytes: number;
  activeFiles: number;
  activeFolders: number;
  trashBytes: number;
  trashItems: number;
  diskFreeBytes: number | null;
  diskTotalBytes: number | null;
}

export interface DriveListResponse {
  view: DriveView;
  currentFolderId: string | null;
  breadcrumbs: DriveBreadcrumb[];
  folders: DriveFolderItem[];
  files: DriveFileItem[];
  folderTree: DriveFolderTreeNode[];
  stats: DriveStorageStats;
}

export interface R2FolderItem {
  prefix: string;
  name: string;
}

export interface R2FileItem {
  key: string;
  name: string;
  size: number;
  ext: string;
  mime: string;
  category: DriveFileCategory;
  lastModified: string;
  url: string;
  folderLabel?: string;
}

export interface R2StorageStats {
  usedBytes: number;
  hardCapBytes: number;
  freeTierBytes: number;
  objectCount: number;
  bucketName: string;
  publicUrl: string;
}

export interface R2ListResponse {
  configured: boolean;
  prefix: string;
  breadcrumbs: { prefix: string; name: string }[];
  folders: R2FolderItem[];
  files: R2FileItem[];
  stats: R2StorageStats | null;
}

export const IMAGE_PREVIEW_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".bmp",
]);

export const VIDEO_PREVIEW_EXTS = new Set([".mp4", ".webm", ".mov", ".m4v"]);

export const AUDIO_PREVIEW_EXTS = new Set([
  ".mp3",
  ".wav",
  ".ogg",
  ".flac",
  ".m4a",
  ".aac",
]);

export const TEXT_PREVIEW_EXTS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".json",
  ".csv",
  ".tsv",
  ".log",
  ".yml",
  ".yaml",
  ".toml",
  ".ini",
  ".conf",
  ".cfg",
  ".env",
  ".css",
  ".scss",
  ".sql",
  ".svelte",
  ".jsx",
  ".tsx",
  ".java",
  ".c",
  ".cpp",
  ".h",
  ".rs",
  ".go",
  ".rb",
  ".kt",
  ".swift",
  ".gitignore",
  ".dockerfile",
]);

const MIME_MAP: Record<string, { mime: string; category: DriveFileCategory }> = {
  ".png": { mime: "image/png", category: "image" },
  ".jpg": { mime: "image/jpeg", category: "image" },
  ".jpeg": { mime: "image/jpeg", category: "image" },
  ".gif": { mime: "image/gif", category: "image" },
  ".webp": { mime: "image/webp", category: "image" },
  ".avif": { mime: "image/avif", category: "image" },
  ".bmp": { mime: "image/bmp", category: "image" },
  ".ico": { mime: "image/x-icon", category: "image" },
  ".heic": { mime: "image/heic", category: "image" },
  ".mp4": { mime: "video/mp4", category: "video" },
  ".webm": { mime: "video/webm", category: "video" },
  ".mov": { mime: "video/quicktime", category: "video" },
  ".m4v": { mime: "video/x-m4v", category: "video" },
  ".mkv": { mime: "video/x-matroska", category: "video" },
  ".avi": { mime: "video/x-msvideo", category: "video" },
  ".mp3": { mime: "audio/mpeg", category: "audio" },
  ".wav": { mime: "audio/wav", category: "audio" },
  ".ogg": { mime: "audio/ogg", category: "audio" },
  ".flac": { mime: "audio/flac", category: "audio" },
  ".m4a": { mime: "audio/mp4", category: "audio" },
  ".aac": { mime: "audio/aac", category: "audio" },
  ".pdf": { mime: "application/pdf", category: "document" },
  ".doc": { mime: "application/msword", category: "document" },
  ".docx": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    category: "document",
  },
  ".xls": { mime: "application/vnd.ms-excel", category: "document" },
  ".xlsx": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    category: "document",
  },
  ".ppt": { mime: "application/vnd.ms-powerpoint", category: "document" },
  ".pptx": {
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    category: "document",
  },
  ".hwp": { mime: "application/x-hwp", category: "document" },
  ".hwpx": { mime: "application/hwp+zip", category: "document" },
  ".txt": { mime: "text/plain", category: "document" },
  ".md": { mime: "text/markdown", category: "document" },
  ".markdown": { mime: "text/markdown", category: "document" },
  ".csv": { mime: "text/csv", category: "document" },
  ".tsv": { mime: "text/tab-separated-values", category: "document" },
  ".log": { mime: "text/plain", category: "document" },
  ".rtf": { mime: "application/rtf", category: "document" },
  ".json": { mime: "application/json", category: "code" },
  ".yml": { mime: "text/yaml", category: "code" },
  ".yaml": { mime: "text/yaml", category: "code" },
  ".toml": { mime: "application/toml", category: "code" },
  ".ini": { mime: "text/plain", category: "code" },
  ".conf": { mime: "text/plain", category: "code" },
  ".cfg": { mime: "text/plain", category: "code" },
  ".css": { mime: "text/css", category: "code" },
  ".scss": { mime: "text/x-scss", category: "code" },
  ".sql": { mime: "application/sql", category: "code" },
  ".svelte": { mime: "text/plain", category: "code" },
  ".jsx": { mime: "text/plain", category: "code" },
  ".tsx": { mime: "text/plain", category: "code" },
  ".java": { mime: "text/x-java-source", category: "code" },
  ".c": { mime: "text/x-c", category: "code" },
  ".cpp": { mime: "text/x-c++src", category: "code" },
  ".h": { mime: "text/x-chdr", category: "code" },
  ".rs": { mime: "text/rust", category: "code" },
  ".go": { mime: "text/x-go", category: "code" },
  ".rb": { mime: "text/x-ruby", category: "code" },
  ".kt": { mime: "text/x-kotlin", category: "code" },
  ".swift": { mime: "text/x-swift", category: "code" },
  ".zip": { mime: "application/zip", category: "archive" },
  ".tar": { mime: "application/x-tar", category: "archive" },
  ".gz": { mime: "application/gzip", category: "archive" },
  ".tgz": { mime: "application/gzip", category: "archive" },
  ".7z": { mime: "application/x-7z-compressed", category: "archive" },
  ".rar": { mime: "application/vnd.rar", category: "archive" },
  ".xz": { mime: "application/x-xz", category: "archive" },
  ".bz2": { mime: "application/x-bzip2", category: "archive" },
};

export const CATEGORY_LABELS: Record<DriveCategoryFilter, string> = {
  all: "전체",
  image: "이미지",
  document: "문서",
  media: "미디어",
  video: "동영상",
  audio: "오디오",
  code: "코드/설정",
  archive: "압축",
  other: "기타",
};

/** Classify extension into safe MIME type and high-level Drive category. */
export function classifyFile(ext: string): {
  mime: string;
  category: DriveFileCategory;
} {
  const lower = ext.toLowerCase();
  return (
    MIME_MAP[lower] || {
      mime: "application/octet-stream",
      category: "other",
    }
  );
}

/** Whether extension can be safely rendered inside text preview modal. */
export function isTextPreviewableExt(ext: string): boolean {
  return TEXT_PREVIEW_EXTS.has(ext.toLowerCase());
}

/** Whether extension can be rendered inside image/video/audio preview tags. */
export function isMediaPreviewableExt(ext: string): boolean {
  const lower = ext.toLowerCase();
  return (
    IMAGE_PREVIEW_EXTS.has(lower) ||
    VIDEO_PREVIEW_EXTS.has(lower) ||
    AUDIO_PREVIEW_EXTS.has(lower)
  );
}

/** Format byte size into readable string. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    sizes.length - 1,
    Math.floor(Math.log(bytes) / Math.log(k)),
  );
  const val = bytes / Math.pow(k, i);
  return `${val >= 100 || i === 0 ? val.toFixed(0) : val.toFixed(1)} ${sizes[i]}`;
}

/** Format ISO timestamp into Korean short date/time string. */
export function formatDateKo(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
