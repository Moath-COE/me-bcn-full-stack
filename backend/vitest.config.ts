import { defineConfig } from "vitest/config";

import { testDatabaseUrl } from "./tests/support/test-database-url.js";

export default defineConfig({
  test: {
    env: {
      NODE_ENV: "test",
      DATABASE_URL: testDatabaseUrl(),
      LIVEKIT_URL: "wss://livekit.test",
      LIVEKIT_API_KEY: "test-key",
      LIVEKIT_API_SECRET: "test-secret-at-least-32-characters-long"
    },
    globalSetup: ["./tests/support/global-setup.ts"],
    // Test files share one database.
    fileParallelism: false
  }
});
