# An Admin is a Role on the same Account, checked by permission, not by role name

Admins are ordinary Accounts in the same `user` table with the Admin Role, managed by Better Auth's
admin plugin. An Admin who studies uses the real student web app, so "unlimited access to the tutor"
is a rule at token issuance rather than a separate login. Code checks permissions defined with Better
Auth access control (`createAccessControl`): `user:*` and `session:*` from the plugin's defaults, plus
our own `course:*` and `tutor:["unlimited"]`. It never compares `role === "admin"`. Adding a narrower
Role later, such as a content editor, then only means adding a role to the permissions module.

The backend is the only enforcer. Token issuance grants an Admin Session (no Enrollment, unpublished
Chapters allowed, no Allowance, excluded from Usage) only when the Account holds `tutor:unlimited`.
Admin API routes require the matching permission **and** TOTP two-factor on the Account, because the
twoFactor plugin cannot require 2FA for one Role on its own.

## Consequences

- The permissions module (statements and roles) is shared with the admin dashboard, a separate app
  that is not part of this repository: it needs the same objects for `adminClient({ ac, roles })`.
- The agent has no "unlimited" value. An Admin Session gets a long finite `session_seconds` with
  `session_limit=session`, so the Allowance-reached ending never fires.
- Admin Accounts sign up like Students (phone, Institution, Major). The first Admin is promoted with
  `pnpm admin:promote <email>`, later ones from the dashboard.

## Considered Options

- **Separate admin identities or table.** Rejected: an Admin couldn't study in the real app without a
  second account, and the admin plugin assumes one user table.
- **Better Auth `adminUserIds`.** Rejected: it bypasses every permission and is invisible in the
  dashboard.
