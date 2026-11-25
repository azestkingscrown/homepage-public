import type { Cookies } from "@sveltejs/kit";
import crypto from "node:crypto";
import { getWhitelistUsers, isAdmin } from "./ddns";

const SESSION_COOKIE = "azest_session";
const OAUTH_STATE_COOKIE = "azest_oauth_state";
const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30일

export interface DiscordSessionUser {
  id: string;
  name: string;
  image: string | null;
}

export interface DiscordSession {
  user: DiscordSessionUser;
}

interface SignedSessionPayload {
  id: string;
  name: string;
  image: string | null;
  exp: number;
}

function getAuthSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET 환경변수가 설정되지 않았습니다.");
  }
  return secret;
}

function isSecureCookie(): boolean {
  const url = process.env.NEXTAUTH_URL || "";
  return url.startsWith("https://") || process.env.NODE_ENV === "production";
}

function signValue(payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const sig = crypto
    .createHmac("sha256", getAuthSecret())
    .update(encoded)
    .digest("base64url");
  return `${encoded}.${sig}`;
}

function verifyValue<T>(raw: string | undefined): T | null {
  if (!raw || typeof raw !== "string") return null;
  const parts = raw.split(".");
  if (parts.length !== 2) return null;

  const [encoded, providedSig] = parts;
  if (!encoded || !providedSig) return null;

  let expectedSig: string;
  try {
    expectedSig = crypto
      .createHmac("sha256", getAuthSecret())
      .update(encoded)
      .digest("base64url");
  } catch {
    return null;
  }

  const a = Buffer.from(providedSig, "utf8");
  const b = Buffer.from(expectedSig, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return null;
  }

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export function getDiscordRedirectUri(url: URL): string {
  const configured = process.env.NEXTAUTH_URL?.replace(/\/$/, "");
  if (configured) {
    return `${configured}/api/auth/callback/discord`;
  }
  return `${url.origin}/api/auth/callback/discord`;
}

export function sanitizeReturnTo(raw: string | null | undefined): string {
  if (!raw || typeof raw !== "string") return "/";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) {
    return "/";
  }
  return raw;
}

export function createOAuthState(cookies: Cookies, returnTo: string): string {
  const state = crypto.randomBytes(24).toString("hex");
  const safeReturn = sanitizeReturnTo(returnTo);
  const signed = signValue({
    state,
    returnTo: safeReturn,
    exp: Date.now() + 10 * 60 * 1000,
  });

  cookies.set(OAUTH_STATE_COOKIE, signed, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    maxAge: 600,
  });

  return state;
}

export function consumeOAuthState(
  cookies: Cookies,
  providedState: string | null,
): { valid: boolean; returnTo: string } {
  const raw = cookies.get(OAUTH_STATE_COOKIE);
  cookies.delete(OAUTH_STATE_COOKIE, { path: "/" });

  if (!raw || !providedState) {
    return { valid: false, returnTo: "/" };
  }

  const parsed = verifyValue<{ state: string; returnTo: string; exp: number }>(
    raw,
  );
  if (!parsed || parsed.exp < Date.now()) {
    return { valid: false, returnTo: "/" };
  }

  const a = Buffer.from(parsed.state, "utf8");
  const b = Buffer.from(providedState, "utf8");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { valid: false, returnTo: "/" };
  }

  return { valid: true, returnTo: sanitizeReturnTo(parsed.returnTo) };
}

export function setDiscordSession(
  cookies: Cookies,
  user: DiscordSessionUser,
): void {
  const payload: SignedSessionPayload = {
    id: user.id,
    name: user.name,
    image: user.image,
    exp: Date.now() + SESSION_MAX_AGE_SEC * 1000,
  };
  cookies.set(SESSION_COOKIE, signValue(payload), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureCookie(),
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

export function clearDiscordSession(cookies: Cookies): void {
  cookies.delete(SESSION_COOKIE, { path: "/" });
}

export function getDiscordSession(cookies: Cookies): DiscordSession | null {
  const raw = cookies.get(SESSION_COOKIE);
  const parsed = verifyValue<SignedSessionPayload>(raw);
  if (!parsed?.id || parsed.exp < Date.now()) {
    return null;
  }

  const whitelist = getWhitelistUsers();
  const matched = whitelist.find((item) => item.id === parsed.id);
  if (!matched && !isAdmin(parsed.id)) {
    return null;
  }

  return {
    user: {
      id: parsed.id,
      name: matched?.name || parsed.name,
      image: parsed.image ?? null,
    },
  };
}
