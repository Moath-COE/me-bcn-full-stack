# Catalog is managed by hand with SQL; one content folder per Chapter

An earlier design gave the admin dashboard a Catalog API: UUID ids and slugs for Courses and
Chapters, Chapter states, versioned content with upload and validation, and an Admin preview. We
dropped it. The reason is simplicity: the Catalog is small and changes rarely, so the dashboard
does not need to own it. It keeps Account management and Insights.

- **Identity.** A Course's id is its slug (`acct-101`). A Chapter is `(course_id, number)`.
- **Publication.** A Chapter has a `published` boolean. Unpublished means Coming soon: listed, but no
  Student Session can open it. An Admin Session may open it (permission `tutor: unlimited`).
- **Content.** A Chapter's teaching material (slides and lesson list) lives in object storage, one
  folder per Chapter: `courses/{course_id}/ch_{number}/`. It is uploaded by hand. The backend never
  reads or writes it and has no storage configuration.
- **The session contract.** The token request is `{ courseId, chapterNumber, language, experience }`.
  The LiveKit participant attributes the agent reads are `course_id`, `chapter_id` (`ch_{n}`),
  `language`, `experience`, `user_id`, `user_name`, `session_seconds` and `session_limit`.
- **The Catalog is managed by hand with SQL.** Adding an Institution, Major, Course or Chapter, and
  publishing or unpublishing a Chapter, is an `INSERT` or `UPDATE` in a transaction.
- **The seed only fills in what is missing.** `src/db/seed-data/` is a set of fixtures for local
  development and tests. `pnpm db:seed` inserts missing Institutions, Majors, Courses and Chapters
  with `ON CONFLICT DO NOTHING` and never overwrites a row, so a hand edit survives every run. Plans
  stay upserted, because the code is their source of truth; `pnpm db:seed:plans` seeds only them.

## Consequences

- Replacing a Chapter's material overwrites its files in place, and a running Session fetches a
  Lesson's plan lazily, so it could read a mix of old and new files. Upload while the Chapter is
  unpublished or while no Student is on it.
- There is no preview of unpublished content other than an Admin Session on an unpublished Chapter.

## Considered Options

- **Build the Catalog API as designed.** Rejected: too much machinery (identity migration, versions,
  uploads, validation, an admin API) for a Catalog edited a few times a month.
- **A smaller admin Catalog editor over the existing tables.** Rejected for now: SQL covers the need,
  and the dashboard's effort goes to Accounts and Insights.
