import type { RequestHandler } from "./$types";
import {
  createOAuthState,
  getDiscordRedirectUri,
  sanitizeReturnTo,
} from "#lib/server/auth.ts";

export const GET: RequestHandler = async ({ url, cookies }) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    return new Response("DISCORD_CLIENT_ID is not configured", { status: 500 });
  }

  const returnTo = sanitizeReturnTo(url.searchParams.get("callbackUrl") || url.searchParams.get("returnTo") || "/");
  const state = createOAuthState(cookies, returnTo);
  const redirectUri = getDiscordRedirectUri(url);

  const authUrl = new URL("https://discord.com/api/oauth2/authorize");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", "identify");
  authUrl.searchParams.set("state", state);

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      "Cache-Control": "no-store",
    },
  });
};
