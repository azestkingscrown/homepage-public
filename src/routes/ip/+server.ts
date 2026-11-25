import type { RequestHandler } from "./$types";
import { getClientIp } from "#lib/server/ddns.ts";
import { safePeerIp } from "#lib/server/session.ts";

export const GET: RequestHandler = async ({ request, getClientAddress }) => {
  const ip = getClientIp(request, safePeerIp(getClientAddress));
  return new Response(`${ip}\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
