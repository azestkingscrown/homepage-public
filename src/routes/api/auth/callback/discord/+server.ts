import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  consumeOAuthState,
  getDiscordRedirectUri,
  setDiscordSession,
} from "#lib/server/auth.ts";
import { getWhitelistUsers, isAdmin } from "#lib/server/ddns.ts";

interface DiscordUserProfile {
  id: string;
  username: string;
  global_name?: string | null;
  avatar: string | null;
  discriminator?: string;
}

function buildAvatarUrl(profile: DiscordUserProfile): string {
  if (profile.avatar) {
    const ext = profile.avatar.startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${ext}?size=128`;
  }
  try {
    const idNum = BigInt(profile.id);
    const index = Number((idNum >> BigInt(22)) % BigInt(6));
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return "https://cdn.discordapp.com/embed/avatars/0.png";
  }
}

export const GET: RequestHandler = async ({ url, cookies }) => {
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  const { valid, returnTo } = consumeOAuthState(cookies, state);
  if (errorParam || !code || !valid) {
    redirect(302, "/unauthorized");
  }

  const clientId = process.env.DISCORD_CLIENT_ID || "";
  const clientSecret = process.env.DISCORD_CLIENT_SECRET || "";
  const redirectUri = getDiscordRedirectUri(url);

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      console.error("[Auth] Discord token exchange failed:", tokenRes.status);
      redirect(302, "/unauthorized");
    }

    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    if (!tokenJson.access_token) {
      redirect(302, "/unauthorized");
    }

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    });

    if (!userRes.ok) {
      console.error("[Auth] Discord @me fetch failed:", userRes.status);
      redirect(302, "/unauthorized");
    }

    const profile = (await userRes.json()) as DiscordUserProfile;
    const whitelist = getWhitelistUsers();
    const matched = whitelist.find((item) => item.id === profile.id);

    if (!matched && !isAdmin(profile.id)) {
      redirect(302, "/unauthorized");
    }

    setDiscordSession(cookies, {
      id: profile.id,
      name: matched?.name || profile.global_name || profile.username,
      image: buildAvatarUrl(profile),
    });
  } catch (err) {
    if (err && typeof err === "object" && "status" in err && "location" in err) {
      throw err;
    }
    console.error("[Auth] Discord OAuth callback error:", err);
    redirect(302, "/unauthorized");
  }

  redirect(302, returnTo || "/");
};
