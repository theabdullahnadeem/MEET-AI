# MEET-AI — Expansion Plan

Forward‑looking feature roadmap. **Part A** is the near‑term, already‑decided feature:
Google‑Meet‑style **multi‑user meetings** with a shared AI agent. **Part B** is the longer‑term
enhancement backlog.

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

### MU‑4 — Host controls (optional)
Mute/remove participants via `RoomServiceClient.mutePublishedTrack` / `removeParticipant`,
exposed only to the `roomAdmin` host. Pairs naturally with the multi‑tile grid.

### MU‑5 — Multi‑user UI polish
Participant name labels, "waiting room" list for the host, a share‑link affordance, and an
active‑speaker layout. The agent tile should be visually distinguished (and excluded from the
human participant count).

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

## Cross‑references
- `ARCHITECTURE.md` — current system design and flows.
- `SECURITY_FIX_PLAN.md` — F‑01 (token authz, = MU‑1) and F‑03 (media privacy) are prerequisites.
- `DECISIONS_AND_CHANGELOG.md` — why PR 5 was built multi‑user‑safe (`room_finished`, not
  `participant_left`).
