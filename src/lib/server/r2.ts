import crypto from "node:crypto";
import { open } from "node:fs/promises";
import path from "node:path";
import {
  classifyFile,
  type DriveSortDir,
  type DriveSortField,
  type R2FileItem,
  type R2FolderItem,
  type R2ListResponse,
  type R2StorageStats,
} from "#lib/driveTypes.ts";
import {
  buildContentDisposition,
  DriveError,
  getFileById,
  resolveSafeUploadPath,
  validateDisplayName,
} from "#lib/server/drive.ts";
import { timingSafeEqualStr } from "#lib/server/session.ts";
import {
  IMAGE_EXTENSIONS,
  matchesImageMagicBytes,
  sanitizeUploadFilename,
} from "#lib/server/uploadValidation.ts";

const FREE_TIER_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB R2 Standard free tier
const DEFAULT_HARD_CAP_GB = 9;
const MAX_ALLOWED_HARD_CAP_GB = 9.5;
const R2_MAX_MULTIPART_FILE_SIZE = 4 * 1024 * 1024 * 1024; // 4 GB safety ceiling
const R2_MIN_PART_SIZE = 5 * 1024 * 1024; // R2/S3 multipart non-final minimum 5 MB
const R2_MAX_PART_SIZE = 50 * 1024 * 1024; // Keep under Cloudflare Tunnel 100 MB request cap
const R2_DEFAULT_PART_SIZE = 20 * 1024 * 1024; // 20 MB
const R2_MAX_PARTS = 500;
const R2_MAX_KEY_LEN = 512;
const R2_USAGE_CACHE_MS = 30_000;
const R2_MULTIPART_TTL_MS = 2 * 60 * 60 * 1000;
const R2_MAX_ACTIVE_MULTIPART = 10;
const EMPTY_SHA256 =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
  hardCapBytes: number;
}

interface R2MultipartSession {
  uploadId: string;
  r2UploadId: string;
  ownerTokenHash: string;
  key: string;
  displayName: string;
  finalExt: string;
  contentType: string;
  totalSize: number;
  chunkSize: number;
  totalChunks: number;
  parts: Map<number, string>; // 1-based partNumber -> quoted/clean ETag
  inFlightParts: Set<number>;
  createdAt: number;
  expiresAt: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __r2MultipartSessions: Map<string, R2MultipartSession> | undefined;
  // eslint-disable-next-line no-var
  var __r2UsageCache:
    | {
        cacheKey: string;
        usedBytes: number;
        objectCount: number;
        fetchedAt: number;
      }
    | undefined;
}

function getMultipartStore(): Map<string, R2MultipartSession> {
  if (!global.__r2MultipartSessions) {
    global.__r2MultipartSessions = new Map<string, R2MultipartSession>();
    setInterval(() => {
      void cleanupExpiredR2Sessions();
    }, 300_000).unref();
  }
  return global.__r2MultipartSessions;
}

function sha256Hex(input: string | Uint8Array): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function hmacSha256(
  key: string | Buffer,
  data: string,
): Buffer {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

/** RFC 3986 URI percent encoding required by AWS SigV4. */
export function encodeRfc3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

/** Read and validate Cloudflare R2 configuration from environment variables. */
export function getR2Config(): R2Config | null {
  const accountId = (process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucketName = (process.env.R2_BUCKET_NAME || "").trim();
  const rawPublicUrl = (process.env.R2_PUBLIC_URL || "").trim();

  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucketName ||
    !rawPublicUrl
  ) {
    return null;
  }

  if (!/^[a-f0-9]{16,64}$/i.test(accountId)) {
    console.warn("[R2] Invalid R2_ACCOUNT_ID format");
    return null;
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucketName)) {
    console.warn("[R2] Invalid R2_BUCKET_NAME format");
    return null;
  }

  let publicUrl: string;
  try {
    const parsed = new URL(rawPublicUrl);
    if (parsed.protocol !== "https:") {
      console.warn("[R2] R2_PUBLIC_URL must use https://");
      return null;
    }
    publicUrl = parsed.origin + parsed.pathname.replace(/\/+$/, "");
  } catch {
    console.warn("[R2] Invalid R2_PUBLIC_URL");
    return null;
  }

  const rawCapGb = Number.parseFloat(process.env.R2_HARD_CAP_GB || "");
  const capGb =
    Number.isFinite(rawCapGb) && rawCapGb > 0
      ? Math.min(rawCapGb, MAX_ALLOWED_HARD_CAP_GB)
      : DEFAULT_HARD_CAP_GB;
  const hardCapBytes = Math.floor(capGb * 1024 * 1024 * 1024);

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicUrl,
    hardCapBytes,
  };
}

function requireR2Config(): R2Config {
  const cfg = getR2Config();
  if (!cfg) {
    throw new DriveError("Cloudflare R2가 설정되지 않았습니다.", 503);
  }
  return cfg;
}

/** Decode common XML named and numeric entities returned by S3 XML responses. */
export function decodeXmlEntities(value: string): string {
  return value.replace(
    /&(amp|lt|gt|quot|apos|#(\d+)|#x([0-9a-fA-F]+));/g,
    (full, name: string, dec?: string, hex?: string) => {
      switch (name) {
        case "amp":
          return "&";
        case "lt":
          return "<";
        case "gt":
          return ">";
        case "quot":
          return '"';
        case "apos":
          return "'";
        default: {
          const code = dec
            ? Number.parseInt(dec, 10)
            : hex
              ? Number.parseInt(hex, 16)
              : NaN;
          return Number.isSafeInteger(code) && code >= 0 && code <= 0x10ffff
            ? String.fromCodePoint(code)
            : full;
        }
      }
    },
  );
}

/** Escape special characters for safe S3 XML request payloads. */
export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function extractXmlTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return match ? decodeXmlEntities(match[1]) : null;
}

