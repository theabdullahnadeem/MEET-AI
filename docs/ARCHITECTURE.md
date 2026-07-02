# MEET-AI — Architecture & How It Works

A complete, ground‑up explanation of the MEET-AI application: the stack, every directory, the
data model, and each end‑to‑end flow — from a user clicking "New Meeting" to a summarised,
recorded, searchable past meeting they can chat with.

---

## 1. What the app is

MEET-AI is an **AI‑powered video meeting platform**. A user creates an **agent** (a named AI
persona with custom instructions), schedules a **meeting** with that agent, and joins a real‑
time video call where the agent listens and talks back live. When the meeting ends, the call is
**recorded**, **transcribed**, and **summarised**, and the user can later **chat** with an AI
about what happened.

### Tech stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router, React 19, Turbopack) |
| API | tRPC 11 (typed RPC over HTTP) + React Query |
| Auth | better-auth (email/password + GitHub/Google OAuth) |
| Database | PostgreSQL (Neon serverless) via Drizzle ORM |
| Real‑time video | LiveKit (Cloud SFU + React SDK) |
| AI voice agent | `@livekit/agents` + `@livekit/agents-plugin-openai` → OpenAI GA Realtime (`gpt-realtime`) |
| Background jobs | Inngest (transcript → summary) |
| Post‑meeting chat | Stream Chat |
| Recording/transcript storage | Cloudflare R2 (S3‑compatible) |
| Billing | Polar |
| UI | Tailwind CSS v4 + shadcn/ui (Radix) |
| Hosting | Vercel (web app) + LiveKit Cloud (agent worker) |

### Two runtimes, one repo
The codebase deploys to **two places**:
1. **Vercel** runs the Next.js app — pages, tRPC, API routes/webhooks. Auto‑deploys on merge.
2. **LiveKit Cloud** runs `src/agents/meeting-agent.ts` as a **separate always‑on Node process**
   (a real‑time agent needs a persistent WebSocket to LiveKit *and* OpenAI; Vercel functions
   time out). Updated manually with `lk agent deploy`.

Each has its **own** environment/secrets store — a frequent source of "works in one place, not
the other" issues.

---

## 2. Directory map

```
src/
├── app/                         # Next.js App Router
│   ├── layout.tsx               # root layout (providers, fonts)
│   ├── (auth)/                  # route group — unauthenticated
│   │   ├── sign-in/ , sign-up/  #   auth pages
│   ├── (dashboard)/             # route group — authenticated shell (sidebar/navbar)
│   │   ├── page.tsx             #   home
│   │   ├── agents/              #   agent list + detail
│   │   ├── meetings/            #   meeting list + detail
│   │   └── upgrade/             #   Polar pricing
│   ├── call/                    # the in-call experience (its own minimal layout)
│   │   └── [meetingId]/page.tsx
│   └── api/
│       ├── auth/[...all]/       # better-auth handler
│       ├── trpc/[trpc]/         # tRPC HTTP handler
│       ├── inngest/             # Inngest function endpoint
│       ├── webhook/             # Stream Chat webhook (post-meeting chat)
│       └── livekit-webhook/     # LiveKit webhook (meeting lifecycle + recording)
│       └── livekit-token/       # mints LiveKit join tokens
├── agents/meeting-agent.ts      # the LiveKit Cloud agent worker (separate runtime)
├── db/{index.ts,schema.ts}      # Drizzle client + schema
├── inngest/{client.ts,function.ts}  # summariser job
├── lib/                         # auth, livekit, stream-chat, stream-video, polar, avatar, utils
├── modules/                     # feature modules (the heart of the app)
│   ├── agents/                  #   {server/procedures, schemas, ui}
│   ├── meetings/                #   {server/procedures, schema, types, ui}
│   ├── call/                    #   {ui/components, ui/views} — the call screens
│   ├── dashboard/               #   sidebar/navbar/command palette
│   └── premium/                 #   {server/procedures, constants, ui}
├── trpc/                        # tRPC setup (init, routers, server/client glue)
├── components/                  # shared components + components/ui (shadcn)
├── hooks/ , constants.ts
```

**Module convention:** each feature in `src/modules/<feature>/` has a `server/procedures.ts`
(tRPC router), `schema(s).ts` (zod validation), `types.ts`, and a `ui/` folder (views +
components). This keeps a feature's data layer and presentation co‑located.

---

## 3. Data model (`src/db/schema.ts`)

Postgres, Drizzle ORM. Core tables:

