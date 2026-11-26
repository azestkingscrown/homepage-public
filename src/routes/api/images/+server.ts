import type { RequestHandler } from "./$types";
import { listLegacyImages } from "#lib/server/drive.ts";
import {
  extractClientIp,
  safePeerIp,
  validateSession,
} from "#lib/server/session.ts";

export const GET: RequestHandler = async ({ request, getClientAddress }) => {
  const token = request.headers.get("x-session-token");
  const clientIp = extractClientIp(
    request.headers,
    safePeerIp(getClientAddress),
  );
  const userAgent = request.headers.get("user-agent") || "unknown-agent";

  if (!validateSession(token, "admin", clientIp, userAgent)) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    const images = await listLegacyImages();
    return Response.json({ images });
  } catch (error) {
    console.error("Failed to read images directory:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
};
