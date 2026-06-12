# LiveKit Migration Plan
## Stream Video → LiveKit (OpenAI GA Realtime)

> **Read this fully before touching any code.**
> Each PR is self-contained, reviewable, and independently revertable via `git revert`.
> Do not start PR N+1 until PR N is merged and verified on the live domain.

---

## Why We Are Migrating

Stream Video's `connectOpenAi()` relies on `@stream-io/openai-realtime-api` which wraps
`@openai/realtime-api-beta`. OpenAI shut down the Beta Realtime API endpoint on **May 12, 2026**.
Stream's Edge Network (their server-side proxy) still sends the deprecated `OpenAI-Beta: realtime=v1`
header and hits the dead endpoint — returning `400 beta_api_shape_disabled`. Stream has not released
an update. `@stream-io/node-sdk` is frozen at `0.7.59`.

**Symptom:** AI agent joins the meeting for ~1 second then silently drops.

**Root cause:** Not fixable from our side. Stream's infrastructure must be updated by Stream.

**Solution:** Replace Stream Video with LiveKit. LiveKit has first-class, actively maintained
OpenAI GA Realtime support via `@livekit/agents`. Built for multi-user meetings with a shared
AI agent that all participants can hear and interact with.

---

## Architecture Overview

### Current (Stream Video — broken)
```
User A ──── Stream Video WebRTC ──── Stream Edge Network ──── OpenAI WS (DEAD ❌)
User B ──── Stream Video WebRTC ──┘
Webhook → connectOpenAi() → @stream-io/openai-realtime-api → @openai/realtime-api-beta → 400
```

### After Migration (LiveKit — multi-user)
```
User A ──┐
User B ──┤──── LiveKit WebRTC ──── LiveKit Cloud SFU ──── LiveKit Agent Worker
User C ──┘                                                       │
                                                      OpenAI GA Realtime WS
                                                       (gpt-realtime-2)
                                                    AI audio published back
                                                    to room — all users hear it
```

### Key Architectural Point
The LiveKit Agent Worker is a **separate long-lived Node.js process** deployed on **Koyeb** (free tier).
This is not optional — a real-time AI agent needs a persistent WebSocket connection to both
LiveKit and OpenAI simultaneously. Vercel serverless functions time out.

**Why Koyeb:**
- Genuine free tier (1 nano instance, always-on, no credit card required)
- Upgrading is a single dropdown change — pick a bigger instance, redeploy, done in ~2 minutes
- No data to migrate when scaling — the agent is completely stateless
- No vendor lock-in — the agent is plain Node.js, runs anywhere

**Two services to run/deploy:**
1. **Vercel** — Next.js app (existing, unchanged deployment)
2. **Koyeb** — LiveKit Agent worker (new, free tier)

---

## What Does NOT Change (Touch Nothing)

- `src/db/` — schema, migrations, all DB queries
- `src/lib/auth.ts`, `src/lib/auth-client.ts` — better-auth untouched
- `src/lib/stream-chat.ts` — post-meeting chat stays on Stream Chat (unaffected)
- `src/trpc/` — all tRPC routers except `meeting.generateToken` and `meeting.create`
- `src/inngest/` — Inngest summarization job untouched
- `src/modules/meetings/ui/` — all meetings list/detail UI untouched
- `src/modules/agents/` — all agent CRUD untouched
- `src/modules/dashboard/` — sidebar, navbar untouched
- `src/modules/auth/` — sign-in/sign-up untouched
- `src/modules/premium/` — Polar billing untouched
- All `src/components/ui/` — shadcn components untouched

---

## Accounts to Create Before Starting

### 1. LiveKit Cloud (free)
1. Go to https://livekit.io → Sign up → Create project
2. Dashboard → Settings → Keys → copy:
   - `LIVEKIT_URL` (e.g. `wss://your-app.livekit.cloud`)
   - `LIVEKIT_API_KEY` (e.g. `APIxxxxxxxxx`)
   - `LIVEKIT_API_SECRET` (long string)

