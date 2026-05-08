// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
//
// IMPORTANT: cloudflare:false disables the Cloudflare Workers adapter so the
// production build targets Node.js (Nitro node-server preset). Carapace runs
// on a self-hosted VPS, not Cloudflare. The Lovable preview environment still
// works because it uses `vite dev`, which doesn't invoke the cloudflare plugin.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  cloudflare: false,
});
