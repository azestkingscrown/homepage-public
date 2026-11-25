import type { RequestHandler } from "./$types";

const DISCORD_ID = process.env.DISCORD_OWNER_ID?.trim() || "";

export const GET: RequestHandler = async () => {
  if (!DISCORD_ID) {
    return Response.json(
      { success: false, error: "DISCORD_OWNER_ID is not configured" },
      { status: 503 },
    );
  }
  try {
    const response = await fetch(
      `https://api.lanyard.rest/v1/users/${DISCORD_ID}`,
      { cache: "no-store", signal: AbortSignal.timeout(5000) },
    );

    if (!response.ok) {
      return Response.json(
        {
          success: false,
          error: `Lanyard API returned status ${response.status}`,
        },
        { status: response.status },
      );
    }

    const data = await response.json();
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error: unknown) {
    console.error("Error fetching Discord status from Lanyard:", error);
    return Response.json(
      {
        success: false,
        error: "Discord status lookup failed",
      },
      { status: 500 },
    );
  }
};
