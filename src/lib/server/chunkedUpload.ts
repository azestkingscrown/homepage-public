import crypto from "node:crypto";
import fs from "node:fs";
import {
  chmod,
  mkdir,
  open,
  readdir,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { DriveFileItem } from "#lib/driveTypes.ts";
import {
  DriveError,
  ensureFolderPath,
  registerUploadedFile,
} from "#lib/server/drive.ts";
import { timingSafeEqualStr } from "#lib/server/session.ts";
import {
  IMAGE_EXTENSIONS,
  matchesImageMagicBytes,
  parseRelativeDirSegments,
  sanitizeUploadFilename,
} from "#lib/server/uploadValidation.ts";

export const MAX_CHUNKED_FILE_SIZE = 10 * 1024 * 1024 * 1024; // 10GB
export const DEFAULT_CHUNK_SIZE = 20 * 1024 * 1024; // 20MB
export const MIN_CHUNK_SIZE = 1 * 1024 * 1024; // 1MB
export const MAX_CHUNK_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_CHUNKS_PER_FILE = 1000;
export const DISK_RESERVE_BYTES = 2 * 1024 * 1024 * 1024; // 2GB safety headroom
export const UPLOAD_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
export const MAX_ACTIVE_UPLOADS = 20;

interface ChunkUploadSession {
  uploadId: string;
  ownerTokenHash: string;
  storageName: string;
  displayName: string;
  finalExt: string;
  folderId: string | null;
  shared: boolean;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  tempFilePath: string;
  receivedChunks: Set<number>;
  inFlightChunks: Set<number>;
  createdAt: number;
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __driveChunkSessions: Map<string, ChunkUploadSession> | undefined;
}

function getUploadTmpDir(): string {
  return path.resolve(process.cwd(), "data", "upload-tmp");
}

function getUploadsDir(): string {
  return path.resolve(process.cwd(), "public", "uploads");
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

async function safeRemoveTmpFile(filePath: string): Promise<void> {
  await unlink(filePath).catch(() => undefined);
}

function getChunkSessionStore(): Map<string, ChunkUploadSession> {
  if (!global.__driveChunkSessions) {
    global.__driveChunkSessions = new Map<string, ChunkUploadSession>();
    setInterval(() => {
      void cleanupExpiredUploads();
    }, 300_000).unref();
  }
  return global.__driveChunkSessions;
}

/** Remove expired in-memory sessions and orphaned .part files older than UPLOAD_TTL_MS. */
export async function cleanupExpiredUploads(): Promise<void> {
  const store = getChunkSessionStore();
  const now = Date.now();
  const activeTmpPaths = new Set<string>();

  for (const [id, session] of store.entries()) {
    if (session.expiresAt < now) {
      store.delete(id);
      await safeRemoveTmpFile(session.tempFilePath);
    } else {
      activeTmpPaths.add(session.tempFilePath);
    }
  }

  const tmpDir = getUploadTmpDir();
  const entries = await readdir(tmpDir).catch(() => []);
  for (const name of entries) {
    if (!name.endsWith(".part")) continue;
    const fullPath = path.resolve(tmpDir, name);
    if (!fullPath.startsWith(tmpDir + path.sep)) continue;
    if (activeTmpPaths.has(fullPath)) continue;
    const st = await stat(fullPath).catch(() => null);
    if (st && now - st.mtimeMs > UPLOAD_TTL_MS) {
      await safeRemoveTmpFile(fullPath);
    }
  }
}

function assertChunkSessionOwner(
  uploadId: unknown,
  sessionToken: string,
): ChunkUploadSession {
  if (
    typeof uploadId !== "string" ||
    !/^[0-9a-f-]{36}$/.test(uploadId)
  ) {
    throw new DriveError("잘못된 업로드 ID입니다.", 400);
  }
  const store = getChunkSessionStore();
  const session = store.get(uploadId);
  if (!session) {
    throw new DriveError("업로드 세션을 찾을 수 없거나 만료되었습니다.", 404);
  }
  if (session.expiresAt < Date.now()) {
    store.delete(uploadId);
    void safeRemoveTmpFile(session.tempFilePath);
    throw new DriveError("업로드 세션이 만료되었습니다.", 404);
  }
  if (!timingSafeEqualStr(session.ownerTokenHash, sha256Hex(sessionToken))) {
    throw new DriveError("이 업로드 세션에 접근할 권한이 없습니다.", 403);
  }
  return session;
}

function getExpectedChunkLength(
  session: ChunkUploadSession,
  index: number,
): number {
  const offset = index * session.chunkSize;
  return Math.min(session.chunkSize, session.totalSize - offset);
}

/** Initialize a chunked upload session after validating filename, quota, and disk free space. */
export async function initChunkedUpload(input: {
  fileName: unknown;
  totalSize: unknown;
  chunkSize?: unknown;
  folderId?: unknown;
  relativePath?: unknown;
  shared?: unknown;
  sessionToken: string;
}): Promise<{ uploadId: string; chunkSize: number; totalChunks: number }> {
  await cleanupExpiredUploads();

  const store = getChunkSessionStore();
  if (store.size >= MAX_ACTIVE_UPLOADS) {
    throw new DriveError(
      `동시 진행 가능한 대용량 업로드 수(${MAX_ACTIVE_UPLOADS}개)를 초과했습니다.`,
      429,
    );
  }

  if (typeof input.fileName !== "string" || !input.fileName.trim()) {
    throw new DriveError("파일명이 없습니다.", 400);
  }
  if (
    typeof input.totalSize !== "number" ||
    !Number.isSafeInteger(input.totalSize) ||
    input.totalSize <= 0
  ) {
    throw new DriveError("올바르지 않은 파일 크기입니다.", 400);
  }
  if (input.totalSize > MAX_CHUNKED_FILE_SIZE) {
    throw new DriveError("파일당 최대 업로드 크기는 10GB입니다.", 413);
  }

  const chunkSize =
    typeof input.chunkSize === "number" && Number.isSafeInteger(input.chunkSize)
      ? input.chunkSize
      : DEFAULT_CHUNK_SIZE;
  if (chunkSize < MIN_CHUNK_SIZE || chunkSize > MAX_CHUNK_SIZE) {
    throw new DriveError("청크 크기는 1MB ~ 50MB 사이여야 합니다.", 400);
  }

  const totalChunks = Math.ceil(input.totalSize / chunkSize);
  if (totalChunks < 1 || totalChunks > MAX_CHUNKS_PER_FILE) {
    throw new DriveError(
      `허용된 최대 청크 수(${MAX_CHUNKS_PER_FILE}개)를 초과했습니다.`,
      400,
    );
  }

  const { finalExt, storageName, displayName } = sanitizeUploadFilename(
    input.fileName,
  );

  // Verify available server disk headroom (require at least 2GB remaining after upload).
  try {
    const uploadsDir = getUploadsDir();
    const checkDir = fs.existsSync(uploadsDir) ? uploadsDir : process.cwd();
    const fsStat = fs.statfsSync(checkDir);
    const freeBytes = Number(fsStat.bavail) * Number(fsStat.bsize);
    if (freeBytes - input.totalSize < DISK_RESERVE_BYTES) {
      throw new DriveError(
        "서버 디스크 여유 공간이 부족합니다(최소 2GB 여유 필요).",
        507,
      );
    }
  } catch (err) {
    if (err instanceof DriveError) throw err;
  }

  const baseFolderId =
    typeof input.folderId === "string" && input.folderId.trim().length > 0
      ? input.folderId.trim()
      : null;

  const dirSegments = parseRelativeDirSegments(input.relativePath);
  const resolvedFolderId =
    dirSegments.length > 0
      ? await ensureFolderPath(baseFolderId, dirSegments)
      : baseFolderId;

  const isShared = input.shared === true;
  const uploadId = crypto.randomUUID();
  const tmpDir = getUploadTmpDir();
  await mkdir(tmpDir, { recursive: true, mode: 0o700 });

  const tempFilePath = path.resolve(tmpDir, `${uploadId}.part`);
  if (!tempFilePath.startsWith(tmpDir + path.sep)) {
    throw new DriveError("잘못된 임시 경로입니다.", 400);
  }

  const handle = await open(tempFilePath, "w", 0o600);
  await handle.close();
  await chmod(tempFilePath, 0o600).catch(() => undefined);

  const now = Date.now();
  store.set(uploadId, {
    uploadId,
    ownerTokenHash: sha256Hex(input.sessionToken),
    storageName,
    displayName,
    finalExt,
    folderId: resolvedFolderId,
    shared: isShared,
    totalSize: input.totalSize,
    chunkSize,
    totalChunks,
    tempFilePath,
    receivedChunks: new Set<number>(),
    inFlightChunks: new Set<number>(),
    createdAt: now,
    expiresAt: now + UPLOAD_TTL_MS,
  });

  return { uploadId, chunkSize, totalChunks };
}

/** Stream one upload chunk directly to its target byte offset on disk. */
export async function writeUploadChunk(input: {
  uploadId: unknown;
  index: number;
  sessionToken: string;
  contentLength: number | null;
  bodyStream: ReadableStream<Uint8Array> | null;
}): Promise<{ index: number; receivedChunks: number; totalChunks: number }> {
  const session = assertChunkSessionOwner(input.uploadId, input.sessionToken);

  if (
    !Number.isSafeInteger(input.index) ||
    input.index < 0 ||
    input.index >= session.totalChunks
  ) {
    throw new DriveError("잘못된 청크 인덱스입니다.", 400);
  }
  if (!input.bodyStream) {
    throw new DriveError("청크 본문이 비어 있습니다.", 400);
  }

  const expectedLen = getExpectedChunkLength(session, input.index);
  if (
    input.contentLength !== null &&
    Number.isFinite(input.contentLength) &&
    input.contentLength !== expectedLen
  ) {
    throw new DriveError(
      `청크 크기가 일치하지 않습니다 (예상 ${expectedLen} bytes).`,
      input.contentLength > expectedLen ? 413 : 400,
    );
  }

  if (session.inFlightChunks.has(input.index)) {
    throw new DriveError("동일 청크가 이미 업로드 중입니다.", 409);
  }
  session.inFlightChunks.add(input.index);

  const startOffset = input.index * session.chunkSize;
  let written = 0;
  const headChunks: Uint8Array[] = [];
  let headBytesCollected = 0;

  let handle: Awaited<ReturnType<typeof open>> | null = null;
  const reader = input.bodyStream.getReader();

  try {
    handle = await open(session.tempFilePath, "r+");

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;

      if (written + value.byteLength > expectedLen) {
        await reader.cancel().catch(() => undefined);
        throw new DriveError("청크 크기가 지정된 길이를 초과했습니다.", 413);
      }

      if (input.index === 0 && headBytesCollected < 12) {
        const take = Math.min(12 - headBytesCollected, value.byteLength);
        headChunks.push(value.subarray(0, take));
        headBytesCollected += take;
      }

      let pieceOffset = 0;
      while (pieceOffset < value.byteLength) {
        const { bytesWritten } = await handle.write(
          value,
          pieceOffset,
          value.byteLength - pieceOffset,
          startOffset + written,
        );
        if (bytesWritten <= 0) {
          throw new DriveError("디스크 청크 쓰기에 실패했습니다.", 500);
        }
        pieceOffset += bytesWritten;
        written += bytesWritten;
      }
    }

    if (written !== expectedLen) {
      throw new DriveError(
        `청크 데이터가 불완전합니다 (${written}/${expectedLen} bytes).`,
        400,
      );
    }

    if (input.index === 0 && IMAGE_EXTENSIONS.has(session.finalExt)) {
      const head = Buffer.concat(headChunks);
      if (!matchesImageMagicBytes(session.finalExt, head)) {
        await handle.close().catch(() => undefined);
        handle = null;
        getChunkSessionStore().delete(session.uploadId);
        await safeRemoveTmpFile(session.tempFilePath);
        throw new DriveError(
          "이미지 파일의 실제 시그니처가 확장자와 일치하지 않습니다.",
          400,
        );
      }
    }

    session.receivedChunks.add(input.index);
    session.expiresAt = Date.now() + UPLOAD_TTL_MS;

    return {
      index: input.index,
      receivedChunks: session.receivedChunks.size,
      totalChunks: session.totalChunks,
    };
  } finally {
    await handle?.close().catch(() => undefined);
    reader.releaseLock();
    session.inFlightChunks.delete(input.index);
  }
}

async function movePartFileToFinal(
  tempPath: string,
  finalPath: string,
): Promise<void> {
  try {
    await rename(tempPath, finalPath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code !== "EXDEV") throw error;
    await pipeline(
      fs.createReadStream(tempPath),
      fs.createWriteStream(finalPath),
    );
    await safeRemoveTmpFile(tempPath);
  }
}

/** Finalize a completed chunked upload, move into public/uploads, and register in Drive index. */
export async function completeChunkedUpload(input: {
  uploadId: unknown;
  sessionToken: string;
}): Promise<{ url: string; name: string; file: DriveFileItem }> {
  const session = assertChunkSessionOwner(input.uploadId, input.sessionToken);

  if (session.inFlightChunks.size > 0) {
    throw new DriveError("아직 전송 중인 청크가 있습니다.", 409);
  }

  for (let i = 0; i < session.totalChunks; i += 1) {
    if (!session.receivedChunks.has(i)) {
      throw new DriveError(`누락된 청크(${i})가 있어 완료할 수 없습니다.`, 400);
    }
  }

  const tmpStat = await stat(session.tempFilePath).catch(() => null);
  if (!tmpStat || tmpStat.size !== session.totalSize) {
    throw new DriveError("조립된 파일 크기가 일치하지 않습니다.", 400);
  }

  if (IMAGE_EXTENSIONS.has(session.finalExt)) {
    const headBuf = Buffer.alloc(12);
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      handle = await open(session.tempFilePath, "r");
      const { bytesRead } = await handle.read(headBuf, 0, 12, 0);
      if (!matchesImageMagicBytes(session.finalExt, headBuf.subarray(0, bytesRead))) {
        throw new DriveError(
          "이미지 파일의 실제 시그니처가 확장자와 일치하지 않습니다.",
          400,
        );
      }
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }

  const uploadsDir = getUploadsDir();
  const finalPath = path.resolve(uploadsDir, session.storageName);
  if (!finalPath.startsWith(uploadsDir + path.sep)) {
    throw new DriveError("잘못된 파일 경로입니다.", 400);
  }

  await mkdir(uploadsDir, { recursive: true });
  await movePartFileToFinal(session.tempFilePath, finalPath);
  await chmod(finalPath, 0o644).catch(() => undefined);

  getChunkSessionStore().delete(session.uploadId);

  const driveFile = await registerUploadedFile({
    storageName: session.storageName,
    displayName: session.displayName,
    size: session.totalSize,
    ext: session.finalExt,
    folderId: session.folderId,
    shared: session.shared,
  });

  return {
    url: `/uploads/${session.storageName}`,
    name: session.storageName,
    file: driveFile,
  };
}

/** Abort an active chunked upload and clean up temporary disk bytes. */
export async function abortChunkedUpload(input: {
  uploadId: unknown;
  sessionToken: string;
}): Promise<void> {
  if (
    typeof input.uploadId !== "string" ||
    !/^[0-9a-f-]{36}$/.test(input.uploadId)
  ) {
    return;
  }
  const store = getChunkSessionStore();
  const session = store.get(input.uploadId);
  if (!session) return;
  if (!timingSafeEqualStr(session.ownerTokenHash, sha256Hex(input.sessionToken))) {
    throw new DriveError("이 업로드 세션을 취소할 권한이 없습니다.", 403);
  }
  store.delete(input.uploadId);
  await safeRemoveTmpFile(session.tempFilePath);
}
