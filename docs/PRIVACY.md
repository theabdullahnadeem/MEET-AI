# Data Retention & Deletion Policy

What Meet.AI stores, for how long, and how deletion works. Written to back the
GDPR items in `SECURITY_CHECKUP_2026-07.md` (S‑4/S‑5). This is the internal
engineering policy — the user‑facing privacy policy page should be derived
from it (and reviewed by a lawyer before launch).

## What we store, and where

| Data | Where | Created when |
|---|---|---|
| Account (name, email, avatar, 2FA secret) | Neon Postgres | Sign‑up |
| Agents (name, instructions) | Neon Postgres | User creates them |
| Meetings (name, status, timestamps, summary) | Neon Postgres | User creates them |
| Join requests (who knocked on which meeting) | Neon Postgres | Guest knocks |
| Recordings (video) | Cloudflare R2 (private bucket) | Meeting runs |
| Transcripts (original + English) | Cloudflare R2 (private bucket) | Meeting runs |
| Post‑meeting "Ask AI" chat | Stream Chat | User opens the chat |
| Billing (invoices, tax records) | Polar (merchant of record) | User subscribes |
| Voice audio during a call | OpenAI Realtime API — **not retained by us**; processed live | During the call |
| Audit log (sign‑ins incl. IP/user‑agent, host actions, deletions) | Neon Postgres | As events occur (S‑6) |

Consent: every participant sees "This meeting is recorded and transcribed, and
an AI assistant may listen and speak" **before** joining (lobby and guest
knock screen — S‑4).

## Retention

- **Meetings & media**: retained until the owner deletes the meeting or their
  account. No automatic expiry in v1. (A time‑based retention window — e.g.
  auto‑purge recordings after 90 days on free plans — is a planned v1.1 plan
  differentiator; the purge helper already exists.)
- **Denied join requests**: kept as a record that access was refused; removed
  with the meeting or account.
- **Rate‑limit counters** (Upstash): expire automatically within minutes.
- **Webhook idempotency keys**: rows are pruned opportunistically; contain no
  personal data (provider event ids only).
- **Backups**: Neon point‑in‑time recovery window (≈ 6 h on the current plan).
  Deleted data can persist inside that window and then ages out — this is
  industry‑standard and should be stated in the public privacy policy.

## Deletion paths

### Deleting a meeting (owner, any time)
Removes the DB row **and** purges the recording and both transcripts from R2
(S‑4, `meeting.remove`). Best‑effort: a storage failure logs the orphaned key
rather than blocking the deletion; orphans are visible in Vercel logs under
`[r2]`.

### Deleting an account (user menu → Delete account)
Implemented via better-auth `deleteUser` (S‑5). Email+password users confirm
with their password; social‑login users need a fresh session (sign in again if
prompted). The `beforeDelete` hook (`lib/account-deletion.ts`) purges, in
order, everything the FK cascade cannot reach:

1. **R2 media** for every meeting the user owns (recordings + transcripts).
2. **Live rooms** — any active meeting is ended for all participants.
3. **Stream Chat** — the meetings' chat channels and the Stream user (hard
   delete).
4. **Polar subscription** — revoked immediately so a deleted account is never
   billed again. Polar retains invoices and tax records as the merchant of
   record is legally required to; we cannot and do not delete those.

Then the user row is deleted and every dependent table cascades: agents,
meetings, join requests, sessions, OAuth accounts, 2FA secrets.

**What survives account deletion (by design):**
- Polar invoices/tax records (legal obligation, held by Polar).
- **Audit-log entries** (S‑6) — security logs are retained under legitimate
  interest (GDPR Art. 17(3)); they reference the former user id and contain no
  profile data. A time-bounded purge (e.g. 90 days) is planned for v1.1.
- Media inside other users' meetings the person appeared in as a **guest** —
  those meetings belong to their hosts. (Public privacy policy should state
  this; a guest can ask the host to delete a meeting.)
- Data inside the Neon PITR backup window until it ages out (≈ 6 h).

## Known gaps / next steps

- Public‑facing privacy policy + terms pages (templates to be drafted in S‑9;
  legal review before launch).
- HIPAA is explicitly **out of scope** — no vendor in the stack is under a BAA
  on current tiers. Do not market to healthcare; state this in the ToS.
- Optional retention windows per plan (v1.1).
