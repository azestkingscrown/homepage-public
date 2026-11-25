import type { RequestHandler } from "./$types";
import { clearDiscordSession } from "#lib/server/auth.ts";

export const POST: RequestHandler = async ({ cookies }) => {
  clearDiscordSession(cookies);
  return Response.json({ success: true });
};
