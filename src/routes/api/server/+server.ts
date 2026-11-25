import type { RequestHandler } from "./$types";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { verifySync } from "otplib";
import {
  addWhitelistUser,
  ensureDdnsUser,
  getWhitelistUsers,
  isAdmin,
  removeWhitelistUser,
  saveWhitelistUsers,
} from "#lib/server/ddns.ts";
import {
  extractClientIp,
  generateToken,
  getOtpConsumedStore,
  getSessionStore,
  safePeerIp,
  SESSION_TTL,
  validateSession,
} from "#lib/server/session.ts";

const execFilePromise = promisify(execFile);
const CONTAINER_NAME = process.env.MC_CONTAINER_NAME?.trim() || "minecraft-server";
const LOG_FILE_PATH = path.join(process.cwd(), "server_logs.json");
const ALLOWED_ACTIONS = new Set([
  "login",
  "logout",
  "start",
  "stop",
  "getLogs",
  "getWhitelist",
  "addWhitelist",
  "removeWhitelist",
  "updateWhitelist",
]);

const OTP_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5_000;

interface OtpAttempt {
  count: number;
  lastAttemptAt: number;
  lockoutUntil: number;
}

interface ServerActionBody {
  action?: string;
  token?: string;
  otpTokens?: unknown;
  whitelistItem?: { id?: string; name?: string };
  targetId?: string;
}

const OTP_SECRET_SLOTS = 3;

function getConfiguredOtpSecrets(): [string, string, string] | null {
  const secrets = [
    process.env.ADMIN_OTP_SECRET?.trim() || "",
    process.env.ADMIN_OTP_SECRET_2?.trim() || "",
    process.env.ADMIN_OTP_SECRET_3?.trim() || "",
  ];
  if (secrets.some((s) => s.length === 0)) {
    return null;
  }
  return secrets as [string, string, string];
}

function parseOtpTokens(rawTokens: unknown): [string, string, string] | null {
  if (!Array.isArray(rawTokens) || rawTokens.length !== OTP_SECRET_SLOTS) {
    return null;
  }
  const normalized = rawTokens.map((item) =>
    typeof item === "string" ? item.trim() : "",
  );
  if (normalized.some((code) => !/^\d{6}$/.test(code))) {
    return null;
  }
  return normalized as [string, string, string];
}

function verifyTripleOtp(
  tokens: [string, string, string],
  secrets: [string, string, string],
  consumedStore: Map<string, number>,
): { ok: boolean; reason?: "reused" | "invalid" } {
  let hasReused = false;
  let allValid = true;

  for (let i = 0; i < OTP_SECRET_SLOTS; i += 1) {
    const consumedKey = `${i + 1}:${tokens[i]}`;
    if (consumedStore.has(consumedKey)) {
      hasReused = true;
    }
    const verification = verifySync({ token: tokens[i], secret: secrets[i] });
    if (!verification.valid) {
      allValid = false;
    }
  }

  if (!allValid) {
    return { ok: false, reason: "invalid" };
  }
  if (hasReused) {
    return { ok: false, reason: "reused" };
  }
  return { ok: true };
}

const g = globalThis as typeof globalThis & {
  __otpAttemptStore?: Map<string, OtpAttempt>;
};

function isAttemptExpired(attempt: OtpAttempt, now: number): boolean {
  if (attempt.lockoutUntil > 0) {
    return attempt.lockoutUntil <= now;
  }
  return now - attempt.lastAttemptAt >= OTP_ATTEMPT_WINDOW_MS;
}

function getOtpAttemptStore(): Map<string, OtpAttempt> {
  if (!g.__otpAttemptStore) {
    g.__otpAttemptStore = new Map<string, OtpAttempt>();
    setInterval(() => {
      const now = Date.now();
      for (const [ip, attempt] of g.__otpAttemptStore!.entries()) {
        if (isAttemptExpired(attempt, now)) {
          g.__otpAttemptStore!.delete(ip);
        }
      }
    }, 300_000).unref();
  }
  return g.__otpAttemptStore;
}

function checkOtpRateLimit(clientIp: string): {
  allowed: boolean;
  remainingLockoutSeconds?: number;
} {
  const attempt = getOtpAttemptStore().get(clientIp);
  const now = Date.now();
  if (attempt && attempt.lockoutUntil > now) {
    return {
      allowed: false,
      remainingLockoutSeconds: Math.ceil((attempt.lockoutUntil - now) / 1000),
    };
  }
  return { allowed: true };
}

function evictOtpAttemptsIfNeeded(store: Map<string, OtpAttempt>, now: number) {
  if (store.size < MAX_OTP_ATTEMPTS) return;
  for (const [k, v] of store.entries()) {
    if (isAttemptExpired(v, now)) store.delete(k);
  }
  while (store.size >= MAX_OTP_ATTEMPTS) {
    const oldestKey = store.keys().next().value;
    if (oldestKey === undefined) break;
    store.delete(oldestKey);
  }
}

