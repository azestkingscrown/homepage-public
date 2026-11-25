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
  <div class="w-full max-w-md space-y-5 rounded-md border border-oc-border bg-oc-surface p-6">
    <div class="flex items-center gap-3">
      <div class="flex size-10 shrink-0 items-center justify-center rounded border border-oc-border bg-oc-subtle text-oc-strong">
        <Icon name="lock" class="size-5" />
      </div>
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-base font-semibold text-oc-strong">
            {title}
          </h2>
          <span class="rounded border border-oc-border bg-oc-subtle px-1.5 py-0.5 font-mono text-[10px] font-medium text-oc-text">
            3중 OTP
          </span>
        </div>
        <p class="text-xs text-oc-muted">
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
              class="font-mono font-medium text-oc-text"
            >
              OTP #{idx + 1}
            </label>
            <span
              class={ready
                ? "inline-flex items-center gap-1 font-medium text-[#239f50] dark:text-[#54d483]"
                : "font-mono text-oc-faint"}
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
            class="block w-full rounded border border-oc-border bg-oc-bg px-3 py-2 text-center font-mono text-lg tracking-[0.3em] text-oc-strong outline-none transition placeholder:text-oc-faint focus:border-oc-strong focus:ring-1 focus:ring-oc-border-strong"
          />
        </div>
      {/each}

      {#if errorMessage}
        <p class="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-[#db2424] dark:text-[#ed5a5a]">
          {errorMessage}
        </p>
      {/if}

      <button
        type="submit"
        disabled={loading || !allFilled}
        class="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded bg-oc-strong px-4 py-2 text-sm font-medium text-oc-inverted transition hover:bg-oc-strong-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Icon name="shield" class="size-4" />
        {loading ? loadingLabel : submitLabel}
      </button>
    </form>
  </div>
</div>