### 2. Koyeb (free, no credit card)
1. Go to https://koyeb.com → Sign up
2. You will deploy here in PR 4 — no setup needed yet, just create the account

---

## Environment Variables

### Add to `.env` (and Vercel production settings)
```env
# LiveKit — add all 4
LIVEKIT_URL=wss://your-app.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_LIVEKIT_URL=wss://your-app.livekit.cloud

# OpenAI (already exists — same key, no change needed)
OPENAI_API_KEY=sk-...
```

### Add to Koyeb service env vars (set in PR 4)
```env
LIVEKIT_URL=wss://your-app.livekit.cloud
LIVEKIT_API_KEY=APIxxxxxxxxxxxxxxxx
LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk-...
DATABASE_URL=postgresql://...
```

### Keep (still needed for Stream Chat)
```env
NEXT_PUBLIC_STREAM_API_KEY=...   # keep — stream chat still uses this
STREAM_VIDEO_SECRET=...          # can be removed after PR 5 is stable
```

---

## PR 1 — LiveKit Foundation
**Goal:** Install packages, add env vars, create server client. Zero breaking changes.

### Packages to install
```bash
npm install livekit-server-sdk @livekit/components-react livekit-client
npm install @livekit/agents @livekit/agents-plugin-openai
npm install -D ts-node
```

### File: `src/lib/livekit.ts` (CREATE NEW)
```typescript
import { AccessToken, RoomServiceClient, EgressClient } from "livekit-server-sdk";

if (!process.env.LIVEKIT_API_KEY) throw new Error("LIVEKIT_API_KEY is not set");
if (!process.env.LIVEKIT_API_SECRET) throw new Error("LIVEKIT_API_SECRET is not set");
if (!process.env.LIVEKIT_URL) throw new Error("LIVEKIT_URL is not set");

export const livekitRoomService = new RoomServiceClient(
  process.env.LIVEKIT_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET,
);

export const livekitEgressClient = new EgressClient(
  process.env.LIVEKIT_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET,
);

export function createLiveKitToken(
  userId: string,
  userName: string,
  userImage: string,
  roomName: string,
  ttlSeconds = 3600,
): string {
  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY!,
    process.env.LIVEKIT_API_SECRET!,
    {
      identity: userId,
      name: userName,
      ttl: ttlSeconds,
    },
  );

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    roomAdmin: false,
  });

  return token.toJwt();
}
```

### File: `package.json` — add agent scripts
```json
"scripts": {
  "dev": "next dev",
  "dev:agent": "node --loader ts-node/esm src/agents/meeting-agent.ts dev",
  "start:agent": "node dist/agents/meeting-agent.js start",
  "dev:webhook": "ngrok http --url=amelia-unreplete-shonna.ngrok-free.dev 3000"
}
```

### Verify PR 1
- `npm run build` passes with no errors
- No UI changes visible

### Revert PR 1
```bash
git revert <pr1-merge-commit>
npm install
```

---

## PR 2 — Token Generation + Room Creation
**Goal:** Add LiveKit token endpoint, wire LiveKit room creation into `meeting.create`.
Stream Video still runs in parallel during this PR.

### File: `src/app/api/livekit-token/route.ts` (CREATE NEW)
```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createLiveKitToken } from "@/lib/livekit";
import { generateAvatarUri } from "@/lib/avatar";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roomName = req.nextUrl.searchParams.get("room");
  if (!roomName) {
    return NextResponse.json({ error: "Missing room parameter" }, { status: 400 });
  }

  const userImage =
    session.user.image ??
    generateAvatarUri({ seed: session.user.name, variant: "initials" });

  const token = createLiveKitToken(
    session.user.id,
    session.user.name,
    userImage,
    roomName,
  );

  return NextResponse.json({ token });
}
```

### File: `src/modules/meetings/server/procedures.ts` (MODIFY `create` mutation)
In the `create` mutation (around line 201), **after** the existing Stream `call.create()` block,
add LiveKit room creation:

