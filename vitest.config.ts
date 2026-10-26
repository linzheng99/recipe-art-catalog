import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/frontend/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
    unstubGlobals: true,
  },
});
