import type { RequestHandler } from "./$types";
import type {
  DriveCategoryFilter,
  DriveItemRef,
  DriveSortDir,
  DriveSortField,
  DriveView,
} from "#lib/driveTypes.ts";
import {
  createFolder,
  deletePermanent,
  DriveError,
  emptyTrash,
  listDriveView,
  moveItems,
  renameItem,
  restoreItems,
  toggleShare,
  toggleStar,
  trashItems,
} from "#lib/server/drive.ts";
import {
  extractClientIp,
  safePeerIp,
  validateSession,
} from "#lib/server/session.ts";

const VALID_VIEWS = new Set<DriveView>([
  "my-drive",
  "recent",
  "starred",
  "shared",
  "trash",
]);

const VALID_CATEGORIES = new Set<DriveCategoryFilter>([
  "all",
  "image",
  "video",
  "audio",
  "document",
  "code",
  "archive",
  "media",
  "other",
]);

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

function handleDriveError(error: unknown, fallbackMessage: string): Response {
  if (error instanceof DriveError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("[API /api/drive] Error:", error);
  return Response.json({ error: fallbackMessage }, { status: 500 });
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
    const rawView = url.searchParams.get("view") || "my-drive";
    const view: DriveView = VALID_VIEWS.has(rawView as DriveView)
      ? (rawView as DriveView)
      : "my-drive";

    const rawFolderId = url.searchParams.get("folderId");
    const folderId =
      rawFolderId && rawFolderId.trim().length > 0 ? rawFolderId.trim() : null;

    const q = (url.searchParams.get("q") || "").slice(0, 200);

    const rawCategory = url.searchParams.get("category") || "all";
    const category: DriveCategoryFilter = VALID_CATEGORIES.has(
      rawCategory as DriveCategoryFilter,
    )
      ? (rawCategory as DriveCategoryFilter)
      : "all";

    const rawSort = url.searchParams.get("sort") || "updated";
    const sort: DriveSortField = VALID_SORTS.has(rawSort as DriveSortField)
      ? (rawSort as DriveSortField)
      : "updated";

    const rawDir = url.searchParams.get("dir");
    const dir: DriveSortDir | undefined =
      rawDir && VALID_DIRS.has(rawDir as DriveSortDir)
        ? (rawDir as DriveSortDir)
        : undefined;

    const data = await listDriveView({
      view,
      folderId,
      q,
      category,
      sort,
      dir,
    });

    return Response.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return handleDriveError(error, "드라이브 목록을 불러오지 못했습니다.");
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
    const action = body.action;

    switch (action) {
      case "createFolder": {
        const parentId =
          typeof body.parentId === "string" && body.parentId.trim()
            ? body.parentId.trim()
            : null;
        const folder = await createFolder(body.name, parentId);
        return Response.json({ success: true, folder });
      }

      case "rename": {
        const kind = body.kind;
        const id = body.id;
        if (
          (kind !== "folder" && kind !== "file") ||
          typeof id !== "string" ||
          !id
        ) {
          return Response.json(
            { error: "이름을 변경할 대상이 올바르지 않습니다." },
            { status: 400 },
          );
        }
        await renameItem(kind, id, body.name);
        return Response.json({ success: true });
      }

      case "move": {
        const targetFolderId =
          typeof body.targetFolderId === "string" && body.targetFolderId.trim()
            ? body.targetFolderId.trim()
            : null;
        await moveItems(body.items as DriveItemRef[], targetFolderId);
        return Response.json({ success: true });
      }

      case "toggleStar": {
        const starred =
          typeof body.starred === "boolean" ? body.starred : undefined;
        await toggleStar(body.items as DriveItemRef[], starred);
        return Response.json({ success: true });
      }

      case "toggleShare": {
        const fileIds = Array.isArray(body.fileIds)
          ? body.fileIds.filter((v): v is string => typeof v === "string" && Boolean(v))
          : [];
        const shared =
          typeof body.shared === "boolean" ? body.shared : undefined;
        const result = await toggleShare(fileIds, shared);
        return Response.json({ success: true, ...(result || {}) });
      }

      case "trash": {
        await trashItems(body.items as DriveItemRef[]);
        return Response.json({ success: true });
      }

      case "restore": {
        await restoreItems(body.items as DriveItemRef[]);
        return Response.json({ success: true });
      }

      case "deletePermanent": {
        const result = await deletePermanent(body.items as DriveItemRef[]);
        return Response.json({ success: true, ...result });
      }

      case "emptyTrash": {
        const result = await emptyTrash();
        return Response.json({ success: true, ...result });
      }

      default:
        return Response.json(
          { error: "지원하지 않는 작업입니다." },
          { status: 400 },
        );
    }
  } catch (error) {
    return handleDriveError(error, "드라이브 작업을 처리하지 못했습니다.");
  }
};
