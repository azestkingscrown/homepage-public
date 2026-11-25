import type { RequestHandler } from "./$types";
import fs from "node:fs";
import path from "node:path";

export const GET: RequestHandler = async ({ locals }) => {
  const filename =
    locals.locale === "en" ? "technical-info.en.html" : "technical-info.html";
  const filePath = path.resolve(process.cwd(), "static", "docs", filename);
  const html = fs.readFileSync(filePath, "utf8");
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
      Vary: "Accept-Language, Cookie",
    },
  });
};
