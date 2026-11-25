import {
  type AuthVerification,
  getClientIp,
  getManagedDomains,
  isValidIp,
  resolveTargetDomain,
  syncCloudflareDdns,
  verifyDdnsRequest,
} from "./ddns";

const NO_STORE = { "Cache-Control": "no-store" };

function dyndnsText(code: string): Response {
  return new Response(`${code}\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function respondError(
  isDyndns: boolean,
  dyndnsCode: string,
  message: string,
  status: number,
): Response {
  if (isDyndns) return dyndnsText(dyndnsCode);
  return Response.json({ success: false, message }, { status, headers: NO_STORE });
}

function canAccessDomain(auth: AuthVerification, targetDomain: string): boolean {
  if (auth.isMaster || auth.user?.role === "admin") return true;
  const domainRecord = getManagedDomains().find((m) => m.domain === targetDomain);
  return Boolean(domainRecord?.ownerId && domainRecord.ownerId === auth.user?.discordId);
}

export async function handleDdnsUpdate(
  req: Request,
  url: URL,
  forceDyndns = false,
): Promise<Response> {
  const isDyndnsFormat =
    forceDyndns ||
    url.searchParams.get("format") === "dyndns" ||
    url.pathname.includes("/nic/update") ||
    Boolean(req.headers.get("accept")?.includes("text/plain"));

  const auth = verifyDdnsRequest(req, url, { allowQueryToken: true });
  if (!auth.authenticated) {
    return respondError(
      isDyndnsFormat,
      "badauth",
      "인증 토큰이 유효하지 않거나 제공되지 않았습니다. 올바른 개인 토큰을 사용하십시오.",
      401,
    );
  }

  const requestedDomain =
    url.searchParams.get("domain") || url.searchParams.get("hostname");
  const targetDomain = resolveTargetDomain(requestedDomain);
  if (!targetDomain) {
    return respondError(
      isDyndnsFormat,
      "nohost",
      "허용되지 않았거나 등록되지 않은 DDNS 도메인입니다.",
      400,
    );
  }

  if (!canAccessDomain(auth, targetDomain)) {
    return respondError(
      isDyndnsFormat,
      "nohost",
      "본인이 등록한 DDNS 도메인만 갱신할 수 있습니다.",
      403,
    );
  }

  let targetIp = url.searchParams.get("ip") || url.searchParams.get("myip");
  if (!targetIp || !isValidIp(targetIp)) {
    targetIp = getClientIp(req);
  }

  if (!isValidIp(targetIp)) {
    return respondError(
      isDyndnsFormat,
      "dnserr",
      "유효한 공인 IP 주소를 감지하거나 파싱할 수 없습니다.",
      400,
    );
  }

  const syncResult = await syncCloudflareDdns(targetIp, targetDomain);
  if (isDyndnsFormat) {
    if (!syncResult.success) return dyndnsText("911");
    return dyndnsText(syncResult.changed ? `good ${targetIp}` : `nochg ${targetIp}`);
  }

  return Response.json(
    {
      success: syncResult.success,
      updated: syncResult.changed,
      domain: syncResult.domain,
      ip: syncResult.ip,
      message: syncResult.message,
    },
    {
      status: syncResult.statusCode || (syncResult.success ? 200 : 500),
      headers: NO_STORE,
    },
  );
}
