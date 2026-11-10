export type EmailLocale = "ar" | "en";

// The web sends `x-becan-locale` on every auth request. Anything else falls back to Arabic.
export function resolveEmailLocale(request?: Request): EmailLocale {
  return request?.headers.get("x-becan-locale") === "en" ? "en" : "ar";
}
