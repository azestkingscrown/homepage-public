import type { RequestHandler } from "./$types";
import fs from "node:fs";
import path from "node:path";

export const GET: RequestHandler = async () => {
  const filePath = path.resolve(
    process.cwd(),
    "static",
    "docs",
    "chzzk-bot-guide.html",
  );
  const html = fs.readFileSync(filePath, "utf8");
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
};
