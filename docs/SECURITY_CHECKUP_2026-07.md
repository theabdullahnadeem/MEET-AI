# Security & Reliability Checkup — July 2026

Pre‑launch assessment against the full production‑readiness checklist. Complements
`SECURITY_FIX_PLAN.md` (SEC‑1…8 + F‑07, all shipped) — this pass covers what that plan
didn't: billing abuse, PII lifecycle, testing/CI, resilience, and the long‑tail attack
classes (SSTI, ReDoS, large‑payload DoS, replay, clipboard).

**Legend:** ✅ already covered · 🟡 partial / hardening useful · 🔴 gap, needs a PR · ⚪ N/A here

---

## Part 1 — Checklist assessment

### Application security

| Item | Status | Notes |
|---|---|---|
| Input sanitization & injection prevention | 🟡 | zod on every tRPC input; React auto‑escaping; markdown rendered without raw HTML (SEC‑8). **Gap: no `.max()` length caps** on meeting name / agent name / instructions (→ PR S‑1). |
| SQL / NoSQL injection | ✅ | Drizzle parameterizes everything; `escapeLike()` covers LIKE wildcards (F‑08); the only `sql` template literals are constant expressions. No NoSQL store. |
| SSTI (server‑side template injection) | ⚪ | No string‑template engine exists (React/JSX only). No surface. |
| ReDoS | ✅ | No `new RegExp(userInput)` anywhere; transcript search uses `react-highlight-words` with `autoEscape={true}`. |
| Large‑payload DoS (LPDoS) | 🔴 | No max lengths on user text fields. Oversized agent `instructions` also flow into LiveKit room metadata (64 KB cap) and the realtime prompt (token cost). Webhook handlers `req.text()` without a size guard. → PR S‑1. |
| XSS / dangerous HTML | ✅ | Single `dangerouslySetInnerHTML` is shadcn's chart theme CSS (no user input). Chat/summary/transcript render as escaped text or sanitized markdown. |
| Clipboard attack | ✅ | Only `navigator.clipboard.writeText` of an app‑generated invite link on explicit click. Nothing reads the clipboard; no paste‑jacking surface. |
| Secret key leaks | 🟡 | Secrets server‑only (`server-only` imports, env vars); `NEXT_PUBLIC_*` values are legitimately public (LiveKit URL, Stream API key — secured by server‑minted tokens). `.env` never committed. **Add:** secret scanning in CI (gitleaks) + enable GitHub secret scanning (→ PR S‑7). |
| Replay attacks | 🟡 | Webhooks: signature‑verified (LiveKit JWT, Stream HMAC) **and** idempotent (`webhook_events` dedupe, F‑07) ✅. Auth: better‑auth httpOnly cookies ✅. **Residual: a kicked guest holding a still‑valid LiveKit token (TTL 1 h) can reconnect directly to the room until it expires** → shorten TTL (PR S‑3). |

### AuthN / AuthZ / sessions

| Item | Status | Notes |
|---|---|---|
| Authentication | ✅ | better‑auth (email+password, Google, GitHub) + TOTP 2FA (C.7). Boot fails without a real `BETTER_AUTH_SECRET` (SEC‑2). |
| Authorization, roles, permissions | ✅ | Consistent server‑side model: owner‑only management; owner‑or‑admitted for reads (`canAccessMeeting`); host‑only in‑call controls verified in every mutation; knock‑to‑join gates tokens & media. Roles beyond host/guest aren't needed yet (single‑owner tenancy). |
| Session management & token expiry | 🟡 | better‑auth sessions with standard expiry ✅. LiveKit room tokens: 1 h TTL — works, but sets the kicked‑user replay window. → 15 min TTL (client already re‑fetches on reconnect) (PR S‑3). |
| Auth endpoint brute force | 🟡 | better‑auth's built‑in rate limiting defaults to in‑memory storage — per‑instance and ephemeral on serverless. → back it with the existing Upstash Redis (PR S‑3). |
| Multi‑tenancy & data isolation | ✅ | Every query filters by `userId` or admitted membership; verified across meetings/agents/media/transcripts during SEC‑1 and MU‑2/3. IDs are `nanoid()` — non‑enumerable. |

### Abuse, limits & billing integrity