/** Parse an S3 ListObjectsV2 XML body into folders, objects, and pagination marker. */
export function parseListObjectsV2Xml(xml: string): {
  isTruncated: boolean;
  nextContinuationToken: string | null;
  commonPrefixes: string[];
  contents: {
    key: string;
    size: number;
    lastModified: string;
    etag: string;
  }[];
} {
  const isTruncated =
    (extractXmlTag(xml, "IsTruncated") || "").toLowerCase() === "true";
  const nextContinuationToken = extractXmlTag(xml, "NextContinuationToken");

  const commonPrefixes: string[] = [];
  const cpRegex = /<CommonPrefixes>([\s\S]*?)<\/CommonPrefixes>/g;
  for (const m of xml.matchAll(cpRegex)) {
    const p = extractXmlTag(m[1], "Prefix");
    if (p) commonPrefixes.push(p);
  }

  const contents: {
    key: string;
    size: number;
    lastModified: string;
    etag: string;
  }[] = [];
  const objRegex = /<Contents>([\s\S]*?)<\/Contents>/g;
  for (const m of xml.matchAll(objRegex)) {
    const key = extractXmlTag(m[1], "Key");
    if (!key) continue;
    const size = Number.parseInt(extractXmlTag(m[1], "Size") || "0", 10) || 0;
    const lastModified = extractXmlTag(m[1], "LastModified") || "";
    const etag = extractXmlTag(m[1], "ETag") || "";
    contents.push({ key, size, lastModified, etag });
  }

  return { isTruncated, nextContinuationToken, commonPrefixes, contents };
}

/** Extract UploadId from S3 CreateMultipartUpload XML response. */
export function parseUploadIdXml(xml: string): string | null {
  const id = extractXmlTag(xml, "UploadId");
  return id && id.trim() ? id.trim() : null;
}

/** Build S3 CompleteMultipartUpload XML payload sorted by partNumber. */
export function buildCompleteMultipartXml(
  parts: { partNumber: number; etag: string }[],
): string {
  const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);
  const body = sorted
    .map(
      (p) =>
        `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${escapeXml(p.etag)}</ETag></Part>`,
    )
    .join("");
  return `<CompleteMultipartUpload>${body}</CompleteMultipartUpload>`;
}

/** Validate and normalize an R2 folder prefix (empty string for root or ending with '/'). */
export function normalizeR2Prefix(rawPrefix: unknown): string {
  if (rawPrefix === null || rawPrefix === undefined) return "";
  if (typeof rawPrefix !== "string") {
    throw new DriveError("잘못된 R2 폴더 경로입니다.", 400);
  }
  const trimmed = rawPrefix.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (!trimmed) return "";
  if (trimmed.length > R2_MAX_KEY_LEN || trimmed.includes("\0")) {
    throw new DriveError("허용되지 않는 R2 폴더 경로입니다.", 400);
  }
  const segments = trimmed.split("/");
  for (const seg of segments) {
    if (!seg || seg === "." || seg === "..") {
      throw new DriveError("경로에 '.' 또는 '..'를 사용할 수 없습니다.", 400);
    }
    validateDisplayName(seg);
  }
  return `${segments.join("/")}/`;
}

/** Validate and normalize an R2 object key (no leading slash, no dot traversal). */
export function normalizeR2Key(rawKey: unknown): string {
  if (typeof rawKey !== "string") {
    throw new DriveError("잘못된 R2 파일 키입니다.", 400);
  }
  const trimmed = rawKey.trim().replace(/^\/+/, "");
  if (
    !trimmed ||
    trimmed.endsWith("/") ||
    trimmed.length > R2_MAX_KEY_LEN ||
    trimmed.includes("\0")
  ) {
    throw new DriveError("허용되지 않는 R2 파일 키입니다.", 400);
  }
  const segments = trimmed.split("/");
  for (const seg of segments) {
    if (!seg || seg === "." || seg === ".." || seg.includes("\\")) {
      throw new DriveError("유효하지 않은 R2 파일 경로입니다.", 400);
    }
    for (let i = 0; i < seg.length; i += 1) {
      const code = seg.charCodeAt(i);
      if (code < 0x20 || code === 0x7f) {
        throw new DriveError("경로에 제어 문자를 포함할 수 없습니다.", 400);
      }
    }
  }
  return segments.join("/");
}

