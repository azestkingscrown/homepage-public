import type { RequestHandler } from "./$types";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  DriveError,
  ensureFolderPath,
  registerUploadedFile,
} from "#lib/server/drive.ts";
import {
  extractClientIp,
  safePeerIp,
  validateSession,
} from "#lib/server/session.ts";
import {
  IMAGE_EXTENSIONS,
  matchesImageMagicBytes,
  parseRelativeDirSegments,
  sanitizeUploadFilename,
} from "#lib/server/uploadValidation.ts";

const MAX_FILE_SIZE = 95 * 1024 * 1024; // 단일 요청 한도 95MB (초과 시 청크 API 사용)
const MAX_CONTENT_LENGTH = MAX_FILE_SIZE + 5 * 1024 * 1024;

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  try {
    const token = request.headers.get("x-session-token");
    const clientIp = extractClientIp(
      request.headers,
      safePeerIp(getClientAddress),
    );
    const userAgent = request.headers.get("user-agent") || "unknown-agent";

    if (!validateSession(token, "admin", clientIp, userAgent)) {
      return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const declaredLength = Number.parseInt(
      request.headers.get("content-length") || "",
      10,
    );
    if (Number.isFinite(declaredLength) && declaredLength > MAX_CONTENT_LENGTH) {
      return Response.json(
        {
          error:
            "단일 업로드는 95MB까지만 허용됩니다. 대용량은 분할 업로드 API를 사용하세요.",
        },
        { status: 413 },
      );
    }

    const formData = await request.formData();
    const rawFile = formData.get("file");

    if (!(rawFile instanceof File)) {
      return Response.json({ error: "파일이 없습니다." }, { status: 400 });
    }
    const file = rawFile;

    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        {
          error:
            "단일 업로드는 95MB까지만 허용됩니다. 대용량은 분할 업로드 API를 사용하세요.",
        },
        { status: 413 },
      );
    }

    if (file.size === 0) {
      return Response.json(
        { error: "빈 파일은 업로드할 수 없습니다." },
        { status: 400 },
      );
    }

    const { finalExt, storageName, displayName } = sanitizeUploadFilename(
      file.name,
    );

    if (IMAGE_EXTENSIONS.has(finalExt)) {
      const headBytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (!matchesImageMagicBytes(finalExt, headBytes)) {
        return Response.json(
          { error: "이미지 파일의 실제 시그니처가 확장자와 일치하지 않습니다." },
          { status: 400 },
        );
      }
    }

    const rawFolderId = formData.get("folderId");
    const baseFolderId =
      typeof rawFolderId === "string" && rawFolderId.trim().length > 0
        ? rawFolderId.trim()
        : null;

    const dirSegments = parseRelativeDirSegments(formData.get("relativePath"));
    const targetFolderId =
      dirSegments.length > 0
        ? await ensureFolderPath(baseFolderId, dirSegments)
        : baseFolderId;

    const rawShared = formData.get("shared");
    const isShared = rawShared === "false" ? false : true;

    const uploadsDir = path.resolve(process.cwd(), "public", "uploads");
    const filePath = path.resolve(uploadsDir, storageName);
    if (!filePath.startsWith(uploadsDir + path.sep)) {
      return Response.json({ error: "잘못된 파일 경로입니다." }, { status: 400 });
    }

    await mkdir(uploadsDir, { recursive: true });

    const webStream = file.stream();
    const nodeStream = Readable.fromWeb(
      webStream as Parameters<typeof Readable.fromWeb>[0],
    );
    const fileStream = createWriteStream(filePath);
    await pipeline(nodeStream, fileStream);

    const driveFile = await registerUploadedFile({
      storageName,
      displayName,
      size: file.size,
      ext: finalExt,
      folderId: targetFolderId,
      shared: isShared,
    });

    console.log(`[Upload] File saved: ${storageName} (${file.size} bytes)`);

    return Response.json({
      success: true,
      url: `/uploads/${storageName}`,
      name: storageName,
      file: driveFile,
    });
  } catch (error) {
    if (error instanceof DriveError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error("Upload error:", error);
    return Response.json({ error: "서버 업로드 실패" }, { status: 500 });
  }
};
