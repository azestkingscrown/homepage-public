<script lang="ts">
  import { onMount } from "svelte";
  import { localeStore } from "#lib/locale.svelte.ts";
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

  let statusMeta = $derived<Record<string, { label: string; dot: string; badge: string }>>({
    online: {
      label: localeStore.t.discord.online,
      dot: "bg-[#239f50] dark:bg-[#54d483]",
      badge: "border-[#54d483]/30 bg-[#54d483]/10 text-[#239f50] dark:text-[#54d483]",
    },
    idle: {
      label: localeStore.t.discord.idle,
      dot: "bg-[#eb980a] dark:bg-[#f4b434]",
      badge: "border-[#f4b434]/30 bg-[#f4b434]/10 text-[#eb980a] dark:text-[#f4b434]",
    },
    dnd: {
      label: localeStore.t.discord.dnd,
      dot: "bg-[#db2424] dark:bg-[#ed5a5a]",
      badge: "border-[#ed5a5a]/30 bg-[#ed5a5a]/10 text-[#db2424] dark:text-[#ed5a5a]",
    },
    offline: {
      label: localeStore.t.discord.offline,
      dot: "bg-oc-faint",
      badge: "border-oc-border bg-oc-subtle text-oc-muted",
    },
  });

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
    class="flex h-full items-center gap-4 rounded-md border border-oc-border bg-oc-surface p-5"
  >
    <div class="size-12 shrink-0 animate-pulse rounded-full bg-oc-hover"></div>
    <div class="min-w-0 flex-1 space-y-2">
      <div class="h-4 w-28 animate-pulse rounded bg-oc-hover"></div>
      <div class="h-3 w-20 animate-pulse rounded bg-oc-subtle"></div>
    </div>
  </div>
{:else}
  {@const meta = statusMeta[data.discord_status] || statusMeta.offline}
  <div
    class="flex h-full flex-col justify-between gap-4 rounded-md border border-oc-border bg-oc-surface p-5"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="inline-flex items-center gap-1.5 font-mono text-xs font-semibold uppercase tracking-wider text-oc-muted">
        <Icon name="discord" class="size-4 text-oc-strong" />
        Discord Presence
      </span>
      <span class="inline-flex items-center rounded border px-2 py-0.5 font-mono text-xs font-semibold {meta.badge}">
        {meta.label}
      </span>
    </div>

    <div class="flex items-center gap-3.5">
      <div class="relative shrink-0">
        <img
          src={getAvatarUrl(data)}
          alt="Discord Avatar"
          referrerpolicy="no-referrer"
          class="user-icon size-12 rounded-full border border-oc-border object-cover"
        />
        <span
          class="absolute bottom-0 right-0 size-3.5 rounded-full border-2 border-oc-surface {meta.dot}"
          title={meta.label}
        ></span>
      </div>
      <div class="min-w-0 flex-1">
        <p class="truncate text-base font-bold text-oc-strong">
          {data.discord_user.global_name || data.discord_user.username}
        </p>
        <p class="truncate font-mono text-xs text-oc-muted">
          @{data.discord_user.username}
        </p>
      </div>
    </div>
  </div>
{/if}
