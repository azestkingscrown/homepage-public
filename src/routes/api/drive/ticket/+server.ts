import type { RequestHandler } from "./$types";
import { getFileById, resolveSafeUploadPath } from "#lib/server/drive.ts";
import { issueDriveTicket } from "#lib/server/driveTickets.ts";
import {
  extractClientIp,
  safePeerIp,
  validateSession,
} from "#lib/server/session.ts";

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  const token = request.headers.get("x-session-token");
  const clientIp = extractClientIp(
    request.headers,
    safePeerIp(getClientAddress),
  );
  const userAgent = request.headers.get("user-agent") || "unknown-agent";

  if (!token || !validateSession(token, "admin", clientIp, userAgent)) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let body: { fileId?: unknown; purpose?: unknown };
  try {
    body = (await request.json()) as { fileId?: unknown; purpose?: unknown };
  } catch {
    return Response.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
  }

  if (
    typeof body.fileId !== "string" ||
    !/^[a-zA-Z0-9-]{8,64}$/.test(body.fileId)
  ) {
    return Response.json({ error: "잘못된 파일 ID입니다." }, { status: 400 });
  }
  const purpose = body.purpose;
  if (purpose !== "download" && purpose !== "media") {
    return Response.json(
      { error: "지원하지 않는 티켓 목적입니다." },
      { status: 400 },
    );
  }

  const file = await getFileById(body.fileId);
  if (!file) {
    return Response.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  const resolved = await resolveSafeUploadPath(file.storageName);
  if (!resolved) {
    return Response.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });
  }

  const { ticket, expiresInSeconds } = issueDriveTicket({
    fileId: file.id,
    purpose,
    sessionToken: token,
    ip: clientIp,
    userAgent,
  });

  return Response.json(
    {
      ticket,
      url: `/api/drive/stream?ticket=${ticket}`,
      expiresIn: expiresInSeconds,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
};
