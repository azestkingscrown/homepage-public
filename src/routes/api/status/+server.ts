import type { RequestHandler } from "./$types";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { timingSafeEqualStr } from "#lib/server/session.ts";

const GCP_AGENT_URL = process.env.GCP_AGENT_URL?.trim() || "";
const NET_INTERFACE = process.env.NET_INTERFACE?.trim() || "eth0";
const AVAILABILITY_FILE = path.join(process.cwd(), "availability.json");

interface AvailabilityRecord {
  startTime: number;
  upSeconds: number;
  totalSeconds: number;
  lastSeen?: number;
}

interface AvailabilityFile {
  oracle: AvailabilityRecord;
  gcp: AvailabilityRecord;
  tablet: AvailabilityRecord;
  mini: AvailabilityRecord;
}

interface PushCache {
  cpus: { id: number; usage: string }[];
  memory: { usedGB: string; totalGB: string; percentage: string };
  zram: { usedGB: string; totalGB: string; percentage: string };
  network?: { down: string; up: string };
  uptime: string;
  arch: string;
  lastUpdated: number;
}

const g = globalThis as typeof globalThis & {
  availabilityInterval?: ReturnType<typeof setInterval>;
  tabletStatusCache?: PushCache;
  miniStatusCache?: PushCache;
};

function getAvailabilityData(): AvailabilityFile {
  try {
    if (fs.existsSync(AVAILABILITY_FILE)) {
      const data = JSON.parse(
        fs.readFileSync(AVAILABILITY_FILE, "utf8"),
      ) as Partial<AvailabilityFile>;
      const now = Date.now();
      const oracle: AvailabilityRecord = data.oracle || {
        startTime: now,
        upSeconds: 0,
        totalSeconds: 0,
        lastSeen: now,
      };
      const gcp: AvailabilityRecord = data.gcp || {
        startTime: oracle.startTime,
        upSeconds: 0,
        totalSeconds: 0,
      };
      if (!oracle.totalSeconds) {
        oracle.totalSeconds = oracle.upSeconds || 1;
        gcp.totalSeconds = gcp.upSeconds || 1;
      }
      if (!oracle.lastSeen) oracle.lastSeen = now;

      const tablet: AvailabilityRecord = data.tablet || {
        startTime: oracle.startTime || now,
        upSeconds: gcp.upSeconds || 0,
        totalSeconds: gcp.totalSeconds || 0,
      };
      const mini: AvailabilityRecord = data.mini || {
        startTime: oracle.startTime || now,
        upSeconds: oracle.upSeconds || 0,
        totalSeconds: oracle.totalSeconds || 0,
      };
      return { oracle, gcp, tablet, mini };
    }
  } catch {
    // fallback to initial availability object
  }
  const now = Date.now();
  return {
    oracle: { startTime: now, upSeconds: 0, totalSeconds: 0, lastSeen: now },
    gcp: { startTime: now, upSeconds: 0, totalSeconds: 0 },
    tablet: { startTime: now, upSeconds: 0, totalSeconds: 0 },
    mini: { startTime: now, upSeconds: 0, totalSeconds: 0 },
  };
}

function saveAvailabilityData(data: AvailabilityFile) {
  try {
    fs.writeFileSync(AVAILABILITY_FILE, JSON.stringify(data, null, 2), {
      encoding: "utf8",
      mode: 0o600,
    });
  } catch {
    // ignore transient disk write errors
  }
}

