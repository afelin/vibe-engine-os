import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    testTimeout: 30_000,
    // Spawn-heavy CLI/script tests flake under high file parallelism.
    maxWorkers: 2,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.worktrees/**",
      "**/site/proof/**",
    ],
  },
});
