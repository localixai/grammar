import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "src/background/credential-coordinator.ts",
        "src/background/grammar-service.ts",
        "src/background/message-validator.ts",
        "src/background/models-service.ts",
        "src/background/public-error.ts",
        "src/background/sender-context.ts",
        "src/content/apply.ts",
        "src/content/editor-geometry.ts",
        "src/content/input-detector.ts",
        "src/content/overlay.ts",
        "src/shared/utils/openrouter-auth.ts",
        "src/shared/utils/storage.ts",
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 75,
      },
    },
  },
});
