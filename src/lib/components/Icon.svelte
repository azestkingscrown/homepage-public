<script lang="ts">
  export type IconName =
    | "home"
    | "book"
    | "branch"
    | "bell"
    | "shield"
    | "globe"
    | "gamepad"
    | "upload"
    | "admin"
    | "github"
    | "discord"
    | "external"
    | "sun"
    | "moon"
    | "monitor"
    | "menu"
    | "close"
    | "more"
    | "login"
    | "logout"
    | "check"
    | "copy"
    | "trash"
    | "edit"
    | "add"
    | "refresh"
    | "lock"
    | "unlock"
    | "eye"
    | "eyeOff"
    | "key"
    | "server"
    | "cpu"
    | "drive"
    | "arrowDown"
    | "arrowUp"
    | "arrowLeft"
    | "clock"
    | "alert"
    | "play"
    | "stop"
    | "settings"
    | "heart"
    | "cup"
    | "code"
    | "file"
    | "shuffle"
    | "users"
    | "user"
    | "terminal"
    | "history"
    | "sparkles"
    | "loader"
    | "folder"
    | "folderOpen"
    | "folderPlus"
    | "search"
    | "grid"
    | "list"
    | "star"
    | "starFilled"
    | "download"
    | "link"
    | "chevronRight"
    | "chevronDown"
    | "image"
    | "video"
    | "music"
    | "archive"
    | "fileText"
    | "restore"
    | "move"
    | "info"
    | "uploadFolder"
    | "checkSquare";

  let { name, class: className = "size-4" }: { name: IconName; class?: string } =
    $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.8"
  stroke-linecap="round"
  stroke-linejoin="round"
  class={className}
  aria-hidden="true"
