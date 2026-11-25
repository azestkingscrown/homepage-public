import type { RequestHandler } from "./$types";
import { handleDdnsUpdate } from "#lib/server/ddnsUpdate.ts";

export const GET: RequestHandler = async ({ request, url }) =>
  handleDdnsUpdate(request, url);

export const POST: RequestHandler = async ({ request, url }) =>
  handleDdnsUpdate(request, url);
