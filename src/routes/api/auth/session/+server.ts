import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
  return Response.json(
    { user: locals.session?.user ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
};