```typescript
// ADD this import at the top of the file:
import { livekitRoomService } from "@/lib/livekit";

// ADD inside the create mutation, after the streamVideo call.create() block:
await livekitRoomService.createRoom({
  name: createdMeeting.id,
  emptyTimeout: 300,        // 5 min — room auto-closes if empty
  maxParticipants: 50,      // supports multi-user expansion
  metadata: JSON.stringify({
    meetingId: createdMeeting.id,
    meetingName: createdMeeting.name,
    agentId: existingAgent.id,
    agentName: existingAgent.name,
    agentInstructions: existingAgent.instructions,
  }),
});
```

> Keep the existing `streamVideo.video.call()` creation in this PR.
> It is removed in PR 5 after webhooks are fully migrated.

### Verify PR 2
- Create a new meeting — check LiveKit Cloud dashboard shows the room created
- Old meetings page still works
- No UI regressions

### Revert PR 2
```bash
git revert <pr2-merge-commit>
```

---

## PR 3 — Call UI Swap
**Goal:** Replace Stream Video React SDK components with LiveKit React components.

### Files to REPLACE entirely:

#### `src/modules/call/ui/components/call-connect.tsx`
```typescript
"use client";

import { Loader2Icon } from "lucide-react";
import { useEffect, useState } from "react";
import { LiveKitRoom } from "@livekit/components-react";
import "@livekit/components-styles";

import { CallUI } from "./call-ui";

interface Props {
  meetingId: string;
  meetingName: string;
  userId: string;
  userName: string;
  userImage: string;
}

export const CallConnect = ({
  meetingId,
  meetingName,
}: Props) => {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchToken = async () => {
      try {
        const res = await fetch(
          `/api/livekit-token?room=${encodeURIComponent(meetingId)}`,
        );
        if (!res.ok) throw new Error("Failed to fetch token");
        const data = await res.json();
        setToken(data.token);
      } catch (e) {
        setError("Could not connect to meeting. Please try again.");
        console.error(e);
      }
    };

    fetchToken();
  }, [meetingId]);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-radial from-sidebar-accent to-sidebar">
        <p className="text-white text-sm">{error}</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex h-screen items-center justify-center bg-radial from-sidebar-accent to-sidebar">
        <Loader2Icon className="size-6 animate-spin text-white" />
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={token}
      serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL!}
      connect={true}
      audio={true}
      video={true}
    >
      <CallUI meetingName={meetingName} meetingId={meetingId} />
    </LiveKitRoom>
  );
};
```

#### `src/modules/call/ui/components/call-ui.tsx`
```typescript
"use client";

import { useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import { CallLobby } from "./call-lobby";
import { CallActive } from "./call-active";
import { CallEnded } from "./call-ended";

interface Props {
  meetingName: string;
  meetingId: string;
}

export const CallUI = ({ meetingName, meetingId }: Props) => {
  const room = useRoomContext();
  const [show, setShow] = useState<"lobby" | "call" | "ended">("lobby");

  const handleJoin = async () => {
    setShow("call");
  };

  const handleLeave = async () => {
    await room.disconnect();
    setShow("ended");
  };

  return (
    <div className="h-full">
      {show === "lobby" && <CallLobby onJoin={handleJoin} />}
      {show === "call" && (
        <CallActive
          meetingName={meetingName}
          meetingId={meetingId}
          onLeave={handleLeave}
        />
      )}
      {show === "ended" && <CallEnded />}
    </div>
  );
};
```

