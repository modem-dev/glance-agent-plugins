import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const resolveFromRoot = (path: string) =>
  fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@mariozechner/pi-ai": resolveFromRoot("./test/stubs/pi-ai.ts"),
      "@mariozechner/pi-coding-agent": resolveFromRoot(
        "./test/stubs/pi-coding-agent.ts",
      ),
      "@mariozechner/pi-tui": resolveFromRoot("./test/stubs/pi-tui.ts"),
    },
  },
  test: {
    clearMocks: true,
    coverage: {
      all: true,
      include: ["pi/**/*.ts"],
      provider: "v8",
      reporter: ["text", "lcov"],
    },
    environment: "node",
    restoreMocks: true,
  },
});