- **`user`, `session`, `account`, `verification`** — managed by better-auth (identity, sessions,
  OAuth links, email verification).
- **`agents`** — `id` (nanoid), `name`, `userId` (owner, FK→user, cascade), `instructions`,
  timestamps. An agent is a reusable AI persona.
- **`meetings`** — `id` (nanoid), `name`, `userId` (owner), `agentId` (FK→agents), `status`
  (enum), `startedAt`, `endedAt`, `transcriptUrl`, `recordingUrl`, `summary`, timestamps.

**Meeting status enum** (`meeting_status`): `upcoming → active → processing → completed`, plus
`cancelled`. This single column drives which UI the meeting detail page shows.

```
upcoming ──(first human joins)──▶ active ──(room closes)──▶ processing ──(summary done)──▶ completed
   │
   └──(user cancels)──▶ cancelled
```

Ownership is enforced everywhere: every query is scoped by `userId`. The meeting id doubles as
the **LiveKit room name** and the **storage object key** — one identifier ties together the DB
row, the live room, the recording, and the transcript.

---

## 4. Authentication (`src/lib/auth.ts`, `src/trpc/init.ts`)

- **better-auth** with the **Drizzle adapter**. Providers: email/password, GitHub, Google.
- The **Polar plugin** creates a Polar customer on sign‑up and wires checkout/portal.
- Server routes get the session via `auth.api.getSession({ headers })`.
- The browser uses `authClient` (`src/lib/auth-client.ts`) — `authClient.useSession()` etc.
- The auth HTTP handler lives at `app/api/auth/[...all]/route.ts`.

**Authorization is centralised in tRPC** (`src/trpc/init.ts`):
- `protectedProcedure` — resolves the session and throws `UNAUTHORIZED` if absent; injects
  `ctx.auth`.
- `premiumProcedure(entity)` — extends `protectedProcedure`, checks the user's Polar
  subscription and the free‑tier limits (`MAX_FREE_AGENTS`, `MAX_FREE_MEETINGS`), and throws
  `FORBIDDEN` when a free user exceeds the limit. Used by the `create` mutations.

Every data query additionally filters by `ctx.auth.user.id`, so a user can only ever read/modify
their own agents and meetings.

> Note: the **LiveKit token endpoint** (`/api/livekit-token`) currently authenticates but does
> not authorize per‑meeting — see `SECURITY_AUDIT_REPORT.pdf` (F‑01).

---

## 5. The tRPC layer (`src/trpc/`, `src/modules/*/server/procedures.ts`)

tRPC gives end‑to‑end type safety between server and client.

- `trpc/init.ts` — creates the tRPC instance and the procedure helpers (above).
- `trpc/routers/_app.ts` — the **app router**, composed of the per‑feature routers
  (`meetings`, `agents`, `premium`).
- `trpc/server.tsx` — server‑side caller + React Query hydration helpers (used in RSC pages to
  `prefetch` then hydrate).
- `trpc/client.tsx` — the browser tRPC + React Query client (points at
  `NEXT_PUBLIC_APP_URL/api/trpc`).
- `app/api/trpc/[trpc]/route.ts` — the HTTP handler.

**Pattern used on every page:** a React Server Component `prefetch`es the query via the server
caller, wraps the client view in `<HydrationBoundary>`, and the client component reads the same
query with `useSuspenseQuery` — instant data, no loading flash, fully typed.

Key procedures:
- **`meetings`** — `getMany` (paginated/filtered/owner‑scoped), `getOne`, `create`
  (premium‑gated; also creates the LiveKit room), `update`, `remove`, `cancelMeeting`,
  `getTranscript` (fetches the JSONL, joins speaker ids to user/agent names),
  `generateChatToken` (Stream Chat token for post‑meeting chat).
- **`agents`** — `getMany`, `getOne`, `create` (premium‑gated), `update`, `remove`.
- **`premium`** — current subscription / free‑usage for the upgrade UI.

Inputs are validated with **zod** schemas (`schema.ts`/`schemas.ts`), which double as
mass‑assignment allow‑lists (e.g. `meetingsUpdateSchema` only permits `{id,name,agentId}`).

---

## 6. The meeting lifecycle — end to end

This is the spine of the app. Follow a single meeting through it.

### 6.1 Create (status `upcoming`)
`meetings-form` → `meeting.create` mutation:
1. Insert the meeting row (`userId`, `agentId`, `name`, status `upcoming`).
2. Create the **LiveKit room** named after the meeting id, with the agent's config in the room
   metadata.
