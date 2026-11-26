import type { RequestHandler } from "./$types";
import { DriveError } from "#lib/server/drive.ts";
import {
  abortR2Multipart,
  completeR2Multipart,
  initR2Multipart,
  prepareR2ObjectMeta,
  putR2Object,
  uploadR2Part,
} from "#lib/server/r2.ts";
import {
  extractClientIp,
  safePeerIp,
  validateSession,
} from "#lib/server/session.ts";
import {
  IMAGE_EXTENSIONS,
  matchesImageMagicBytes,
  parseRelativeDirSegments,
} from "#lib/server/uploadValidation.ts";

const MAX_DIRECT_R2_SIZE = 20 * 1024 * 1024;
const MAX_DIRECT_CONTENT_LENGTH = MAX_DIRECT_R2_SIZE + 2 * 1024 * 1024;

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

function handleR2UploadError(error: unknown, fallback: string): Response {
  if (error instanceof DriveError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("[API /api/r2/upload] Error:", error);
  return Response.json({ error: fallback }, { status: 500 });
}

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const sessionToken = authorizeAdmin(request, getClientAddress);
  if (!sessionToken) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const contentType = (request.headers.get("content-type") || "").toLowerCase();

  try {
    if (contentType.includes("multipart/form-data")) {
      const declaredLen = Number.parseInt(
        request.headers.get("content-length") || "",
        10,
      );
      if (Number.isFinite(declaredLen) && declaredLen > MAX_DIRECT_CONTENT_LENGTH) {
        return Response.json(
          { error: "단일 R2 업로드는 20MB까지만 허용됩니다." },
          { status: 413 },
        );
      }

      const formData = await request.formData();
      const rawFile = formData.get("file");
      if (!(rawFile instanceof File)) {
        return Response.json({ error: "파일이 없습니다." }, { status: 400 });
      }
      if (rawFile.size <= 0) {
        return Response.json(
          { error: "빈 파일은 업로드할 수 없습니다." },
          { status: 400 },
        );
      }
      if (rawFile.size > MAX_DIRECT_R2_SIZE) {
        return Response.json(
          { error: "단일 R2 업로드는 20MB 이하만 가능합니다." },
          { status: 413 },
        );
      }

      const prefix = formData.get("prefix") || "";
      const dirSegments = parseRelativeDirSegments(formData.get("relativePath"));
      const meta = prepareR2ObjectMeta({
        fileName: rawFile.name,
        basePrefix: prefix,
        dirSegments,
      });

      const bytes = new Uint8Array(await rawFile.arrayBuffer());
      if (IMAGE_EXTENSIONS.has(meta.finalExt)) {
        if (!matchesImageMagicBytes(meta.finalExt, bytes.subarray(0, 12))) {
          return Response.json(
            { error: "이미지 파일의 실제 시그니처가 확장자와 일치하지 않습니다." },
            { status: 400 },
          );
        }
      }

      const created = await putR2Object({
        key: meta.key,
        body: bytes,
        contentType: meta.contentType,
        contentDisposition: meta.contentDisposition,
      });

      return Response.json(
        { success: true, file: created },
        { headers: { "Cache-Control": "no-store" } },
      );
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

    switch (body.action) {
      case "init": {
        const dirSegments = parseRelativeDirSegments(body.relativePath);
        const result = await initR2Multipart({
          fileName: body.fileName,
          totalSize: body.totalSize,
          chunkSize: body.chunkSize,
          prefix: body.prefix,
          dirSegments,
          sessionToken,
        });
        return Response.json(
          { success: true, ...result },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      case "complete": {
        const result = await completeR2Multipart({
          uploadId: body.uploadId,
          sessionToken,
        });
        return Response.json(
          { success: true, ...result },
          { headers: { "Cache-Control": "no-store" } },
        );
      }

      case "abort": {
        await abortR2Multipart({
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
    return handleR2UploadError(error, "R2 업로드 처리에 실패했습니다.");
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
      { error: "잘못된 파트 인덱스입니다." },
      { status: 400 },
    );
  }
  const index = Number.parseInt(rawIndex, 10);

  const rawLen = request.headers.get("content-length");
  const parsedLen = rawLen !== null ? Number.parseInt(rawLen, 10) : null;
  const contentLength =
    parsedLen !== null && Number.isFinite(parsedLen) ? parsedLen : null;

  try {
    const res = await uploadR2Part({
      uploadId,
      index,
      sessionToken,
      contentLength,
      bodyStream: request.body,
    });
    return Response.json(
      { success: true, ...res },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return handleR2UploadError(error, "R2 파트 업로드에 실패했습니다.");
  }
};
