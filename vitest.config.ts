import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // The "server-only" package throws when imported outside a React Server
      // Component graph — stub it so server modules can be unit-tested.
      "server-only": path.resolve(process.cwd(), "src/test/server-only-stub.ts"),
      "@": path.resolve(process.cwd(), "src"),
    },
  },
  test: {
    environment: "node",
    // Sets dummy env vars BEFORE test files import modules that assert them.
    setupFiles: ["src/test/setup.ts"],
    include: ["src/**/*.test.ts"],
  },
});
