import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
  },
  coverage: {
    provider: "v8",
    include: ["src/**/*.ts"],
    reporter: ["text", "html"],
    thresholds: {
      statements: 98,
      branches: 98,
      functions: 98,
      lines: 98,
    },
  },
});
