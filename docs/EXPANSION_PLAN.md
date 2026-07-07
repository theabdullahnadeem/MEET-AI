# MEET-AI — Expansion Plan

Forward‑looking feature roadmap. **Part A** is the near‑term, already‑decided feature:
Google‑Meet‑style **multi‑user meetings** with a shared AI agent. **Part B** is the longer‑term
enhancement backlog. **Part C** is the in‑call agent & platform enhancement batch requested
July 2026 (agent behaviour, language handling, exports, 2FA).

> Read alongside `ARCHITECTURE.md` (how the app works today) and `SECURITY_FIX_PLAN.md`
> (the access‑control fix that Part A builds on).

---

# Part A — Multi‑user meetings (Google Meet style)

## A.1 Goal

Today a meeting is single‑owner: only the creator can join. The goal is for **several humans to
join the same meeting while still sharing one AI agent** — everyone hears and talks to the same
AI, and the AI hears everyone — using the familiar **Google Meet flow**: share a link →
non‑hosts land in a waiting room → the host **admits** them.

## A.2 Where we already are

Two foundations are **already in place**, by design:

1. **The LiveKit media layer is already fully multi‑user.** The room is created with
   `maxParticipants: 50`; each user gets their own token/identity; `GridLayout` +
   `ParticipantTile` render every participant; `RoomAudioRenderer` plays everyone's audio; and
   the agent publishes a single audio track that all participants subscribe to. So "many humans +
   one shared AI" works at the media level **right now**.

2. **PR 5 (the webhook layer) was deliberately built multi‑user‑safe.** This is the key point:
   the meeting lifecycle does **not** end on `participant_left`. If it did, one of several people
   leaving would end the meeting for everyone. Instead:
   - `participant_joined` (only `ParticipantInfo_Kind.STANDARD` humans) flips `upcoming → active`
     **once** (guarded by the current status), so the Nth human joining is a no‑op for state.
   - The end signal is **`room_finished`**, which fires only after the room fully empties — so the
     meeting ends exactly once, no matter how many humans were in it.

   In other words, the state machine already tolerates N humans. **Part A doesn't have to touch
   PR 5's lifecycle logic at all** — it adds an *access/admission* layer on top.

What's **missing** is purely access control + admission UX:
- The app gates a meeting to its **creator** (`meeting.getOne` filters by `userId`).
- The **token endpoint issues a token for any room to any authenticated user** with no per‑meeting
  check (this is security finding **F‑01** — see `SECURITY_FIX_PLAN.md`). Part A's first PR is
  the proper, membership‑aware version of that fix.

## A.3 The Google Meet model, mapped to MEET-AI

| Google Meet | MEET-AI today | What Part A adds |
|-------------|---------------|------------------|
| Shareable meeting link | `/call/[meetingId]` exists | Let **non‑owners** open it |
| Pre‑join camera/mic check | ✅ already (the lobby, PR #46) | nothing |
| Host vs guest | everyone equal | creator gets `roomAdmin`; guests normal perms |
| "Ask to join" → host admits | — | the knock/admission flow |
| Host mute / remove | — | LiveKit `RoomServiceClient` (optional, later) |

## A.4 Build — PR by PR

Each PR is self‑contained and non‑breaking for the current single‑user flow.

### MU‑1 — Host/guest tokens + meeting authorization (supersedes SEC‑1)
**Files:** `src/app/api/livekit-token/route.ts`, `src/lib/livekit.ts`.
- Authorize the caller against the meeting before issuing a token (closes F‑01).
- The **creator** gets a token with `roomAdmin: true` (and full publish); **guests** get normal
  `canPublish/canSubscribe`, `roomAdmin: false`.
- Until MU‑3 lands, "authorized" still means owner‑only — so this PR is safe to ship on its own
  and is the security fix.

### MU‑2 — Open the call page to non‑owners
**Files:** `src/modules/meetings/server/procedures.ts`, the call view.
- Add a **call‑scoped** read (e.g. `meeting.getForCall`) that returns just what the call page
  needs (id, name, agent) **without** the owner filter, so a guest can load the call screen.
- Keep all **management** procedures (`getOne`, `update`, `remove`, list) owner‑scoped.

### MU‑3 — Knock‑to‑join (the core admission flow)
**Schema:** new table `meeting_join_requests` — `{ id, meetingId, userId, status:
'pending'|'approved'|'denied', createdAt }` (Drizzle migration). Add a **partial unique index**
on `(meetingId, userId)` scoped to active rows (`WHERE status <> 'denied'`) so a user can have at
most one live request per meeting — preventing duplicate pending rows and stale-row ambiguity in
`admit()`/`deny()`.
**Flow:**
1. A non‑host opening the call page sees an **"Ask to join"** waiting screen and calls a
   `requestToJoin(meetingId)` tRPC mutation. The mutation first looks up an existing active
   (`pending`/`approved`) request for that `(meetingId, userId)` and **returns/reuses it** if
   present; otherwise it creates a new `pending` row. (The partial unique index is the
   database-level backstop against races.)
2. The **host** (already in the call) polls pending requests (React Query `refetchInterval`) and
   sees "X wants to join" with **Admit / Deny**.
3. `admit(requestId)` (host‑only) marks the row `approved`. The guest's page polls its own status,
   then calls `/api/livekit-token`, which now issues a guest token **only if an approved request
   exists** — so the waiting room can't be bypassed.
4. **Deny** → the guest is blocked and never receives a token, so they never enter the room or
   hear/see anything.

**Signaling:** polling is fine for v1 (the app already uses React Query everywhere). A later
optimization can push the knock over a LiveKit data channel since the host is already connected.

### MU‑4 — Host controls
- **Host token**: the creator's token gets `roomAdmin: true` (today `createLiveKitToken`
  hardcodes `roomAdmin: false` for everyone).
