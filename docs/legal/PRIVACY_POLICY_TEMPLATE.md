# Privacy Policy — DRAFT TEMPLATE

> **Status: template for legal review — do not publish as-is.** Derived from
> the engineering policy in `docs/PRIVACY.md`; bracketed items need real
> values. Have a lawyer review before launch, especially for your operating
> jurisdiction and GDPR/consumer-law wording.

_Last updated: [DATE]_

**Meet.AI** ("we", "us") provides AI-assisted video meetings. This policy
explains what we collect, why, and your rights.

## What we collect

- **Account data**: name, email, avatar, and (if enabled) two-factor
  authentication secrets. Sign-in events including IP address and browser
  user-agent are kept in a security log.
- **Content you create**: AI agent names and instructions, meeting names.
- **Meeting content**: when you join a meeting, the call is **recorded and
  transcribed**, and an AI assistant may listen and speak. You are shown this
  before joining, and joining constitutes consent. Recordings and transcripts
  are stored privately and are accessible only to the meeting's host and
  admitted participants.
- **Payment data**: handled by our merchant of record, Polar. We never see or
  store card numbers.

## How the AI works with your data

Live meeting audio is processed in real time by OpenAI's API to let the AI
assistant listen and respond; we do not retain raw audio. Transcripts and
summaries are generated after the meeting and stored with it. Meeting content
is not used to train models by us; see [OpenAI's API data-usage policy] for
their handling.

## Who else processes data (sub-processors)

Vercel (hosting), Neon (database), LiveKit (real-time media), Cloudflare R2
(media storage), Stream (post-meeting chat), OpenAI (AI processing), Polar
(payments), Upstash (rate limiting), Inngest (background jobs).

## Retention

Meeting recordings, transcripts, and summaries are kept until you delete the
meeting or your account. Security logs are kept for [90] days. Backups age
out within [7] days.

## Your rights

- **Delete a meeting** — removes its recording and transcripts from storage.
- **Delete your account** (user menu → Delete account) — permanently removes
  your account, agents, meetings, recordings, transcripts, chats, and cancels
  any subscription. Invoices are retained by Polar as legally required.
  Content you contributed **as a guest in someone else's meeting** belongs to
  that meeting's host; ask them to delete it.
- **Export** — transcripts and summaries can be downloaded from the meeting
  page.
- GDPR/UK-GDPR requests (access, rectification, portability, complaint):
  contact [EMAIL].

## Contact

[LEGAL ENTITY NAME], [ADDRESS] — [EMAIL]