>
  {#if name === "home"}
    <path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
  {:else if name === "book"}
    <path d="M2 5.5A2.5 2.5 0 0 1 4.5 3H10a3 3 0 0 1 2 1 3 3 0 0 1 2-1h5.5A2.5 2.5 0 0 1 22 5.5v13a2.5 2.5 0 0 1-2.5 2.5H14a2 2 0 0 0-2 1 2 2 0 0 0-2-1H4.5A2.5 2.5 0 0 1 2 18.5Z" /><path d="M12 4v17" />
  {:else if name === "branch"}
    <circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><path d="M6 8.5v7" /><path d="M18 8.5a6 6 0 0 1-6 6H8.5" />
  {:else if name === "bell"}
    <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9" /><path d="M10 19a2 2 0 0 0 4 0" />
  {:else if name === "shield"}
    <path d="M12 3 4 6.5v5.5c0 4.6 3.4 7.9 8 9 4.6-1.1 8-4.4 8-9V6.5L12 3Z" /><path d="m9 12 2 2 4-4" />
  {:else if name === "globe"}
    <circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a13.5 13.5 0 0 1 0 18 13.5 13.5 0 0 1 0-18Z" />
  {:else if name === "gamepad"}
    <rect x="2" y="6" width="20" height="12" rx="4" /><path d="M6 12h4" /><path d="M8 10v4" /><circle cx="15.5" cy="11" r="0.8" fill="currentColor" /><circle cx="17.5" cy="13" r="0.8" fill="currentColor" />
  {:else if name === "upload"}
    <path d="M12 16V7" /><path d="m8.5 10.5 3.5-3.5 3.5 3.5" /><path d="M20 16.5A4.5 4.5 0 0 0 18 8h-1.2A7 7 0 1 0 4 14.9" />
  {:else if name === "admin"}
    <path d="M12 3 4 6.5v5.5c0 4.5 3.3 7.8 8 9 4.7-1.2 8-4.5 8-9V6.5L12 3Z" /><circle cx="12" cy="10" r="2" /><path d="M8.5 16c.8-1.5 2-2.2 3.5-2.2s2.7.7 3.5 2.2" />
  {:else if name === "github"}
    <path d="M9 19c-4 1.2-4-2-6-2.5m12 5v-3.8c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" />
  {:else if name === "discord"}
    <path fill="currentColor" stroke="none" d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028ZM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
  {:else if name === "external"}
    <path d="M14 4h6v6" /><path d="M10 14 20 4" /><path d="M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6" />
  {:else if name === "sun"}
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M4.93 19.07l1.41-1.41m11.32-11.32 1.41-1.41" />
  {:else if name === "moon"}
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
  {:else if name === "monitor"}
    <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8" /><path d="M12 17v4" />
  {:else if name === "menu"}
    <path d="M4 6h16M4 12h16M4 18h16" />
  {:else if name === "close"}
    <path d="M18 6 6 18M6 6l12 12" />
  {:else if name === "more"}
    <circle cx="12" cy="5" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="19" r="1.2" fill="currentColor" />
  {:else if name === "login"}
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="m10 17 5-5-5-5" /><path d="M15 12H3" />
  {:else if name === "logout"}
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
  {:else if name === "check"}
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  {:else if name === "copy"}
    <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  {:else if name === "trash"}
    <path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M6 6l1 14a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-14" />
  {:else if name === "edit"}
    <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" />
  {:else if name === "add"}
    <path d="M12 5v14M5 12h14" />
  {:else if name === "refresh"}
    <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
  {:else if name === "lock"}
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" />
  {:else if name === "unlock"}
    <rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 7.6-1.7" />
  {:else if name === "eye"}
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  {:else if name === "eyeOff"}
    <path d="M10.7 5.1A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.1 4.2" /><path d="M6.6 6.6C4 8.5 2 12 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6" /><path d="M3 3l18 18" />
  {:else if name === "key"}
    <circle cx="8" cy="15" r="4" /><path d="m11 12 9-9" /><path d="m17 6 3 3" /><path d="m14 9 2 2" />
  {:else if name === "server"}
    <rect x="3" y="4" width="18" height="6" rx="1.5" /><rect x="3" y="14" width="18" height="6" rx="1.5" /><circle cx="7" cy="7" r="0.8" fill="currentColor" /><circle cx="7" cy="17" r="0.8" fill="currentColor" />
  {:else if name === "cpu"}
    <rect x="6" y="6" width="12" height="12" rx="2" /><rect x="9.5" y="9.5" width="5" height="5" /><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4" />
  {:else if name === "drive"}
    <path d="M4 13h16l-1.5-7.5A2 2 0 0 0 16.5 4h-9a2 2 0 0 0-2 1.5Z" /><rect x="4" y="13" width="16" height="7" rx="2" /><circle cx="8" cy="16.5" r="0.8" fill="currentColor" />
  {:else if name === "arrowDown"}
    <path d="M12 5v14m0 0-5-5m5 5 5-5" />
  {:else if name === "arrowUp"}
    <path d="M12 19V5m0 0-5 5m5-5 5 5" />
  {:else if name === "arrowLeft"}
    <path d="M19 12H5m0 0 6-6m-6 6 6 6" />
  {:else if name === "clock"}
    <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" />
  {:else if name === "alert"}
    <path d="M10.3 3.9 2.3 18a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14.1a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4" /><circle cx="12" cy="17" r="0.8" fill="currentColor" />
  {:else if name === "play"}
    <circle cx="12" cy="12" r="9" /><path d="m10 8.5 6 3.5-6 3.5v-7Z" fill="currentColor" />
  {:else if name === "stop"}
    <circle cx="12" cy="12" r="9" /><rect x="9" y="9" width="6" height="6" fill="currentColor" />
  {:else if name === "settings"}
    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  {:else if name === "heart"}
    <path d="M12 20.5S4 15.2 4 9.5A4.5 4.5 0 0 1 12 6.6 4.5 4.5 0 0 1 20 9.5c0 5.7-8 11-8 11Z" />
  {:else if name === "cup"}
    <path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5V8Z" /><path d="M16 9h2a2.5 2.5 0 0 1 0 5h-2" /><path d="M4 21h14" />
  {:else if name === "code"}
    <path d="m8 7-5 5 5 5" /><path d="m16 7 5 5-5 5" /><path d="m14 4-4 16" />
  {:else if name === "file"}
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" />
  {:else if name === "shuffle"}
    <path d="M16 3h5v5" /><path d="m4 20 17-17" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="m4 4 5 5" />
  {:else if name === "users"}
    <circle cx="9" cy="8" r="3" /><path d="M3 19a6 6 0 0 1 12 0" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 14.5A4.5 4.5 0 0 1 21 19" />
  {:else if name === "user"}
    <circle cx="12" cy="8" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" />
  {:else if name === "terminal"}
    <rect x="3" y="4" width="18" height="16" rx="2" /><path d="m7 9 3 3-3 3" /><path d="M12 15h5" />
  {:else if name === "history"}
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" />
  {:else if name === "sparkles"}
    <path d="m12 3 1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
  {:else if name === "loader"}
    <path d="M12 3a9 9 0 1 0 9 9" />
  {:else if name === "folder"}
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  {:else if name === "folderOpen"}
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v1H7l-3 9H3V7Z" /><path d="M5 19h14l2-9H8Z" />
  {:else if name === "folderPlus"}
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M12 10.5v5M9.5 13h5" />
  {:else if name === "search"}
    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
  {:else if name === "grid"}
    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
  {:else if name === "list"}
    <path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="0.8" fill="currentColor" /><circle cx="4" cy="12" r="0.8" fill="currentColor" /><circle cx="4" cy="18" r="0.8" fill="currentColor" />
  {:else if name === "star"}
    <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z" />
  {:else if name === "starFilled"}
    <path fill="currentColor" stroke="none" d="m12 2.4 3.05 6.18 6.82.99-4.93 4.8 1.16 6.79L12 17.95l-6.1 3.21 1.16-6.79-4.93-4.8 6.82-.99L12 2.4Z" />
  {:else if name === "download"}
    <path d="M12 4v11" /><path d="m7.5 10.5 4.5 4.5 4.5-4.5" /><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  {:else if name === "link"}
    <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.1 1.1" /><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.1-1.1" />
  {:else if name === "chevronRight"}
    <path d="m9 6 6 6-6 6" />
  {:else if name === "chevronDown"}
    <path d="m6 9 6 6 6-6" />
  {:else if name === "image"}
    <rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L6 20" />
  {:else if name === "video"}
    <rect x="2" y="5" width="14" height="14" rx="2" /><path d="m16 10 6-3.5v11L16 14Z" />
  {:else if name === "music"}
    <path d="M9 18V6l11-2v12" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" />
  {:else if name === "archive"}
    <rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8" /><path d="M10 12h4" />
  {:else if name === "fileText"}
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /><path d="M8 13h8M8 17h5" />
  {:else if name === "restore"}
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" />
  {:else if name === "move"}
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M9.5 13h5M12.5 10.5 15 13l-2.5 2.5" />
  {:else if name === "info"}
    <circle cx="12" cy="12" r="9" /><path d="M12 16v-4" /><circle cx="12" cy="8.2" r="0.8" fill="currentColor" />
  {:else if name === "uploadFolder"}
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /><path d="M12 16v-5m-2.5 2.5L12 11l2.5 2.5" />
  {:else if name === "checkSquare"}
    <rect x="3" y="3" width="18" height="18" rx="3" /><path d="m8 12.5 2.8 2.8L16.5 9.5" />
  {/if}
</svg>
