import type { RequestHandler } from "./$types";
import {
  addManagedDomain,
  addWhitelistUser,
  type DdnsState,
  type DdnsUser,
  ensureDdnsUser,
  getAllDdnsStates,
  getClientIp,
  getDdnsState,
  getDdnsUsers,
  getWhitelistUsers,
  isAdmin,
  normalizeDomain,
  regenerateUserToken,
  removeManagedDomain,
  removeWhitelistUser,
  resolveTargetDomain,
  updateManagedDomainOs,
  verifyDdnsRequest,
} from "#lib/server/ddns.ts";

interface AuthResult {
  authenticated: boolean;
  userType: "discord" | "token" | null;
  user?: DdnsUser;
  isAdmin: boolean;
}

const NO_STORE_STRICT = {
  "Cache-Control": "no-store, no-cache, must-revalidate",
};
const NO_STORE = { "Cache-Control": "no-store" };

function verifyAuth(
  req: Request,
  url: URL,
  session: App.Locals["session"],
): AuthResult {
  if (session?.user?.id) {
    const discordId = session.user.id;
    const isWhitelisted = getWhitelistUsers().some((u) => u.id === discordId);
    const isAdminUser = isAdmin(discordId);

    if (isWhitelisted || isAdminUser) {
      const user = ensureDdnsUser(discordId, session.user.name || undefined);
      return {
        authenticated: true,
        userType: "discord",
        user,
        isAdmin: isAdminUser,
      };
    }
  }

  const tokenAuth = verifyDdnsRequest(req, url);
  if (tokenAuth.authenticated && tokenAuth.user) {
    return {
      authenticated: true,
      userType: "token",
      user: tokenAuth.user,
      isAdmin: Boolean(
        tokenAuth.user.role === "admin" && isAdmin(tokenAuth.user.discordId),
      ),
    };
  }

  return { authenticated: false, userType: null, isAdmin: false };
}

function canReadState(
  auth: AuthResult,
  record: DdnsState | undefined,
): boolean {
  if (auth.isAdmin) return true;
  return Boolean(record?.ownerId && record.ownerId === auth.user?.discordId);
}

function mapDomainView(state: DdnsState, clientIp: string, includeDefaultOwner: boolean) {
  return {
    domain: state.domain,
    label: state.label || "기기",
    ownerId: state.ownerId,
    ownerName: includeDefaultOwner ? state.ownerName || "미지정" : state.ownerName,
    os: state.os || "windows",
    createdAt: state.createdAt,
    currentIp: state.currentIp,
    previousIp: state.previousIp,
    lastUpdated: state.lastUpdated,
    lastChecked: state.lastChecked,
    status: state.status,
    message: state.message,
    isIpMatching: Boolean(state.currentIp && state.currentIp === clientIp),
  };
}

function handleRawGet(auth: AuthResult, requestedDomain: string | null): Response {
  const allManagedStates = getAllDdnsStates();
  const fallbackDomain =
    allManagedStates.find((s) => s.ownerId === auth.user?.discordId)?.domain ||
    (auth.isAdmin ? resolveTargetDomain(null) : null);
  const targetDomain = requestedDomain
    ? resolveTargetDomain(requestedDomain)
    : fallbackDomain;

  const textHeaders = {
    "Content-Type": "text/plain; charset=utf-8",
    ...NO_STORE_STRICT,
  };

  if (!targetDomain) {
    return new Response("notfound\n", { status: 404, headers: textHeaders });
  }

  const managedRecord = allManagedStates.find((s) => s.domain === targetDomain);
  if (!canReadState(auth, managedRecord)) {
    return new Response("forbidden\n", { status: 403, headers: textHeaders });
  }

  const state = managedRecord || getDdnsState(targetDomain);
  return new Response(`${state.currentIp || "none"}\n`, {
    status: 200,
    headers: textHeaders,
  });
}

