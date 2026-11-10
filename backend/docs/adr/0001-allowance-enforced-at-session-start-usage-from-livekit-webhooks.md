# Allowance is enforced at Session start, and Usage is measured from LiveKit webhooks

A Student's Allowance (Sessions, minutes and Course slots per 30-day Period, set by their Plan) is
checked where it can be enforced cheaply and race-free: when the backend issues the LiveKit token
and when it creates an Enrollment, each inside a transaction that locks the Student's current Plan
assignment row. At token time the backend **grants** the Session a budget of
`min(minutes left, longest Session)` and hands it to the agent as a participant attribute; the agent
ends the Session at that budget. Usage is the Student's connected time in the room, which the
backend records from signed LiveKit webhooks. The web reports nothing and is never trusted for it.

Usage is **derived from Session rows**, not kept in a counter: the Period is computed from the Plan
assignment's start, so nothing resets and no job runs. A Session whose leave event never arrives is
charged its full grant, so a lost webhook can never charge more than was granted.

## Considered Options

- **Agent reports usage to the backend.** Rejected: it adds an agent-to-backend channel and a
  service credential, while LiveKit already reports joins and leaves to us, signed.
- **Web reports usage.** Rejected: the student controls the client.
- **Per-Period counter rows.** Deferred: one indexed query over a few Session rows per Student is
  cheap at this scale, and a counter can later sit behind the same function.
- **Generic key/value limit table.** Rejected: every new kind of limit needs its own enforcement
  code anyway, so typed nullable columns on the Plan (null meaning unlimited) are as easy to extend
  and far easier to read.

## Consequences

- The payment seam is the Plan assignment: a provider later ends the current one and starts another,
  which also starts a new Period. Nothing else changes.
- The agent does not own the session length: it ends the Session at the granted `session_seconds`
  attribute.
- The LiveKit project must send webhooks to the backend. Without them Usage is charged only as
  pessimistic full grants.