#### `src/modules/call/ui/components/call-lobby.tsx`
```typescript
"use client";

import Link from "next/link";
import { LogInIcon } from "lucide-react";
import {
  useLocalParticipant,
  useCameraTrack,
  TrackToggle,
  VideoTrack,
} from "@livekit/components-react";
import { Track } from "livekit-client";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { generateAvatarUri } from "@/lib/avatar";

interface Props {
  onJoin: () => void;
}

export const CallLobby = ({ onJoin }: Props) => {
  const { data } = authClient.useSession();
  const { localParticipant } = useLocalParticipant();
  const cameraTrack = useCameraTrack(localParticipant);

  const avatarUrl =
    data?.user.image ??
    generateAvatarUri({ seed: data?.user.name ?? "", variant: "initials" });

  return (
    <div className="flex flex-col items-center justify-center h-full bg-radial from-sidebar-accent to-sidebar">
      <div className="py-4 px-8 flex flex-1 items-center justify-center flex-col gap-4">
        <div className="flex flex-col items-center justify-center gap-y-6 bg-background rounded-lg p-10 shadow-sm">
          <div className="flex flex-col gap-y-2 text-center">
            <h6 className="text-lg font-medium">Ready to join?</h6>
            <p className="text-sm text-muted-foreground">
              Set up your camera and microphone
            </p>
          </div>
          <div className="w-64 h-48 bg-muted rounded-lg overflow-hidden flex items-center justify-center">
            {cameraTrack?.publication?.track ? (
              <VideoTrack
                trackRef={{
                  participant: localParticipant,
                  publication: cameraTrack.publication,
                  source: Track.Source.Camera,
                }}
                className="w-full h-full object-cover"
              />
            ) : (
              <img
                src={avatarUrl}
                alt={data?.user.name ?? "You"}
                className="w-16 h-16 rounded-full"
              />
            )}
          </div>
          <div className="flex gap-x-2">
            <TrackToggle source={Track.Source.Microphone} />
            <TrackToggle source={Track.Source.Camera} />
          </div>
          <div className="flex gap-x-2 justify-between w-full">
            <Button asChild variant="ghost">
              <Link href="/meetings">Cancel</Link>
            </Button>
            <Button onClick={onJoin}>
              <LogInIcon />
              Join Meeting
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
```

#### `src/modules/call/ui/components/call-active.tsx`
```typescript
"use client";

import Link from "next/link";
import Image from "next/image";
import {
  GridLayout,
  ParticipantTile,
  useTracks,
  ControlBar,
} from "@livekit/components-react";
import { Track } from "livekit-client";

interface Props {
  onLeave: () => void;
  meetingName: string;
  meetingId: string;
}

export const CallActive = ({ onLeave, meetingName, meetingId }: Props) => {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false },
  );

  return (
    <div className="flex flex-col justify-between p-4 h-full text-white">
      <div className="bg-[#101213] rounded-full p-4 flex items-center gap-4">
        <Link
          href="/"
          className="flex items-center justify-center p-1 bg-white/10 rounded-full w-fit h-fit"
        >
          <Image src="/logo.svg" alt="Logo" width={22} height={22} />
        </Link>
        <h4 className="text-base">{meetingName}</h4>
      </div>
      <GridLayout tracks={tracks} className="flex-1">
        <ParticipantTile />
      </GridLayout>
      <div className="bg-[#101213] rounded-full px-4">
        <ControlBar
          controls={{ camera: true, microphone: true, screenShare: false, leave: true }}
          onLeave={onLeave}
        />
      </div>
    </div>
  );
};
```

### Also remove from `src/modules/meetings/server/procedures.ts`
Remove the `generateToken` tRPC procedure entirely — it generated Stream Video tokens.
The client now calls `/api/livekit-token` directly.

### Remove Stream Video CSS import
Search codebase for `@stream-io/video-react-sdk/dist/css/styles.css` and remove those lines.
Add LiveKit styles in `call-connect.tsx` (already included above):
```typescript
import "@livekit/components-styles";
```

### Things that could break in PR 3
- Any file outside `src/modules/call/` still importing from `@stream-io/video-react-sdk`
  will fail the TypeScript build. Run `npx tsc --noEmit` before raising the PR.

