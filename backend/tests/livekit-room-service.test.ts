import { RoomServiceClient } from "livekit-server-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "../src/config/env.js";
import { logger } from "../src/config/logger.js";
import { deleteLivekitRoom } from "../src/lib/livekit.js";

const { deleteRoom } = vi.hoisted(() => ({ deleteRoom: vi.fn() }));

vi.mock("livekit-server-sdk", async (importOriginal) => ({
  ...(await importOriginal<typeof import("livekit-server-sdk")>()),
  RoomServiceClient: vi.fn(
    class {
      deleteRoom = deleteRoom;
    }
  )
}));

describe("LiveKit room deletion", () => {
  const originalUrl = env.LIVEKIT_URL;
  beforeEach(() => {
    vi.mocked(RoomServiceClient).mockClear();
    deleteRoom.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => {
    env.LIVEKIT_URL = originalUrl;
    vi.restoreAllMocks();
  });

  it.each([
    { websocketUrl: "wss://livekit.test", httpUrl: "https://livekit.test/" },
    { websocketUrl: "ws://localhost:7880", httpUrl: "http://localhost:7880/" }
  ])(
    "converts the WebSocket URL for room service calls: %j",
    async ({ websocketUrl, httpUrl }) => {
      env.LIVEKIT_URL = websocketUrl;
      await deleteLivekitRoom("ss_test-session");
      expect(RoomServiceClient).toHaveBeenCalledExactlyOnceWith(
        httpUrl,
        env.LIVEKIT_API_KEY,
        env.LIVEKIT_API_SECRET
      );
      expect(deleteRoom).toHaveBeenCalledExactlyOnceWith("ss_test-session");
    }
  );

  it.each(["room not found", "LiveKit unavailable"])(
    "logs and swallows room deletion failure: %s",
    async (message) => {
      const err = new Error(message);
      deleteRoom.mockRejectedValue(err);
      const warning = vi.spyOn(logger, "warn");
      await expect(deleteLivekitRoom("ss_test-session")).resolves.toBeUndefined();
      expect(warning).toHaveBeenCalledExactlyOnceWith(
        { err, room: "ss_test-session" },
        "Could not delete superseded Session room"
      );
    }
  );
});
