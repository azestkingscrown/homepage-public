import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';
import { extractClientIp, timingSafeEqualStr } from './session';

const ROOT_DOMAIN = (process.env.DDNS_ROOT_DOMAIN || 'example.com')
  .trim()
  .toLowerCase()
  .replace(/^\./, '');
const ROOT_DOMAIN_SUFFIX = `.${ROOT_DOMAIN}`;
const RESERVED_SUBDOMAINS = new Set([
  'www',
  'chzzk',
  'boy',
  'api',
  'mail',
  'smtp',
  'imap',
  'pop',
  'ftp',
  'ns1',
  'ns2',
  'admin',
  'root',
  'localhost',
  'status',
  'blog',
  'docs',
  'cdn',
  'static',
  'uploads',
]);

export interface ManagedDomain {
  domain: string;
  label: string;
  os?: 'windows' | 'linux';
  createdAt: string;
  ownerId?: string; // 소유자 Discord ID
  ownerName?: string; // 소유자 닉네임
}

export interface DdnsUser {
  discordId: string;
  name: string;
  token: string;
  role: 'admin' | 'user';
  createdAt: string;
  lastUsedAt?: string;
}

export interface WhitelistUser {
  id: string;
  name: string;
}

export interface DdnsState {
  domain: string;
  label?: string;
  os?: 'windows' | 'linux';
  createdAt?: string;
  ownerId?: string;
  ownerName?: string;
  currentIp: string | null;
  previousIp: string | null;
  lastUpdated: string | null;
  lastChecked: string | null;
  status: 'ok' | 'error' | 'unconfigured';
  message?: string;
}

const STATUS_FILE = path.join(process.cwd(), 'data', 'ddns-status.json');
const DOMAINS_FILE = path.join(process.cwd(), 'data', 'ddns-domains.json');
const USERS_FILE = path.join(process.cwd(), 'data', 'ddns-users.json');
const WHITELIST_FILE = path.join(process.cwd(), 'whitelist.json');

