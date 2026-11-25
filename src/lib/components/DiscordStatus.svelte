<script lang="ts">
  import { onMount } from "svelte";
  import Icon from "./Icon.svelte";

  interface LanyardData {
    discord_user: {
      username: string;
      global_name?: string;
      id: string;
      avatar: string | null;
    };
    discord_status: "online" | "idle" | "dnd" | "offline";
  }

  let data = $state<LanyardData | null>(null);

  const statusMeta: Record<string, { label: string; dot: string; badge: string }> = {
    online: {
      label: "온라인",
      dot: "bg-emerald-500",
      badge: "bg-emerald-50 text-emerald-800 ring-emerald-600/30 dark:bg-emerald-400/10 dark:text-emerald-400 dark:ring-emerald-400/20",
    },
    idle: {
      label: "수면 중",
      dot: "bg-amber-400",
      badge: "bg-amber-50 text-amber-800 ring-amber-600/30 dark:bg-amber-400/10 dark:text-amber-400 dark:ring-amber-400/25",
    },
    dnd: {
      label: "다른 용무 중",
      dot: "bg-red-500",
      badge: "bg-red-50 text-red-800 ring-red-600/20 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20",
    },
    offline: {
      label: "오프라인",
      dot: "bg-gray-400",
      badge: "bg-gray-50 text-gray-700 ring-gray-500/25 dark:bg-gray-400/10 dark:text-gray-300 dark:ring-gray-400/20",
    },
  };

  function getAvatarUrl(d: LanyardData): string {
    if (d.discord_user.avatar) {
      const ext = d.discord_user.avatar.startsWith("a_") ? "gif" : "png";
      return `https://cdn.discordapp.com/avatars/${d.discord_user.id}/${d.discord_user.avatar}.${ext}?size=128`;
    }
    try {
      const idx = Number((BigInt(d.discord_user.id) >> BigInt(22)) % BigInt(6));
      return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    } catch {
      return "https://cdn.discordapp.com/embed/avatars/0.png";
    }
  }

  onMount(() => {
    let active = true;
    const fetchData = async () => {
      try {
        const res = await fetch("/api/discord");
        const json = await res.json();
        if (active && json.success && json.data) {
          data = json.data;
        }
      } catch (err) {
        console.error("Failed to fetch Discord status:", err);
      }
    };
    void fetchData();
    const interval = setInterval(() => void fetchData(), 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  });
</script>

{#if !data}
  <div
    class="flex h-full items-center gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]"
  >
    <div class="size-12 shrink-0 animate-pulse rounded-full bg-gray-200 dark:bg-gray-800"></div>
    <div class="min-w-0 flex-1 space-y-2">
      <div class="h-4 w-28 animate-pulse rounded bg-gray-200 dark:bg-gray-800"></div>
      <div class="h-3 w-20 animate-pulse rounded bg-gray-100 dark:bg-gray-900"></div>
    </div>
  </div>
{:else}
  {@const meta = statusMeta[data.discord_status] || statusMeta.offline}
  <div
    class="flex h-full flex-col justify-between gap-4 rounded-lg border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        <Icon name="discord" class="size-4 text-[#5865F2]" />
        Discord Presence
      </span>
      <span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset {meta.badge}">
        {meta.label}
      </span>
    </div>

    <div class="flex items-center gap-3.5">
      <div class="relative shrink-0">
        <img
          src={getAvatarUrl(data)}
          alt="Discord Avatar"
          referrerpolicy="no-referrer"
          class="user-icon size-12 rounded-full border border-gray-200 object-cover dark:border-gray-800"
        />
        <span
          class="absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-white dark:border-[#090E1A] {meta.dot}"
          title={meta.label}
        ></span>
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-base font-bold text-gray-900 dark:text-gray-50">
          {data.discord_user.global_name || data.discord_user.username}
        </p>
        <p class="truncate font-mono text-xs text-gray-500 dark:text-gray-400">
          @{data.discord_user.username}
        </p>
      </div>
    </div>
  </div>
{/if}
