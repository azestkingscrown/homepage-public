import type { RequestHandler } from "./$types";
import fs from "node:fs";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { extractClientIp, validateSession } from "#lib/server/session.ts";

export const POST: RequestHandler = async ({ request }) => {
  try {
    const token = request.headers.get("x-session-token");
    const clientIp = extractClientIp(request.headers);
    const userAgent = request.headers.get("user-agent") || "unknown-agent";

    if (!validateSession(token, "admin", clientIp, userAgent)) {
      return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
    }

    const body = (await request.json()) as { filename?: string };
    const { filename } = body;

    if (!filename || typeof filename !== "string") {
      return Response.json({ error: "파일명이 없습니다." }, { status: 400 });
    }

    if (
      !/^[a-zA-Z0-9._-]+$/.test(filename) ||
      filename === "." ||
      filename === ".." ||
      filename.includes("..")
    ) {
      return Response.json({ error: "잘못된 파일명입니다." }, { status: 400 });
    }

    const uploadsDir = path.resolve(process.cwd(), "public", "uploads");
    const filePath = path.resolve(uploadsDir, path.basename(filename));

    if (!filePath.startsWith(uploadsDir + path.sep)) {
      return Response.json({ error: "잘못된 파일 경로입니다." }, { status: 400 });
    }

    if (!fs.existsSync(filePath)) {
      return Response.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
    }

    await unlink(filePath);
    console.log(`[Delete] File removed: ${path.basename(filename)}`);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Delete error:", error);
    return Response.json({ error: "서버 삭제 실패" }, { status: 500 });
  }
};
