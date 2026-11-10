import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

const run = promisify(execFile);

// src/config/env.ts validates at import time and exits the process on a bad environment, so each
// case imports it in a child process. Empty strings stand for "unset" and also keep dotenv from
// filling the variable in from a developer's .env.
async function loadEnv(google: { id?: string; secret?: string }) {
  const result = await run(
    process.execPath,
    [
      "--import",
      "tsx",
      "-e",
      'const { env } = await import("./src/config/env.ts"); console.log(JSON.stringify({ id: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET }))'
    ],
    {
      env: {
        ...process.env,
        NODE_ENV: "test",
        GOOGLE_CLIENT_ID: google.id ?? "",
        GOOGLE_CLIENT_SECRET: google.secret ?? ""
      }
    }
  );

  return JSON.parse(result.stdout.trim()) as { id?: string; secret?: string };
}

describe("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET", () => {
  it("are both optional: Google is simply not configured", async () => {
    expect(await loadEnv({})).toEqual({});
  });

  it("are accepted together", async () => {
    expect(await loadEnv({ id: "client-id", secret: "client-secret" })).toEqual({
      id: "client-id",
      secret: "client-secret"
    });
  });

  it.each([
    ["only the id", { id: "client-id" }, "GOOGLE_CLIENT_SECRET"],
    ["only the secret", { secret: "client-secret" }, "GOOGLE_CLIENT_ID"]
  ])("fail validation with %s", async (_label, google, missing) => {
    await expect(loadEnv(google)).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        `${missing} is required when another GOOGLE_* variable is set`
      )
    });
  });
});
