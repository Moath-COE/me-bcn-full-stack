# The Audit log is our own table, not Better Auth Infrastructure

We prefer Better Auth's built-in features, but this is a deliberate exception. Open-source Better Auth
has no audit-log plugin. The only option it offers is the hosted Better Auth Infrastructure `dash()`
plugin. Its free tier keeps events for one day and Pro keeps them for seven, and every event leaves
our database for `dash.better-auth.com`. An Audit log of Admin actions on Students' Accounts has to be
kept long-term and stay in our own Postgres. So the backend writes an `admin_audit_log` row from
Better Auth `hooks.after` on the `/admin/*` paths, and from our own admin routes for Courses and
content. The admin dashboard reads it from there.

The entry for an Account removal keeps only the removed Account's id, the acting Admin, the time and
the reason. It never keeps the person's name or email, because erasing those is the point of removal.