function handleSingleDomainGet(
  auth: AuthResult,
  requestedDomain: string,
  clientIp: string,
): Response {
  const targetDomain = resolveTargetDomain(requestedDomain);
  if (!targetDomain) {
    return Response.json(
      { success: false, message: "등록되지 않은 도메인입니다." },
      { status: 404, headers: NO_STORE },
    );
  }
  const managedRecord = getAllDdnsStates().find((s) => s.domain === targetDomain);
  if (!canReadState(auth, managedRecord)) {
    return Response.json(
      { success: false, message: "본인이 등록한 도메인만 조회할 수 있습니다." },
      { status: 403, headers: NO_STORE },
    );
  }
  const state = managedRecord || getDdnsState(targetDomain);
  return Response.json(
    {
      success: true,
      domain: state.domain,
      label: state.label,
      ownerId: state.ownerId,
      ownerName: state.ownerName,
      currentIp: state.currentIp,
      previousIp: state.previousIp,
      lastUpdated: state.lastUpdated,
      lastChecked: state.lastChecked,
      clientIp,
      isIpMatching: Boolean(state.currentIp && state.currentIp === clientIp),
      status: state.status,
      message: state.message,
    },
    { headers: NO_STORE },
  );
}

function handleAdminViewGet(auth: AuthResult, clientIp: string): Response {
  const user = auth.user!;
  return Response.json(
    {
      success: true,
      isAdmin: true,
      clientIp,
      users: getDdnsUsers(),
      whitelist: getWhitelistUsers(),
      domains: getAllDdnsStates().map((s) => mapDomainView(s, clientIp, true)),
      authToken: user.token,
      user: { name: user.name, id: user.discordId, role: user.role },
    },
    { headers: NO_STORE },
  );
}

export const GET: RequestHandler = async ({ request, url, locals }) => {
  const clientIp = getClientIp(request);
  const auth = verifyAuth(request, url, locals.session);

  if (!auth.authenticated || !auth.user) {
    return Response.json(
      {
        success: false,
        message:
          "보안 인증이 필요합니다. Discord로 로그인하거나 Authorization: Bearer <token> 헤더를 제공하십시오.",
        clientIp,
      },
      { status: 401, headers: NO_STORE_STRICT },
    );
  }

  const requestedDomain =
    url.searchParams.get("domain") || url.searchParams.get("hostname");
  const rawParam = url.searchParams.get("raw");
  if (rawParam === "1" || rawParam === "true") {
    return handleRawGet(auth, requestedDomain);
  }
  if (requestedDomain) {
    return handleSingleDomainGet(auth, requestedDomain, clientIp);
  }
  if (url.searchParams.get("view") === "admin" && auth.isAdmin) {
    return handleAdminViewGet(auth, clientIp);
  }

  const myStates = getAllDdnsStates(auth.user.discordId).map((s) =>
    mapDomainView(s, clientIp, false),
  );
  const allStates = auth.isAdmin
    ? getAllDdnsStates().map((s) => mapDomainView(s, clientIp, true))
    : undefined;

  return Response.json(
    {
      success: true,
      clientIp,
      domains: myStates,
      allDomains: allStates,
      defaultDomain: myStates[0]?.domain || allStates?.[0]?.domain,
      currentIp: myStates[0]?.currentIp,
      authToken: auth.user.token,
      authType: auth.userType,
      isAdmin: auth.isAdmin,
      user: {
        name: auth.user.name,
        id: auth.user.discordId,
        role: auth.user.role,
      },
    },
    { headers: NO_STORE_STRICT },
  );
};

function readStringField(body: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const val = body[key];
    if (typeof val === "string" && val.length > 0) return val;
  }
  return "";
}

function handleUpdateOsAction(
  auth: AuthResult,
  body: Record<string, unknown>,
): Response {
  const domain = readStringField(body, "domain");
  const os = body.os;
  if (!domain || (os !== "windows" && os !== "linux")) {
    return Response.json(
      { success: false, message: "도메인 및 올바른 OS(windows, linux)가 필요합니다." },
      { status: 400 },
    );
  }

  const normalizedTarget = normalizeDomain(domain);
  const targetState = getAllDdnsStates().find(
    (s) => s.domain.toLowerCase() === normalizedTarget,
  );
  if (!targetState) {
    return Response.json(
      { success: false, message: "등록되지 않은 도메인입니다." },
      { status: 404 },
    );
  }
  if (!canReadState(auth, targetState)) {
    return Response.json(
      { success: false, message: "해당 도메인의 설정을 변경할 권한이 없습니다." },
      { status: 403 },
    );
  }

  const updated = updateManagedDomainOs(normalizedTarget, os);
  const osLabel = os === "windows" ? "Windows" : "Linux";
  const message = updated
    ? `기기 OS가 ${osLabel}로 변경되었습니다.`
    : "OS 변경 실패";
  return Response.json({ success: updated, os, message });
}

