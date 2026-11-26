import type { RequestHandler } from "./$types";
import path from "node:path";
import {
  buildContentDisposition,
  getPublicFileAccess,
  isSafeStorageName,
  resolveSafeUploadPath,
} from "#lib/server/drive.ts";
import { createFileStreamResponse } from "#lib/server/rangeStream.ts";

const SAFE_IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export const GET: RequestHandler = async ({ params, request }) => {
  const filename = params.filename;

  if (!isSafeStorageName(filename)) {
    return new Response("Bad Request", { status: 400 });
  }

  const ext = path.extname(filename).toLowerCase();
  if (ext === ".svg" || ext === ".svgz") {
    return new Response("Forbidden Extension", { status: 403 });
  }

  try {
    const access = await getPublicFileAccess(filename);
    if (!access.allowed) {
      return new Response("File Not Found", { status: 404 });
    }

    const resolved = await resolveSafeUploadPath(filename);
    if (!resolved) {
      return new Response("File Not Found", { status: 404 });
    }

    const imageMime = SAFE_IMAGE_CONTENT_TYPES[ext];
    const contentType = imageMime || "application/octet-stream";
    const disposition = imageMime
      ? "inline"
      : buildContentDisposition("attachment", access.displayName || filename);

    return createFileStreamResponse({
      filePath: resolved.realFilePath,
      fileSize: resolved.size,
      rangeHeader: request.headers.get("range"),
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=60, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": disposition,
        "Content-Security-Policy":
          "default-src 'none'; img-src 'self'; style-src 'none'; script-src 'none'",
      },
    });
  } catch (error) {
    console.error("File serving error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
