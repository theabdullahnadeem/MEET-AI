# Decisions & Changelog — Stream → LiveKit Migration

This document records **every change made during the migration**, in order, and — more
importantly — **why** each decision was made, including the deviations from the original plan
(`LIVEKIT_MIGRATION.md`) and the dead ends we hit. It is the "why" companion to the code.

---

## 0. Background — why we migrated at all

The AI meeting agent broke. Stream Video's `connectOpenAi()` depends on the **OpenAI Beta
Realtime API**, which OpenAI shut down on **2026‑05‑12**. Stream's Edge Network still sends the
deprecated `OpenAI-Beta: realtime=v1` header to a dead endpoint, returning
`400 beta_api_shape_disabled`. `@stream-io/node-sdk` is frozen at `0.7.59` and Stream shipped
no fix. **Symptom:** the agent joined for ~1 second then dropped.

**Decision:** rather than wait on Stream, replace Stream **Video** with **LiveKit**, which has
first‑class, actively maintained OpenAI **GA** Realtime support via `@livekit/agents`. Stream
**Chat** (post‑meeting chat) was left completely untouched — it was never the problem.

The work was structured as 6 sequential, independently revertable PRs, each verified live
before the next. This was deliberate: a real‑time stack has many moving parts (client SDK,
server tokens, a separate agent process, webhooks, storage), and a big‑bang swap would have
been impossible to debug.

---

## 1. PR 1 — Foundation (#38)

**What:** installed the LiveKit SDKs, created `src/lib/livekit.ts` (the server client:
`RoomServiceClient`, `EgressClient`, and a `createLiveKitToken` helper), added agent npm
scripts, and committed `.env.example`.

**Key decisions / deviations from the plan:**
- **`createLiveKitToken` is `async`.** The plan assumed `token.toJwt()` was synchronous. In the
  installed `livekit-server-sdk@2` it returns `Promise<string>`. Verified directly in the
  package's type definitions before writing the helper, rather than trusting the plan.
- **Added `import "server-only"`** to `livekit.ts`, matching the existing `stream-video.ts`,
  because the module holds the API secret and must never be bundled to the client.
- **Embedded the user avatar as token `metadata`** instead of leaving the `userImage` parameter
  unused (the plan declared it but never used it).
- **`.env.example` lists every variable the code actually reads**, verified by grepping
  `process.env` — not the plan's list, which had wrong names (e.g. Stream Chat uses
  `NEXT_PUBLIC_STREAM_CHAT_API_KEY`, not `NEXT_PUBLIC_STREAM_API_KEY`).

**Verification note that recurred all migration:** the repo has **no local `.env`** (secrets
live only in Vercel). `npm run build` fails on `main` without one (page‑data collection needs
`DATABASE_URL`). So every build check used a **throwaway dummy `.env`**, deleted afterward.

---

## 2. PR 2 — Token endpoint + room creation (#39)

**What:** added `GET /api/livekit-token` (session‑authenticated, returns a join token) and made
`meeting.create` also create a LiveKit room named after the meeting id, storing the agent
config (`agentId`, `agentName`, `agentInstructions`, …) in the **room metadata**.

**Key decisions:**
- **Room name = meeting id.** This makes everything else (webhooks, agent dispatch, storage
  keys) deterministic — given a webhook for room `X`, we immediately know the meeting.
- **Agent config in room metadata** so the agent worker is fully stateless: it learns
  everything it needs from the room it's dispatched to, with no extra DB call at join time.
- **`createRoom` placed after the existing agent lookup**, not "after the Stream block" as the
  plan said, because the metadata needs `existingAgent`, which is only fetched later.
- Stream Video room creation was **left running in parallel** — removed only later — so the app
  never had a moment where neither system worked.

