import type { RequestHandler } from "./$types";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  extractClientIp,
  safePeerIp,
  validateSession,
} from "#lib/server/session.ts";

const MAX_FILE_SIZE = 95 * 1024 * 1024; // 95MB (Cloudflare Tunnel 100MB 제한 대응)
const MAX_CONTENT_LENGTH = MAX_FILE_SIZE + 5 * 1024 * 1024;

const FORBIDDEN_EXTENSIONS = new Set([
  ".exe", ".bat", ".cmd", ".sh", ".bin", ".msi", ".vbs", ".ps1",
  ".php", ".php3", ".php4", ".php5", ".phtml",
  ".pl", ".py", ".jsp", ".asp", ".aspx", ".cgi",
  ".html", ".htm", ".js", ".mjs", ".cjs", ".ts", ".tsx",
  ".svg", ".svgz", ".xml", ".xhtml", ".wasm", ".swf", ".jar", ".dll",
  ".mhtml", ".mht", ".shtml", ".hta", ".scr", ".lnk", ".reg", ".com", ".pif",
]);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

function trimUnderscores(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && value[start] === "_") start += 1;
  while (end > start && value[end - 1] === "_") end -= 1;
  return value.slice(start, end);
}

function matchesImageMagicBytes(ext: string, head: Uint8Array): boolean {
  if (ext === ".png") {
    const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return head.byteLength >= 8 && pngSig.every((b, idx) => head[idx] === b);
  }
  if (ext === ".jpg" || ext === ".jpeg") {
    return (
      head.byteLength >= 3 &&
      head[0] === 0xff &&
      head[1] === 0xd8 &&
      head[2] === 0xff
    );
  }
  if (ext === ".gif") {
    if (head.byteLength < 6) return false;
    const header = String.fromCharCode(...head.slice(0, 6));
    return header === "GIF87a" || header === "GIF89a";
  }
  if (ext === ".webp") {
    if (head.byteLength < 12) return false;
    const riff = String.fromCharCode(...head.slice(0, 4));
    const webp = String.fromCharCode(...head.slice(8, 12));
    return riff === "RIFF" && webp === "WEBP";
  }
  return true;
}

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
            "Cloudflare Tunnel 전송 제한(100MB)으로 인해 파일 크기는 95MB를 초과할 수 없습니다.",
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

    if (IMAGE_EXTENSIONS.has(finalExt)) {
      const headBytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
      if (!matchesImageMagicBytes(finalExt, headBytes)) {
        return Response.json(
          { error: "이미지 파일의 실제 시그니처가 확장자와 일치하지 않습니다." },
          { status: 400 },
        );
      }
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
