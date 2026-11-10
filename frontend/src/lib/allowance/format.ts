const renewalDate = new Intl.DateTimeFormat("en", {
  day: "numeric",
  month: "long",
  year: "numeric",
  // A period ends at an instant; showing it in Riyadh time keeps the day the same for every student.
  timeZone: "Asia/Riyadh",
});

export function formatRenewalDate(date: Date): string {
  return renewalDate.format(date);
}
