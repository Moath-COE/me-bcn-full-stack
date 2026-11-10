export function RemainingMinutes({ count }: { count: number }) {
  return (
    <p className="mt-2 max-w-measure text-sm leading-base text-ink-2">
      You have {count} {count === 1 ? "minute" : "minutes"} left in this usage period
    </p>
  );
}