/** Sign an S3-compatible request for Cloudflare R2 using AWS Signature Version 4. */
export function signR2Request(opts: {
  config: R2Config;
  method: "GET" | "HEAD" | "PUT" | "POST" | "DELETE";
  key?: string;
  query?: [string, string][];
  headers?: Record<string, string>;
  payloadHash?: string;
  now?: Date;
}): { url: string; headers: Record<string, string> } {
  const date = opts.now ?? new Date();
  const amzDate = date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const dateStamp = amzDate.slice(0, 8);
  const host = `${opts.config.accountId}.r2.cloudflarestorage.com`;

  const cleanKey = (opts.key || "").replace(/^\/+/, "");
  const encodedKey = cleanKey
    ? cleanKey.split("/").map(encodeRfc3986).join("/")
    : "";
  const canonicalUri = encodedKey
    ? `/${encodeRfc3986(opts.config.bucketName)}/${encodedKey}`
    : `/${encodeRfc3986(opts.config.bucketName)}`;

  const queryPairs = (opts.query || [])
    .map(([k, v]) => [encodeRfc3986(k), encodeRfc3986(v)] as [string, string])
    .sort((a, b) =>
      a[0] === b[0]
        ? a[1].localeCompare(b[1])
        : a[0].localeCompare(b[0]),
    );
  const canonicalQueryString = queryPairs
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  const payloadHash = opts.payloadHash || EMPTY_SHA256;

  const signingMap = new Map<string, string>();
  const finalHeaders: Record<string, string> = {};

  signingMap.set("host", host);
  signingMap.set("x-amz-content-sha256", payloadHash);
  signingMap.set("x-amz-date", amzDate);

  finalHeaders["x-amz-content-sha256"] = payloadHash;
  finalHeaders["x-amz-date"] = amzDate;

  if (opts.headers) {
    for (const [rawK, rawV] of Object.entries(opts.headers)) {
      const lower = rawK.toLowerCase();
      const val = rawV.trim().replace(/\s+/g, " ");
      finalHeaders[rawK] = rawV;
      if (lower === "content-md5" || lower.startsWith("x-amz-")) {
        signingMap.set(lower, val);
      }
    }
  }

  const sortedHeaderKeys = [...signingMap.keys()].sort();
  const canonicalHeaders =
    sortedHeaderKeys.map((k) => `${k}:${signingMap.get(k)!}`).join("\n") + "\n";
  const signedHeaders = sortedHeaderKeys.join(";");

  const canonicalRequest = [
    opts.method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const credentialScope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const kDate = hmacSha256(`AWS4${opts.config.secretAccessKey}`, dateStamp);
  const kRegion = hmacSha256(kDate, "auto");
  const kService = hmacSha256(kRegion, "s3");
  const kSigning = hmacSha256(kService, "aws4_request");
  const signature = crypto
    .createHmac("sha256", kSigning)
    .update(stringToSign, "utf8")
    .digest("hex");

  finalHeaders["Authorization"] =
    `AWS4-HMAC-SHA256 Credential=${opts.config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const url = `https://${host}${canonicalUri}${canonicalQueryString ? `?${canonicalQueryString}` : ""}`;
  return { url, headers: finalHeaders };
}

async function r2Fetch(opts: {
  config: R2Config;
  method: "GET" | "HEAD" | "PUT" | "POST" | "DELETE";
  key?: string;
  query?: [string, string][];
  headers?: Record<string, string>;
  body?: Uint8Array | string | null;
}): Promise<Response> {
  const payloadHash =
    opts.body !== undefined && opts.body !== null
      ? sha256Hex(opts.body)
      : EMPTY_SHA256;

  const signed = signR2Request({
    config: opts.config,
    method: opts.method,
    key: opts.key,
    query: opts.query,
    headers: opts.headers,
    payloadHash,
  });

  const bodyInit: BodyInit | undefined =
    opts.body === undefined || opts.body === null
      ? undefined
      : typeof opts.body === "string"
        ? opts.body
        : Uint8Array.from(opts.body);

  return fetch(signed.url, {
    method: opts.method,
    headers: signed.headers,
    body: bodyInit,
    signal: AbortSignal.timeout(120_000),
  });
}

function buildPublicObjectUrl(config: R2Config, key: string): string {
  const encodedPath = key.split("/").map(encodeURIComponent).join("/");
  return `${config.publicUrl}/${encodedPath}`;
}

function invalidateUsageCache() {
  global.__r2UsageCache = undefined;
}

/** Query live R2 bucket byte total (30s cached) to enforce the free-tier hard cap. */
export async function getR2BucketUsage(
  config: R2Config,
  forceRefresh = false,
): Promise<{ usedBytes: number; objectCount: number }> {
  const cacheKey = `${config.accountId}:${config.bucketName}`;
  const cached = global.__r2UsageCache;
  if (
    !forceRefresh &&
    cached &&
    cached.cacheKey === cacheKey &&
    Date.now() - cached.fetchedAt < R2_USAGE_CACHE_MS
  ) {
    return { usedBytes: cached.usedBytes, objectCount: cached.objectCount };
  }

  let usedBytes = 0;
  let objectCount = 0;
  let token: string | null = null;

  for (let page = 0; page < 50; page += 1) {
    const query: [string, string][] = [
      ["list-type", "2"],
      ["max-keys", "1000"],
    ];
    if (token) query.push(["continuation-token", token]);

    const res = await r2Fetch({ config, method: "GET", query });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[R2] Usage list failed:", res.status, errText.slice(0, 300));
      throw new DriveError("R2 버킷 사용량 조회에 실패했습니다.", 502);
    }

    const parsed = parseListObjectsV2Xml(await res.text());
    for (const obj of parsed.contents) {
      usedBytes += obj.size;
      if (!obj.key.endsWith("/.keep") && !obj.key.endsWith("/") && obj.key !== ".keep") {
        objectCount += 1;
      }
    }

    if (!parsed.isTruncated || !parsed.nextContinuationToken) break;
    token = parsed.nextContinuationToken;
  }

  global.__r2UsageCache = {
    cacheKey,
    usedBytes,
    objectCount,
    fetchedAt: Date.now(),
  };

  return { usedBytes, objectCount };
}

