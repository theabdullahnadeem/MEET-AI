# Security Remediation Plan — PR by PR

> Companion to `SECURITY_AUDIT_REPORT.pdf`. Each section below is a **self-contained,
> independently reviewable, independently revertable** pull request. They are ordered by
> risk. Do not start PR N+1 until PR N is merged and verified.
>
> Guiding rule for every PR here: **fix the vulnerability without changing existing
> behaviour for legitimate users.** Each PR lists exactly why it is non-breaking.

| PR | Finding(s) | Severity | Risk of breaking the app |
|----|------------|----------|--------------------------|
| SEC‑1 | F‑01 Token endpoint IDOR | HIGH | Low — adds an authorization check only |
| SEC‑2 | F‑02 Auth secret not enforced | HIGH | Low — config + boot guard |
| SEC‑3 | F‑05 Security headers | MEDIUM | Low — response headers only |
| SEC‑4 | F‑04 Rate limiting + fetch timeouts | MEDIUM | Low–Med — tune limits carefully |
| SEC‑5 | F‑03 Private recording/transcript storage | MEDIUM | Med — changes how media URLs are served |
| SEC‑6 | F‑06 Dependency upgrades | MEDIUM | Med — version bumps need a full smoke test |
| SEC‑7 | F‑07 + F‑08 + F‑09 (low batch) | LOW | Low |
| SEC‑8 | F‑13 Prompt‑injection hardening | INFO | Low |

---

## SEC‑1 — Authorize the LiveKit token endpoint (F‑01, HIGH)

**Goal:** stop any authenticated user from minting a join token for a meeting they do not
own. This is the single highest‑impact fix.

**File:** `src/app/api/livekit-token/route.ts`

**Change:** after resolving the session and `room` param, look the meeting up and confirm the
caller is allowed in it before calling `createLiveKitToken`.

```ts
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { and, eq } from "drizzle-orm";

// ...after `roomName` is validated:
const [meeting] = await db
  .select({ id: meetings.id, userId: meetings.userId })
  .from(meetings)
  .where(eq(meetings.id, roomName));

// `room` IS the meeting id. Today only the owner may join.
if (!meeting || meeting.userId !== session.user.id) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

**Why it is non‑breaking:** the meeting UI is already owner‑only (`meeting.getOne` filters by
`userId`), so legitimate users only ever request tokens for their own meetings — they keep
working unchanged. Only the *unauthorized* direct‑API path is closed.

**Forward‑compatibility with multi‑user (knock‑to‑join):** when that feature lands, replace
the `meeting.userId !== session.user.id` check with "owner **or** an approved membership row
exists." Keep the deny‑by‑default shape.

**Verify:**
- As the owner, create + join a meeting → still works.
- As a second account, `GET /api/livekit-token?room=<otherUsersMeetingId>` → `403`.
- `npx tsc --noEmit` + `npm run build` pass.

**Revert:** `git revert <merge-commit>`.

---

## SEC‑2 — Enforce a real auth secret (F‑02, HIGH)

**Goal:** guarantee sessions are signed with a strong, unique secret and never the framework
default.

**Files:** `src/lib/auth.ts`, `.env.example`, production env (Vercel).

**Change:**
```ts
if (!process.env.BETTER_AUTH_SECRET) {
  throw new Error("BETTER_AUTH_SECRET is not set");
}

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET,
  // ...existing config unchanged
});
```
Add `BETTER_AUTH_SECRET=` to `.env.example`, and set a strong random value in Vercel
(Production + Preview). Generate with `openssl rand -base64 32`.

**Why it is non‑breaking:** if the secret is already set in production, sessions are already
signed with it — adding the explicit option and the boot guard changes nothing at runtime.
The guard mirrors the pattern already used in `src/lib/livekit.ts`. **Caveat:** if the app is
*currently* running on the default secret, deploying a new secret will invalidate existing
sessions (everyone re‑logs in once). Deploy at a low‑traffic time and communicate it.

**Verify:** build with the var set → passes; unset it locally → boot throws (expected). Sign
in/out works after deploy.

**Revert:** `git revert <merge-commit>` (do **not** remove the env var).

---

## SEC‑3 — Add HTTP security headers (F‑05, MEDIUM)

**Goal:** defence‑in‑depth via response headers (clickjacking, HSTS, sniffing, referrer).

**File:** `next.config.ts`

```ts
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), display-capture=(self)" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
```

**Content‑Security‑Policy — add carefully and last.** CSP is the one header that can break the
app (LiveKit media, Stream Chat, avatars, inline styles). Roll it out in **`Content-Security-
Policy-Report-Only`** first, watch the browser console for violations, allow‑list the needed
origins (LiveKit `wss://*.livekit.cloud`, the R2 public domain, Stream, dicebear), and only
then switch to enforcing.

