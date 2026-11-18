import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@/lib": path.resolve(__dirname, "../site/lib") },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