function handleAdminWhitelistAction(
  auth: AuthResult,
  action: "add_whitelist" | "remove_whitelist",
  body: Record<string, unknown>,
): Response {
  if (!auth.isAdmin) {
    return Response.json(
      { success: false, message: "관리자 권한이 필요합니다." },
      { status: 403 },
    );
  }
  const discordId = readStringField(body, "discordId");
  const result =
    action === "add_whitelist"
      ? addWhitelistUser(discordId, readStringField(body, "name"))
      : removeWhitelistUser(discordId);
  return Response.json(result, { status: result.success ? 200 : 400 });
}

async function handleCreateDomainAction(
  auth: AuthResult,
  body: Record<string, unknown>,
  clientIp: string,
): Promise<Response> {
  const domainPrefix = readStringField(body, "domain", "prefix", "subdomain");
  if (!domainPrefix) {
    return Response.json(
      { success: false, message: "서브도메인 이름(prefix)은 필수 항목입니다." },
      { status: 400, headers: NO_STORE },
    );
  }

  const label = readStringField(body, "label", "name") || "새 기기";
  const initialIp = readStringField(body, "ip") || clientIp;
  const deviceOs: "windows" | "linux" = body.os === "linux" ? "linux" : "windows";
  const targetOwnerId =
    (auth.isAdmin && readStringField(body, "ownerId")) || auth.user!.discordId;
  const targetOwnerName =
    (auth.isAdmin && readStringField(body, "ownerName")) || auth.user!.name;

  const result = await addManagedDomain(
    domainPrefix,
    label,
    initialIp,
    targetOwnerId,
    targetOwnerName,
    deviceOs,
    auth.isAdmin,
  );
  return Response.json(result, {
    status: result.success ? 200 : 400,
    headers: NO_STORE,
  });
}

export const POST: RequestHandler = async ({ request, url, locals }) => {
  const clientIp = getClientIp(request);
  const auth = verifyAuth(request, url, locals.session);

  if (!auth.authenticated || !auth.user) {
    return Response.json(
      { success: false, message: "인증 권한이 없습니다." },
      { status: 401, headers: NO_STORE },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = body.action;

    if (action === "regenerate_token") {
      const targetDiscordId =
        (auth.isAdmin && readStringField(body, "targetDiscordId")) ||
        auth.user.discordId;
      return Response.json({
        success: true,
        token: regenerateUserToken(targetDiscordId),
        message: "새로운 개인 DDNS 토큰이 발급되었습니다.",
      });
    }

    if (action === "add_whitelist" || action === "remove_whitelist") {
      return handleAdminWhitelistAction(auth, action, body);
    }

    if (action === "update_os") {
      return handleUpdateOsAction(auth, body);
    }

    return await handleCreateDomainAction(auth, body, clientIp);
  } catch (err: unknown) {
    return Response.json(
      {
        success: false,
        message:
          err instanceof Error
            ? err.message
            : "요청 처리 중 오류가 발생했습니다.",
      },
      { status: 500, headers: NO_STORE },
    );
  }
};

export const DELETE: RequestHandler = async ({ request, url, locals }) => {
  const auth = verifyAuth(request, url, locals.session);
  if (!auth.authenticated || !auth.user) {
    return Response.json(
      { success: false, message: "인증 권한이 없습니다." },
      { status: 401, headers: NO_STORE },
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { domain?: string };
    const domain = body.domain || url.searchParams.get("domain");

    if (!domain || typeof domain !== "string") {
      return Response.json(
        { success: false, message: "삭제할 도메인명이 지정되지 않았습니다." },
        { status: 400, headers: NO_STORE },
      );
    }

    const result = await removeManagedDomain(
      domain,
      auth.user.discordId,
      auth.isAdmin,
    );
    return Response.json(result, {
      status: result.success ? 200 : 400,
      headers: NO_STORE,
    });
  } catch (err: unknown) {
    return Response.json(
      {
        success: false,
        message:
          err instanceof Error
            ? err.message
            : "기기 삭제 중 오류가 발생했습니다.",
      },
      { status: 500, headers: NO_STORE },
    );
  }
};