function recordOtpFailure(clientIp: string) {
  const store = getOtpAttemptStore();
  const now = Date.now();
  let attempt = store.get(clientIp);
  if (!attempt || isAttemptExpired(attempt, now)) {
    if (!attempt) evictOtpAttemptsIfNeeded(store, now);
    attempt = { count: 1, lastAttemptAt: now, lockoutUntil: 0 };
  } else {
    attempt.count += 1;
    attempt.lastAttemptAt = now;
  }
  if (attempt.count >= 5) {
    attempt.lockoutUntil = now + 5 * 60 * 1000;
  }
  store.set(clientIp, attempt);
}

function resetOtpAttempts(clientIp: string) {
  getOtpAttemptStore().delete(clientIp);
}

function getOtpRateLimitHeaders(clientIp: string): Record<string, string> {
  const attempt = getOtpAttemptStore().get(clientIp);
  const now = Date.now();
  const limit = 5;
  const isLocked = Boolean(attempt && attempt.lockoutUntil > now);

  let count = 0;
  if (isLocked) {
    count = 5;
  } else if (attempt && !isAttemptExpired(attempt, now)) {
    count = attempt.count;
  }

  const remaining = Math.max(0, limit - count);
  const resetMs = isLocked && attempt ? attempt.lockoutUntil : now + 5 * 60 * 1000;
  return {
    "X-RateLimit-Limit": limit.toString(),
    "X-RateLimit-Remaining": remaining.toString(),
    "X-RateLimit-Reset": Math.ceil(resetMs / 1000).toString(),
  };
}

