import type { RequestHandler } from "./$types";
import fs from "node:fs";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

const SAFE_IMAGE_CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
};

export const GET: RequestHandler = async ({ params }) => {
  const filename = params.filename;

  if (
    !/^[a-zA-Z0-9._-]+$/.test(filename) ||
    filename === "." ||
    filename === ".." ||
    filename.includes("..")
  ) {
    return new Response("Bad Request", { status: 400 });
  }

  const uploadsDir = path.resolve(process.cwd(), "public", "uploads");
  const filePath = path.resolve(uploadsDir, filename);

  if (!filePath.startsWith(uploadsDir + path.sep)) {
    return new Response("Forbidden", { status: 403 });
  }

  const ext = path.extname(filename).toLowerCase();
  if (ext === ".svg" || ext === ".svgz") {
    return new Response("Forbidden Extension", { status: 403 });
  }

  try {
    const stat = await lstat(filePath).catch(() => null);
    if (!stat || !stat.isFile() || stat.isSymbolicLink()) {
      return new Response("File Not Found", { status: 404 });
    }

    const [realUploadsDir, realFilePath] = await Promise.all([
      realpath(uploadsDir),
      realpath(filePath),
    ]);
    if (!realFilePath.startsWith(realUploadsDir + path.sep)) {
      return new Response("Forbidden", { status: 403 });
    }

    const imageMime = SAFE_IMAGE_CONTENT_TYPES[ext];
    const contentType = imageMime || "application/octet-stream";
    const disposition = imageMime ? "inline" : "attachment";
    const nodeStream = fs.createReadStream(realFilePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return new Response(webStream, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(stat.size),
        "Cache-Control": "public, max-age=31536000, immutable",
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