| Item | Status | Notes |
|---|---|---|
| Rate limiting & abuse prevention | 🟡 | Upstash limits on `/api/livekit-token` (per user) and both webhooks (per IP), fail‑open by design ✅. **Gaps:** sensitive tRPC mutations unlimited (`requestToJoin`, `activateMeeting`, `generateChatToken`) → PR S‑3. |
| **Per‑plan quotas** | 🔴 | `premiumProcedure` enforces limits **only for free users** — any active subscription = unlimited meetings & agents. A single heavy subscriber can cost more than their subscription (see §Pricing). → PR S‑2, the highest‑value fix in this document. |
| Cost guardrails (runtime) | ✅ | 10‑min idle auto‑end, 60‑min hard cap, muted mode generates no reply tokens, LiveKit free‑tier minute caps backstop everything. |

### Data protection & compliance

| Item | Status | Notes |
|---|---|---|
| PII handling | 🔴 | **Deleting a meeting deletes only the DB row — the recording (video of people) and transcript stay in R2 forever, orphaned.** → purge on delete (PR S‑4). |
| Recording consent | 🔴 | Guests are never told the call is recorded and transcribed. Legally required in many jurisdictions (two‑party consent) and a GDPR transparency requirement. → lobby/knock notice (PR S‑4). |
| Data retention & deletion policies | 🔴 | No retention policy, no account deletion. → account deletion + cascade purge + written retention policy (PR S‑5). Retention windows also keep R2 costs flat. |
| GDPR | 🟡 | Foundations exist (private storage, access control, export of transcript/summary ≈ portability). Missing: privacy policy/ToS pages, right‑to‑erasure (S‑5), consent notice (S‑4), records of processing (S‑9 doc). |
| HIPAA | ⚪ | Out of scope — none of the vendors are under BAA on current tiers (LiveKit requires Scale for HIPAA). **Do not market to healthcare**; state this in ToS. |
| Audit trails / tamper‑evident logging | 🔴 | Only console logs (ephemeral in Vercel). → append‑only `audit_log` table for auth events + host actions (admit/deny/kick/mute/agent add‑remove/delete) (PR S‑6). True tamper‑evidence (hash chaining) is overkill now; append‑only + no update path is proportionate. |

### Transport & platform

| Item | Status | Notes |
|---|---|---|
| HTTPS / TLS / cert rotation | ✅ | Fully managed (Vercel edge, LiveKit Cloud, Neon, R2 presigned HTTPS). HSTS with preload already set (SEC‑3). Nothing to rotate ourselves. |
| Security headers / CSP | 🟡 | Headers shipped (SEC‑3); **CSP deliberately deferred** — roll out `Content-Security-Policy-Report-Only`, tune, then enforce (PR S‑8). |
| Dependency scanning & patching | ✅ | Dependabot weekly (grouped, with documented pins), `npm audit`: 0 high/critical. **Add:** audit gate in CI so regressions fail PRs (PR S‑7). |

### Engineering quality & resilience

| Item | Status | Notes |
|---|---|---|
| Unit / integration / E2E tests | 🔴 | Zero automated tests. → PR S‑7 (CI + first unit tests), then Playwright smoke (S‑10). |
| Regression tests / coverage thresholds in CI | 🔴 | No CI at all — validation is manual (tsc/lint/build per PR). → GitHub Actions (PR S‑7); coverage gate applied to *new* code first (a blanket threshold on an untested codebase would just be a lie). |
| Load & stress testing | 🟡 | Media plane is LiveKit Cloud's SLA; our own hot paths are thin (token route, tRPC reads). → small k6 script + one pre‑launch run at expected concurrency (bundled into S‑10). Build tier's 5‑concurrent‑agent cap is the real ceiling — arrives before load does. |
| Chaos / resilience testing | 🟡 | Formal chaos engineering is disproportionate. Instead: a **failure‑modes table** (what happens when OpenAI / LiveKit / Stream / Upstash / Neon are down) — most paths already degrade gracefully; document + fix the gaps found while writing it (S‑9). |
| Error handling & graceful degradation | ✅ | Consistently non‑fatal: recording/dispatch failures don't kill meetings, rate limiter fails open, `meetings/finalize` rescues stuck pipelines, UI queries degrade to skeletons. |
| Retry logic, backoff, idempotency | ✅ | Inngest steps retry with backoff; webhooks idempotent; activation & knock flows are atomic (see next row). Client mutations surface errors via toasts rather than blind retries — correct for user actions. |
| Circuit breakers & fallbacks | 🟡 | No formal breakers; fallbacks exist where it matters (webhook activation fallback, complete‑without‑summary). OpenAI outage → agent absent but meeting works; post‑meeting chat errors are caught. Document as accepted posture (S‑9). |
| Concurrency & race prevention | ✅ | Partial unique index on live knocks; `ON CONFLICT DO NOTHING`; atomic `upcoming→active` flip guarantees exactly‑once dispatch/recording; status‑guarded webhook updates; F‑07 dedupe. |
| Caching strategy & invalidation | ✅ | React Query with explicit invalidations; polling for liveness (3–5 s) with terminal‑state stop. No server cache — nothing to go stale. Revisit only if DB load grows. |
| RTO / RPO & disaster recovery | 🔴 | Nothing written. Reality: Neon PITR (~6 h window on free), R2 11‑nines durability, infra reproducible from repo + env inventory. → define RTO ≤ 4 h / RPO ≤ 24 h (free tier) and a restore runbook (PR S‑9). |
| Accessibility | 🟡 | Radix/shadcn primitives give a good base; icon‑only call buttons need `aria-label`s, badge counts need SR text, focus order & contrast need one audit pass (PR S‑10). |
| Architecture diagrams & ADRs | ✅ | `ARCHITECTURE.md` + `DECISIONS_AND_CHANGELOG.md` exist and are current practice; add the failure‑modes table (S‑9). |
| Code review process | 🟡 | De‑facto: every change is a PR reviewed by the owner with per‑PR validation. → enable branch protection on `main` (require PR + green CI once S‑7 lands). |

