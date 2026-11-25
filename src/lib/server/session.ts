/**
 * 공유 세션 스토어 유틸리티
 * server/route.ts와 upload/delete/images route에서 공유 사용
 * Next.js 서버 컴포넌트에서는 global 객체를 통해 메모리 공유
 */

import crypto from 'node:crypto';
import net from 'node:net';

export interface SessionEntry {
  type: 'server' | 'admin';
  expiresAt: number;
  ip?: string;
  userAgent?: string;
}

// global 네임스페이스에 세션 스토어 저장 (핫 리로드 시에도 유지)
declare global {
  // eslint-disable-next-line no-var
  var __sessionStore: Map<string, SessionEntry> | undefined;
  // eslint-disable-next-line no-var
  var __otpConsumedStore: Map<string, number> | undefined;
}

export function getSessionStore(): Map<string, SessionEntry> {
  if (!global.__sessionStore) {
    global.__sessionStore = new Map<string, SessionEntry>();

    // 5분마다 만료 토큰 정리
    setInterval(() => {
      const now = Date.now();
      for (const [token, session] of global.__sessionStore!.entries()) {
        if (session.expiresAt < now) {
          global.__sessionStore!.delete(token);
        }
      }
    }, 300_000).unref();
  }
  return global.__sessionStore;
}

export function getOtpConsumedStore(): Map<string, number> {
  if (!global.__otpConsumedStore) {
    global.__otpConsumedStore = new Map<string, number>();

    // 5분마다 만료된 OTP 기록 정리
    setInterval(() => {
      const now = Date.now();
      for (const [token, expiresAt] of global.__otpConsumedStore!.entries()) {
        if (expiresAt < now) {
          global.__otpConsumedStore!.delete(token);
        }
      }
    }, 300_000).unref();
  }
  return global.__otpConsumedStore;
}

export function timingSafeEqualStr(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export const SESSION_TTL = 30 * 60 * 1000; // 30분

export function normalizePeerIp(raw?: string | null): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
}

export function isLoopbackIp(ip?: string | null): boolean {
  const normalized = normalizePeerIp(ip);
  return normalized === '127.0.0.1' || normalized === '::1';
}

export function safePeerIp(getClientAddress?: () => string): string | undefined {
  if (typeof getClientAddress !== 'function') return undefined;
  try {
    return normalizePeerIp(getClientAddress());
  } catch {
    return undefined;
  }
}

function cleanValidIp(raw?: string | null): string | undefined {
  const normalized = normalizePeerIp(raw);
  return normalized && net.isIP(normalized) !== 0 ? normalized : undefined;
}

export function extractClientIp(headers: Headers, peerAddress?: string): string {
  const normalizedPeer = cleanValidIp(peerAddress);
  if (normalizedPeer && !isLoopbackIp(normalizedPeer)) {
    return normalizedPeer;
  }

  const cfIp = cleanValidIp(headers.get('cf-connecting-ip'));
  if (cfIp) return cfIp;
  const realIp = cleanValidIp(headers.get('x-real-ip'));
  if (realIp) return realIp;
  const forwarded = cleanValidIp(headers.get('x-forwarded-for')?.split(',')[0]);
  if (forwarded) return forwarded;
  return normalizedPeer || 'unknown-ip';
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function validateSession(
  token: string | null | undefined,
  requiredType: 'server' | 'admin',
  clientIp?: string,
  userAgent?: string
): boolean {
  if (!token || typeof token !== 'string') return false;
  // 토큰 형식 검증 (64자 hex)
  if (!/^[0-9a-f]{64}$/.test(token)) return false;

  const store = getSessionStore();
  const session = store.get(token);
  if (!session) return false;
  if (session.expiresAt < Date.now()) {
    store.delete(token);
    return false;
  }
  
  // 세션 하이재킹 방지 1: 세션에 IP가 바인딩되어 있고 검증 시 IP가 제공된 경우 일치 여부 확인
  if (session.ip && clientIp && session.ip !== clientIp) {
    return false;
  }

  // 세션 하이재킹 방지 2: User-Agent 일치 여부 확인
  if (session.userAgent && userAgent && session.userAgent !== userAgent) {
    return false;
  }

  // admin은 server 권한도 포함
  if (requiredType === 'server') {
    return session.type === 'server' || session.type === 'admin';
  }
  return session.type === requiredType;
}
