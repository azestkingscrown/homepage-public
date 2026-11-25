import type { Locale } from "#lib/i18n.ts";

// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {
    interface Locals {
      session: {
        user: {
          id: string;
          name: string;
          image: string | null;
        };
      } | null;
      host: string;
      locale: Locale;
    }
  }
}

export {};