**Why it is non‑breaking:** the non‑CSP headers don't affect same‑origin app behaviour;
`X-Frame-Options: DENY` only matters if you embed the app in an iframe (you don't). Camera/mic
are allowed for `self`, which is what the call page needs.

**Verify:** load the app, join a meeting (camera/mic still work), check headers in DevTools →
Network. CSP report‑only shows no blocking before you enforce.

**Revert:** `git revert <merge-commit>`.

---

## SEC‑4 — Rate limiting + fetch hardening (F‑04, MEDIUM)

**Goal:** cap abuse of public endpoints and stop unbounded server‑side fetches.

**Files:** the three `src/app/api/*` routes (or a shared helper), `src/inngest/function.ts`,
`src/modules/meetings/server/procedures.ts` (`getTranscript`).

**Changes:**
1. **Rate limit** `/api/livekit-token`, `/api/webhook`, `/api/livekit-webhook` per IP/user.
   Easiest on Vercel: enable **Vercel WAF / rate limiting**, or use `@upstash/ratelimit`
   with Upstash Redis:
   ```ts
   const { success } = await ratelimit.limit(ipOrUserId);
   if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
   ```
2. **Timeout + size cap** on every server‑side transcript fetch:
   ```ts
   const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
   const len = Number(res.headers.get("content-length") ?? 0);
   if (len > 5_000_000) throw new Error("transcript too large");
   ```

**Why it is non‑breaking:** legitimate users are far below any sane limit; webhooks from
LiveKit/Stream are low‑volume and signed (don't rate‑limit *below* their burst rate — start
generous, e.g. 60/min/IP, and tighten with data). The fetch timeout is longer than any real
transcript download.

**Verify:** normal flows unaffected; hammering an endpoint returns `429`; a hung transcript URL
aborts after 10s instead of hanging the worker.

**Revert:** `git revert <merge-commit>`.

---

## SEC‑5 — Private media storage with signed URLs (F‑03, MEDIUM)

**Goal:** recordings and transcripts should require authorization, not a permanent public URL.

This is the largest change — do it deliberately.

**Steps:**
1. **Turn off public access** on the R2 bucket (remove the r2.dev public domain).
2. Stop writing the public URL into the DB. Instead store the **object key**
   (`recordings/<id>.mp4`, `transcripts/<id>.jsonl`) — or keep the existing columns but treat
   them as keys.
3. Add an **authenticated route** that checks meeting ownership/membership and returns a
   short‑lived pre‑signed GET URL via `@aws-sdk/s3-request-presigner`:
   ```ts
   // GET /api/media/recording?meetingId=...  → 302 to a 5-min presigned URL
   // (verify session + meeting ownership first; 403 otherwise)
   ```
4. **Server‑side reads** (the Inngest summariser, `getTranscript`) generate a presigned URL
   internally instead of fetching a public one.
5. Player: `completed-state.tsx` points `<video src>` at the new authenticated route.

**Why it can break things (and how to avoid it):** this touches the recording player, the
transcript tab, and the summariser. Ship it **after** SEC‑1 (so the same ownership logic is
reused) and test a full meeting end‑to‑end (record → transcript → summary → playback) on a
preview deployment before merging. Keep the unguessable‑key fallback if presigning proves
fiddly.

**Verify:** owner can play recording + read transcript + see summary; the raw R2 URL now
returns `403`; a non‑owner cannot reach either.

**Revert:** `git revert <merge-commit>` and re‑enable the bucket's public domain.

---

## SEC‑6 — Patch vulnerable dependencies (F‑06, MEDIUM)

**Goal:** clear the high/critical advisories, prioritising web‑facing packages.

**Steps:**
1. `npm audit` → triage. Fix the **request‑path** packages first: `better-auth`, `drizzle-orm`,
   `axios`, `form-data`, `fast-uri`. The OpenTelemetry/grpc advisories come from the LiveKit
   **agent** worker, not the Next.js request path — lower urgency.
2. `npm audit fix`, then targeted `npm install <pkg>@<fixed>` for the rest.
3. Add CI gate: `npm audit --audit-level=high` and Dependabot/Renovate.

**Why it can break things:** `better-auth` and `drizzle-orm` are core. A major bump may change
APIs. Pin to the smallest version that clears the advisory; run `tsc`, `npm run build`, and a
full manual smoke test (sign‑in, create agent/meeting, join, complete) on a preview deploy.

**Verify:** `npm audit` high/critical count drops; build green; smoke test passes.

**Revert:** `git revert <merge-commit> && npm install`.

---

## SEC‑7 — Low‑severity batch: replay, LIKE, Polar (F‑07/F‑08/F‑09)

Small, low‑risk hardening; can ship together.

**F‑07 webhook idempotency** — in both webhook routes, persist processed event ids (a small
`webhook_events` table or a Redis set) and `return` early on duplicates; reject events older
than ~5 min. Non‑breaking: first‑seen events behave exactly as today.

**F‑08 LIKE escaping** — in the `getMany` search of `meetings` and `agents` procedures, escape
LIKE metacharacters before building the pattern:
```ts
const safe = search.replace(/[\\%_]/g, (c) => "\\" + c);
// ...ilike(table.name, `%${safe}%`)  with an ESCAPE '\' clause
```
Non‑breaking: ordinary searches are unchanged; only literal `%`/`_` now match literally.

**F‑09 Polar server mode** — `src/lib/polar.ts`: drive `server` from an env var
(`POLAR_SERVER ?? "sandbox"`), set `production` in prod. Non‑breaking in non‑prod; **verify
billing** in a staging Polar account before flipping production.

**Verify:** searches still return expected results; replaying a webhook is a no‑op; billing
checks resolve in the chosen environment.

**Revert:** `git revert <merge-commit>`.

---

## SEC‑8 — Prompt‑injection hardening (F‑13, INFO)

**Goal:** reduce manipulation of the summariser and the post‑meeting chat assistant.

**Files:** `src/inngest/function.ts`, `src/app/api/webhook/route.ts` (`message.new`).

**Changes (defensive, not behavioural):**
- Wrap untrusted transcript/user text in clear delimiters in the prompt and instruct the model
  to treat anything inside as data, never instructions.
- Keep rendering LLM output as **sanitised markdown** (already the case — no `rehype-raw`).
- Optionally validate the summary shape before saving.

**Why it is non‑breaking:** prompt wording changes only; output rendering is unchanged.

**Verify:** summaries/chat still generate normally; a transcript containing "ignore previous
instructions" no longer derails the summary.

**Revert:** `git revert <merge-commit>`.

---

## Suggested order & cadence

1. **This week:** SEC‑1, SEC‑2 (the two HIGH items). Small, high impact.
2. **Next:** SEC‑3, SEC‑4 (cheap, broad hardening).
3. **Then:** SEC‑5 (media privacy — needs a full E2E test), SEC‑6 (deps — needs a smoke test).
4. **Backlog:** SEC‑7, SEC‑8.

After each PR: `npx tsc --noEmit`, `npm run build`, and the relevant manual flow on a Vercel
preview before promoting to production. Re‑run the audit (and ideally `/security-review`)
once the HIGH/MEDIUM items are closed.
