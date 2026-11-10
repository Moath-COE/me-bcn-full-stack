import { describe, expect, it } from "vitest";

import { livekitRoomName } from "../src/utils/livekit-room.js";

describe("LiveKit room name", () => {
  it("uses the Session's full id", () => {
    expect(livekitRoomName("ba74b8d3-09b7-428f-8ec7-17ed63656961")).toBe(
      "ss_ba74b8d3-09b7-428f-8ec7-17ed63656961"
    );
  });
});