### Verify PR 3
- Join a meeting — lobby shows camera preview, mic/camera toggles work
- Clicking "Join Meeting" enters the call, participants visible
- Leave button works and shows ended screen
- AI agent is NOT wired yet — that is PR 4

### Revert PR 3
```bash
git revert <pr3-merge-commit>
npm install
```

---

## PR 4 — AI Agent (The Core Fix)
**Goal:** Deploy a LiveKit Agent worker on Koyeb that joins every meeting room, connects to
OpenAI GA Realtime, and bridges audio for all participants simultaneously.

This is the PR that actually fixes the broken real-time AI. All users in the meeting
hear the same AI agent. The AI hears all participants. Fully multi-user from day one.

### Architecture
```
User A ──┐
User B ──┤── LiveKit room ── Agent Worker (Koyeb) ── OpenAI gpt-realtime-2
User C ──┘        ↑                    │
                  └──── AI audio ──────┘  (published to room, everyone hears it)
```

### Packages (installed in PR 1)
```
@livekit/agents
@livekit/agents-plugin-openai
```

### File: `src/agents/meeting-agent.ts` (CREATE NEW)
```typescript
import {
  WorkerOptions,
  cli,
  defineAgent,
  AgentSession,
  JobContext,
} from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";

export default defineAgent({
  entry: async (ctx: JobContext) => {
    // Parse agent config stored in room metadata (set during meeting creation in PR 2)
    const metadata = ctx.room.metadata
      ? (JSON.parse(ctx.room.metadata) as {
          meetingId?: string;
          agentId?: string;
          agentName?: string;
          agentInstructions?: string;
        })
      : {};

    const { meetingId, agentId, agentInstructions, agentName } = metadata;

    if (!meetingId || !agentId) {
      console.error("[Agent] Missing meetingId or agentId in room metadata — exiting");
      return;
    }

    console.log(`[Agent] Joining meeting: ${meetingId}, agent: ${agentName}`);

    await ctx.connect();

    const session = new AgentSession();

    await session.start(
      ctx.room,
      new openai.realtime.RealtimeAgent({
        model: new openai.realtime.RealtimeModel({
          model: "gpt-realtime-2",
          voice: "shimmer",
          instructions:
            agentInstructions ?? "You are a helpful AI meeting assistant.",
          turnDetection: {
            type: "server_vad",
            threshold: 0.5,
            prefixPaddingMs: 300,
            silenceDurationMs: 500,
          },
          inputAudioTranscription: {
            model: "whisper-1",
          },
          modalities: ["audio", "text"],
        }),
      }),
    );

    console.log(`[Agent] Session started for meeting: ${meetingId}`);
  },
});

// Worker entry point
cli.runApp(
  new WorkerOptions({
    agent: __filename,
    apiKey: process.env.LIVEKIT_API_KEY!,
    apiSecret: process.env.LIVEKIT_API_SECRET!,
    wsURL: process.env.LIVEKIT_URL!,
  }),
);
```

### Running locally (two terminals)
```bash
# Terminal 1 — Next.js app
npm run dev

# Terminal 2 — Agent worker
npm run dev:agent
```

### Deploying the agent to Koyeb (free tier)