// 관리자 Discord ID 목록 (환경변수 ADMIN_DISCORD_IDS 쉼표 구분)
export function getAdminDiscordIds(): string[] {
  return (process.env.ADMIN_DISCORD_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}

export function isAdmin(discordId?: string | null): boolean {
  if (!discordId) return false;
  return getAdminDiscordIds().includes(discordId.trim());
}

export function generateSecureToken(): string {
  return crypto.randomBytes(24).toString('hex');
}

// ─────────────────────────────────────────────────────────────
// 화이트리스트 관리 (whitelist.json)
// ─────────────────────────────────────────────────────────────
export function getWhitelistUsers(): WhitelistUser[] {
  try {
    if (fs.existsSync(WHITELIST_FILE)) {
      const raw = JSON.parse(fs.readFileSync(WHITELIST_FILE, 'utf8'));
      if (Array.isArray(raw)) return raw;
    }
  } catch (err) {
    console.error('[DDNS] 화이트리스트 파일 읽기 실패:', err);
  }
  return [];
}

export function saveWhitelistUsers(users: WhitelistUser[]): void {
  fs.writeFileSync(WHITELIST_FILE, JSON.stringify(users, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export function addWhitelistUser(id: string, name: string): { success: boolean; message: string; user?: WhitelistUser } {
  const cleanId = id.trim();
  const cleanName = name.trim();
  if (!cleanId || !cleanName) {
    return { success: false, message: 'Discord ID와 닉네임을 모두 입력해주세요.' };
  }
  if (!/^\d{16,21}$/.test(cleanId)) {
    return { success: false, message: '올바른 Discord 고유 ID (16~21자리 숫자)를 입력해주세요.' };
  }

  const list = getWhitelistUsers();
  if (list.some((u) => u.id === cleanId)) {
    return { success: false, message: '이미 화이트리스트에 등록된 Discord ID입니다.' };
  }

  const newItem: WhitelistUser = { id: cleanId, name: cleanName };
  list.push(newItem);
  saveWhitelistUsers(list);

  // ddns-users.json에도 유저 및 개인 토큰 자동 등록
  ensureDdnsUser(cleanId, cleanName);

  return { success: true, message: `[${cleanName}] 님이 화이트리스트에 성공적으로 등록되었습니다.`, user: newItem };
}

export function removeWhitelistUser(id: string): { success: boolean; message: string } {
  const cleanId = id.trim();
  if (isAdmin(cleanId)) {
    return { success: false, message: '시스템 관리자 계정은 화이트리스트에서 삭제할 수 없습니다.' };
  }

  const list = getWhitelistUsers();
  const index = list.findIndex((u) => u.id === cleanId);
  if (index === -1) {
    return { success: false, message: '화이트리스트에 존재하지 않는 ID입니다.' };
  }

  list.splice(index, 1);
  saveWhitelistUsers(list);
  removeDdnsUser(cleanId);

  return { success: true, message: '화이트리스트에서 삭제되었습니다.' };
}

// ─────────────────────────────────────────────────────────────
// DDNS 유저 및 개인 토큰 관리 (data/ddns-users.json)
// ─────────────────────────────────────────────────────────────
export function getDdnsUsers(): DdnsUser[] {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
      if (Array.isArray(raw) && raw.length > 0) {
        return raw;
      }
    }
  } catch (err) {
    console.error('[DDNS] 유저 목록 파일 읽기 오류:', err);
  }

  // 초기 시드 생성 (환경변수 ADMIN_DISCORD_IDS 기반)
  const adminIds = getAdminDiscordIds();
  const initialUsers: DdnsUser[] = adminIds.map((id, idx) => ({
    discordId: id,
    name: idx === 0 ? 'Admin' : `Admin-${idx + 1}`,
    token: idx === 0 && process.env.DDNS_SECRET_TOKEN ? process.env.DDNS_SECRET_TOKEN : generateSecureToken(),
    role: 'admin',
    createdAt: new Date().toISOString(),
  }));

  if (initialUsers.length > 0) {
    try {
      const dir = path.dirname(USERS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(USERS_FILE, JSON.stringify(initialUsers, null, 2), { encoding: 'utf8', mode: 0o600 });
    } catch (err) {
      console.error('[DDNS] 초기 유저 파일 저장 실패:', err);
    }
  }

  return initialUsers;
}

export function saveDdnsUsers(users: DdnsUser[]): void {
  const dir = path.dirname(USERS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), { encoding: 'utf8', mode: 0o600 });
}

export function ensureDdnsUser(discordId: string, name?: string): DdnsUser {
  const users = getDdnsUsers();
  let user = users.find((u) => u.discordId === discordId);
  const isAdminUser = isAdmin(discordId);

  const whitelist = getWhitelistUsers();
  const matchedWhitelist = whitelist.find((w) => w.id === discordId);
  const resolvedName = name || matchedWhitelist?.name || (isAdminUser ? 'Admin' : '사용자');

  if (user) {
    let updated = false;
    if (resolvedName && user.name !== resolvedName) {
      user.name = resolvedName;
      updated = true;
    }
    if (isAdminUser && user.role !== 'admin') {
      user.role = 'admin';
      updated = true;
    }
    if (updated) saveDdnsUsers(users);
    return user;
  }

  // 신규 유저 생성
  user = {
    discordId,
    name: resolvedName,
    token: generateSecureToken(),
    role: isAdminUser ? 'admin' : 'user',
    createdAt: new Date().toISOString(),
  };
  users.push(user);
  saveDdnsUsers(users);
  return user;
}

export function removeDdnsUser(discordId: string): void {
  const users = getDdnsUsers();
  const idx = users.findIndex((u) => u.discordId === discordId);
  if (idx !== -1) {
    users.splice(idx, 1);
    saveDdnsUsers(users);
  }
}

export function regenerateUserToken(discordId: string): string {
  const users = getDdnsUsers();
  const user = users.find((u) => u.discordId === discordId);
  const newToken = generateSecureToken();
  if (user) {
    user.token = newToken;
    saveDdnsUsers(users);
    return newToken;
  }
  const created = ensureDdnsUser(discordId);
  return created.token;
}

export function findUserByToken(token: string): DdnsUser | null {
  if (!token) return null;
  const trimmed = token.trim();
  const users = getDdnsUsers();
  let found: DdnsUser | null = null;
  for (const u of users) {
    if (timingSafeEqualStr(u.token, trimmed)) {
      found = u;
    }
  }
  if (found) return found;

  // 마스터 환경변수 토큰 호환 (관리자 매핑)
  const masterToken = process.env.DDNS_SECRET_TOKEN;
  if (masterToken && timingSafeEqualStr(trimmed, masterToken.trim())) {
    const admin = users.find((u) => u.role === 'admin' && isAdmin(u.discordId)) || users.find((u) => u.role === 'admin');
    return admin || null;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// 도메인 및 상태 관리
// ─────────────────────────────────────────────────────────────
export function isValidIp(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  return net.isIP(ip.trim()) !== 0;
}

function ipv4ToInt(ip: string): number | null {
  if (!net.isIPv4(ip)) return null;
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function isPublicIpv4(ip: string): boolean {
  if (!ip || typeof ip !== 'string') return false;
  const num = ipv4ToInt(ip.trim());
  if (num === null) return false;

  const b0 = (num >>> 24) & 0xff;
  const b1 = (num >>> 16) & 0xff;
  const b2 = (num >>> 8) & 0xff;

  if (b0 === 0 || b0 === 10 || b0 === 127 || b0 >= 224) return false;
  if (b0 === 100 && b1 >= 64 && b1 <= 127) return false;
  if (b0 === 169 && b1 === 254) return false;
  if (b0 === 172 && b1 >= 16 && b1 <= 31) return false;
  if (b0 === 192 && b1 === 0 && (b2 === 0 || b2 === 2)) return false;
  if (b0 === 192 && b1 === 168) return false;
  if (b0 === 198 && (b1 === 18 || b1 === 19)) return false;
  if (b0 === 198 && b1 === 51 && b2 === 100) return false;
  if (b0 === 203 && b1 === 0 && b2 === 113) return false;
  return true;
}

/**
 * HTTP 요청 헤더와 피어 주소를 기반으로 클라이언트 IP를 추출합니다.
 */
export function getClientIp(req: Request, peerAddress?: string): string {
  const resolved = extractClientIp(req.headers, peerAddress);
  return isValidIp(resolved) ? resolved : '127.0.0.1';
}

/**
 * 도메인 문자열을 FQDN 형태로 정규화합니다.
 */
export function normalizeDomain(domain: string): string {
  const trimmed = domain.trim().toLowerCase();
  if (trimmed.includes('.')) {
    return trimmed;
  }
  return `${trimmed}.${ROOT_DOMAIN}`;
}

/**
 * 영구 저장된 관리 대상 DDNS 도메인 목록을 불러옵니다.
 */
export function getManagedDomains(): ManagedDomain[] {
  try {
    if (fs.existsSync(DOMAINS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(DOMAINS_FILE, 'utf8'));
      if (Array.isArray(raw)) {
        return raw;
      }
    }
  } catch (err) {
    console.error('[DDNS] 도메인 목록 파일 읽기 오류:', err);
  }

  const envSubdomains = process.env.DDNS_SUBDOMAINS;
  if (!envSubdomains) {
    return [];
  }

  const defaultOwnerId = getAdminDiscordIds()[0] || '';
  const initialList: ManagedDomain[] = envSubdomains
    .split(',')
    .map((s) => normalizeDomain(s))
    .filter(Boolean)
    .map((d, idx) => ({
      domain: d,
      label: `Device ${idx + 1}`,
      createdAt: new Date().toISOString(),
      ownerId: defaultOwnerId,
      ownerName: 'Admin',
    }));

  if (initialList.length > 0) {
    try {
      const dir = path.dirname(DOMAINS_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      fs.writeFileSync(DOMAINS_FILE, JSON.stringify(initialList, null, 2), { encoding: 'utf8', mode: 0o600 });
    } catch (err) {
      console.error('[DDNS] 초기 도메인 목록 파일 저장 실패:', err);
    }
  }

  return initialList;
}

/**
 * 관리 대상 도메인 목록을 파일에 영구 저장합니다.
 */
export function saveManagedDomains(domains: ManagedDomain[]): void {
  const dir = path.dirname(DOMAINS_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(DOMAINS_FILE, JSON.stringify(domains, null, 2), { encoding: 'utf8', mode: 0o600 });
}

/**
 * 서버에 설정된 허용 DDNS 서브도메인 목록을 반환합니다.
 */
export function getAllowedDomains(): string[] {
  return getManagedDomains().map((m) => m.domain);
}

/**
 * 클라이언트 요청(hostname 또는 domain 파라미터)에서 대상 도메인을 결정합니다.
 * 파라미터가 없으면 기본 도메인(첫 번째 허용 도메인)을 반환합니다.
 * 허용되지 않은 도메인인 경우 null을 반환합니다.
 */
export function resolveTargetDomain(requested?: string | null): string | null {
  const allowed = getAllowedDomains();
  if (!requested?.trim()) {
    return allowed[0] || null;
  }

  const normalized = normalizeDomain(requested);
  if (allowed.includes(normalized)) {
    return normalized;
  }

  return null;
}

/**
 * 기본 도메인을 반환합니다.
 */
export function getTargetDomain(): string {
  return getAllowedDomains()[0] || '';
}

/**
 * 로컬 DDNS 상태 파일에서 전체 도메인 상태 맵을 읽어옵니다.
 */
function readRawStatusMap(): Record<string, DdnsState> {
  try {
    if (fs.existsSync(STATUS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(STATUS_FILE, 'utf8'));
      // 기존 단일 객체 구조 마이그레이션 호환 처리
      if (typeof raw?.domain === 'string') {
        return { [raw.domain]: raw };
      }
      return raw;
    }
  } catch (err) {
    console.error('[DDNS] 상태 파일 읽기 오류:', err);
  }
  return {};
}

/**
 * 특정 도메인의 상태를 반환합니다.
 */
export function getDdnsState(targetDomain?: string): DdnsState {
  const domain = targetDomain ? normalizeDomain(targetDomain) : getTargetDomain();
  const map = readRawStatusMap();

  if (map[domain]) {
    return map[domain];
  }

  return {
    domain,
    currentIp: null,
    previousIp: null,
    lastUpdated: null,
    lastChecked: null,
    status: process.env.CLOUDFLARE_API_TOKEN ? 'ok' : 'unconfigured',
    message: process.env.CLOUDFLARE_API_TOKEN ? '초기화 대기 중' : 'Cloudflare API 토큰 미설정',
  };
}

/**
 * 등록된 도메인의 상태 목록을 반환합니다. (라벨, 생성일, 소유자 정보 포함)
 * filterDiscordId 지정 시 해당 유저의 도메인만 필터링합니다.
 */
export function getAllDdnsStates(filterDiscordId?: string): DdnsState[] {
  let managed = getManagedDomains();
  if (filterDiscordId) {
    managed = managed.filter((m) => m.ownerId === filterDiscordId);
  }
  return managed.map((m) => {
    const state = getDdnsState(m.domain);
    return {
      ...state,
      label: m.label,
      createdAt: m.createdAt,
      ownerId: m.ownerId,
      ownerName: m.ownerName,
      os: m.os || (m.label?.toLowerCase().includes('win') ? 'windows' : 'linux'),
    };
  });
}

/**
 * 특정 도메인의 OS 설정을 변경합니다 ('windows' | 'linux').
 */
export function updateManagedDomainOs(domain: string, os: 'windows' | 'linux'): boolean {
  const normalized = normalizeDomain(domain);
  const managed = getManagedDomains();
  const target = managed.find((m) => m.domain === normalized);
  if (!target) return false;

  target.os = os;
  saveManagedDomains(managed);
  return true;
}

/**
 * 특정 도메인의 상태를 캐시 파일에서 완전히 삭제합니다.
 */
export function deleteDdnsState(domain: string): void {
  const normalizedDomain = normalizeDomain(domain);
  try {
    const map = readRawStatusMap();
    if (map[normalizedDomain]) {
      delete map[normalizedDomain];
      fs.writeFileSync(STATUS_FILE, JSON.stringify(map, null, 2), { encoding: 'utf8', mode: 0o600 });
    }
  } catch (err) {
    console.error('[DDNS] 상태 파일 항목 삭제 실패:', err);
  }
}

/**
 * 특정 도메인의 로컬 DDNS 상태를 파일에 저장합니다.
 */
export function saveDdnsState(domain: string, state: Partial<DdnsState>): DdnsState {
  const normalizedDomain = normalizeDomain(domain);
  try {
    const map = readRawStatusMap();
    const current = map[normalizedDomain] || {
      domain: normalizedDomain,
      currentIp: null,
      previousIp: null,
      lastUpdated: null,
      lastChecked: null,
      status: 'ok',
    };

    const updated: DdnsState = {
      ...current,
      ...state,
      domain: normalizedDomain,
    };

    map[normalizedDomain] = updated;

    const dir = path.dirname(STATUS_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    }

    fs.writeFileSync(STATUS_FILE, JSON.stringify(map, null, 2), { encoding: 'utf8', mode: 0o600 });
    return updated;
  } catch (err) {
    console.error('[DDNS] 상태 파일 저장 실패:', err);
    return getDdnsState(normalizedDomain);
  }
}

export interface AuthVerification {
  authenticated: boolean;
  user?: DdnsUser;
  isMaster?: boolean;
}

function verifyCandidateToken(tokenStr: string): AuthVerification | null {
  const trimmed = tokenStr.trim();
  if (!trimmed) return null;

  const user = findUserByToken(trimmed);
  if (user) {
    return {
      authenticated: true,
      user,
      isMaster: user.role === 'admin' && isAdmin(user.discordId),
    };
  }

  const masterSecret = process.env.DDNS_ACCESS_TOKEN || process.env.DDNS_SECRET_TOKEN;
  if (masterSecret && timingSafeEqualStr(trimmed, masterSecret.trim())) {
    return { authenticated: true, isMaster: true };
  }

  return null;
}

function extractHeaderTokenCandidates(authHeader: string | null): string[] {
  if (!authHeader) return [];
  const candidates: string[] = [];

  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) candidates.push(bearer);
  }

  if (authHeader.startsWith('Basic ')) {
    try {
      const credentials = Buffer.from(authHeader.slice(6).trim(), 'base64').toString('utf8');
      const sepIdx = credentials.indexOf(':');
      const password = sepIdx >= 0 ? credentials.slice(sepIdx + 1) : '';
      if (password) candidates.push(password);
    } catch (err) {
      console.error('[DDNS] Basic Auth 디코딩 실패:', err);
    }
  }

  return candidates;
}

/**
 * 요청의 인증 토큰 또는 Basic Auth를 검증하고 해당 사용자 정보를 반환합니다.
 */
export function verifyDdnsRequest(
  req: Request,
  url: URL,
  options?: { allowQueryToken?: boolean }
): AuthVerification {
  const candidates = extractHeaderTokenCandidates(req.headers.get('authorization'));

  if (options?.allowQueryToken) {
    const queryToken =
      url.searchParams.get('token') ||
      url.searchParams.get('key') ||
      url.searchParams.get('password');
    if (queryToken) candidates.push(queryToken);
  }

  for (const candidate of candidates) {
    const verified = verifyCandidateToken(candidate);
    if (verified) return verified;
  }

  return { authenticated: false };
}

/**
 * 요청의 인증 여부를 boolean으로 반환합니다. (호환성 유지)
 */
export function authenticateDdnsRequest(req: Request, url: URL): boolean {
  return verifyDdnsRequest(req, url).authenticated;
}

export interface SyncDdnsResult {
  success: boolean;
  changed: boolean;
  ip: string;
  domain: string;
  message: string;
  statusCode?: number;
}

/**
 * Cloudflare DNS API와 통신하여 지정된 도메인의 A 레코드를 갱신합니다.
 */
export async function syncCloudflareDdns(newIp: string, targetDomain?: string): Promise<SyncDdnsResult> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const domain = targetDomain ? normalizeDomain(targetDomain) : getTargetDomain();
  const now = new Date().toISOString();

  if (!token || !zoneId) {
    const errorMsg = 'Cloudflare API 토큰 또는 Zone ID가 서버 환경변수(.env.local)에 설정되지 않았습니다.';
    saveDdnsState(domain, {
      lastChecked: now,
      status: 'unconfigured',
      message: errorMsg,
    });
    return {
      success: false,
      changed: false,
      ip: newIp,
      domain,
      message: errorMsg,
      statusCode: 500,
    };
  }

  if (!isPublicIpv4(newIp)) {
    return {
      success: false,
      changed: false,
      ip: newIp,
      domain,
      message: '유효한 공인 IPv4 주소만 DDNS에 등록할 수 있습니다.',
      statusCode: 400,
    };
  }

  try {
    // 1. 기존 DNS A 레코드 목록 조회
    const searchUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(domain)}`;
    const searchRes = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (!searchRes.ok) {
      const errBody = await searchRes.text();
      console.error(`[DDNS] Cloudflare DNS 레코드 조회 실패 (HTTP ${searchRes.status}):`, errBody);
      const errMsg = `Cloudflare DNS 레코드 조회 실패 (HTTP ${searchRes.status})`;
      saveDdnsState(domain, {
        lastChecked: now,
        status: 'error',
        message: errMsg,
      });
      return {
        success: false,
        changed: false,
        ip: newIp,
        domain,
        message: errMsg,
        statusCode: 502,
      };
    }

    const searchData = await searchRes.json();
    const existingRecord = searchData.result?.[0];

    // 2. 이미 동일한 IP인 경우: 갱신 생략 (nochg)
    if (existingRecord?.content === newIp) {
      saveDdnsState(domain, {
        currentIp: newIp,
        lastChecked: now,
        status: 'ok',
        message: 'IP가 동일하여 DNS 레코드가 유지되었습니다.',
      });
      return {
        success: true,
        changed: false,
        ip: newIp,
        domain,
        message: `IP가 이미 ${newIp}로 최신 상태입니다. (변경 없음)`,
      };
    }

    // 3. IP가 변경되었거나 신규 등록인 경우: Cloudflare 갱신 또는 생성
    const prevIp = existingRecord?.content || getDdnsState(domain).currentIp;
    let updateRes: Response;

    if (existingRecord) {
      // 레코드 업데이트 (PUT/PATCH)
      const updateUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${existingRecord.id}`;
      updateRes = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: newIp,
          ttl: 60, // 빠른 DNS 전파 (1분)
          proxied: false, // 게임, SSH, VPN 등 모든 포트 허용을 위해 DNS-Only 설정
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
    } else {
      // 레코드 신규 생성 (POST)
      const createUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`;
      updateRes = await fetch(createUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'A',
          name: domain,
          content: newIp,
          ttl: 60,
          proxied: false,
        }),
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });
    }

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      console.error(`[DDNS] Cloudflare DNS 레코드 갱신 실패 (HTTP ${updateRes.status}):`, errText);
      const errMsg = `Cloudflare DNS 레코드 갱신 실패 (HTTP ${updateRes.status})`;
      saveDdnsState(domain, {
        lastChecked: now,
        status: 'error',
        message: errMsg,
      });
      return {
        success: false,
        changed: false,
        ip: newIp,
        domain,
        message: errMsg,
        statusCode: 502,
      };
    }

    // 성공 처리
    saveDdnsState(domain, {
      currentIp: newIp,
      previousIp: prevIp || null,
      lastUpdated: now,
      lastChecked: now,
      status: 'ok',
      message: 'Cloudflare DNS A 레코드가 성공적으로 갱신되었습니다.',
    });

    return {
      success: true,
      changed: true,
      ip: newIp,
      domain,
      message: `성공적으로 ${domain}의 DNS A 레코드가 ${newIp}로 갱신되었습니다.`,
    };
  } catch (err: unknown) {
    console.error('[DDNS] Cloudflare 통신 예외 발생:', err);
    const errMsg = 'Cloudflare 통신 중 오류가 발생했습니다.';
    saveDdnsState(domain, {
      lastChecked: now,
      status: 'error',
      message: errMsg,
    });
    return {
      success: false,
      changed: false,
      ip: newIp,
      domain,
      message: errMsg,
      statusCode: 500,
    };
  }
}

function validateNewDomainRegistration(
  prefixOrDomain: string,
  managed: ManagedDomain[],
): { ok: true; domain: string; prefix: string } | { ok: false; message: string } {
  const domain = normalizeDomain(prefixOrDomain);
  if (!domain.endsWith(ROOT_DOMAIN_SUFFIX)) {
    return {
      ok: false,
      message: `허용된 루트 도메인(${ROOT_DOMAIN_SUFFIX}) 하위 서브도메인만 등록할 수 있습니다.`,
    };
  }
  const prefix = domain.slice(0, -ROOT_DOMAIN_SUFFIX.length).trim().toLowerCase();

  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(prefix)) {
    return {
      ok: false,
      message: '서브도메인은 3~30자의 영문 소문자, 숫자, 하이픈(-)만 가능하며 하이픈으로 시작하거나 끝날 수 없습니다.',
    };
  }

  if (RESERVED_SUBDOMAINS.has(prefix)) {
    return {
      ok: false,
      message: `시스템 예약 서브도메인(${prefix})은 DDNS 기기로 등록할 수 없습니다.`,
    };
  }

  if (managed.some((m) => m.domain === domain)) {
    return { ok: false, message: `이미 등록된 도메인입니다: ${domain}` };
  }

  return { ok: true, domain, prefix };
}

async function upsertCloudflareARecord(
  zoneId: string,
  token: string,
  domain: string,
  targetIp: string,
  isAdminRequester: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const searchUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?name=${encodeURIComponent(domain)}`;
  const searchRes = await fetch(searchUrl, {
    method: 'GET',
    headers,
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  if (!searchRes.ok) {
    console.error(`[DDNS] Cloudflare DNS 조회 실패 (HTTP ${searchRes.status}):`, await searchRes.text());
    return { ok: false, message: `Cloudflare DNS 조회 실패 (HTTP ${searchRes.status})` };
  }

  const searchData = await searchRes.json();
  const existingRecords: Array<{ id: string; type?: string; proxied?: boolean }> =
    Array.isArray(searchData.result) ? searchData.result : [];
  if (existingRecords.some((r) => r.type && r.type !== 'A')) {
    return { ok: false, message: '이미 다른 DNS 레코드(CNAME 등)가 사용 중인 서브도메인입니다.' };
  }

  const existing = existingRecords.find((r) => r.type === 'A');
  if (existing) {
    if (!isAdminRequester || existing.proxied) {
      return {
        ok: false,
        message: '이미 Cloudflare에 사용 중인 서브도메인입니다. 다른 이름을 사용해 주세요.',
      };
    }
    const patchRes = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${existing.id}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ content: targetIp, ttl: 60, proxied: false }),
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      },
    );
    if (!patchRes.ok) {
      console.error(`[DDNS] Cloudflare DNS 레코드 갱신 실패 (HTTP ${patchRes.status}):`, await patchRes.text());
      return { ok: false, message: `Cloudflare DNS 레코드 갱신 실패 (HTTP ${patchRes.status})` };
    }
    return { ok: true };
  }

  const createRes = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        type: 'A',
        name: domain,
        content: targetIp,
        ttl: 60,
        proxied: false,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    },
  );
  if (!createRes.ok) {
    console.error(`[DDNS] Cloudflare DNS 레코드 생성 실패 (HTTP ${createRes.status}):`, await createRes.text());
    return { ok: false, message: `Cloudflare DNS 레코드 생성 실패 (HTTP ${createRes.status})` };
  }
  return { ok: true };
}

