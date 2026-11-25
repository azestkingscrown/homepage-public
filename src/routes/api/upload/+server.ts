import type { RequestHandler } from "./$types";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { extractClientIp, validateSession } from "#lib/server/session.ts";

const MAX_FILE_SIZE = 95 * 1024 * 1024; // 95MB (Cloudflare Tunnel 100MB 제한 대응)

const FORBIDDEN_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".bin", ".msi", ".vbs", ".ps1",
  ".php", ".php3", ".php4", ".php5", ".phtml",
  ".pl", ".py", ".jsp", ".asp", ".aspx", ".cgi",
  ".html", ".htm", ".js", ".mjs", ".cjs", ".ts", ".tsx",
  ".svg", ".svgz", ".xml", ".xhtml", ".wasm", ".swf", ".jar", ".dll",
]);

function trimUnderscores(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "_") start += 1;
  while (end > start && value[end - 1] === "_") end -= 1;
  return value.slice(start, end);
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const token = request.headers.get("x-session-token");
    const clientIp = extractClientIp(request.headers);
    const userAgent = request.headers.get("user-agent") || "unknown-agent";

    if (!validateSession(token, "admin", clientIp, userAgent)) {
      return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
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
            "Cloudflare Tunnel 전송 제한(100MB)으로 인해 파일 크기는 95MB를 초과할 수 없습니다.",
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

    const rawExt = path.extname(file.name).toLowerCase();
    if (
      FORBIDDEN_EXTENSIONS.has(rawExt) ||
      rawExt === "" ||
      !/^\.[a-z0-9]{1,12}$/.test(rawExt)
    ) {
      return Response.json(
        { error: "보안상 업로드가 금지된 실행/스크립트 파일 형식입니다." },
        { status: 400 },
      );
    }

    const rawBase = path.basename(file.name, path.extname(file.name));
    const cleanedBase = rawBase.replace(/[^a-zA-Z0-9_-]/g, "_");
    const safeBase = trimUnderscores(cleanedBase).slice(0, 80) || "file";
    const safeName = `${safeBase}${rawExt}`;
    const finalExt = path.extname(safeName).toLowerCase();
    if (FORBIDDEN_EXTENSIONS.has(finalExt) || finalExt !== rawExt) {
      return Response.json(
        { error: "보안상 업로드가 금지된 파일 형식입니다." },
        { status: 400 },
      );
    }

    const fileName = `${Date.now()}-${safeName}`;

    const uploadsDir = path.resolve(process.cwd(), "public", "uploads");
    const filePath = path.resolve(uploadsDir, fileName);
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

    console.log(`[Upload] File saved: ${fileName} (${file.size} bytes)`);

    return Response.json({
      success: true,
      url: `/uploads/${fileName}`,
      name: fileName,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return Response.json({ error: "서버 업로드 실패" }, { status: 500 });
  }
};