**Step 1 — Add a Dockerfile to the project root:**
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npx tsc --outDir dist
CMD ["node", "dist/src/agents/meeting-agent.js", "start"]
```

**Step 2 — Push to GitHub (agent code is in the same repo)**

**Step 3 — Koyeb setup:**
1. Go to koyeb.com → New Service → GitHub
2. Select your repo, branch: `main`
3. Build: Docker
4. Instance type: **nano** (free tier)
5. Set environment variables:
   ```
   LIVEKIT_URL=wss://...
   LIVEKIT_API_KEY=API...
   LIVEKIT_API_SECRET=...
   OPENAI_API_KEY=sk-...
   DATABASE_URL=postgresql://...
   ```
6. Deploy

**Step 4 — Verify in LiveKit Cloud dashboard:**
When the worker is running, it appears as a connected worker in your LiveKit project.
When a meeting room is created, LiveKit automatically dispatches the agent to it.

### Scaling on Koyeb (when needed)
```
Current usage      → nano instance (free)
~50+ concurrent    → small instance (~$5/month) — 1 dropdown change, 2 min deploy
~200+ concurrent   → medium instance or add a second service instance
```
No data migration. No config changes. Just change the instance size and redeploy.

### Things that could break in PR 4
- `@livekit/agents` package API — check exact import names match the installed version:
  ```bash
  node -e "console.log(Object.keys(require('@livekit/agents')))"
  ```
- `@livekit/agents-plugin-openai` — verify `RealtimeAgent` and `RealtimeModel` exports exist
- Agent not dispatching — confirm the worker is running and the API keys match the LiveKit project
- Room metadata empty — if `ctx.room.metadata` is `""` (empty string), `JSON.parse("")` throws.
  Guard it: `ctx.room.metadata ? JSON.parse(ctx.room.metadata) : {}`
- TypeScript compilation for Koyeb — if `tsconfig.json` has `"rootDir": "src"`, adjust the
  Dockerfile `CMD` path accordingly

### Verify PR 4
- Start both terminals locally
- Create and join a meeting
- Agent joins the room within 2–3 seconds and appears as a participant
- Agent responds to voice in real time
- All users in the room hear the same AI — confirmed by joining from two browser tabs
- Agent stays for the full meeting duration
- On Koyeb: check service logs show `[Agent] Session started`

### Revert PR 4
```bash
git revert <pr4-merge-commit>
# Stop the agent terminal locally
# On Koyeb: pause the service
```

---

## PR 5 — Webhooks Migration
**Goal:** Replace Stream Video webhooks with LiveKit webhooks for meeting state transitions.

### File: `src/app/api/livekit-webhook/route.ts` (CREATE NEW)
```typescript
import { NextRequest, NextResponse } from "next/server";
import { WebhookReceiver } from "livekit-server-sdk";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { inngest } from "@/inngest/client";

const receiver = new WebhookReceiver(
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!,
);

export async function POST(req: NextRequest) {
  const body = await req.text();
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  }

  let event;
  try {
    event = receiver.receive(body, authHeader);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
  }

  console.log("[livekit-webhook] Event:", event.event);

  const roomMetadata = event.room?.metadata
    ? (JSON.parse(event.room.metadata || "{}") as { agentId?: string })
    : {};

  // Participant joined → mark meeting active (human only, skip agent)
  if (event.event === "participant_joined") {
    const roomName = event.room?.name;
    const participantIdentity = event.participant?.identity;

    if (!roomName) return NextResponse.json({ status: "skipped" });
    if (participantIdentity === roomMetadata.agentId) {
      return NextResponse.json({ status: "agent joined, skipped" });
    }

    await db
      .update(meetings)
      .set({ status: "active", startedAt: new Date() })
      .where(
        and(eq(meetings.id, roomName), eq(meetings.status, "upcoming")),
      );
  }

  // Participant left → if human left, mark processing
  if (event.event === "participant_left") {
    const roomName = event.room?.name;
    const participantIdentity = event.participant?.identity;

    if (!roomName) return NextResponse.json({ status: "skipped" });

    if (participantIdentity !== roomMetadata.agentId) {
      await db
        .update(meetings)
        .set({ status: "processing", endedAt: new Date() })
        .where(
          and(eq(meetings.id, roomName), eq(meetings.status, "active")),
        );
    }
  }

  // Room finished → trigger Inngest summarization
  if (event.event === "room_finished") {
    const roomName = event.room?.name;
    if (!roomName) return NextResponse.json({ status: "skipped" });

    const [meeting] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, roomName));

    if (meeting?.transcriptUrl) {
      await inngest.send({
        name: "meetings/processing",
        data: {
          meetingId: meeting.id,
          transcriptUrl: meeting.transcriptUrl,
        },
      });
    }
  }

  // Egress ended → save recording URL
  if (event.event === "egress_ended") {
    const roomName = event.egressInfo?.roomName;
    const fileUrl = event.egressInfo?.fileResults?.[0]?.downloadUrl;

    if (roomName && fileUrl) {
      await db
        .update(meetings)
        .set({ recordingUrl: fileUrl })
        .where(eq(meetings.id, roomName));
    }
  }

  return NextResponse.json({ status: "success" });
}
```

### Register the webhook in LiveKit Cloud
1. LiveKit Cloud dashboard → your project → Webhooks
2. Add URL: `https://your-domain.com/api/livekit-webhook`
3. Select events: `participant_joined`, `participant_left`, `room_finished`, `egress_ended`