3. Premium‑gated by `premiumProcedure("meetings")`.

### 6.2 Join (status → `active`)
The user opens `/call/[meetingId]`:
1. `app/call/[meetingId]/page.tsx` checks the session, prefetches `meeting.getOne`, renders
   `CallView`.
2. `CallView` → `CallProvider` (waits for the better-auth session) → `CallConnect`.
3. `CallConnect` fetches a token from `GET /api/livekit-token?room=<meetingId>` and shows the
   **lobby** (camera/mic preview via `usePreviewTracks`, **not yet connected** to the room).
4. On **"Join Meeting"**, `CallConnect` mounts `<LiveKitRoom connect>` → the browser connects to
   the LiveKit Cloud SFU and `CallActive` renders the participant grid + control bar +
   `RoomAudioRenderer`.
5. The participant connecting triggers two things on the LiveKit side:
   - **The agent is dispatched** (see §7).
   - LiveKit sends a **`participant_joined`** webhook → `/api/livekit-webhook` flips the meeting
     `upcoming → active`, sets `startedAt`, and **starts the recording** (Egress → R2) — exactly
     once, because the status update only matches a row on the first join.

### 6.3 In‑call
- All humans + the agent are in one LiveKit room. `RoomAudioRenderer` plays everyone's audio;
  `GridLayout`/`ParticipantTile` render video. The agent publishes one audio track that every
  participant subscribes to — so everyone hears the same AI, and the AI hears everyone.
- The agent streams the conversation to OpenAI GA Realtime and speaks responses back live.

### 6.4 Leave (status → `processing`)
- When the last human leaves, the agent's session closes (`closeOnDisconnect`), the agent
  uploads the transcript and writes `transcriptUrl` (see §8), and the room empties.
- After the room's `emptyTimeout`, LiveKit fires **`room_finished`** → `/api/livekit-webhook`
  flips `active → processing`, sets `endedAt`, and (if a `transcriptUrl` exists) triggers the
  Inngest summariser. Recording finalises and `egress_ended` saves `recordingUrl`.
- **Multi‑user‑safe:** the app deliberately does **not** end on `participant_left`, so one of
  several humans leaving never ends the meeting for everyone — only `room_finished` does.

### 6.5 Processing → `completed`
- The Inngest `meetings/processing` function fetches the transcript, joins speaker ids to
  names, asks GPT‑4o to summarise (markdown), writes `summary`, and flips `processing →
  completed` (see §9).

### 6.6 The detail page adapts to status
`meeting-id-view` renders a different component per status: `upcoming-state`, `active-state`,
`processing-state`, `cancelled-state`, or `completed-state`. The **completed** view has tabs:
**Summary** (markdown), **Transcript** (searchable, speaker‑attributed), **Recording**
(`<video>`), and **Chat** (Stream Chat with an AI assistant grounded in the summary).

---

## 7. The AI agent worker (`src/agents/meeting-agent.ts`)

A separate Node process on **LiveKit Cloud**, registered as an agent worker.

**Lifecycle of one job:**
1. LiveKit dispatches a job when a participant connects to a room (automatic dispatch — no agent
   name set). The worker's `entry(ctx)` runs.
2. It reads the room metadata from **`ctx.job.room?.metadata`** (the dispatch payload — *not*
   `ctx.room.metadata`, which is an empty stub before `ctx.connect()`), and parses out
   `meetingId`, `agentId`, `agentInstructions`, etc. If they're missing it exits.
3. `ctx.connect()` joins the room.
4. It builds a `voice.AgentSession` whose LLM is `openai.realtime.RealtimeModel`
   (`model: "gpt-realtime"`, `voice: "shimmer"`, server VAD turn detection, whisper‑1 input
   transcription) and `session.start({ agent: new voice.Agent({ instructions }), room })`.
5. **Transcript capture:** it listens for `conversation_item_added` and appends each message to
   an in‑memory transcript in the project's JSONL shape — agent lines tagged with `agentId`,
   human lines tagged with the human participant's identity (= their user id).
6. **On shutdown** (`ctx.addShutdownCallback`, fired when the human leaves and the session
   closes): it uploads the transcript JSONL to R2 via the S3 SDK and writes the meeting's
   `transcriptUrl` to the DB (via dynamic imports so a missing `DATABASE_URL` can't crash
   startup).

