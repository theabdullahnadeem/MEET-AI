# Disaster Recovery & Failure Modes

S‑9 from `SECURITY_CHECKUP_2026-07.md`. Everything here assumes the current
(mostly free‑tier) stack; revisit the RPO when Neon moves to a paid plan.

## Targets

- **RTO (time to restore service): ≤ 4 hours.** Realistic because every piece
  of infrastructure is reproducible from this repository plus the env-var
  inventory below; nothing is hand-configured on a server.
- **RPO (acceptable data loss): ≤ 24 hours, typically ≈ 6 hours.** The only
  stateful store we own is Neon Postgres, whose free-tier point‑in‑time
  recovery window is ~6 hours. Media in R2 is 11‑nines durable and needs no
  backup of our own; it is only ever lost if *we* delete it.

## What is actually stateful

| Store | Contents | Backup mechanism |
|---|---|---|
| Neon Postgres | users, agents, meetings, join requests, audit log | Neon PITR (~6 h window on free tier) |
| Cloudflare R2 | recordings, transcripts | R2 durability (no egress copies needed) |
| Stream Chat | post-meeting chats | Vendor-managed |
| Polar | subscriptions, invoices | Vendor-managed (merchant of record) |
| Everything else | stateless | redeploy from repo |

## Restore runbooks

### Database loss / bad migration / accidental deletion
1. Neon console → project → **Restore** → pick a point in time inside the PITR
   window (restores into a new branch).
2. Point `DATABASE_URL` in Vercel (and `.env.agent` for the agent) at the
   restored branch; redeploy.
3. Expect: meetings created after the restore point are gone (RPO); R2 media
   for them still exists but is unreachable (harmless orphans).

### Vercel project loss
1. `vercel` import of this repo (or new project) → set the env vars from the
   inventory below → deploy. HSTS/CSP headers, cron-free design and webhooks
   are all code, not dashboard config.
2. Re-register the LiveKit webhook URL (LiveKit Cloud dashboard → webhooks →
   `https://<domain>/api/livekit-webhook`) and the Stream webhook
   (`/api/webhook`).

### LiveKit agent loss
`lk cloud auth` → `lk agent deploy` from the repo root with
`--secrets-file .env.agent`. The worker registers as the named agent
`meetai-agent`; no dashboard config beyond the webhook above.

### Full from-zero rebuild order
Neon (or restored branch) → `npm run db:push` → Vercel env + deploy →
LiveKit webhook registration → `lk agent deploy` → Polar webhook/products
check → smoke test: sign in, create meeting, join, agent speaks, recording
appears.

## Env-var inventory (the real recovery secret list)

Vercel: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
`GITHUB_CLIENT_ID/SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `LIVEKIT_API_KEY`,
`LIVEKIT_API_SECRET`, `LIVEKIT_URL`, `NEXT_PUBLIC_LIVEKIT_URL`,
`NEXT_PUBLIC_APP_URL`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `NEXT_PUBLIC_STREAM_CHAT_API_KEY`,
`STREAM_CHAT_SECRET`, `NEXT_PUBLIC_STREAM_API_KEY`, `STREAM_VIDEO_SECRET`,
`OPENAI_API_KEY`, `POLAR_ACCESS_TOKEN`, `POLAR_SERVER`,
`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, Inngest keys.

Agent (`.env.agent` → `lk agent deploy` secrets): `OPENAI_API_KEY`,
`DATABASE_URL`, `R2_*`, optional `MEETING_IDLE_TIMEOUT_MINUTES`,
`MEETING_MAX_DURATION_MINUTES`. (LiveKit Cloud injects `LIVEKIT_*` itself.)

Keep a copy of all secrets in a password manager — the env inventory above is
the list, not the values.

## Vendor failure modes (what breaks when X is down)

| Vendor down | User-visible effect | Degradation built in |
|---|---|---|
| **Neon (Postgres)** | App down (auth, meetings) — the one true SPOF | None — accept; Neon SLA + PITR |
| **LiveKit Cloud** | Calls can't start/continue | Dashboard, history, transcripts, Ask-AI all keep working |
| **OpenAI** | Agent doesn't join / goes silent; summaries delayed | Meetings still work human-to-human; `meetings/finalize` completes stuck meetings without summary; Inngest retries the pipeline |
| **Stream Chat** | Post-meeting Ask-AI chat errors | Rest of the meeting page (recording, transcript, summary) unaffected |
| **Cloudflare R2** | Recordings/transcripts unavailable; new uploads fail | Agent logs upload failure; meeting completes; Inngest retries summarisation later |
| **Upstash Redis** | None | Rate limiting fails **open** by design |
| **Polar** | Checkout/portal unavailable | Quota checks fail **open** — paying users are never blocked; upgrade page degrades to "Free plan" view |
| **Inngest** | Summaries/finalization delayed | Events replay when it recovers; `meetings/finalize` is the backstop |
| **Vercel** | App down | Redeploy elsewhere is possible but not pre-provisioned — accepted risk at this stage |

## Load posture (S-10)

Media scale is LiveKit Cloud's problem (their SLA); our own hot paths are
thin (token mint, tRPC reads). `tools/k6-smoke.js` exercises the public
endpoints — run before launch and after infra changes:

```
k6 run tools/k6-smoke.js -e BASE_URL=https://meet-ai-self.vercel.app
```

Watch for: p95 < 1s on pages, no 5xx, 401/403 (not 500) from the token route
when unauthenticated. The Build-tier cap of **5 concurrent agent sessions**
is the real ceiling and arrives long before HTTP load does.