/**
 * 새로운 DDNS 도메인을 등록하고 Cloudflare에 DNS A 레코드를 생성합니다.
 */
export async function addManagedDomain(
  prefixOrDomain: string,
  label: string,
  initialIp?: string,
  ownerId?: string,
  ownerName?: string,
  os?: 'windows' | 'linux',
  isAdminRequester = false
): Promise<{ success: boolean; message: string; domain?: string }> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;

  if (!token || !zoneId) {
    return { success: false, message: 'Cloudflare API 토큰 또는 Zone ID가 서버에 설정되어 있지 않습니다.' };
  }

  const managed = getManagedDomains();
  const validated = validateNewDomainRegistration(prefixOrDomain, managed);
  if (!validated.ok) {
    return { success: false, message: validated.message };
  }
  const { domain, prefix } = validated;

  const cleanLabel = (label || prefix).trim().slice(0, 30);
  const fallbackIp = process.env.DDNS_DEFAULT_IP || '192.0.2.1';
  const targetIp = initialIp && isPublicIpv4(initialIp) ? initialIp : fallbackIp;
  const resolvedOs: 'windows' | 'linux' =
    os || (cleanLabel.toLowerCase().includes('win') ? 'windows' : 'linux');

  try {
    const cfResult = await upsertCloudflareARecord(
      zoneId,
      token,
      domain,
      targetIp,
      isAdminRequester,
    );
    if (!cfResult.ok) {
      return { success: false, message: cfResult.message };
    }

    managed.push({
      domain,
      label: cleanLabel,
      os: resolvedOs,
      createdAt: new Date().toISOString(),
      ownerId: ownerId || getAdminDiscordIds()[0] || '',
      ownerName: ownerName || '관리자',
    });
    saveManagedDomains(managed);

    saveDdnsState(domain, {
      currentIp: targetIp,
      previousIp: null,
      lastUpdated: new Date().toISOString(),
      lastChecked: new Date().toISOString(),
      status: 'ok',
      message: '새로 등록되었습니다.',
    });

    return {
      success: true,
      message: `성공적으로 등록되었습니다: ${domain}`,
      domain,
    };
  } catch (err: unknown) {
    console.error('[DDNS] 도메인 등록 중 오류:', err);
    return {
      success: false,
      message: '도메인 등록 중 오류가 발생했습니다.',
    };
  }
}

