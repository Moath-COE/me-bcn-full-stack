// Admin Insights time rules. Asia/Riyadh is UTC+3 all year (no daylight saving), so a fixed offset
// gives the same local day boundaries as the database's `AT TIME ZONE 'Asia/Riyadh'`.
export const INSIGHTS_TIME_ZONE = "Asia/Riyadh";

const OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const insightsRanges = ["7d", "30d", "90d"] as const;
export type InsightsRange = (typeof insightsRanges)[number];

const rangeDays: Record<InsightsRange, number> = { "7d": 7, "30d": 30, "90d": 90 };

export type InsightsWindow = {
  bucket: "day" | "week";
  // Local midnight of the first day, as an instant.
  from: Date;
  to: Date;
  // Every bucket's first local day, `YYYY-MM-DD`, oldest first.
  buckets: string[];
};

function isoDate(localMs: number): string {
  return new Date(localMs).toISOString().slice(0, 10);
}

// `7d` and `30d` are the last 7 or 30 local days including today, bucketed by day. `90d` is the last
// 90 local days, bucketed by week; a week starts on Sunday, so the first bucket may start before `from`.
export function insightsWindow(range: InsightsRange, now: Date): InsightsWindow {
  // "Local milliseconds": the local wall clock read as if it were UTC.
  const localNow = new Date(now.getTime() + OFFSET_MS);
  const todayMs = Date.UTC(
    localNow.getUTCFullYear(),
    localNow.getUTCMonth(),
    localNow.getUTCDate()
  );
  const firstMs = todayMs - (rangeDays[range] - 1) * DAY_MS;
  const bucket = range === "90d" ? "week" : "day";
  const startMs =
    bucket === "week" ? firstMs - new Date(firstMs).getUTCDay() * DAY_MS : firstMs;
  const stepMs = bucket === "week" ? 7 * DAY_MS : DAY_MS;

  const buckets: string[] = [];
  for (let ms = startMs; ms <= todayMs; ms += stepMs) buckets.push(isoDate(ms));

  return { bucket, from: new Date(firstMs - OFFSET_MS), to: now, buckets };
}