**Credentials:** `LIVEKIT_*` are injected by LiveKit Cloud; `OPENAI_API_KEY`, `DATABASE_URL`,
and `R2_*` are set as agent secrets. Run locally with `npm run dev:agent`; deploy with
`lk agent deploy` (see `AGENT_DEPLOY.md`).

---

## 8. Webhooks & state transitions

### 8.1 LiveKit webhook (`/api/livekit-webhook`) — meeting lifecycle + recording
Signature‑verified with `WebhookReceiver`. LiveKit sends **all** event types; the handler
filters:
- **`participant_joined`** (only `ParticipantInfo_Kind.STANDARD` humans) → `upcoming → active`,
  set `startedAt`, start Egress recording to R2 (once).
- **`room_finished`** → `active → processing`, set `endedAt`, trigger Inngest if `transcriptUrl`
  is set.
- **`egress_ended`** → save `recordingUrl` (`<R2_PUBLIC_URL>/recordings/<meetingId>.mp4`).

### 8.2 Stream webhook (`/api/webhook`) — post‑meeting chat only
Trimmed during the migration to **only** handle `message.new`: when a user messages the
completed‑meeting chat, it loads the meeting + agent, builds a prompt grounded in the meeting
**summary** + the agent instructions + recent history, calls GPT‑4o, and posts the reply back
into the Stream Chat channel as the agent. (All the old Stream **Video** handlers were removed.)
The webhook's signature is still verified with the Stream **Video** SDK client
(`streamVideo.verifyWebhook`) — the one remaining use of that client.

---

## 9. Background processing — the summariser (`src/inngest/`)

Inngest decouples the slow LLM summarisation from the request path.

- `room_finished` (webhook) sends the **`meetings/processing`** event `{ meetingId, transcriptUrl }`.
- `src/inngest/function.ts` runs as steps: **fetch** the transcript JSONL → **parse** it →
  **add speakers** (join `speaker_id` to user/agent names from the DB) → **summarise** with a
  GPT‑4o `@inngest/agent-kit` agent (structured markdown) → **save** `summary` and flip status to
  `completed`.
- Exposed to Inngest at `app/api/inngest/route.ts`.

Because it only reads `transcriptUrl`, the summariser is independent of *how* the transcript was
produced — which is why swapping Stream for LiveKit didn't touch it.

---

## 10. Transcription & recording pipeline (Cloudflare R2)

One S3‑compatible **R2** bucket holds both artifacts at deterministic keys:
- **Transcript** — `transcripts/<meetingId>.jsonl`, written by the **agent** on shutdown.
- **Recording** — `recordings/<meetingId>.mp4`, written by **LiveKit Egress** (server‑side
  room‑composite recording) started from the webhook.

R2 was chosen for S3 compatibility (works directly with both Egress and the AWS SDK) and **zero
egress/bandwidth fees**. `R2_*` env vars must exist in **both** runtimes (Vercel for Egress;
the agent for the transcript upload). The bucket is **private** (SEC‑5/F‑03): the DB stores
object **keys**, server reads presign their own access (`src/lib/r2.ts`), and the recording
player goes through the authenticated `GET /api/media/recording?meetingId=…` route, which
checks meeting ownership and 302‑redirects to a short‑lived pre‑signed URL. Legacy rows that
still store full public URLs are resolved to keys transparently (`r2KeyFromStored`).

---

## 11. Post‑meeting chat (Stream Chat)