---

## Part 2 — Pricing reality check (upgrade page)

**How it works today:** the upgrade page renders whatever products exist in the **Polar
dashboard** — names, prices, and benefit bullets are dashboard copy. **None of it is
enforced by code.** The application only distinguishes free (1 agent + 1 meeting,
*lifetime count*) from "has any active subscription" (unlimited everything).

**Consequences:**
1. If the Polar products are still tutorial‑era placeholders, the page is advertising
   benefits that don't map to anything real — and any price works out to *unlimited AI
   minutes* for whoever subscribes.
2. Loss exposure is concentrated in heavy users: variable cost ≈ **$1–1.75 per 30‑min AI
   meeting** (see `MeetAI-Cost-and-Scaling-Plan.pdf`). A subscriber running a daily 60‑min
   meeting costs ≈ **$90–110/mo** — under water at any sub‑$100 price. Average users
   (~3 meetings/mo ≈ $5) are fine, but nothing protects the tail.
3. The free tier is *1 meeting ever* (total count, not monthly) — safe against abuse but
   probably too tight for conversion; consider 1/month instead (same code path, add a
   month filter).

**Recommendation (implemented by PR S‑2):** metadata‑driven quotas. Each Polar product
carries `maxAgents` and `maxMeetingsPerMonth` in its metadata; `premiumProcedure` enforces
them (missing metadata ⇒ current unlimited behaviour, so nothing breaks before the
dashboard is configured). Suggested ladder priced against measured cost:

| Plan | Price | Agents | AI meetings /mo | Worst‑case COGS | Margin logic |
|---|---|---|---|---|---|
| Free | $0 | 1 | 1/mo | ~$1.75 | acquisition cost |
| Starter | **$15/mo** | 3 | 10 | ~$17 cap, ~$8 typical | positive on typical, capped tail |
| Pro | **$29/mo** | 10 | 30 | ~$52 cap, ~$20 typical | positive on typical; cap prevents blowout |
| Business | **$59+/mo** | unlimited | 75 | — | for real teams; revisit with usage data |

(60‑min hard cap per meeting already bounds each unit. Recalibrate the ladder after the
first month of real usage data; Polar takes 4–5% + 40–50¢ per sale.)

---

## Part 3 — PR‑based implementation plan

Ordered by risk reduction per unit of effort. One PR at a time, as always; every PR keeps
current behaviour as the fallback so nothing breaks mid‑rollout. Rough sizes:
S = hours, M = a day, L = multi‑day.

