import { describe, expect, it } from "vitest";

import { currentPeriod } from "../src/utils/current-period.js";

describe("currentPeriod", () => {
  it("starts the first Period at the anchor", () => {
    const anchor = new Date("2026-01-01T12:34:56.789Z");

    expect(currentPeriod(anchor, anchor)).toEqual({
      start: anchor,
      end: new Date("2026-01-31T12:34:56.789Z")
    });
  });

  it.each([
    [
      "just before the boundary",
      "2026-01-31T12:34:56.788Z",
      "2026-01-01T12:34:56.789Z",
      "2026-01-31T12:34:56.789Z"
    ],
    [
      "exactly at the boundary",
      "2026-01-31T12:34:56.789Z",
      "2026-01-31T12:34:56.789Z",
      "2026-03-02T12:34:56.789Z"
    ],
    [
      "after many Periods",
      "2026-12-31T00:00:00.000Z",
      "2026-12-27T12:34:56.789Z",
      "2027-01-26T12:34:56.789Z"
    ],
    [
      "before the anchor",
      "2025-12-01T00:00:00.000Z",
      "2026-01-01T12:34:56.789Z",
      "2026-01-31T12:34:56.789Z"
    ]
  ])("returns the expected UTC window %s", (_label, now, start, end) => {
    expect(currentPeriod(new Date("2026-01-01T12:34:56.789Z"), new Date(now))).toEqual({
      start: new Date(start),
      end: new Date(end)
    });
  });
});
