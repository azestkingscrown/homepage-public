import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { clearDiscordSession, sanitizeReturnTo } from "#lib/server/auth.ts";

export const POST: RequestHandler = async ({ cookies }) => {
  clearDiscordSession(cookies);
  return Response.json({ success: true });
};

export const GET: RequestHandler = async ({ cookies, url }) => {
  clearDiscordSession(cookies);
  const returnTo = sanitizeReturnTo(url.searchParams.get("returnTo") || "/");
  redirect(302, returnTo);
};
