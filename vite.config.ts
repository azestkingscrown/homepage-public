import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      preprocess: vitePreprocess(),
      adapter: adapter({
        out: "build",
      }),
      csrf: {
        // /api/ddns/update, /nic/update 등 비브라우저 클라이언트의 POST를 허용하고,
        // 브라우저 쿠키 기반 엔드포인트의 Origin 검증은 src/hooks.server.ts에서 정밀 적용합니다.
        trustedOrigins: ["*"],
      },
      csp: {
        mode: "nonce",
        directives: {
          "default-src": ["none"],
          "script-src": ["strict-dynamic", "self"],
          "style-src": ["self", "https://fonts.googleapis.com"],
          "style-src-attr": [
            "unsafe-hashes",
            "sha256-S8qMpvofolR8Mpjy4kQvEm7m1q8clzU4dfDH0AmvZjo=",
          ],
          "font-src": ["self", "https://fonts.gstatic.com"],
          "img-src": [
            "self",
            "data:",
            "blob:",
            "https://cdn.discordapp.com",
            "https://i.scdn.co",
            "https://images.unsplash.com",
            "https://ui-avatars.com",
            "https://media.discordapp.net",
          ],
          "connect-src": [
            "self",
            "https://api.lanyard.rest",
            "wss://api.lanyard.rest",
          ],
          "media-src": ["self"],
          "manifest-src": ["self"],
          "worker-src": ["self", "blob:"],
          "frame-src": ["self"],
          "child-src": ["self"],
          "object-src": ["none"],
          "base-uri": ["self"],
          "form-action": ["self"],
          "frame-ancestors": ["self"],
        },
      },
    }),
  ],
});
