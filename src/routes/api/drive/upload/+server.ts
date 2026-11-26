import type { RequestHandler } from "./$types";
import { DriveError } from "#lib/server/drive.ts";
import {
  abortChunkedUpload,
  completeChunkedUpload,
  initChunkedUpload,
  writeUploadChunk,
} from "#lib/server/chunkedUpload.ts";
import {
  extractClientIp,
  safePeerIp,
  validateSession,
} from "#lib/server/session.ts";

function authorizeAdmin(
  request: Request,
  getClientAddress: () => string,
): string | null {
  const token = request.headers.get("x-session-token");
  const clientIp = extractClientIp(
    request.headers,
    safePeerIp(getClientAddress),
  );
  const userAgent = request.headers.get("user-agent") || "unknown-agent";
  if (!token || !validateSession(token, "admin", clientIp, userAgent)) {
    return null;
  }
  return token;
}

function errorResponse(error: unknown, fallback: string): Response {
  if (error instanceof DriveError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("[API /api/drive/upload] Error:", error);
  return Response.json({ error: fallback }, { status: 500 });
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const sessionToken = authorizeAdmin(request, getClientAddress);
  if (!sessionToken) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON 본문을 읽을 수 없습니다." }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "init": {
        const result = await initChunkedUpload({
          fileName: body.fileName,
          totalSize: body.totalSize,
          chunkSize: body.chunkSize,
          folderId: body.folderId,
          relativePath: body.relativePath,
          shared: body.shared,
          sessionToken,
        });
        return Response.json(
          { success: true, ...result },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      case "complete": {
        const result = await completeChunkedUpload({
          uploadId: body.uploadId,
          sessionToken,
        });
        return Response.json(
          { success: true, ...result },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      case "abort": {
        await abortChunkedUpload({
          uploadId: body.uploadId,
          sessionToken,
        });
        return Response.json(
          { success: true },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      default:
        return Response.json(
          { error: "지원하지 않는 업로드 작업입니다." },
          { status: 400 },
        );
    }
  } catch (error) {
    return errorResponse(error, "대용량 업로드 처리에 실패했습니다.");
  }
};

export const PUT: RequestHandler = async ({
  request,
  url,
  getClientAddress,
}) => {
  const sessionToken = authorizeAdmin(request, getClientAddress);
  if (!sessionToken) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const uploadId = url.searchParams.get("uploadId");
  const rawIndex = url.searchParams.get("index") || "";
  if (!/^\d+$/.test(rawIndex)) {
    return Response.json(
      { error: "잘못된 청크 인덱스입니다." },
      { status: 400 },
    );
  }
  const index = Number.parseInt(rawIndex, 10);

  const rawLength = request.headers.get("content-length");
  const parsedLength =
    rawLength !== null ? Number.parseInt(rawLength, 10) : null;
  const contentLength =
    parsedLength !== null && Number.isFinite(parsedLength) ? parsedLength : null;

  try {
    const result = await writeUploadChunk({
      uploadId,
      index,
      sessionToken,
      contentLength,
      bodyStream: request.body,
    });
    return Response.json(
      { success: true, ...result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "청크 저장에 실패했습니다.");
  }
};
