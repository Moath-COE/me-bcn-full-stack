# Google sign-up collects the Account fields first, never creates an Account on its own, and Admins never use Google

Google is a Sign-in method (Better Auth's `socialProviders.google`), but an Account needs a phone
number, an Institution and a Major, and Google provides none of them. Those columns stay `NOT NULL`
and every Account is validated by the same `assertValidNewAccount` as an email sign-up. So:

- **The fields come before the redirect.** The web's join page asks for phone, Institution and Major
  first, then calls `signIn.social` with `requestSignUp: true` and the three values in
  `additionalData`. Better Auth keeps `additionalData` in the OAuth state across Google's redirect.
  On the callback, the provider's `mapProfileToUser` reads exactly those three keys, strings only,
  from `getOAuthState()` and hands them to Better Auth as part of the profile. The existing
  `databaseHooks.user.create.before` then validates them like any other sign-up and answers with the
  usual codes (`INVALID_PHONE_NUMBER`, `INVALID_INSTITUTION`, `INVALID_MAJOR`, `PHONE_NUMBER_TAKEN`).
  `additionalData` is client input; nothing else in it reaches the Account. The profile mapping is the
  only seam that works: Better Auth requires every `required` additional field to be present in the
  provider profile, and throws a generic `MISSING_FIELD` before any database hook runs.
- **No implicit sign-up.** The provider has `disableImplicitSignUp: true`. The sign-in page does not
  send `requestSignUp`, so Google there only signs in an existing Account (`signup_disabled`
  otherwise). Without this, a visitor who pressed "Continue with Google" on the sign-in page would get
  an Account with no phone, Institution or Major.
- **Linking needs two verified addresses.** A Google sign-in whose email matches an Account links
  Google to it and signs in, but only when Google reports the address as verified and the Account's
  own address is verified (Better Auth's default `requireLocalEmailVerified`). `trustedProviders` is
  deliberately left empty: a trusted provider skips the check on Google's claim. A Google address that
  is not verified creates the Account (if it is a sign-up) without a session and sends our
  verification email (`requireEmailVerification` on the provider), the same bar as email sign-up.
- **Admins never use Google.** Better Auth's `twoFactor` after-hook challenges only
  `/sign-in/email|username|phone-number`, so a session created by an OAuth callback would skip an
  Admin's TOTP, and ADR 0002 makes two-factor the second lock on every Admin route. The
  `user.validateUserInfo` gate refuses every OAuth sign-in and every link to an Account that holds an
  admin permission, with `ADMIN_GOOGLE_FORBIDDEN`. It reads the Role from the user row and asks by
  permission, not by the name "admin", like the rest of the code. An Admin still studies in the same
  web app, signed in by email, password and TOTP.

## Consequences

- **Error contract with the web.** The callback redirects to the `errorCallbackURL` with `?error=<code>`
  (and `error_description`). The codes are our own for failures in our hooks and Better Auth's
  lowercase strings for its own.
- Google needs `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` (both or neither). The authorized
  redirect URI in Google Cloud Console is `{BETTER_AUTH_URL}/api/auth/callback/google`, the web origin,
  because the web proxies `/api/auth/*` here. The admin dashboard does not sign in with Google.
- An Account created through Google has no password. It can set one through the usual reset flow.
- A Google sign-in whose email matches a password Account that never verified its address is told
  `account_not_linked`; the Student verifies the password Account first.
- `/sign-in/social` has its own rate limit, like the email endpoints.

## Considered Options

- **Let Google create the Account and ask for the fields afterwards.** Rejected: it needs nullable
  columns or a half-made Account state, and every query and Allowance rule would have to handle it.
- **`trustedProviders: ["google"]`.** Rejected: it makes Better Auth skip Google's `email_verified`
  check when linking, so an unverified Google address could take over a matching Account.
- **A `session.create.before` hook for Admins.** Rejected: `validateUserInfo` runs for sign-in and
  link before anything is written, and it knows the method and the provider; a session hook does not.
- **Making the three additional fields optional for the OAuth case.** Rejected: it would loosen
  email sign-up too.