**Gotcha that bit us later:** LiveKit Cloud's dashboard shows **no room session for an empty
room** — sessions only start when a participant joins. So "check the dashboard for the room"
(the plan's verification step) was a red herring; room creation was actually fine.

---

## 3. PR 3 — Call UI swap (#40) + layout fix (#41)

**What:** replaced the Stream Video React components in `src/modules/call/` with
`@livekit/components-react`, and removed the now‑dead Stream `generateToken` tRPC procedure.

**Key decisions / deviations:** the plan's component code referenced APIs that **don't exist**
in the installed `@livekit/components-react@2.9.21`. Verified against the type definitions and
adapted:
- `useCameraTrack()` doesn't exist → used `useLocalParticipant().cameraTrack` + `isCameraEnabled`.
- `ControlBar` has no `onLeave` prop → leave is the built‑in `DisconnectButton`; the UI reacts
  to `RoomEvent.Disconnected` (this also catches server‑side disconnects, not just the button).
- **Added `RoomAudioRenderer`** — without it you see participants but hear nothing. Its absence
  would have made the (later) agent look broken even when working.
- **Installed `@livekit/components-styles`** + `data-lk-theme="default"` — the plan's PR 1
  package list omitted the styles package even though its PR 3 code imported it.

**The "controls not showing" incident (post‑deploy):** after merge the call UI rendered a dead,
control‑less screen. Root cause was **not** the code — it was a missing **`NEXT_PUBLIC_LIVEKIT_
URL`** in Vercel. `NEXT_PUBLIC_*` values are inlined into the client bundle **at build time**, so
without it `LiveKitRoom` had `serverUrl=undefined` and silently never connected. Fix was
environmental + a redeploy. Lesson logged: client‑side connection failures show only in the
**browser console**, never in Vercel logs.

**Layout fix (#41):** the active call overflowed the viewport, pushing the control bar off‑
screen. `GridLayout` renders `.lk-grid-layout` (`height:100%`); as a `flex-1` child its default
`min-height:auto` let it grow past the screen. Fix: `min-h-0` on the grid (the real fix) plus
`overflow-hidden`/`shrink-0` on the header and control bar.

---

## 4. PR 4 — The AI agent (#42) + metadata fix (#43)

**What:** `src/agents/meeting-agent.ts` — a long‑lived worker that joins every room, connects to
OpenAI GA Realtime, and bridges audio for all participants.

**Biggest reality check — the plan's agent code was wrong.** Verified the real
`@livekit/agents@1.4.5` API against the installed `.d.ts` files:
- There is no `openai.realtime.RealtimeAgent`. The real shape is
  `new voice.AgentSession({ llm: new openai.realtime.RealtimeModel({...}) })` then
  `session.start({ agent: new voice.Agent({ instructions }), room })`.
- `turnDetection` keys are **snake_case** (`prefix_padding_ms`, `silence_duration_ms`).
- **Model is `gpt-realtime`** (the plugin's default GA model), not the plan's `gpt-realtime-2` —
  chosen to maximise the chance the agent works on first run; it's a one‑line change otherwise.
- Worker entry guarded with `process.argv[1] === fileURLToPath(import.meta.url)` so the
  framework can import the file for its default export without re‑launching the worker.

**Tooling decisions:**
- **`tsx` instead of `ts-node`.** The plan's `node --loader ts-node/esm` is brittle for ESM +
  the project's `moduleResolution: bundler`. `tsx` was already a dependency, resolves the `@/*`
  path alias, and runs the TS agent directly with no compile step. Removed the now‑unused
  `ts-node`.

**Hosting decision — Koyeb → LiveKit Cloud.** The plan targeted Koyeb's free tier. By the time
we deployed, **Koyeb (acquired by Mistral AI, Feb 2026) had removed its free tier for new
accounts** — it asked for a credit card. We evaluated alternatives and chose **LiveKit Cloud's
native agent hosting**: same vendor, free Build tier (1,000 agent‑min/mo, 5 concurrent
sessions), `LIVEKIT_*` injected automatically, deploy with one `lk agent deploy`. We considered
Cloudinary‑style options too but they don't fit a long‑lived worker. Documented in
`AGENT_DEPLOY.md`; `Dockerfile` + `.dockerignore` added for the LiveKit Cloud build.

**The metadata bug (#43) — found by reading logs, not guessing.** After deploy the agent was
*dispatched* (we saw `received job request`) but exited every time with
`Missing meetingId or agentId in room metadata`. Root cause: the code read `ctx.room.metadata`
**before** `ctx.connect()`, when `ctx.room` is an unconnected stub with empty metadata. The
room metadata is delivered on the **dispatch job** — `ctx.job.room?.metadata` (verified against
the protocol `Job` message). One‑line fix. **Lesson:** we resisted the temptation to "fix"
dispatch (which was working) and instead pulled `lk agent logs`, which pointed straight at the
real cause. Also confirmed `closeOnDisconnect` is on by default, so the agent leaves when the
human leaves — which makes `room_finished` fire (important for PR 5/6).

---

## 5. PR 5 — Webhooks (#45)

**What:** `POST /api/livekit-webhook` drives meeting state from LiveKit events; the old Stream
webhook (`/api/webhook`) was trimmed to **only** the `message.new` (post‑meeting chat) handler.

**Key decisions / deviations:**
- **Multi‑user‑safe end signal.** The plan ended a meeting on `participant_left`. That's wrong
  for group calls (one of several people leaving would end it for everyone) — and we're planning
  Google‑Meet‑style multi‑user. We deliberately do **not** handle `participant_left`; the end
  state is driven by **`room_finished`**, which fires once after the room empties.
- **Agent detected by participant *kind*, not identity.** `participant_joined` flips the meeting
  to `active` only for `ParticipantInfo_Kind.STANDARD` (real humans); the AI agent (`AGENT`) and
  any SIP/ingress/egress participants are skipped. This is robust — the agent's LiveKit identity
  isn't our `agentId`, so identity matching (the plan's approach) wouldn't have worked. Added
  `@livekit/protocol` as a direct dependency for the enum.
- **`receiver.receive()` is `async`** in `livekit-server-sdk@2` (the plan had it sync) — awaited.
- Recording capture (`egress_ended`) was deferred to PR 6, where egress is actually started and
  its result shape could be verified.

**The signing‑key incident (post‑deploy).** Webhooks initially returned **401** for every event.
LiveKit Cloud webhooks have **no per‑event selection** (the receiver gets all events and the
handler filters) — that part was fine. The 401s meant the webhook's **signing key** didn't match
Vercel's `LIVEKIT_API_KEY`/`SECRET` (the project had multiple keys). Resolved by aligning Vercel's
key/secret to the webhook's signing key and redeploying — confirmed by the webhook flipping to
**200** in the logs.

---

## 6. PR 6 — Transcription + recording (#47)

**What:** the agent captures the transcript and uploads it to R2 + records the DB
`transcriptUrl`; the webhook starts LiveKit Egress (recording) to R2 and saves `recordingUrl`.

**Storage decision — Cloudflare R2 over AWS S3 / Cloudinary.** The user wanted "easy, no
surprise bills." Cloudinary was ruled out: **LiveKit Egress can only write to S3/GCP/Azure‑
compatible storage** (no Cloudinary target), and Cloudinary's video credits can themselves
overage. **R2** was chosen because it speaks the **S3 API** (plugs straight into Egress *and* the
agent's `@aws-sdk/client-s3` upload) and crucially has **zero egress/bandwidth fees** — the
exact line item that causes "surprise S3 bills." One bucket serves both recordings and
transcripts.

**Key decisions / deviations:**
- **Transcript format reused verbatim.** The agent emits the **same JSONL shape**
  (`{ speaker_id, type, text, start_ts, stop_ts }`) the existing summariser and `getTranscript`
  already consume — so nothing downstream changed. Agent lines → `agentId`; human lines → the
  human participant's identity (= their user id).
- **The plan's transcript events don't exist.** Verified `@livekit/agents@1.4.5`: the real event
  is **`conversation_item_added`** (a `ChatMessage` with `role` + `textContent`), not the plan's
  `agent_speech_committed` / `user_speech_committed`.
- **Transcript saved on agent shutdown** via `ctx.addShutdownCallback`, with the DB write done
  through **dynamic relative imports** (`await import("../db")`) so a missing `DATABASE_URL`
  can't crash the worker at startup — only the (guarded) transcript save would log an error.
- **Recording starts exactly once** — gated on the `upcoming → active` DB update actually
  changing a row (the first human join), so multiple joins don't start multiple egresses.

**Two post‑deploy incidents, both diagnosed from logs:**
1. **Transcript upload failed** with `No value provided for input HTTP label: Bucket` — the
   **agent** was missing the `R2_*` secrets. Vercel having them wasn't enough: the LiveKit agent
   is a **separate secrets store**, and `lk agent deploy` keeps the secrets set at `create` time.
   Fixed by pushing all `R2_*` + `DATABASE_URL` to the agent and redeploying.
2. **Recording produced no file.** The egress request the webhook sent contained only
   `region: "auto"` — no endpoint/bucket/keys — so LiveKit fell back to `s3.auto.amazonaws.com`
   (`no such host`). Cause: the `R2_*` vars were missing from the **Vercel** runtime (a separate
   copy from the agent's). protobuf drops empty fields, which is why only the literal `"auto"`
   survived. Fixed by adding the five `R2_*` vars to Vercel and redeploying.

**The recurring lesson across PR 4–6:** there are **two independent deploy targets** — Vercel
(the Next app + webhooks, auto‑deploys on merge) and **LiveKit Cloud** (the agent, only updates
on manual `lk agent deploy`) — each with its **own secrets store**. Most "it doesn't work"
moments were one of those two copies being missing or stale, and every one was pinpointed by
reading logs (`lk agent logs` for the agent, Vercel runtime logs for the webhook) rather than
changing code speculatively.

---

## 7. Follow‑up fix — pre‑join lobby (#46)

**Problem:** the AI agent joined "too early" — while the user was still in the lobby. Cause: the
call page mounted `<LiveKitRoom connect={true}>` as soon as the token loaded, so the browser
connected to the room during the lobby, and the agent auto‑dispatches on participant connect.

**Decision:** render the lobby **outside** `<LiveKitRoom>` and only connect on "Join Meeting".
The lobby preview uses `usePreviewTracks` (LiveKit's connection‑free hook, which releases the
camera on unmount). This makes the agent arrive **consistently** right after a real join. The
residual "too late" is **LiveKit Cloud free‑tier cold‑start** (the worker scales to zero when
idle) — a billing tradeoff, not a code bug, so it was documented rather than "fixed."

---

## 8. Security audit (this session, no code changed)

A static security review was performed against the requested classes (SSTI, ReDoS, LpDoS,
secret leak, SQL/NoSQL injection, clipboard, replay) plus discovered issues. Output:
`SECURITY_AUDIT_REPORT.pdf` (findings + fixes) and `SECURITY_FIX_PLAN.md` (PR‑by‑PR remediation).
**No application code was changed** — analysis only, as requested. Top findings: an **IDOR on
the LiveKit token endpoint** (any user can join any meeting) and **`BETTER_AUTH_SECRET` not
enforced**. SSTI, SQL/NoSQL injection and clipboard attacks were **not present** (safe‑by‑default
stack: Drizzle parameterised queries, React auto‑escaping, react‑markdown without `rehype-raw`).

---

## Cross‑cutting principles that guided every decision

1. **Verify the API against the installed `.d.ts`, never trust the plan.** Almost every PR found
   the plan's code didn't match the real package version. This caught the async `toJwt`, the
   `voice.AgentSession` shape, the snake_case turn‑detection keys, the `conversation_item_added`
   event, and the async `WebhookReceiver.receive`.
2. **Diagnose from logs before changing code.** The metadata bug, the 401 webhooks, the missing
   bucket, and the empty egress config were all found by reading logs — and at least one wrong
   fix (the "agent stays in the room" theory) was avoided by checking first.
3. **Non‑breaking, parallel migration.** Stream ran alongside LiveKit until each piece was proven,
   so the app was never fully broken mid‑migration.
4. **Stateless, two‑target deploys.** The agent is stateless (config from room metadata) and
   deploys separately from the web app — remembering that two‑target split (and its two secret
   stores) was the key to operating it.
