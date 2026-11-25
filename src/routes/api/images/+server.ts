import type { RequestHandler } from "./$types";
import fs from "node:fs";
import path from "node:path";
import {
  extractClientIp,
  safePeerIp,
  validateSession,
} from "#lib/server/session.ts";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);

export const GET: RequestHandler = async ({ request, getClientAddress }) => {
  const token = request.headers.get("x-session-token");
  const clientIp = extractClientIp(
    request.headers,
    safePeerIp(getClientAddress),
  );
  const userAgent = request.headers.get("user-agent") || "unknown-agent";

  if (!validateSession(token, "admin", clientIp, userAgent)) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");

  try {
    if (!fs.existsSync(uploadsDir)) {
      return Response.json({ images: [] });
    }

    const files = fs.readdirSync(uploadsDir);

    const imageFiles = files
      .filter((file) => {
        const ext = path.extname(file).toLowerCase();
        return IMAGE_EXTENSIONS.has(ext) && !file.startsWith(".");
      })
      .map((file) => {
        const filePath = path.join(uploadsDir, file);
        const stat = fs.statSync(filePath);
        return {
          name: file,
          url: `/uploads/${file}`,
          size: stat.size,
          mtime: stat.mtime,
        };
      })
      .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

    return Response.json({ images: imageFiles });
  } catch (error) {
    console.error("Failed to read images directory:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
};