### Trim `src/app/api/webhook/route.ts`
Keep only the `message.new` handler (post-meeting chat). Remove all Stream Video call handlers:
```typescript
// Only this block remains — everything else deleted
if (eventType === "message.new") {
  // ... existing handler, completely untouched
}
```

### Things that could break in PR 5
- LiveKit webhook `Authorization` header format — if `receiver.receive()` throws, the header
  is malformed. Check LiveKit Cloud webhook settings for the exact header format.
- `JSON.parse("")` on empty metadata — guarded above with `|| "{}"`
- Inngest not triggered — `transcriptUrl` is null until PR 6 wires it up. Normal for now.

### Verify PR 5
- Join and leave a meeting — DB shows `status: active` → `status: processing`
- Post-meeting chat still works (Stream Chat webhook unchanged)

### Revert PR 5
```bash
git revert <pr5-merge-commit>
```

---

## PR 6 — Transcription and Recording
**Goal:** Wire LiveKit Egress for recording, capture transcripts from the agent worker,
replace Stream's transcription/recording pipeline.

### Recording via LiveKit Egress
In `src/app/api/livekit-webhook/route.ts`, start recording when the first human joins.
Add inside the `participant_joined` block (after the DB update):

```typescript
import { livekitEgressClient } from "@/lib/livekit";

// Start composite recording when first human joins
// (only if no active egress already exists for this room)
try {
  await livekitEgressClient.startRoomCompositeEgress(roomName, {
    fileOutputs: [
      {
        filepath: `recordings/${roomName}.mp4`,
        output: {
          // S3 example — configure your bucket
          s3: {
            accessKey: process.env.AWS_ACCESS_KEY_ID!,
            secret: process.env.AWS_SECRET_ACCESS_KEY!,
            region: process.env.AWS_REGION!,
            bucket: process.env.AWS_S3_BUCKET!,
          },
        },
      },
    ],
  });
} catch (err) {
  console.error("[livekit-webhook] Failed to start egress:", err);
  // Non-fatal — meeting continues without recording
}
```

> S3 env vars needed: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`.
> AWS S3 free tier includes 5GB storage and 20,000 GET requests/month — sufficient for early stage.

### Transcription via Agent Worker
Add transcript capture to `src/agents/meeting-agent.ts` inside the `entry` function,
after `session.start()`:

```typescript
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { eq } from "drizzle-orm";
import JSONL from "jsonl-parse-stringify";

const transcriptItems: Array<{ speaker_id: string; text: string; timestamp: number }> = [];

session.on("agent_speech_committed", (msg) => {
  transcriptItems.push({
    speaker_id: agentId,
    text: msg.content ?? "",
    timestamp: Date.now(),
  });
});

session.on("user_speech_committed", (msg) => {
  // ctx.room.localParticipant is the agent; find the human speaker
  transcriptItems.push({
    speaker_id: msg.participantIdentity ?? "unknown",
    text: msg.transcript ?? "",
    timestamp: Date.now(),
  });
});