| # | Branch | Title | Size | Contents & no‑breakage strategy |
|---|---|---|---|---|
| **S‑1** | `sec/input-limits` | Input length caps & payload guards | S | `.max()` on all user text (meeting name 120, agent name 80, instructions 10 000 — protects the LiveKit 64 KB metadata cap and the realtime prompt); DB `varchar` stays `text` (no migration); `content-length` guard (1 MB) on both webhook routes before `req.text()`; cap in‑call chat send length client‑side. Existing longer rows keep working (caps apply to writes only). |
| **S‑2** | `feat/plan-quotas` | Per‑plan quotas from Polar metadata | M | Read `maxAgents` / `maxMeetingsPerMonth` from the subscriber's product metadata in `premiumProcedure`; count meetings *created this month* for the monthly limit; free tier moves to 1 meeting/month. **Missing metadata ⇒ unlimited (today's behaviour)** — configure Polar products after merge, nothing breaks before. Upgrade page needs no code change (benefits stay Polar copy — update the copy to match the enforced quotas). |
| **S‑3** | `sec/auth-abuse-hardening` | Auth rate limits, mutation limits, token TTL | M | better‑auth `rateLimit` backed by Upstash (secondary storage) — sign‑in/2FA brute force protection that survives serverless; Upstash checks (fail‑open, same pattern as SEC‑4) on `requestToJoin`, `activateMeeting`, `generateChatToken`; LiveKit token TTL 3600 → 900 s (client already re‑fetches; shrinks the kicked‑user replay window 4×). |
| **S‑4** | `sec/pii-purge-consent` | Media purge on delete + recording notice | M | `meeting.remove` also deletes `recordings/<id>.mp4` + `transcripts/<id>*.jsonl` from R2 (best‑effort, logged); lobby + knock screens state "This meeting is recorded and transcribed"; agent greeting already implies AI presence. Purge failures don't block deletion (logged for retry). |
| **S‑5** | `feat/account-deletion-retention` | Account deletion + retention policy | L | better‑auth `deleteUser` enabled with an Inngest cascade purge (meetings, R2 objects, join requests, Polar customer note); `docs/PRIVACY.md` retention policy (e.g., media 90 days on free / configurable on paid — also keeps R2 flat); optional scheduled purge job. Ship behind a settings‑page button. |
| **S‑6** | `feat/audit-log` | Append‑only audit trail | M | `audit_log` table (`actor, action, target, meetingId, ts, meta`); writes from admit/deny/kick/mute/agent add‑remove/meeting delete + better‑auth sign‑in/2FA hooks; no update/delete path exposed (append‑only by construction). Needs `npm run db:push`. |
| **S‑7** | `chore/ci-and-tests` | CI pipeline + first tests + secret scan | M | GitHub Actions on PR: `tsc`, `eslint`, `next build` (dummy env), `npm audit --omit dev --audit-level=high`, gitleaks; vitest with first unit tests (`escapeLike`, quota logic from S‑2, `r2KeyFromStored`, activation win/lose semantics); coverage reported, threshold enforced **on changed files only** to start. Then enable branch protection on `main`. |
| **S‑8** | `sec/csp-report-only` | Content‑Security‑Policy rollout | M | `Content-Security-Policy-Report-Only` allow‑listing self + LiveKit wss + Stream + data: (dicebear) + Vercel; collect a week of reports; flip to enforcing in a follow‑up. Report‑only by definition cannot break the app. |
| **S‑9** | `docs/dr-failure-modes` | DR runbook, RTO/RPO, failure modes | S | RTO ≤ 4 h / RPO ≤ 24 h stated; Neon PITR restore steps; env/secret inventory checklist; vendor failure‑modes table (OpenAI/LiveKit/Stream/Upstash/Neon down → observed behaviour); privacy‑policy & ToS *templates* for review (legal text needs the owner/lawyer, not a PR). |
| **S‑10** | `chore/a11y-and-load` | Accessibility pass + k6 smoke | M | `aria-label` on icon‑only controls, SR text for badges, focus-visible audit, axe pass on dashboard + call; `tools/k6-smoke.js` for token route + hot tRPC reads with a documented pre‑launch run. Playwright E2E smoke (sign‑in → create → join) if time allows, else follow‑up. |

**Deliberately not doing (with reasons):** HIPAA (vendor tiers don't support it — state in
ToS) · formal chaos engineering (failure‑modes doc instead) · server‑side caching (no load
to justify staleness risk) · hash‑chained logs (append‑only table is proportionate) ·
RBAC/org roles (single‑owner tenancy until teams ship).

**Suggested sequence:** S‑1 → S‑2 → S‑3 → S‑4 → S‑7 → S‑5 → S‑6 → S‑8 → S‑9 → S‑10.
S‑1/S‑2/S‑3 close the money‑ and abuse‑shaped holes before launch; S‑4 closes the legal
one; the rest harden operations. Each PR validated with tsc/lint/build (+ CI from S‑7 on).