/** Enforce hard cap strictly below the 10 GB free-tier ceiling before uploading. */
export function assertWithinR2HardCap(
  usedBytes: number,
  incomingBytes: number,
  hardCapBytes: number,
): void {
  if (incomingBytes <= 0) {
    throw new DriveError("빈 파일은 업로드할 수 없습니다.", 400);
  }
  if (usedBytes + incomingBytes > hardCapBytes) {
    const capGb = (hardCapBytes / (1024 * 1024 * 1024)).toFixed(1);
    throw new DriveError(
      `R2 무료 안전 한도(${capGb} GB)를 초과하여 업로드가 차단되었습니다.`,
      507,
    );
  }
}

function makeR2FileItem(
  config: R2Config,
  obj: { key: string; size: number; lastModified: string },
  includeFolderLabel: boolean,
): R2FileItem {
  const slashIdx = obj.key.lastIndexOf("/");
  const rawName = slashIdx >= 0 ? obj.key.slice(slashIdx + 1) : obj.key;
  const displayName = rawName.replace(/^\d{13}-[0-9a-f]{4}-/, "") || rawName;
  const ext = path.extname(rawName).toLowerCase();
  const { mime, category } = classifyFile(ext);
  const dirPart = slashIdx > 0 ? obj.key.slice(0, slashIdx) : "";
  return {
    key: obj.key,
    name: displayName,
    size: obj.size,
    ext,
    mime,
    category,
    lastModified: obj.lastModified || new Date().toISOString(),
    url: buildPublicObjectUrl(config, obj.key),
    folderLabel: includeFolderLabel ? (dirPart ? `R2 / ${dirPart}` : "R2 루트") : undefined,
  };
}

function buildR2Breadcrumbs(prefix: string): { prefix: string; name: string }[] {
  const crumbs: { prefix: string; name: string }[] = [
    { prefix: "", name: "R2 루트" },
  ];
  if (!prefix) return crumbs;
  const parts = prefix.replace(/\/+$/, "").split("/").filter(Boolean);
  let acc = "";
  for (const part of parts) {
    acc += `${part}/`;
    crumbs.push({ prefix: acc, name: part });
  }
  return crumbs;
}

/** List R2 folders and files inside prefix (or search across all objects when q is non-empty). */
export async function listR2Prefix(opts: {
  prefix?: string;
  q?: string;
  sort?: DriveSortField;
  dir?: DriveSortDir;
}): Promise<R2ListResponse> {
  const config = getR2Config();
  if (!config) {
    return {
      configured: false,
      prefix: "",
      breadcrumbs: [{ prefix: "", name: "R2 루트" }],
      folders: [],
      files: [],
      stats: null,
    };
  }

  const prefix = normalizeR2Prefix(opts.prefix || "");
  const queryText = (opts.q || "").trim().toLowerCase();
  const sort: DriveSortField = opts.sort || "updated";
  const dir: DriveSortDir = opts.dir || (sort === "name" ? "asc" : "desc");

  const folderMap = new Map<string, R2FolderItem>();
  const fileList: R2FileItem[] = [];
  let token: string | null = null;

  for (let page = 0; page < 20; page += 1) {
    const query: [string, string][] = [
      ["list-type", "2"],
      ["max-keys", "1000"],
    ];
    if (!queryText) {
      query.push(["delimiter", "/"]);
      if (prefix) query.push(["prefix", prefix]);
    } else if (prefix) {
      query.push(["prefix", prefix]);
    }
    if (token) query.push(["continuation-token", token]);

    const res = await r2Fetch({ config, method: "GET", query });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[R2] ListObjectsV2 failed:", res.status, errText.slice(0, 300));
      throw new DriveError("R2 버킷 목록을 조회하지 못했습니다.", 502);
    }

    const parsed = parseListObjectsV2Xml(await res.text());
    for (const cp of parsed.commonPrefixes) {
      const cleaned = cp.replace(/\/+$/, "");
      const name = cleaned.split("/").pop() || cleaned;
      if (name && !folderMap.has(cp)) {
        folderMap.set(cp, { prefix: cp, name });
      }
    }

    for (const obj of parsed.contents) {
      if (obj.key === ".keep" || obj.key.endsWith("/.keep") || obj.key.endsWith("/")) {
        continue;
      }
      const item = makeR2FileItem(config, obj, Boolean(queryText));
      if (queryText && !item.name.toLowerCase().includes(queryText) && !item.key.toLowerCase().includes(queryText)) {
        continue;
      }
      fileList.push(item);
    }

    if (!parsed.isTruncated || !parsed.nextContinuationToken) break;
    token = parsed.nextContinuationToken;
  }

  const mult = dir === "asc" ? 1 : -1;
  const folders = [...folderMap.values()].sort(
    (a, b) => a.name.localeCompare(b.name, "ko") * mult,
  );

  fileList.sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name, "ko") * mult;
    if (sort === "size" && a.size !== b.size) return (a.size - b.size) * mult;
    return (
      (new Date(a.lastModified).getTime() - new Date(b.lastModified).getTime()) *
      mult
    );
  });

  const usage = await getR2BucketUsage(config, false);
  const stats: R2StorageStats = {
    usedBytes: usage.usedBytes,
    hardCapBytes: config.hardCapBytes,
    freeTierBytes: FREE_TIER_BYTES,
    objectCount: usage.objectCount,
    bucketName: config.bucketName,
    publicUrl: config.publicUrl,
  };

  return {
    configured: true,
    prefix,
    breadcrumbs: queryText
      ? [{ prefix: "", name: prefix ? `검색 (${prefix.replace(/\/$/, "")})` : "R2 전체 검색" }]
      : buildR2Breadcrumbs(prefix),
    folders: queryText ? [] : folders,
    files: fileList,
    stats,
  };
}