if (!g.availabilityInterval) {
  const bootNow = Date.now();
  const initData = getAvailabilityData();
  const lastSeen = initData.oracle.lastSeen || bootNow;
  const initialGap = bootNow - lastSeen;
  if (initialGap > 90000) {
    const offlineSeconds = Math.floor(initialGap / 1000);
    initData.oracle.totalSeconds += offlineSeconds;
    initData.gcp.totalSeconds += offlineSeconds;
    initData.gcp.upSeconds += offlineSeconds;
    initData.tablet.totalSeconds += offlineSeconds;
    initData.tablet.upSeconds += offlineSeconds;
    initData.mini.totalSeconds += offlineSeconds;
    initData.mini.upSeconds += offlineSeconds;
  }
  initData.oracle.lastSeen = bootNow;
  saveAvailabilityData(initData);

  g.availabilityInterval = setInterval(async () => {
    const data = getAvailabilityData();
    const now = Date.now();

    data.oracle.totalSeconds += 60;
    data.oracle.upSeconds += 60;
    data.oracle.lastSeen = now;

    if (GCP_AGENT_URL) {
      data.gcp.totalSeconds += 60;
      try {
        const res = await fetch(GCP_AGENT_URL, {
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) data.gcp.upSeconds += 60;
      } catch {
        // gcp agent unreachable
      }
    }

    data.tablet.totalSeconds += 60;
    if (g.tabletStatusCache && now - g.tabletStatusCache.lastUpdated < 75000) {
      data.tablet.upSeconds += 60;
    }

    data.mini.totalSeconds += 60;
    if (g.miniStatusCache && now - g.miniStatusCache.lastUpdated < 75000) {
      data.mini.upSeconds += 60;
    }

    saveAvailabilityData(data);
  }, 60000);
  g.availabilityInterval.unref?.();
}

function calculateAvailability(
  serverKey: "oracle" | "gcp" | "tablet" | "mini",
) {
  const data = getAvailabilityData();
  const info = data[serverKey];
  if (!info?.totalSeconds || info.totalSeconds <= 0) return "100.00";
  const percentage = (info.upSeconds / info.totalSeconds) * 100;
  return Math.min(100, percentage).toFixed(2);
}

let lastCpus = os.cpus();
let lastNetwork = { rx: 0, tx: 0, time: Date.now() };

async function getOracleStatus() {
  const currentCpus = os.cpus();
  const cpuDetails = currentCpus.map((cpu, i) => {
    const lastCpu = lastCpus[i] || cpu;
    const idle = cpu.times.idle - lastCpu.times.idle;
    const total =
      Object.values(cpu.times).reduce((a, b) => a + b, 0) -
      Object.values(lastCpu.times).reduce((a, b) => a + b, 0);
    const usage = total > 0 ? ((total - idle) / total) * 100 : 0;
    return { id: i, usage: usage.toFixed(1) };
  });
  lastCpus = currentCpus;

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const toGB = (bytes: number) => (bytes / 1024 ** 3).toFixed(2);

  let downloadSpeed = "0.0 KB/s";
  let uploadSpeed = "0.0 KB/s";
  try {
    const data = fs.readFileSync("/proc/net/dev", "utf8");
    const line = data.split("\n").find((l) => l.includes(`${NET_INTERFACE}:`));
    if (line) {
      const stats = line.trim().split(/\s+/);
      const rxBytes = Number.parseInt(stats[1], 10);
      const txBytes = Number.parseInt(stats[9], 10);
      const now = Date.now();
      const timeDiff = (now - lastNetwork.time) / 1000;
      if (lastNetwork.rx > 0 && timeDiff > 0) {
        const formatSpeed = (bps: number) => {
          if (bps > 1024 * 1024)
            return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
          return `${(bps / 1024).toFixed(1)} KB/s`;
        };
        downloadSpeed = formatSpeed((rxBytes - lastNetwork.rx) / timeDiff);
        uploadSpeed = formatSpeed((txBytes - lastNetwork.tx) / timeDiff);
      }
      lastNetwork = { rx: rxBytes, tx: txBytes, time: now };
    }
  } catch {
    // /proc/net/dev unavailable
  }

  let zramInfo = { usedGB: "0.00", totalGB: "0.00", percentage: "0.0" };
  try {
    const memInfo = fs.readFileSync("/proc/meminfo", "utf8");
    const getVal = (key: string) => {
      const match = new RegExp(String.raw`${key}:\s+(\d+)`).exec(memInfo);
      return match ? Number.parseInt(match[1], 10) * 1024 : 0;
    };
    const sTotal = getVal("SwapTotal");
    const sFree = getVal("SwapFree");
    const sUsed = sTotal - sFree;
    if (sTotal > 0) {
      zramInfo = {
        totalGB: (sTotal / 1024 ** 3).toFixed(2),
        usedGB: (sUsed / 1024 ** 3).toFixed(2),
        percentage: ((sUsed / sTotal) * 100).toFixed(1),
      };
    }
  } catch {
    // /proc/meminfo unavailable
  }

  const uptimeSeconds = os.uptime();
  const days = Math.floor(uptimeSeconds / (24 * 3600));
  const hours = Math.floor((uptimeSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = Math.floor(uptimeSeconds % 60);

  return {
    name: "Main Server",
    cpus: cpuDetails,
    memory: {
      usedGB: toGB(usedMem),
      totalGB: toGB(totalMem),
      percentage: ((usedMem / totalMem) * 100).toFixed(1),
    },
    zram: zramInfo,
    network: { down: downloadSpeed, up: uploadSpeed },
    uptime: `${days}d ${hours}h ${minutes}m ${seconds}s`,
    availability: calculateAvailability("oracle"),
  };
}

function getTabletStatus() {
  const now = Date.now();
  const tabletCache = g.tabletStatusCache;
  if (!tabletCache || now - tabletCache.lastUpdated >= 30000) {
    return {
      name: "Sub Server",
      error: "Offline",
      availability: calculateAvailability("tablet"),
    };
  }
  return {
    name: "Sub Server",
    cpus: tabletCache.cpus || [],
    memory: tabletCache.memory,
    zram: tabletCache.zram,
    uptime: tabletCache.uptime,
    availability: calculateAvailability("tablet"),
  };
}

function getMiniStatus() {
  const now = Date.now();
  const miniCache = g.miniStatusCache;
  if (!miniCache || now - miniCache.lastUpdated >= 30000) {
    return {
      name: "Mini Server",
      error: "Offline",
      availability: calculateAvailability("mini"),
    };
  }
  return {
    name: "Mini Server",
    cpus: miniCache.cpus || [],
    memory: miniCache.memory,
    zram: miniCache.zram,
    network: miniCache.network,
    uptime: miniCache.uptime,
    arch: miniCache.arch || "x64",
    availability: calculateAvailability("mini"),
  };
}

function parseMemMetrics(raw: unknown) {
  if (!raw || typeof raw !== "object") {
    return { usedGB: "0.00", totalGB: "0.00", percentage: "0.0" };
  }
  const obj = raw as Record<string, unknown>;
  return {
    usedGB: typeof obj.usedGB === "string" ? obj.usedGB.slice(0, 10) : "0.00",
    totalGB: typeof obj.totalGB === "string" ? obj.totalGB.slice(0, 10) : "0.00",
    percentage:
      typeof obj.percentage === "string" ? obj.percentage.slice(0, 10) : "0.0",
  };
}

function parseNetworkMetrics(raw: unknown) {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  return {
    down: typeof obj.down === "string" ? obj.down.slice(0, 20) : "0.0 KB/s",
    up: typeof obj.up === "string" ? obj.up.slice(0, 20) : "0.0 KB/s",
  };
}

function parsePushPayload(metrics: Record<string, unknown>, isMini: boolean): PushCache {
  const rawCpus = Array.isArray(metrics.cpus) ? metrics.cpus : [];
  const safeCpus = rawCpus.slice(0, 32).map((cpu: Record<string, unknown>) => ({
    id: typeof cpu.id === "number" ? cpu.id : 0,
    usage:
      typeof cpu.usage === "string" && cpu.usage.length <= 10
        ? cpu.usage.replace(/[^0-9.]/g, "")
        : "0.0",
  }));

  const defaultArch = isMini ? "x64" : "arm64";
  const safeArch =
    typeof metrics.arch === "string"
      ? metrics.arch.slice(0, 20).replace(/[^a-zA-Z0-9_-]/g, "")
      : defaultArch;

  const safeUptime =
    typeof metrics.uptime === "string"
      ? metrics.uptime.slice(0, 50).replace(/[^a-zA-Z0-9\s]/g, "")
      : "unknown";

  return {
    cpus: safeCpus,
    memory: parseMemMetrics(metrics.memory),
    zram: parseMemMetrics(metrics.zram),
    network: parseNetworkMetrics(metrics.network),
    uptime: safeUptime,
    arch: safeArch,
    lastUpdated: Date.now(),
  };
}

export const GET: RequestHandler = async () => {
  const oracle = await getOracleStatus();
  let gcp = null;

  if (GCP_AGENT_URL) {
    try {
      const res = await fetch(GCP_AGENT_URL, {
        signal: AbortSignal.timeout(2000),
        cache: "no-store",
      });
      const data = (await res.json()) as Record<string, unknown>;
      const { swap, ...rest } = data;
      gcp = {
        name: "Chzzk Bot Server",
        ...rest,
        zram: swap,
        availability: calculateAvailability("gcp"),
      };
    } catch {
      gcp = {
        name: "Chzzk Bot Server",
        error: "Offline",
        availability: calculateAvailability("gcp"),
      };
    }
  }

  return Response.json(
    { servers: [oracle, getMiniStatus(), getTabletStatus(), gcp].filter(Boolean) },
    { headers: { "Cache-Control": "no-store" } },
  );
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const tabletToken = request.headers.get("x-tablet-token");
    const miniToken = request.headers.get("x-mini-token");
    const secretTabletToken = process.env.TABLET_MONITOR_TOKEN;
    const secretMiniToken = process.env.MINI_MONITOR_TOKEN || secretTabletToken;

    const isTablet = timingSafeEqualStr(tabletToken, secretTabletToken);
    const isMini = timingSafeEqualStr(miniToken, secretMiniToken);

    if (!isTablet && !isMini) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const metrics = (await request.json()) as Record<string, unknown>;
    if (!metrics || typeof metrics !== "object") {
      return Response.json({ error: "Invalid payload format" }, { status: 400 });
    }

    const parsed = parsePushPayload(metrics, isMini);
    if (isTablet) {
      g.tabletStatusCache = parsed;
    } else if (isMini) {
      g.miniStatusCache = parsed;
    }

    return Response.json({ success: true });
  } catch (error: unknown) {
    console.error("Error processing status push:", error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
};
