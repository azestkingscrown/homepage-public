import type { RequestHandler } from "./$types";
import { getClientIp } from "#lib/server/ddns.ts";

export const GET: RequestHandler = async ({ request }) => {
  const ip = getClientIp(request);
  return new Response(`${ip}\n`, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
};