/** Create an empty folder marker (.keep) under an R2 prefix. */
export async function createR2Folder(
  rawPrefix: unknown,
  rawName: unknown,
): Promise<R2FolderItem> {
  const config = requireR2Config();
  const basePrefix = normalizeR2Prefix(rawPrefix || "");
  const name = validateDisplayName(rawName);
  const nextPrefix = normalizeR2Prefix(`${basePrefix}${name}`);
  const markerKey = `${nextPrefix}.keep`;

  const res = await r2Fetch({
    config,
    method: "PUT",
    key: markerKey,
    headers: { "Content-Type": "application/octet-stream" },
    body: new Uint8Array(0),
  });
  if (!res.ok) {
    throw new DriveError("R2 폴더 생성에 실패했습니다.", 502);
  }
  invalidateUsageCache();
  return { prefix: nextPrefix, name };
}

/** Upload a single buffered object (<= 20MB) directly to Cloudflare R2. */
export async function putR2Object(input: {
  key: string;
  body: Uint8Array;
  contentType: string;
  contentDisposition?: string;
}): Promise<R2FileItem> {
  const config = requireR2Config();
  const key = normalizeR2Key(input.key);
  const usage = await getR2BucketUsage(config, false);
  assertWithinR2HardCap(usage.usedBytes, input.body.byteLength, config.hardCapBytes);

  const headers: Record<string, string> = {
    "Content-Type": input.contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  if (input.contentDisposition) {
    headers["Content-Disposition"] = input.contentDisposition;
  }

  const res = await r2Fetch({
    config,
    method: "PUT",
    key,
    headers,
    body: input.body,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[R2] PutObject failed:", res.status, errText.slice(0, 300));
    throw new DriveError("R2 파일 업로드에 실패했습니다.", 502);
  }

  invalidateUsageCache();
  return makeR2FileItem(
    config,
    { key, size: input.body.byteLength, lastModified: new Date().toISOString() },
    false,
  );
}

/** Delete R2 object keys and/or folder prefixes (recursive up to 500 keys per prefix). */
export async function deleteR2Targets(input: {
  keys?: unknown[];
  prefixes?: unknown[];
}): Promise<{ deletedCount: number }> {
  const config = requireR2Config();
  const keysToDelete = new Set<string>();

  if (Array.isArray(input.keys)) {
    for (const rawKey of input.keys) {
      keysToDelete.add(normalizeR2Key(rawKey));
    }
  }

  if (Array.isArray(input.prefixes)) {
    for (const rawPref of input.prefixes) {
      const prefix = normalizeR2Prefix(rawPref);
      if (!prefix) {
        throw new DriveError("루트 버킷 전체는 삭제할 수 없습니다.", 400);
      }
      const query: [string, string][] = [
        ["list-type", "2"],
        ["max-keys", "500"],
        ["prefix", prefix],
      ];
      const res = await r2Fetch({ config, method: "GET", query });
      if (!res.ok) {
        throw new DriveError("삭제할 R2 폴더 내용을 읽지 못했습니다.", 502);
      }
      const parsed = parseListObjectsV2Xml(await res.text());
      for (const obj of parsed.contents) {
        keysToDelete.add(obj.key);
      }
    }
  }

  if (keysToDelete.size === 0) return { deletedCount: 0 };
  if (keysToDelete.size > 500) {
    throw new DriveError("한 번에 최대 500개 개체까지만 삭제할 수 있습니다.", 400);
  }

  const keysArr = [...keysToDelete];
  if (keysArr.length === 1) {
    const res = await r2Fetch({
      config,
      method: "DELETE",
      key: keysArr[0],
    });
    if (!res.ok && res.status !== 404) {
      throw new DriveError("R2 개체 삭제에 실패했습니다.", 502);
    }
  } else {
    const xml = `<Delete><Quiet>true</Quiet>${keysArr
      .map((k) => `<Object><Key>${escapeXml(k)}</Key></Object>`)
      .join("")}</Delete>`;
    const md5 = crypto.createHash("md5").update(xml, "utf8").digest("base64");
    const res = await r2Fetch({
      config,
      method: "POST",
      query: [["delete", ""]],
      headers: {
        "Content-Type": "application/xml",
        "Content-MD5": md5,
      },
      body: xml,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[R2] DeleteObjects failed:", res.status, errText.slice(0, 300));
      throw new DriveError("R2 일괄 삭제에 실패했습니다.", 502);
    }
  }

  invalidateUsageCache();
  return { deletedCount: keysArr.length };
}

async function createR2MultipartOnServer(
  config: R2Config,
  key: string,
  contentType: string,
  contentDisposition?: string,
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=31536000, immutable",
  };
  if (contentDisposition) {
    headers["Content-Disposition"] = contentDisposition;
  }

  const res = await r2Fetch({
    config,
    method: "POST",
    key,
    query: [["uploads", ""]],
    headers,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[R2] CreateMultipartUpload failed:", res.status, errText.slice(0, 300));
    throw new DriveError("R2 멀티파트 업로드 시작에 실패했습니다.", 502);
  }
  const uploadId = parseUploadIdXml(await res.text());
  if (!uploadId) {
    throw new DriveError("R2 UploadId를 파싱할 수 없습니다.", 502);
  }
  return uploadId;
}

async function uploadR2PartDirect(
  config: R2Config,
  key: string,
  r2UploadId: string,
  partNumber: number,
  body: Uint8Array,
): Promise<string> {
  const res = await r2Fetch({
    config,
    method: "PUT",
    key,
    query: [
      ["partNumber", String(partNumber)],
      ["uploadId", r2UploadId],
    ],
    headers: { "Content-Type": "application/octet-stream" },
    body,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[R2] UploadPart failed:", res.status, errText.slice(0, 300));
    throw new DriveError("R2 파트 업로드에 실패했습니다.", 502);
  }
  const etag = res.headers.get("etag") || res.headers.get("ETag");
  if (!etag) {
    throw new DriveError("R2 파트 ETag 응답이 없습니다.", 502);
  }
  return etag;
}

async function completeR2MultipartOnServer(
  config: R2Config,
  key: string,
  r2UploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  const xml = buildCompleteMultipartXml(parts);
  const res = await r2Fetch({
    config,
    method: "POST",
    key,
    query: [["uploadId", r2UploadId]],
    headers: { "Content-Type": "application/xml" },
    body: xml,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.error("[R2] CompleteMultipartUpload failed:", res.status, errText.slice(0, 300));
    throw new DriveError("R2 멀티파트 완료 처리에 실패했습니다.", 502);
  }
}

async function abortR2MultipartOnServer(
  config: R2Config,
  key: string,
  r2UploadId: string,
): Promise<void> {
  await r2Fetch({
    config,
    method: "DELETE",
    key,
    query: [["uploadId", r2UploadId]],
  }).catch(() => undefined);
}

/** Clean up expired local metadata entries for R2 multipart uploads and abort remotely. */
export async function cleanupExpiredR2Sessions(): Promise<void> {
  const config = getR2Config();
  const store = getMultipartStore();
  const now = Date.now();
  for (const [id, session] of store.entries()) {
    if (session.expiresAt < now) {
      store.delete(id);
      if (config) {
        await abortR2MultipartOnServer(config, session.key, session.r2UploadId);
      }
    }
  }
}

function assertR2MultipartOwner(
  uploadId: unknown,
  sessionToken: string,
): R2MultipartSession {
  if (typeof uploadId !== "string" || !/^[0-9a-f-]{36}$/.test(uploadId)) {
    throw new DriveError("잘못된 R2 업로드 ID입니다.", 400);
  }
  const store = getMultipartStore();
  const session = store.get(uploadId);
  if (!session) {
    throw new DriveError("R2 업로드 세션을 찾을 수 없거나 만료되었습니다.", 404);
  }
  if (session.expiresAt < Date.now()) {
    store.delete(uploadId);
    const config = getR2Config();
    if (config) {
      void abortR2MultipartOnServer(config, session.key, session.r2UploadId);
    }
    throw new DriveError("R2 업로드 세션이 만료되었습니다.", 404);
  }
  if (!timingSafeEqualStr(session.ownerTokenHash, sha256Hex(sessionToken))) {
    throw new DriveError("이 R2 업로드 세션에 접근할 권한이 없습니다.", 403);
  }
  return session;
}

/** Build sanitized destination R2 key + Content-Type + Content-Disposition for upload. */
export function prepareR2ObjectMeta(input: {
  fileName: string;
  basePrefix?: unknown;
  dirSegments?: string[];
  exactStorageName?: string;
  displayNameOverride?: string;
}): {
  key: string;
  finalExt: string;
  displayName: string;
  contentType: string;
  contentDisposition?: string;
} {
  const basePrefix = normalizeR2Prefix(input.basePrefix || "");
  let subPrefix = basePrefix;
  if (input.dirSegments && input.dirSegments.length > 0) {
    for (const seg of input.dirSegments) {
      subPrefix = normalizeR2Prefix(`${subPrefix}${validateDisplayName(seg)}`);
    }
  }

  let storageName: string;
  let finalExt: string;
  let displayName: string;
  if (input.exactStorageName) {
    const san = sanitizeUploadFilename(input.displayNameOverride || input.fileName);
    storageName = input.exactStorageName;
    finalExt = path.extname(storageName).toLowerCase() || san.finalExt;
    displayName = san.displayName;
  } else {
    const san = sanitizeUploadFilename(input.fileName);
    storageName = san.storageName;
    finalExt = san.finalExt;
    displayName = san.displayName;
  }

  const key = normalizeR2Key(`${subPrefix}${storageName}`);
  const { mime } = classifyFile(finalExt);
  const isInlineSafe =
    IMAGE_EXTENSIONS.has(finalExt) ||
    mime.startsWith("video/") ||
    mime.startsWith("audio/");
  const contentDisposition = isInlineSafe
    ? undefined
    : buildContentDisposition("attachment", displayName);

  return {
    key,
    finalExt,
    displayName,
    contentType: mime,
    contentDisposition,
  };
}

/** Initialize a multipart upload session directly against Cloudflare R2. */
export async function initR2Multipart(input: {
  fileName: unknown;
  totalSize: unknown;
  chunkSize?: unknown;
  prefix?: unknown;
  dirSegments?: string[];
  sessionToken: string;
}): Promise<{ uploadId: string; chunkSize: number; totalChunks: number }> {
  const config = requireR2Config();
  await cleanupExpiredR2Sessions();

  const store = getMultipartStore();
  if (store.size >= R2_MAX_ACTIVE_MULTIPART) {
    throw new DriveError(
      `동시 진행 가능한 R2 대용량 업로드(${R2_MAX_ACTIVE_MULTIPART}개)를 초과했습니다.`,
      429,
    );
  }

  if (typeof input.fileName !== "string" || !input.fileName.trim()) {
    throw new DriveError("파일명이 없습니다.", 400);
  }
  if (
    typeof input.totalSize !== "number" ||
    !Number.isSafeInteger(input.totalSize) ||
    input.totalSize <= 0
  ) {
    throw new DriveError("올바르지 않은 파일 크기입니다.", 400);
  }
  if (input.totalSize > R2_MAX_MULTIPART_FILE_SIZE) {
    throw new DriveError("R2 단일 파일 업로드는 최대 4GB까지 지원합니다.", 413);
  }

  const chunkSize =
    typeof input.chunkSize === "number" && Number.isSafeInteger(input.chunkSize)
      ? input.chunkSize
      : R2_DEFAULT_PART_SIZE;
  if (chunkSize < R2_MIN_PART_SIZE || chunkSize > R2_MAX_PART_SIZE) {
    throw new DriveError("R2 파트 크기는 5MB ~ 50MB 사이여야 합니다.", 400);
  }

  const totalChunks = Math.ceil(input.totalSize / chunkSize);
  if (totalChunks < 1 || totalChunks > R2_MAX_PARTS) {
    throw new DriveError(`최대 파트 수(${R2_MAX_PARTS}개)를 초과했습니다.`, 400);
  }

  const usage = await getR2BucketUsage(config, false);
  assertWithinR2HardCap(usage.usedBytes, input.totalSize, config.hardCapBytes);

  const meta = prepareR2ObjectMeta({
    fileName: input.fileName,
    basePrefix: input.prefix,
    dirSegments: input.dirSegments,
  });

  const r2UploadId = await createR2MultipartOnServer(
    config,
    meta.key,
    meta.contentType,
    meta.contentDisposition,
  );

  const uploadId = crypto.randomUUID();
  const now = Date.now();
  store.set(uploadId, {
    uploadId,
    r2UploadId,
    ownerTokenHash: sha256Hex(input.sessionToken),
    key: meta.key,
    displayName: meta.displayName,
    finalExt: meta.finalExt,
    contentType: meta.contentType,
    totalSize: input.totalSize,
    chunkSize,
    totalChunks,
    parts: new Map<number, string>(),
    inFlightParts: new Set<number>(),
    createdAt: now,
    expiresAt: now + R2_MULTIPART_TTL_MS,
  });

  return { uploadId, chunkSize, totalChunks };
}

/** Stream a bounded chunk from the client request directly to Cloudflare R2 UploadPart. */
export async function uploadR2Part(input: {
  uploadId: unknown;
  index: number;
  sessionToken: string;
  contentLength: number | null;
  bodyStream: ReadableStream<Uint8Array> | null;
}): Promise<{ index: number; totalChunks: number }> {
  const config = requireR2Config();
  const session = assertR2MultipartOwner(input.uploadId, input.sessionToken);

  if (
    !Number.isSafeInteger(input.index) ||
    input.index < 0 ||
    input.index >= session.totalChunks
  ) {
    throw new DriveError("잘못된 파트 인덱스입니다.", 400);
  }
  if (!input.bodyStream) {
    throw new DriveError("파트 본문이 비어 있습니다.", 400);
  }

  const expectedLen = Math.min(
    session.chunkSize,
    session.totalSize - input.index * session.chunkSize,
  );
  if (
    input.contentLength !== null &&
    Number.isFinite(input.contentLength) &&
    input.contentLength !== expectedLen
  ) {
    throw new DriveError(
      `파트 크기가 일치하지 않습니다 (예상 ${expectedLen} bytes).`,
      input.contentLength > expectedLen ? 413 : 400,
    );
  }

  if (session.inFlightParts.has(input.index)) {
    throw new DriveError("동일 파트가 이미 업로드 중입니다.", 409);
  }
  session.inFlightParts.add(input.index);

  const buffer = Buffer.allocUnsafe(expectedLen);
  let offset = 0;
  const reader = input.bodyStream.getReader();

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      if (offset + value.byteLength > expectedLen) {
        await reader.cancel().catch(() => undefined);
        throw new DriveError("파트 크기가 지정된 길이를 초과했습니다.", 413);
      }
      Buffer.from(value.buffer, value.byteOffset, value.byteLength).copy(
        buffer,
        offset,
      );
      offset += value.byteLength;
    }

    if (offset !== expectedLen) {
      throw new DriveError(
        `파트 데이터가 불완전합니다 (${offset}/${expectedLen} bytes).`,
        400,
      );
    }

    if (input.index === 0 && IMAGE_EXTENSIONS.has(session.finalExt)) {
      if (!matchesImageMagicBytes(session.finalExt, buffer.subarray(0, 12))) {
        getMultipartStore().delete(session.uploadId);
        await abortR2MultipartOnServer(config, session.key, session.r2UploadId);
        throw new DriveError(
          "이미지 파일의 실제 시그니처가 확장자와 일치하지 않습니다.",
          400,
        );
      }
    }

    const partNumber = input.index + 1;
    const etag = await uploadR2PartDirect(
      config,
      session.key,
      session.r2UploadId,
      partNumber,
      buffer,
    );
    session.parts.set(partNumber, etag);
    session.expiresAt = Date.now() + R2_MULTIPART_TTL_MS;

    return { index: input.index, totalChunks: session.totalChunks };
  } finally {
    reader.releaseLock();
    session.inFlightParts.delete(input.index);
  }
}

/** Finalize an R2 multipart upload and return the resulting CDN file item. */
export async function completeR2Multipart(input: {
  uploadId: unknown;
  sessionToken: string;
}): Promise<{ file: R2FileItem }> {
  const config = requireR2Config();
  const session = assertR2MultipartOwner(input.uploadId, input.sessionToken);

  if (session.inFlightParts.size > 0) {
    throw new DriveError("아직 전송 중인 파트가 있습니다.", 409);
  }

  const partsList: { partNumber: number; etag: string }[] = [];
  for (let i = 1; i <= session.totalChunks; i += 1) {
    const etag = session.parts.get(i);
    if (!etag) {
      throw new DriveError(`누락된 파트(${i - 1})가 있어 완료할 수 없습니다.`, 400);
    }
    partsList.push({ partNumber: i, etag });
  }

  const usage = await getR2BucketUsage(config, true);
  assertWithinR2HardCap(usage.usedBytes, session.totalSize, config.hardCapBytes);

  await completeR2MultipartOnServer(
    config,
    session.key,
    session.r2UploadId,
    partsList,
  );
  getMultipartStore().delete(session.uploadId);
  invalidateUsageCache();

  return {
    file: makeR2FileItem(
      config,
      {
        key: session.key,
        size: session.totalSize,
        lastModified: new Date().toISOString(),
      },
      false,
    ),
  };
}

/** Abort an R2 multipart upload session locally and on Cloudflare R2. */
export async function abortR2Multipart(input: {
  uploadId: unknown;
  sessionToken: string;
}): Promise<void> {
  if (typeof input.uploadId !== "string" || !/^[0-9a-f-]{36}$/.test(input.uploadId)) {
    return;
  }
  const store = getMultipartStore();
  const session = store.get(input.uploadId);
  if (!session) return;
  if (!timingSafeEqualStr(session.ownerTokenHash, sha256Hex(input.sessionToken))) {
    throw new DriveError("이 R2 업로드 세션을 취소할 권한이 없습니다.", 403);
  }
  store.delete(input.uploadId);
  const config = getR2Config();
  if (config) {
    await abortR2MultipartOnServer(config, session.key, session.r2UploadId);
  }
}

/** Replicate a local Drive file to Cloudflare R2 (direct PUT <= 20MB or streamed Multipart > 20MB). */
export async function copyLocalFileToR2(
  fileId: string,
  rawTargetPrefix?: unknown,
): Promise<{ fileId: string; key: string; url: string; name: string }> {
  const config = requireR2Config();
  const localFile = await getFileById(fileId);
  if (!localFile) {
    throw new DriveError("복제할 로컬 파일을 찾을 수 없습니다.", 404);
  }

  const resolved = await resolveSafeUploadPath(localFile.storageName);
  if (!resolved) {
    throw new DriveError("로컬 디스크에서 파일을 찾을 수 없습니다.", 404);
  }

  const usage = await getR2BucketUsage(config, true);
  assertWithinR2HardCap(usage.usedBytes, resolved.size, config.hardCapBytes);

  const meta = prepareR2ObjectMeta({
    fileName: localFile.name,
    basePrefix: rawTargetPrefix || "",
    exactStorageName: localFile.storageName,
    displayNameOverride: localFile.name,
  });

  if (resolved.size <= R2_DEFAULT_PART_SIZE) {
    const handle = await open(resolved.realFilePath, "r");
    try {
      const buf = Buffer.allocUnsafe(resolved.size);
      let readTotal = 0;
      while (readTotal < resolved.size) {
        const { bytesRead } = await handle.read(
          buf,
          readTotal,
          resolved.size - readTotal,
          readTotal,
        );
        if (bytesRead === 0) break;
        readTotal += bytesRead;
      }
      const created = await putR2Object({
        key: meta.key,
        body: buf.subarray(0, readTotal),
        contentType: meta.contentType,
        contentDisposition: meta.contentDisposition,
      });
      return {
        fileId: localFile.id,
        key: created.key,
        url: created.url,
        name: created.name,
      };
    } finally {
      await handle.close().catch(() => undefined);
    }
  }

  const r2UploadId = await createR2MultipartOnServer(
    config,
    meta.key,
    meta.contentType,
    meta.contentDisposition,
  );
  const handle = await open(resolved.realFilePath, "r");

  try {
    const parts: { partNumber: number; etag: string }[] = [];
    const totalParts = Math.ceil(resolved.size / R2_DEFAULT_PART_SIZE);
    for (let idx = 0; idx < totalParts; idx += 1) {
      const fileOffset = idx * R2_DEFAULT_PART_SIZE;
      const partLen = Math.min(R2_DEFAULT_PART_SIZE, resolved.size - fileOffset);
      const buf = Buffer.allocUnsafe(partLen);
      let filled = 0;
      while (filled < partLen) {
        const { bytesRead } = await handle.read(
          buf,
          filled,
          partLen - filled,
          fileOffset + filled,
        );
        if (bytesRead === 0) break;
        filled += bytesRead;
      }
      const etag = await uploadR2PartDirect(
        config,
        meta.key,
        r2UploadId,
        idx + 1,
        buf.subarray(0, filled),
      );
      parts.push({ partNumber: idx + 1, etag });
    }

    await completeR2MultipartOnServer(config, meta.key, r2UploadId, parts);
    invalidateUsageCache();

    return {
      fileId: localFile.id,
      key: meta.key,
      url: buildPublicObjectUrl(config, meta.key),
      name: localFile.name,
    };
  } catch (err) {
    await abortR2MultipartOnServer(config, meta.key, r2UploadId);
    throw err;
  } finally {
    await handle.close().catch(() => undefined);
  }
}