/**
 * DDNS 도메인을 삭제하고 Cloudflare DNS A 레코드를 제거합니다.
 */
export async function removeManagedDomain(
  targetDomain: string,
  requesterDiscordId?: string,
  isAdminRequester?: boolean
): Promise<{ success: boolean; message: string }> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const domain = normalizeDomain(targetDomain);

  const managed = getManagedDomains();
  const index = managed.findIndex((m) => m.domain === domain);
  if (index === -1) {
    return { success: false, message: '등록되지 않은 도메인입니다.' };
  }

  // 권한 검증 (fail-closed): 관리자가 아닌 경우 반드시 소유자 일치 필수
  const record = managed[index];
  if (!isAdminRequester) {
    if (!requesterDiscordId || !record.ownerId || record.ownerId !== requesterDiscordId) {
      return { success: false, message: '본인이 등록한 기기만 삭제할 수 있습니다.' };
    }
  }

  // Cloudflare DNS 레코드 삭제 시도
  if (token && zoneId) {
    try {
      const searchUrl = `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(domain)}`;
      const searchRes = await fetch(searchUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(8000),
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const records = searchData.result || [];
        for (const record of records) {
          await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${record.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
            cache: 'no-store',
            signal: AbortSignal.timeout(8000),
          });
        }
      }
    } catch (err) {
      console.error('[DDNS] Cloudflare 레코드 삭제 실패:', err);
    }
  }

  // 로컬 목록 및 상태 제거
  managed.splice(index, 1);
  saveManagedDomains(managed);
  deleteDdnsState(domain);

  return { success: true, message: `성공적으로 삭제되었습니다: ${domain}` };
}
