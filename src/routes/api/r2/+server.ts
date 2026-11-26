import type { RequestHandler } from "./$types";
import type { DriveSortDir, DriveSortField } from "#lib/driveTypes.ts";
import { DriveError } from "#lib/server/drive.ts";
import {
  copyLocalFileToR2,
  createR2Folder,
  deleteR2Targets,
  getR2Config,
  listR2Prefix,
} from "#lib/server/r2.ts";
import {
  extractClientIp,
  safePeerIp,
  validateSession,
} from "#lib/server/session.ts";

const VALID_SORTS = new Set<DriveSortField>(["updated", "name", "size"]);
const VALID_DIRS = new Set<DriveSortDir>(["asc", "desc"]);

function isAuthorizedAdmin(
  request: Request,
  getClientAddress: () => string,
): boolean {
  const token = request.headers.get("x-session-token");
  const clientIp = extractClientIp(
    request.headers,
    safePeerIp(getClientAddress),
  );
  const userAgent = request.headers.get("user-agent") || "unknown-agent";
  return validateSession(token, "admin", clientIp, userAgent);
}

function handleR2Error(error: unknown, fallback: string): Response {
  if (error instanceof DriveError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("[API /api/r2] Error:", error);
  return Response.json({ error: fallback }, { status: 500 });
}

export const GET: RequestHandler = async ({
  request,
  url,
  getClientAddress,
}) => {
  if (!isAuthorizedAdmin(request, getClientAddress)) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  try {
    if (url.searchParams.get("statusOnly") === "1") {
      const cfg = getR2Config();
      return Response.json(
        {
          configured: Boolean(cfg),
          publicUrl: cfg?.publicUrl ?? null,
          hardCapBytes: cfg?.hardCapBytes ?? null,
        },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    const prefix = url.searchParams.get("prefix") || "";
    const q = (url.searchParams.get("q") || "").slice(0, 200);
    const rawSort = url.searchParams.get("sort") || "updated";
    const sort: DriveSortField = VALID_SORTS.has(rawSort as DriveSortField)
      ? (rawSort as DriveSortField)
      : "updated";
    const rawDir = url.searchParams.get("dir");
    const dir: DriveSortDir | undefined =
      rawDir && VALID_DIRS.has(rawDir as DriveSortDir)
        ? (rawDir as DriveSortDir)
        : undefined;

    const data = await listR2Prefix({ prefix, q, sort, dir });
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleR2Error(error, "R2 목록 조회에 실패했습니다.");
  }
};

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
  if (!isAuthorizedAdmin(request, getClientAddress)) {
    return Response.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return Response.json({ error: "잘못된 요청 형식입니다." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ error: "JSON 본문을 읽을 수 없습니다." }, { status: 400 });
  }

  try {
    switch (body.action) {
      case "createFolder": {
        const folder = await createR2Folder(body.prefix, body.name);
        return Response.json({ success: true, folder });
      }

      case "delete": {
        const keys = Array.isArray(body.keys) ? body.keys : [];
        const prefixes = Array.isArray(body.prefixes) ? body.prefixes : [];
        if (keys.length + prefixes.length === 0) {
          return Response.json({ error: "삭제할 대상이 없습니다." }, { status: 400 });
        }
        if (keys.length + prefixes.length > 200) {
          return Response.json(
            { error: "한 번에 최대 200개 항목까지만 삭제할 수 있습니다." },
            { status: 400 },
          );
        }
        const res = await deleteR2Targets({ keys, prefixes });
        return Response.json({ success: true, ...res });
      }

      case "copyFromLocal": {
        const rawIds = Array.isArray(body.fileIds) ? body.fileIds : [];
        const fileIds = rawIds.filter(
          (id): id is string =>
            typeof id === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(id),
        );
        if (fileIds.length === 0) {
          return Response.json({ error: "복제할 파일이 없습니다." }, { status: 400 });
        }
        if (fileIds.length > 20) {
          return Response.json(
            { error: "한 번에 최대 20개 파일까지 R2로 배포할 수 있습니다." },
            { status: 400 },
          );
        }
        const copied = [];
        for (const id of new Set(fileIds)) {
          copied.push(await copyLocalFileToR2(id, body.targetPrefix));
        }
        return Response.json({ success: true, copied });
      }

      default:
        return Response.json(
          { error: "지원하지 않는 R2 작업입니다." },
          { status: 400 },
        );
    }
  } catch (error) {
    return handleR2Error(error, "R2 작업 처리에 실패했습니다.");
  }
};
