<script lang="ts">
  import Icon from "./Icon.svelte";

  interface Props {
    title: string;
    subtitle: string;
    submitLabel: string;
    loadingLabel: string;
    loading?: boolean;
    errorMessage?: string;
    tokens?: [string, string, string];
    onSubmit: () => void | Promise<void>;
  }

  let {
    title,
    subtitle,
    submitLabel,
    loadingLabel,
    loading = false,
    errorMessage = "",
    tokens = $bindable<[string, string, string]>(["", "", ""]),
    onSubmit,
  }: Props = $props();

  let inputRefs = $state<(HTMLInputElement | null)[]>([null, null, null]);
  let allFilled = $derived(tokens.every((code) => /^\d{6}$/.test(code)));

  function handleInput(index: number, rawValue: string) {
    const digits = rawValue.replaceAll(/\D/g, "");
    if (index === 0 && digits.length >= 12) {
      tokens = [
        digits.slice(0, 6),
        digits.slice(6, 12),
        digits.slice(12, 18),
      ];
      const focusIdx = digits.length >= 18 ? 2 : 1;
      inputRefs[focusIdx]?.focus();
      return;
    }

    const code = digits.slice(0, 6);
    const next: [string, string, string] = [...tokens] as [string, string, string];
    next[index] = code;
    tokens = next;

    if (code.length === 6 && index < 2) {
      inputRefs[index + 1]?.focus();
    }
  }

  function handleKeyDown(index: number, event: KeyboardEvent) {
    if (event.key === "Backspace" && tokens[index].length === 0 && index > 0) {
      inputRefs[index - 1]?.focus();
    }
  }
</script>

<div class="flex justify-center pt-4">
  <div class="w-full max-w-md space-y-5 rounded-lg border border-gray-200 bg-white p-6 shadow-xs dark:border-gray-800/90 dark:bg-[#090E1A]">
    <div class="flex items-center gap-3">
      <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400">
        <Icon name="lock" class="size-5" />
      </div>
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-base font-semibold text-gray-900 dark:text-gray-50">
            {title}
          </h2>
          <span class="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 ring-1 ring-inset ring-indigo-500/30 dark:bg-indigo-400/10 dark:text-indigo-400">
            3중 OTP
          </span>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          {subtitle}
        </p>
      </div>
    </div>

    <form
      onsubmit={(e) => {
        e.preventDefault();
        if (allFilled && !loading) {
          void onSubmit();
        }
      }}
      class="space-y-3"
    >
      {#each [0, 1, 2] as idx}
        {@const ready = tokens[idx].length === 6}
        <div class="space-y-1">
          <div class="flex items-center justify-between text-xs">
            <label
              for={`otp-slot-${idx + 1}`}
              class="font-medium text-gray-700 dark:text-gray-300"
            >
              OTP #{idx + 1}
            </label>
            <span
              class={ready
                ? "inline-flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400"
                : "font-mono text-gray-400 dark:text-gray-500"}
            >
              {#if ready}
                <Icon name="check" class="size-3.5" />
                입력됨
              {:else}
                {tokens[idx].length}/6
              {/if}
            </span>
          </div>
          <input
            id={`otp-slot-${idx + 1}`}
            bind:this={inputRefs[idx]}
            type="text"
            inputmode="numeric"
            autocomplete={idx === 0 ? "one-time-code" : "off"}
            maxlength={idx === 0 ? 18 : 6}
            placeholder="000000"
            value={tokens[idx]}
            oninput={(e) => handleInput(idx, e.currentTarget.value)}
            onkeydown={(e) => handleKeyDown(idx, e)}
            class="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-center font-mono text-lg tracking-[0.3em] text-gray-900 shadow-xs outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-gray-800 dark:bg-gray-950 dark:text-gray-50 dark:focus:border-indigo-700 dark:focus:ring-indigo-700/30"
          />
        </div>
      {/each}

      {#if errorMessage}
        <p class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-400">
          {errorMessage}
        </p>
      {/if}

      <button
        type="submit"
        disabled={loading || !allFilled}
        class="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-xs transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-indigo-500 dark:hover:bg-indigo-600"
      >
        <Icon name="shield" class="size-4" />
        {loading ? loadingLabel : submitLabel}
      </button>
    </form>
  </div>
</div>