// On room disconnect — save transcript
ctx.room.on("disconnected", async () => {
  if (transcriptItems.length === 0) return;

  const jsonlContent = JSONL.stringify(transcriptItems);
  const blob = new Blob([jsonlContent], { type: "application/jsonl" });

  // Upload to S3 (or any storage)
  // Then update DB with the URL
  // await uploadToS3(`transcripts/${meetingId}.jsonl`, blob);
  // await db.update(meetings).set({ transcriptUrl: url }).where(eq(meetings.id, meetingId));

  console.log(`[Agent] Transcript saved for meeting: ${meetingId}`);
});
```

> **Note:** The `StreamTrancriptItem` type in `src/modules/meetings/types.ts` and the
> `getTranscript` tRPC procedure in `src/modules/meetings/server/procedures.ts` use Stream's
> JSONL format. Update the type to match the new format above. The Inngest summarization job
> in `src/inngest/function.ts` is unaffected — it only reads `transcriptUrl` and processes
> whatever text is there.

### Verify PR 6
- Complete a full meeting
- `recordingUrl` and `transcriptUrl` populated in DB
- Meeting detail page shows transcript correctly
- Inngest triggers and populates `summary`

### Revert PR 6
```bash
git revert <pr6-merge-commit>
```

---

## Post-Migration Cleanup (after all 6 PRs are stable in production)

1. `npm uninstall @stream-io/node-sdk @stream-io/openai-realtime-api @stream-io/video-react-sdk`
2. Delete `src/lib/stream-video.ts`
3. Delete `patches/@stream-io+openai-realtime-api+0.3.3.patch`
4. Remove `"postinstall": "patch-package"` from `package.json`
5. Remove `STREAM_VIDEO_SECRET` from `.env` and Vercel (keep `NEXT_PUBLIC_STREAM_API_KEY` for Stream Chat)
6. Remove the Stream Video `call.create()` block from `meeting.create` tRPC procedure
7. Close the `fix/openai-realtime-model-ga` branch — superseded by this migration

---

## Deployment Checklist

### Vercel (Next.js app — unchanged deployment)
- Add `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `NEXT_PUBLIC_LIVEKIT_URL` to project env vars
- Register LiveKit webhook URL in LiveKit Cloud dashboard

### Koyeb (LiveKit Agent worker)
- Create account at koyeb.com (free, no card)
- New service → GitHub → select repo
- Build: Docker (using `Dockerfile` added in PR 4)
- Instance: **nano** (free tier)
- Set all 5 env vars: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `OPENAI_API_KEY`, `DATABASE_URL`
- Deploy → verify worker appears in LiveKit Cloud dashboard

### Scaling the agent worker (when needed)
```
Koyeb dashboard → service → Settings → Instance → change size → Redeploy
```
~2 minutes. No data migration. No code changes. Fully stateless.

---

## Gotchas / Things That Could Backfire

| Risk | Mitigation |
|------|-----------|
| `@livekit/agents` JS API differs from docs | Run `node -e "console.log(Object.keys(require('@livekit/agents')))"` after install to verify exports |
| Agent not dispatching to room | Check Koyeb logs — worker must show as connected in LiveKit Cloud dashboard |
| Room metadata empty string | Guard with `ctx.room.metadata \|\| "{}"` before `JSON.parse` |
| Agent appears in GridLayout (unwanted) | Filter agent participant by identity in `useTracks` — check `participant.identity === agentId` |
| TypeScript path aliases in agent | `@/db`, `@/lib` etc. require `tsconfig-paths` at runtime. Add `tsconfig-paths/register` to agent entry or compile fully with `tsc` |
| Transcript format mismatch | Update `StreamTrancriptItem` type and `getTranscript` query in PR 6 to match new format |
| Recording requires S3 setup | AWS free tier covers early stage; can defer recording to post-launch if needed |
| Stream Chat broken | Stream Chat is completely independent — never touched in any PR |
| Multi-user: AI speaks to all | Confirmed — agent publishes one audio track to the room, all participants subscribe automatically |
| Koyeb free tier RAM (256MB) | Agent uses ~30–50MB per active meeting. Free tier handles ~4–6 concurrent meetings comfortably |
