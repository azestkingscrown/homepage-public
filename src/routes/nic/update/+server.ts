import type { RequestHandler } from "./$types";
import { handleDdnsUpdate } from "#lib/server/ddnsUpdate.ts";
import { safePeerIp } from "#lib/server/session.ts";

export const GET: RequestHandler = async ({ request, url, getClientAddress }) =>
  handleDdnsUpdate(request, url, true, safePeerIp(getClientAddress));

export const POST: RequestHandler = async ({ request, url, getClientAddress }) =>
  handleDdnsUpdate(request, url, true, safePeerIp(getClientAddress));
