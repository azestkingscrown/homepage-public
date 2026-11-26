import type { RequestHandler } from "./$types";
import {
  buildContentDisposition,
  getFileById,
  resolveSafeUploadPath,
} from "#lib/server/drive.ts";
import { verifyDriveTicket } from "#lib/server/driveTickets.ts";
import { createFileStreamResponse } from "#lib/server/rangeStream.ts";
import { extractClientIp, safePeerIp } from "#lib/server/session.ts";

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
  request,
  url,
  getClientAddress,
}) => {
  const ticket = url.searchParams.get("ticket");
  const clientIp = extractClientIp(
    request.headers,
    safePeerIp(getClientAddress),
  );
  const userAgent = request.headers.get("user-agent") || "unknown-agent";

  const entry = verifyDriveTicket(ticket, clientIp, userAgent);
  if (!entry) {
    return Response.json(
      { error: "유효하지 않거나 만료된 스트리밍 티켓입니다." },
      { status: 401 },
    );
  }

  const file = await getFileById(entry.fileId);
  if (!file) {
    return Response.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  const resolved = await resolveSafeUploadPath(file.storageName);
  if (!resolved) {
    return Response.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  const inlineMime = INLINE_MEDIA_MIME[file.ext.toLowerCase()];
  const allowInline = entry.purpose === "media" && Boolean(inlineMime);
  const contentType = allowInline ? inlineMime : "application/octet-stream";
  const disposition = allowInline
    ? buildContentDisposition("inline", file.name)
    : buildContentDisposition("attachment", file.name);

  return createFileStreamResponse({
    filePath: resolved.realFilePath,
    fileSize: resolved.size,
    rangeHeader: request.headers.get("range"),
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": disposition,
    },
  });
};