Unrelated to Stream **Video** (which LiveKit replaced for live calls — the old Stream Video call
creation has been removed from `meeting.create`; the `streamVideo` client now survives only to
verify the Stream webhook signature, see §8.2). After a meeting completes, the **Chat** tab
opens a Stream Chat channel (`meeting.generateChatToken` mints the user's token). Messages the
user sends trigger the `/api/webhook` `message.new` handler, which replies as the agent using
the meeting summary as grounding — effectively "chat with your meeting."

---

## 12. Billing & premium (Polar)

- `src/lib/polar.ts` — the Polar SDK client (currently `server: "sandbox"`; see F‑09).
- The better-auth Polar plugin handles checkout/portal and customer creation.
- `premiumProcedure` enforces free‑tier limits (`MAX_FREE_AGENTS`, `MAX_FREE_MEETINGS`) and lets
  subscribers exceed them. The `/upgrade` page (`premium` module) shows pricing.

---

## 13. UI shell (`src/modules/dashboard`, `src/components/ui`)

- `(dashboard)/layout.tsx` wraps authenticated pages in the sidebar + navbar shell
  (`dashboard-sidebar`, `dashboard-navbar`, a `⌘K` command palette).
- `components/ui/*` is shadcn/ui (Radix primitives + Tailwind). Shared building blocks
  (`data-table`, `data-pagination`, `responsive-dialog`, `command-select`, states, avatars)
  live in `components/`.
- The **call** experience uses its own minimal `app/call/layout.tsx` (full‑screen, no dashboard
  chrome).

---

## 14. Request/data flow at a glance

```
Browser (React + React Query)
   │  tRPC (typed)            ┌─────────────────────────────────────────┐
   ├────────────────────────▶ │ Next.js on Vercel                       │
   │  /api/livekit-token      │  • tRPC routers (meetings, agents, …)    │
   │  /api/auth/*             │  • API routes / webhooks                 │
   │                          │  • better-auth                          │
   │  WebRTC (media)          └───────────────┬─────────────────────────┘
   │                                          │ Drizzle
   ▼                                          ▼
LiveKit Cloud SFU ◀───────── webhooks ──▶  Postgres (Neon)
   │    ▲                                     ▲
   │    │ dispatch                            │ transcriptUrl / status / summary
   ▼    │                                     │
LiveKit Agent (LiveKit Cloud) ──── OpenAI GA Realtime (gpt-realtime)
   │
   ├── transcript JSONL ─▶ Cloudflare R2 ◀── recording mp4 (Egress)
   │
room_finished ─▶ Inngest summariser ─▶ GPT-4o ─▶ summary + status=completed
                                                       │
                                          Stream Chat (post-meeting "chat with meeting")
```

---

## 15. Environment variables — who uses what

| Variable | Used by | Where set |
|----------|---------|-----------|
| `DATABASE_URL` | web app + agent (transcript write) | Vercel + agent |
| `BETTER_AUTH_SECRET` | auth (sessions) | Vercel |
| `GITHUB_/GOOGLE_CLIENT_*` | OAuth | Vercel |
| `OPENAI_API_KEY` | agent (realtime) + summariser + post‑meeting chat | Vercel + agent |
| `LIVEKIT_URL/API_KEY/API_SECRET` | token signing, room creation, webhook verify, Egress | Vercel (agent: auto‑injected) |
| `NEXT_PUBLIC_LIVEKIT_URL` | browser LiveKit connect (build‑time inlined) | Vercel |
| `R2_ENDPOINT/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET/PUBLIC_URL` | Egress (Vercel) + transcript upload (agent) | **both** Vercel + agent |
| `NEXT_PUBLIC_STREAM_CHAT_API_KEY` / `STREAM_CHAT_SECRET` | Stream Chat | Vercel |
| `NEXT_PUBLIC_STREAM_API_KEY` / `STREAM_VIDEO_SECRET` | Stream **Video** SDK client — now only verifies the Stream webhook signature (`/api/webhook`) | Vercel |
| `POLAR_ACCESS_TOKEN` | billing | Vercel |
| `NEXT_PUBLIC_APP_URL` | tRPC client base URL | Vercel |

**Rule of thumb:** anything the **agent** needs (DB, OpenAI, R2) must be in the **agent's**
secrets *and* redeployed with `lk agent deploy` — separate from Vercel. `NEXT_PUBLIC_*` values
are baked into the client bundle at **build time**, so changing them requires a redeploy.

---

## 16. Operating & debugging

- **Web app / webhooks:** Vercel → Deployments → Runtime Logs (filter by path). A `401` on
  `/api/livekit-webhook` means the webhook signing key ≠ Vercel `LIVEKIT_API_KEY/SECRET`.
- **Agent:** `lk agent logs --log-type deploy`, `lk agent status`. The agent only updates on
  `lk agent deploy` (merging a PR does **not** redeploy it).
- **Client connection issues** (e.g. dead call controls) show only in the **browser console** —
  usually a missing `NEXT_PUBLIC_LIVEKIT_URL` or an invalid token.
- **Recording failed?** Check LiveKit Cloud → Egresses for the egress status/error.

---

## 17. Related documents

- `LIVEKIT_MIGRATION.md` — the original 6‑PR migration plan (annotated with what shipped).
- `DECISIONS_AND_CHANGELOG.md` — every change made and why.
- `AGENT_DEPLOY.md` — how to run/deploy the agent worker.
- `SECURITY_AUDIT_REPORT.pdf` + `SECURITY_FIX_PLAN.md` — security findings and the fix plan.