- **Kick / mute participants**: host‑only tRPC mutations (verify meeting ownership) that call
  `RoomServiceClient.removeParticipant` / `mutePublishedTrack`; kick buttons in the People panel
  (MU‑5). A kicked guest's join request should be set back to `denied` so they can't
  immediately re‑fetch a token.
- **Host‑departure policy (requested)**: when the **host** leaves, the meeting ends for
  **everyone**. Note this deliberately reverses the PR‑5 design ("only `room_finished` ends the
  meeting") — implement as an explicit policy: on `participant_left` where the identity equals
  `meeting.userId`, delete the room (webhook‑side `RoomServiceClient.deleteRoom`, which fires the
  normal `room_finished` → transcript/summary pipeline). Consider a per‑meeting toggle
  ("end when host leaves" on/off) so both behaviours stay available.

### MU‑5 — Google‑Meet‑style in‑call UI
- **People panel** (requested): a persistent top‑bar button with a badge count opening a side
  panel that shows **(a) everyone currently in the meeting** and **(b) the waiting‑to‑join
  list**. Today's floating knock panel only renders while pending requests exist — if the host
  misses it, nothing indicates someone is (still) waiting. The panel makes knocks persistent and
  impossible to lose; Admit/Deny move in here (with the badge + a chime on new knocks).
- **In‑call chat** (requested): a Google‑Meet‑style chat side panel during the call. Cheapest
  path: LiveKit **data channel** messages (ephemeral, in‑memory); alternately reuse the
  meeting's Stream Chat channel so in‑call chat persists into the post‑meeting "Ask AI" tab —
  decide when building.
- Participant **name labels**, an **active‑speaker layout**, and the agent tile visually
  distinguished (and excluded from the human participant count).
- ~~Share‑link affordance~~ — **shipped July 2026** (invite button in the call header and on
  the meeting page).

## A.5 Decisions still open
- **Guest identity:** require sign‑in (current model) vs. allow anonymous guests (bigger lift —
  better‑auth bypass + guest identities). Recommended: keep sign‑in for v1.
- **Recording/transcript privacy** becomes more pressing with multiple participants — pairs with
  security **F‑03** (move media behind authenticated, pre‑signed URLs).
- **Transcript speaker attribution:** `@livekit/agents` does not yet expose a per‑utterance
  speaker id, so multi‑human transcripts currently attribute user lines to the first human
  participant. Revisit when the SDK supports `speakerId`.

## A.6 Recommended sequencing
Finish/verify the migration first, then ship **MU‑1** (it's also the top security fix), then
**MU‑2 → MU‑3** (the actual Google Meet experience), then **MU‑4/MU‑5** as polish.

---

# Part B — Future enhancements backlog

These build on the multi‑user foundation in Part A. Status reflects the product roadmap; the
notes describe how each fits the existing architecture (see `ARCHITECTURE.md`).

### B.1 Multi‑Agent Memory Sync — Personal AI Assistants  · *Planned*
Each user has an individual "personal AI" that retains memory of their schedule, prior meetings
and plans. When several users join a meeting, their personal AIs sync relevant context,
schedules and prior shared knowledge into the main meeting AI.
- **Fits:** depends on Part A (multi‑user) and a **per‑user memory store** (a new table or a
  vector DB). At join, the agent would load each admitted participant's memory and merge it into
  the realtime session's context. Heaviest new subsystem here is durable per‑user memory +
  retrieval.
- **Dependencies:** Part A; a memory/embedding store; per‑user privacy controls.

### B.2 Contextual Role Awareness  · *Planned*
The meeting AI explicitly understands each participant's role (e.g. Project Manager, Lead
Developer) and anticipates the outputs/updates/action items expected of each.
- **Fits:** roles can be attached to the LiveKit participant **metadata/attributes** at token
  time (extend `createLiveKitToken`) and surfaced to the agent via the realtime session
  instructions. Lighter than B.1; a good first "smart" feature after multi‑user.
- **Dependencies:** Part A (per‑participant identity), a role field on membership.

### B.3 Real‑time Fact‑Checking & Knowledge Retrieval  · *Proposed*
The in‑call AI can instantly query company wikis, Jira, or past transcripts to verify claims or
pull up data, shown in a shared meeting sidebar.
- **Fits:** add **tools/function‑calling** to the realtime agent (RAG over past transcripts +
  external connectors) and a **shared data channel** to render results in a sidebar for all
  participants. Reuses the existing transcript store as one knowledge source.
- **Dependencies:** a retrieval layer + connectors (Jira/wiki); LiveKit data messages for the
  shared sidebar.

### B.4 Sentiment & Engagement Analysis Dashboard  · *Proposed*
Post‑meeting analytics gauging overall tone, engagement and talk‑time distribution to help teams
improve communication.
- **Fits:** an **extra Inngest step** alongside the summariser — analyse the transcript
  (sentiment per speaker, talk‑time from timestamps) and store metrics on the meeting; render a
  dashboard tab. Lowest‑risk of the proposed set (offline, additive).
- **Dependencies:** richer transcript timing (per‑utterance start/stop), an analytics table.
- **Blocked by speaker attribution:** per‑speaker sentiment and talk‑time distribution require
  real per‑utterance speaker ids, which `@livekit/agents` does **not** yet expose (see A.5). Until
  it does, scope B.4 to **aggregate, whole‑meeting** tone/engagement only — per‑speaker breakdowns
  are deferred to upstream `speakerId` support.

### B.5 Automated Action‑Item Delegation & Follow‑up  · *Proposed*
The AI extracts action items, assigns them based on detected roles, and follows up via
Slack/Email/Stream Chat before the next sync.
- **Fits:** another post‑meeting Inngest step extracts structured action items; assignment uses
  B.2 roles; follow‑up uses scheduled jobs + connectors. The post‑meeting Stream Chat assistant
  already shows the "act on a finished meeting" pattern.
- **Dependencies:** B.2 (roles), connectors (Slack/Email), a scheduler.
- **Limited by speaker attribution:** role‑based assignment via B.2 participant metadata works at
  the participant level, but pinning an extracted action item to *who actually said it* needs
  per‑utterance speaker ids (the same A.5 `@livekit/agents` limitation). Until `speakerId` lands,
  delegate by explicit role assignment rather than inferred-from-transcript attribution.

### B.6 Cross‑Language Real‑time Translation  · *Proposed*
The agent acts as a real‑time translator so participants can speak their native language with
seamless audio/subtitle translation for others.
- **Fits:** extend the realtime pipeline with per‑participant language config (participant
  metadata) and translation; subtitles ride the **data channel**, translated audio is published
  as additional tracks. Technically the most demanding (latency‑sensitive, per‑listener output).
- **Dependencies:** Part A; realtime translation models; per‑participant audio routing.

## B.7 Suggested order
1. **Part A** (multi‑user) — unblocks everything below.
2. **B.2 Role Awareness** then **B.4 Sentiment/Engagement** — cheap, additive, high signal
   (B.4's per‑speaker metrics wait on `speakerId`; ship the aggregate version first — see A.5).
3. **B.1 Personal AI Memory** and **B.5 Action‑Item Delegation** — bigger subsystems.
4. **B.3 Fact‑Checking** and **B.6 Translation** — most infrastructure‑heavy; do last.

---

# Part C — In‑call agent & platform enhancements (requested July 2026)

Feature batch requested after multi‑user shipped. Each item lists how it fits the current
architecture and any hard constraints.

### C.1 Overlapping speech — listen to everyone, then answer
When two people talk at the same time, the agent should hold its reply, hear **both** of them
out, and then answer in a way that **involves/addresses everyone** — instead of reacting to
only one speaker.
- **Hard constraint:** the agents SDK (`RoomIO`) forwards **one participant's audio at a time**
  to the realtime model. Active‑speaker re‑linking (shipped July 2026) means the agent hears
  whoever is loudest, but genuinely simultaneous speech from a second person is not heard.
- **Paths:** (a) use the SDK's `OverlappingSpeech` event to delay the reply until turns settle
  (partial — still single‑track); (b) **server‑side audio mixing — the real fix, and confirmed
  buildable today**: `@livekit/rtc-node` (installed, 0.13.30) ships an `AudioMixer` that
  combines multiple audio streams into one; subscribe to every human's mic, mix, and feed the
  session the mixed stream as a custom audio input. Bonus: VAD then only sees silence once
  *everyone* stops talking, so "wait, then answer" falls out naturally. Trade‑off: a mixed
  stream can't attribute words per speaker — transcript labels fall back to the active‑speaker
  heuristic. Multi‑day agent build, not a quick PR. (c) upstream multi‑participant support in
  `@livekit/agents` (1.5.0 still uses the single‑linked‑participant model). Interim tuning:
  longer `silence_duration_ms` so the agent stops jumping in early.
- Prompt‑side: instruct the agent to address participants by name and engage the whole group.

### C.2 Add/remove the agent mid‑meeting (as often as needed)
Host can dismiss the agent and bring it back at any point, any number of times.
- **Remove:** host‑only tRPC mutation → `RoomServiceClient.removeParticipant(agent identity)`
  (the agent's shutdown callback saves the transcript captured so far).
- **Re‑add:** requires **explicit agent dispatch** (`AgentDispatchClient.createDispatch`), which
  means switching the worker from automatic dispatch to a **named agent** (`agentName` in
  `WorkerOptions` + `lk agent deploy` config change) — automatic dispatch only fires on the
  first participant join.
- **Transcript gotcha:** each agent session currently **overwrites**
  `transcripts/<meetingId>.jsonl` on shutdown. Multiple sessions per meeting must **append/merge**
  (per‑session segment keys merged by the summariser, or download‑concat‑upload).
- Idle‑timeout guardrail must be agent‑session‑scoped (a meeting without the agent shouldn't be
  auto‑ended by the agent — the duration cap still applies via room‑level enforcement).

### C.3 Agent mute / answer‑only‑when‑asked
Three agent modes, switchable in‑call by the host:
1. **Active** (today) — answers whenever it detects a turn.
2. **Muted note‑taker** — keeps listening **and transcribing**, never speaks.
3. **On‑request** — silent until explicitly asked (a "Ask AI" button, and later a wake‑phrase).
- **Fits:** OpenAI Realtime supports VAD‑without‑auto‑response (`turnDetection` with
  `createResponse: false`) — transcription continues, replies happen only via a manual
  `session.generateReply()`. Mode switches ride a **LiveKit data channel** message from the
  host UI to the agent; agent publishes its current mode back (for a badge on the agent tile).
- This is the highest‑leverage C‑item: it fixes "the agent interrupts human conversation".

### C.4 Multi‑screenshare (several people sharing at once)
- LiveKit already supports **N concurrent screenshare tracks**, and both the call grid and the
  recording template render every `ScreenShare` track — so this is likely *functional* today.
- Work: **verify** concurrent shares end‑to‑end, then polish layout — a focus layout when 1+
  screens are shared ("X's screen" labels, screens enlarged, cameras in a strip).

### C.5 Multilingual speech, English‑only transcript
Users code‑switch (Urdu/Hindi/English/Korean in one meeting) and the transcript comes out
mixed‑language because `whisper-1` auto‑detects per utterance. Requirement: the agent keeps
**conversing in whatever language is spoken** (the realtime model already does), but the stored
transcript — and therefore the summary and "Ask AI" grounding — must be **pure English**.
- **Recommended:** translate **once, offline, in the Inngest pipeline** — a translate step
  (GPT‑4o‑mini, batched lines) before `add-speakers`/save, so the stored/displayed transcript
  and the summary input are English. Cheap, no latency added to the live call.
- Alternative: translate per‑utterance in the agent at capture time (adds live cost/latency —
  only if "live English captions" become a requirement).
- Agent lines can also arrive mixed‑language — translate those too.

### C.6 Export / download: transcript, summary, recording
Download buttons on the completed‑meeting view:
- **Transcript** → `.txt`/`.pdf` (speaker‑labelled lines; client‑side generation or a tiny route).
- **Summary** → `.md`/`.pdf`.
- **Recording** → `.mp4` via the existing presigned‑URL route with a download variant
  (`ResponseContentDisposition: attachment` on the presign).
- Access follows the participant‑access rules (owner OR admitted). Quick win, no schema changes.

### C.7 Two‑factor authentication (authenticator apps)
- better‑auth ships a **`twoFactor` plugin**: TOTP (Google Authenticator/Authy/1Password),
  backup codes, optional trusted devices. Server plugin + `twoFactorClient` on the client,
  enrol flow (QR code) in a new account‑security settings page, challenge step on sign‑in.
  Adds a table → `npm run db:push`.

## C.8 Suggested order
1. **C.6 Exports** + **C.4 multi‑screenshare verify** — quick wins.
2. **C.3 Agent mute/on‑request** — biggest UX complaint, moderate build.
3. **C.5 English transcript pipeline** — pipeline‑only, independent.
4. **C.2 Add/remove agent** — needs the named‑dispatch switch + transcript merging.
5. **C.7 2FA** — independent, any time.
6. **C.1 Overlapping speech** — hardest (audio mixing or upstream SDK); do last or when the
   SDK catches up. Pairs with MU‑4/MU‑5 (host controls + People panel) from Part A.

---

# Known issues / bugs

Tracked defects in the current flow, to fix before/around Part A. These complement the
product‑level fixes in `ROADMAP.md` (Stage 0–1).

### K.1 Meeting status doesn't update without a manual refresh
When a meeting ends, the LiveKit `room_finished` webhook flips it `active → processing`, and the
Inngest summariser later flips `processing → completed` — but the meeting detail page does **not**
reflect either transition until the user **manually refreshes**. The page reads status through
React Query with no `refetchInterval` or realtime subscription, so the client cache goes stale.
- **Fix options:** add a `refetchInterval` to the meeting `getOne` query while status is `active`
  or `processing` (simplest), or push status changes over a realtime channel for instant updates.
  Aligns with `ROADMAP.md` Stage 0 "Fix 2 — Summarisation Feedback" and Stage 1.1 "Real‑Time
  Frontend Updates".
- **Files:** `src/modules/meetings/server/procedures.ts` (`getOne`) and the meeting‑detail view
  (`meeting-id-view` + the per‑status state components).

### K.2 Agent join timing — should join at a natural time (not too late, not too early)
The AI agent should enter the call at a **normal** moment: late enough that it isn't added before
the human is actually in the room, but not so late that there's an awkward silence after the
meeting starts. Today the agent is dispatched on participant connect (automatic dispatch) and the
timing can feel off in either direction.
- **Goal:** tune dispatch/greeting so the agent is reliably present shortly after the first human
  joins — no early phantom join, no long lag.
- **Investigate:** dispatch + connect timing in `src/agents/meeting-agent.ts` (`entry` →
  `ctx.connect()` → `session.start`) and the lobby/connect timing on the client
  (`src/modules/call/ui/components/call-connect.tsx`). The `fix/call-prejoin-agent-timing` branch
  is related prior art.

---

## Cross‑references
- `ARCHITECTURE.md` — current system design and flows.
- `SECURITY_FIX_PLAN.md` — F‑01 (token authz, = MU‑1) and F‑03 (media privacy) are prerequisites.
- `DECISIONS_AND_CHANGELOG.md` — why PR 5 was built multi‑user‑safe (`room_finished`, not
  `participant_left`).
