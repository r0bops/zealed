import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // `next build` (output: standalone) copies lib/*.test.ts into .next/standalone; don't run them twice.
  test: { exclude: [...configDefaults.exclude, ".next/**"] },
});
