import crypto from "node:crypto";
import path from "node:path";
import { DriveError, validateDisplayName } from "#lib/server/drive.ts";

export const FORBIDDEN_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".bin", ".msi", ".vbs", ".ps1",
  ".php", ".php3", ".php4", ".php5", ".phtml",
  ".pl", ".py", ".jsp", ".asp", ".aspx", ".cgi",
  ".html", ".htm", ".js", ".mjs", ".cjs", ".ts", ".tsx",
  ".svg", ".svgz", ".xml", ".xhtml", ".wasm", ".swf", ".jar", ".dll",
  ".mhtml", ".mht", ".shtml", ".hta", ".scr", ".lnk", ".reg", ".com", ".pif",
]);

export const IMAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
]);

function trimUnderscores(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "_") start += 1;
  while (end > start && value[end - 1] === "_") end -= 1;
  return value.slice(start, end);
}

/** Verify leading magic bytes match image extension when applicable. */
export function matchesImageMagicBytes(
  ext: string,
  head: Uint8Array,
): boolean {
  const lower = ext.toLowerCase();
  if (lower === ".png") {
    const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return head.byteLength >= 8 && pngSig.every((b, idx) => head[idx] === b);
  }
  if (lower === ".jpg" || lower === ".jpeg") {
    return (
      head.byteLength >= 3 &&
      head[0] === 0xff &&
      head[1] === 0xd8 &&
      head[2] === 0xff
    );
  }
  if (lower === ".gif") {
    if (head.byteLength < 6) return false;
    const header = String.fromCharCode(...head.slice(0, 6));
    return header === "GIF87a" || header === "GIF89a";
  }
  if (lower === ".webp") {
    if (head.byteLength < 12) return false;
    const riff = String.fromCharCode(...head.slice(0, 4));
    const webp = String.fromCharCode(...head.slice(8, 12));
    return riff === "RIFF" && webp === "WEBP";
  }
  return true;
}

/** Validate extension and construct safe disk storageName + UTF-8 displayName. */
export function sanitizeUploadFilename(originalName: string): {
  safeName: string;
  finalExt: string;
  storageName: string;
  displayName: string;
} {
  if (!originalName || typeof originalName !== "string") {
    throw new DriveError("파일명이 없습니다.", 400);
  }

  const baseInputName = path.basename(originalName);
  const rawExt = path.extname(baseInputName).toLowerCase();
  if (
    FORBIDDEN_EXTENSIONS.has(rawExt) ||
    rawExt === "" ||
    !/^\.[a-z0-9]{1,12}$/.test(rawExt)
  ) {
    throw new DriveError(
      "보안상 업로드가 금지된 실행/스크립트 파일 형식입니다.",
      400,
    );
  }

  const rawBase = path.basename(baseInputName, path.extname(baseInputName));
  const cleanedBase = rawBase.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeBase = trimUnderscores(cleanedBase).slice(0, 80) || "file";
  const safeName = `${safeBase}${rawExt}`;
  const finalExt = path.extname(safeName).toLowerCase();

  if (FORBIDDEN_EXTENSIONS.has(finalExt) || finalExt !== rawExt) {
    throw new DriveError("보안상 업로드가 금지된 파일 형식입니다.", 400);
  }

  const storageName = `${Date.now()}-${crypto.randomBytes(2).toString("hex")}-${safeName}`;

  let displayName = safeName;
  try {
    displayName = validateDisplayName(baseInputName);
  } catch {
    displayName = safeName;
  }

  return { safeName, finalExt, storageName, displayName };
}

/** Extract safe parent directory segments from a folder-upload relativePath. */
export function parseRelativeDirSegments(rawRelativePath: unknown): string[] {
  if (typeof rawRelativePath !== "string" || rawRelativePath.trim().length === 0) {
    return [];
  }
  if (rawRelativePath.includes("\0")) {
    throw new DriveError("잘못된 폴더 경로입니다.", 400);
  }
  const segments = rawRelativePath
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
  if (segments.some((s) => s === "." || s === "..")) {
    throw new DriveError("잘못된 폴더 경로입니다.", 400);
  }
  return segments.slice(0, -1);
}
