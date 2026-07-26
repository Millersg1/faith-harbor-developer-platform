import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Vitest 4's default worker pool hits a "reading 'config'" init crash on
    // this Windows dev machine (CI/Linux is unaffected). The forks pool uses
    // child processes instead of worker threads and runs the suite reliably.
    pool: "forks",
    include: [
      "src/**/*.test.ts",
      "src/**/*.spec.ts",
      "tests/**/*.test.ts",
      "tests/**/*.spec.ts",
    ],
    exclude: [
      "node_modules/**",
      "dist/**",
      "frontend/**",
    ],
  },
});