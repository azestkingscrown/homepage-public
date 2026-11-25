import type { RequestHandler } from "./$types";
import fs from "node:fs";
import path from "node:path";

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

  try {
    if (!fs.existsSync(filePath)) {
      return new Response("File Not Found", { status: 404 });
    }

    const ext = path.extname(filename).toLowerCase();
    if (ext === ".svg" || ext === ".svgz") {
      return new Response("Forbidden Extension", { status: 403 });
    }

    const fileBuffer = fs.readFileSync(filePath);
    const contentTypes: Record<string, string> = {
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
    };

    const contentType = contentTypes[ext] || "application/octet-stream";

    return new Response(fileBuffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": "inline",
        "Content-Security-Policy":
          "default-src 'none'; img-src 'self'; style-src 'none'; script-src 'none'",
      },
    });
  } catch (error) {
    console.error("File serving error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
};
