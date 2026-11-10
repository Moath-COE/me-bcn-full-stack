/** A post-sign-in destination is only ever a path on this site; anything else becomes `fallback`. */
export function safeNext(raw: string | null | undefined, fallback = "/dashboard"): string {
  const hasControl = (value: string) => Array.from(value).some(
    (char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127,
  );
  if (!raw || hasControl(raw)) return fallback;
  let decoded = raw.split(/[?#]/, 1)[0];
  try {
    /* Only the path is decoded layer by layer; the query string is not a redirect target. */
    while (true) {
      if (!/^\/[^/\\]/.test(decoded) || decoded.includes("\\") ||
        hasControl(decoded)) {
        return fallback;
      }
      if (new URL(decoded, "https://becan.invalid").pathname.startsWith("//")) return fallback;
      const next = decodeURIComponent(decoded);
      if (next === decoded) return raw;
      decoded = next;
    }
  } catch {
    return fallback;
  }
}

export function accountReturnPath(
  path: string,
  searchParams: Record<string, string | string[] | undefined>,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    for (const entry of Array.isArray(value) ? value : value === undefined ? [] : [value]) {
      query.append(key, entry);
    }
  }
  const search = query.toString();
  return search ? `${path}?${search}` : path;
}
