// Adds `error=<code>` to a callback URL, keeping its path, existing query and hash. An absolute URL
// stays absolute; a relative path (which Better Auth's trusted-origin check also accepts) stays one.
export function appendErrorParam(callbackURL: string, code: string): string {
  const base = "http://relative.invalid";
  const url = new URL(callbackURL, base);
  url.searchParams.set("error", code);

  return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : url.toString();
}
