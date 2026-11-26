import type { RequestHandler } from "./$types";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import {
  buildContentDisposition,
  getPublicFileAccess,
  isSafeStorageName,
  resolveSafeUploadPath,
} from "#lib/server/drive.ts";

const SAFE_IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export const GET: RequestHandler = async ({ params }) => {
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
    const nodeStream = fs.createReadStream(resolved.realFilePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return new Response(webStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(resolved.size),
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
