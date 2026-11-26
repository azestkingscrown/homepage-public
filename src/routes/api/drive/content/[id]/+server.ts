import type { RequestHandler } from "./$types";
import fs from "node:fs";
import { open } from "node:fs/promises";
import { Readable } from "node:stream";
import { isTextPreviewableExt } from "#lib/driveTypes.ts";
import {
  buildContentDisposition,
  getFileById,
  resolveSafeUploadPath,
} from "#lib/server/drive.ts";
import {
  extractClientIp,
  safePeerIp,
  validateSession,
} from "#lib/server/session.ts";

const MAX_TEXT_PREVIEW_BYTES = 512 * 1024;

const INLINE_MEDIA_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".m4v": "video/x-m4v",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
};

export const GET: RequestHandler = async ({
  params,
  request,
  url,
  getClientAddress,
}) => {
  const token = request.headers.get("x-session-token");
  const clientIp = extractClientIp(
    request.headers,
    safePeerIp(getClientAddress),
  );
  const userAgent = request.headers.get("user-agent") || "unknown-agent";

  if (!validateSession(token, "admin", clientIp, userAgent)) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const fileId = params.id;
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(fileId)) {
    return Response.json({ error: "잘못된 파일 ID입니다." }, { status: 400 });
  }

  const file = await getFileById(fileId);
  if (!file) {
    return Response.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  const resolved = await resolveSafeUploadPath(file.storageName);
  if (!resolved) {
    return Response.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  const mode = url.searchParams.get("mode");
  if (mode === "text") {
    if (!isTextPreviewableExt(file.ext)) {
      return Response.json(
        { error: "텍스트 미리보기를 지원하지 않는 형식입니다." },
        { status: 400 },
      );
    }

    const bytesToRead = Math.min(resolved.size, MAX_TEXT_PREVIEW_BYTES);
    const buf = Buffer.alloc(bytesToRead);
    let handle: Awaited<ReturnType<typeof open>> | null = null;
    try {
      handle = await open(resolved.realFilePath, "r");
      let offset = 0;
      while (offset < bytesToRead) {
        const { bytesRead } = await handle.read(
          buf,
          offset,
          bytesToRead - offset,
          offset,
        );
        if (bytesRead === 0) break;
        offset += bytesRead;
      }
      const text = buf.subarray(0, offset).toString("utf8");
      return Response.json(
        {
          text,
          truncated: resolved.size > MAX_TEXT_PREVIEW_BYTES,
          size: resolved.size,
        },
        {
          headers: {
            "Cache-Control": "private, no-store",
          },
        },
      );
    } finally {
      await handle?.close().catch(() => undefined);
    }
  }

  const forceDownload = url.searchParams.get("download") === "1";
  const inlineMime = INLINE_MEDIA_MIME[file.ext.toLowerCase()];
  const contentType =
    !forceDownload && inlineMime ? inlineMime : "application/octet-stream";
  const disposition =
    !forceDownload && inlineMime
      ? buildContentDisposition("inline", file.name)
      : buildContentDisposition("attachment", file.name);

  const nodeStream = fs.createReadStream(resolved.realFilePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

  return new Response(webStream, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(resolved.size),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": disposition,
    },
  });
};
