import "server-only";

/* Chapter content (slides and lesson lists) lives in object storage, one folder per chapter:
   `courses/{courseId}/ch_{number}/`. It is read on the server so the access key stays there. */

export async function fetchContent(path: string): Promise<Response | null> {
  const base = process.env.CONTENT_STORAGE_URL;
  const key = process.env.CONTENT_STORAGE_KEY;
  if (!base || !key) return null;

  return fetch(`${base.replace(/\/+$/, "")}/${path}`, {
    headers: { AccessKey: key },
    cache: "no-store",
  });
}