async function getLogs() {
  try {
    const data = await fs.readFile(LOG_FILE_PATH, "utf-8");
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function addLog(action: string, user: string) {
  const safeUser =
    typeof user === "string" && user.length <= 100 ? user : "unknown";
  const logs = await getLogs();
  const newLog = {
    action,
    user: safeUser,
    time: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
  };
  const updatedLogs = [newLog, ...logs].slice(0, 20);
  await fs.writeFile(LOG_FILE_PATH, JSON.stringify(updatedLogs, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

function handleLoginAction(
  rawOtpTokens: unknown,
  clientIp: string,
  userAgent: string,
): Response {
  const rateLimitStatus = checkOtpRateLimit(clientIp);
  if (!rateLimitStatus.allowed) {
    const minutes = Math.ceil((rateLimitStatus.remainingLockoutSeconds || 0) / 60);
    return Response.json(
      {
        message: `OTP 시도 횟수 초과로 계정이 잠겼습니다. 약 ${minutes}분 후 다시 시도하세요.`,
      },
      {
        status: 429,
        headers: {
          ...getOtpRateLimitHeaders(clientIp),
          "Retry-After": (rateLimitStatus.remainingLockoutSeconds || 300).toString(),
        },
      },
    );
  }

  const parsedTokens = parseOtpTokens(rawOtpTokens);
  if (!parsedTokens) {
    recordOtpFailure(clientIp);
    return Response.json(
      { message: "3개의 6자리 OTP 코드를 모두 입력해 주세요." },
      { status: 401, headers: getOtpRateLimitHeaders(clientIp) },
    );
  }

  const secrets = getConfiguredOtpSecrets();
  if (!secrets) {
    recordOtpFailure(clientIp);
    return Response.json(
      { message: "서버 OTP 설정이 완료되지 않았습니다." },
      { status: 401, headers: getOtpRateLimitHeaders(clientIp) },
    );
  }

  const consumedStore = getOtpConsumedStore();
  const checkResult = verifyTripleOtp(parsedTokens, secrets, consumedStore);

  if (!checkResult.ok) {
    recordOtpFailure(clientIp);
    const errorMessage =
      checkResult.reason === "reused"
        ? "이미 사용된 OTP 코드가 포함되어 있습니다."
        : "OTP 코드가 일치하지 않습니다.";
    return Response.json(
      { message: errorMessage },
      { status: 401, headers: getOtpRateLimitHeaders(clientIp) },
    );
  }

  resetOtpAttempts(clientIp);
  const consumeUntil = Date.now() + 5 * 60 * 1000;
  for (let i = 0; i < OTP_SECRET_SLOTS; i += 1) {
    consumedStore.set(`${i + 1}:${parsedTokens[i]}`, consumeUntil);
  }
  const newToken = generateToken();
  getSessionStore().set(newToken, {
    type: "admin",
    expiresAt: Date.now() + SESSION_TTL,
    ip: clientIp,
    userAgent,
  });
  return Response.json(
    { token: newToken, role: "admin" },
    { headers: getOtpRateLimitHeaders(clientIp) },
  );
}

async function handleLogoutAction(
  token: string | undefined,
  clientIp: string,
  userAgent: string,
): Promise<Response> {
  if (!token || typeof token !== "string" || !validateSession(token, "admin", clientIp, userAgent)) {
    return Response.json(
      { success: false, message: "유효하지 않거나 이미 만료된 세션입니다." },
      { status: 401 },
    );
  }
  getSessionStore().delete(token);
  await addLog("관리자 로그아웃", clientIp);
  return Response.json({
    success: true,
    message: "성공적으로 로그아웃 되었습니다.",
  });
}

function handleUpdateWhitelist(body: ServerActionBody): Response {
  const cleanId = typeof body.targetId === "string" ? body.targetId.trim() : "";
  const cleanName =
    typeof body.whitelistItem?.name === "string"
      ? body.whitelistItem.name.trim().slice(0, 50)
      : "";
  if (!cleanId || !cleanName) {
    return Response.json({ message: "잘못된 입력입니다." }, { status: 400 });
  }
  const list = getWhitelistUsers();
  const target = list.find((item) => item.id === cleanId);
  if (!target) {
    return Response.json({ message: "존재하지 않는 ID입니다." }, { status: 404 });
  }
  target.name = cleanName;
  saveWhitelistUsers(list);
  ensureDdnsUser(cleanId, cleanName);
  return Response.json({ success: true, whitelist: list });
}

function handleAddWhitelist(body: ServerActionBody): Response {
  if (!body.whitelistItem?.id || !body.whitelistItem?.name) {
    return Response.json({ message: "ID와 이름을 입력해 주세요." }, { status: 400 });
  }
  const result = addWhitelistUser(
    String(body.whitelistItem.id),
    String(body.whitelistItem.name),
  );
  if (!result.success) {
    return Response.json({ message: result.message }, { status: 400 });
  }
  return Response.json({ success: true, whitelist: getWhitelistUsers() });
}

function handleRemoveWhitelist(body: ServerActionBody): Response {
  if (!body.targetId) {
    return Response.json({ message: "대상 ID가 누락되었습니다." }, { status: 400 });
  }
  const result = removeWhitelistUser(String(body.targetId));
  if (!result.success) {
    return Response.json({ message: result.message }, { status: 400 });
  }
  return Response.json({ success: true, whitelist: getWhitelistUsers() });
}

async function handleAdminAction(
  action: string,
  body: ServerActionBody,
  clientIp: string,
  userAgent: string,
): Promise<Response> {
  if (!validateSession(body.token, "admin", clientIp, userAgent)) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  if (action === "getLogs") return Response.json({ logs: await getLogs() });
  if (action === "getWhitelist") return Response.json({ whitelist: getWhitelistUsers() });
  if (action === "addWhitelist") return handleAddWhitelist(body);
  if (action === "updateWhitelist") return handleUpdateWhitelist(body);
  return handleRemoveWhitelist(body);
}

async function handleDockerAction(
  action: "start" | "stop",
  session: App.Locals["session"],
): Promise<Response> {
  const userId = session?.user?.id;
  const whitelistIds = getWhitelistUsers().map((item) => item.id);

  if (!session || !userId || (!isAdmin(userId) && !whitelistIds.includes(userId))) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const userName = session.user.name || "Discord User";
  await execFilePromise("docker", [action, CONTAINER_NAME], { timeout: 15_000 });
  if (action === "start") {
    await addLog("서버 켜기", userName);
    return Response.json({
      message: "서버 시작 명령을 전달했습니다. 완전히 켜질 때까지 기다려주세요.",
    });
  }
  await addLog("서버 끄기", userName);
  return Response.json({ message: "서버가 꺼졌습니다." });
}

export const GET: RequestHandler = async () => {
  try {
    const { stdout } = await execFilePromise(
      "docker",
      [
        "inspect",
        "-f",
        "{{.State.Status}} {{.State.Health.Status}}",
        CONTAINER_NAME,
      ],
      { timeout: 5_000 },
    );
    const [status, health] = stdout.trim().split(" ");
    return Response.json({ status, health });
  } catch {
    try {
      const { stdout } = await execFilePromise(
        "docker",
        [
          "inspect",
          "-f",
          "{{.State.Status}}",
          CONTAINER_NAME,
        ],
        { timeout: 5_000 },
      );
      return Response.json({ status: stdout.trim(), health: "none" });
    } catch {
      return Response.json({ status: "offline", health: "none" });
    }
  }
};

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
  try {
    const body = (await request.json()) as ServerActionBody;
    const { action } = body;

    if (!action || !ALLOWED_ACTIONS.has(action)) {
      return Response.json({ message: "Invalid action" }, { status: 400 });
    }

    const clientIp = extractClientIp(
      request.headers,
      safePeerIp(getClientAddress),
    );
    const userAgent = request.headers.get("user-agent") || "unknown-agent";

    if (action === "login") {
      return handleLoginAction(body.otpTokens, clientIp, userAgent);
    }
    if (action === "logout") {
      return await handleLogoutAction(body.token, clientIp, userAgent);
    }
    if (action === "start" || action === "stop") {
      return await handleDockerAction(action, locals.session);
    }
    return await handleAdminAction(action, body, clientIp, userAgent);
  } catch (error) {
    console.error("Action error:", error);
    return Response.json(
      { message: "명령 수행 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
};
