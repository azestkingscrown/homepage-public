import fs from "node:fs";
import { Readable } from "node:stream";

export type ParsedByteRange =
  | { kind: "none" }
  | { kind: "unsatisfiable" }
  | { kind: "single"; start: number; end: number };

/** Parse single HTTP Byte Range header against a known file size. */
export function parseByteRange(
  rangeHeader: string | null | undefined,
  fileSize: number,
): ParsedByteRange {
  if (!rangeHeader || typeof rangeHeader !== "string") {
    return { kind: "none" };
  }
  const trimmed = rangeHeader.trim();
  if (!trimmed.toLowerCase().startsWith("bytes=")) {
    return { kind: "none" };
  }
  const spec = trimmed.slice(6).trim();
  if (!spec || spec.includes(",")) {
    // Multi-range or empty spec: fall back to full 200 response per RFC 9110.
    return { kind: "none" };
  }

  if (fileSize <= 0) {
    return { kind: "unsatisfiable" };
  }

  const dashIdx = spec.indexOf("-");
  if (dashIdx === -1) {
    return { kind: "unsatisfiable" };
  }

  const startStr = spec.slice(0, dashIdx).trim();
  const endStr = spec.slice(dashIdx + 1).trim();

  if (startStr === "") {
    if (!/^\d+$/.test(endStr)) return { kind: "unsatisfiable" };
    const suffixLen = Number.parseInt(endStr, 10);
    if (!Number.isSafeInteger(suffixLen) || suffixLen <= 0) {
      return { kind: "unsatisfiable" };
    }
    const start = Math.max(0, fileSize - suffixLen);
    return { kind: "single", start, end: fileSize - 1 };
  }

  if (!/^\d+$/.test(startStr)) return { kind: "unsatisfiable" };
  const start = Number.parseInt(startStr, 10);
  if (!Number.isSafeInteger(start) || start < 0 || start >= fileSize) {
    return { kind: "unsatisfiable" };
  }

  if (endStr === "") {
    return { kind: "single", start, end: fileSize - 1 };
  }

  if (!/^\d+$/.test(endStr)) return { kind: "unsatisfiable" };
  const rawEnd = Number.parseInt(endStr, 10);
  if (!Number.isSafeInteger(rawEnd) || rawEnd < start) {
    return { kind: "unsatisfiable" };
  }

  return {
    kind: "single",
    start,
    end: Math.min(rawEnd, fileSize - 1),
  };
}

/** Build a 200, 206 Partial Content, or 416 Range Not Satisfiable file stream Response. */
export function createFileStreamResponse(opts: {
  filePath: string;
  fileSize: number;
  rangeHeader: string | null | undefined;
  headers: HeadersInit;
}): Response {
  const outHeaders = new Headers(opts.headers);
  outHeaders.set("Accept-Ranges", "bytes");

  const parsed = parseByteRange(opts.rangeHeader, opts.fileSize);

  if (parsed.kind === "unsatisfiable") {
    outHeaders.set("Content-Range", `bytes */${opts.fileSize}`);
    outHeaders.set("Content-Length", "0");
    return new Response(null, { status: 416, headers: outHeaders });
  }

  if (parsed.kind === "single") {
    const chunkLength = parsed.end - parsed.start + 1;
    outHeaders.set(
      "Content-Range",
      `bytes ${parsed.start}-${parsed.end}/${opts.fileSize}`,
    );
    outHeaders.set("Content-Length", String(chunkLength));
    const nodeStream = fs.createReadStream(opts.filePath, {
      start: parsed.start,
      end: parsed.end,
    });
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    return new Response(webStream, { status: 206, headers: outHeaders });
  }

  outHeaders.set("Content-Length", String(opts.fileSize));
  const nodeStream = fs.createReadStream(opts.filePath);
  const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
  return new Response(webStream, { status: 200, headers: outHeaders });
}
