import crypto from "node:crypto";
import { validateSession } from "#lib/server/session.ts";

export type DriveTicketPurpose = "download" | "media";

export interface DriveStreamTicket {
  ticket: string;
  fileId: string;
  purpose: DriveTicketPurpose;
  sessionToken: string;
  ip: string;
  userAgent: string;
  expiresAt: number;
}

const MAX_TICKETS = 500;
const DOWNLOAD_TICKET_TTL_MS = 60_000;
const MEDIA_TICKET_TTL_MS = 10 * 60_000;

declare global {
  // eslint-disable-next-line no-var
  var __driveTicketStore: Map<string, DriveStreamTicket> | undefined;
}

function getTicketStore(): Map<string, DriveStreamTicket> {
  if (!global.__driveTicketStore) {
    global.__driveTicketStore = new Map<string, DriveStreamTicket>();
    setInterval(() => {
      const now = Date.now();
      for (const [k, v] of global.__driveTicketStore!.entries()) {
        if (v.expiresAt < now) {
          global.__driveTicketStore!.delete(k);
        }
      }
    }, 60_000).unref();
  }
  return global.__driveTicketStore;
}

function pruneTicketStore(store: Map<string, DriveStreamTicket>, now: number) {
  for (const [k, v] of store.entries()) {
    if (v.expiresAt < now) store.delete(k);
  }
  while (store.size >= MAX_TICKETS) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

/** Issue a short-lived streaming ticket bound to caller IP, UA, and active admin session. */
export function issueDriveTicket(input: {
  fileId: string;
  purpose: DriveTicketPurpose;
  sessionToken: string;
  ip: string;
  userAgent: string;
}): { ticket: string; expiresInSeconds: number } {
  const store = getTicketStore();
  const now = Date.now();
  pruneTicketStore(store, now);

  const ttlMs =
    input.purpose === "media" ? MEDIA_TICKET_TTL_MS : DOWNLOAD_TICKET_TTL_MS;
  const ticket = crypto.randomBytes(32).toString("hex");
  store.set(ticket, {
    ticket,
    fileId: input.fileId,
    purpose: input.purpose,
    sessionToken: input.sessionToken,
    ip: input.ip,
    userAgent: input.userAgent,
    expiresAt: now + ttlMs,
  });

  return {
    ticket,
    expiresInSeconds: Math.floor(ttlMs / 1000),
  };
}

/** Verify ticket ownership, expiry, and ensure the parent admin session is still active. */
export function verifyDriveTicket(
  ticket: string | null | undefined,
  clientIp: string,
  userAgent: string,
): DriveStreamTicket | null {
  if (!ticket || typeof ticket !== "string") return null;
  if (!/^[0-9a-f]{64}$/.test(ticket)) return null;

  const store = getTicketStore();
  const entry = store.get(ticket);
  if (!entry) return null;

  if (entry.expiresAt < Date.now()) {
    store.delete(ticket);
    return null;
  }

  if (entry.ip && clientIp && entry.ip !== clientIp) {
    return null;
  }
  if (entry.userAgent && userAgent && entry.userAgent !== userAgent) {
    return null;
  }

  if (!validateSession(entry.sessionToken, "admin", clientIp, userAgent)) {
    store.delete(ticket);
    return null;
  }

  return entry;
}
