import { fileURLToPath } from "node:url";

import {
  WorkerOptions,
  cli,
  defineAgent,
  voice,
  type JobContext,
} from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";
import { ParticipantKind, RoomEvent } from "@livekit/rtc-node";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import JSONL from "jsonl-parse-stringify";

import {
  AGENT_CONTROL_TOPIC,
  AGENT_STATE_TOPIC,
  MEETING_AGENT_NAME,
  type AgentControlMessage,
  type AgentMode,
  type AgentStateMessage,
} from "../modules/call/agent-protocol";

interface RoomMeta {
  meetingId?: string;
  meetingName?: string;
  hostUserId?: string;
  agentId?: string;
  agentName?: string;
  agentInstructions?: string;
}

// Same JSONL shape the summarizer (src/inngest/function.ts) and getTranscript
// already consume, so nothing downstream changes.
interface TranscriptItem {
  speaker_id: string;
  type: string;
  text: string;
  start_ts: number;
  stop_ts: number;
}

// Cost guardrails (optional agent secrets; sane defaults if unset).
const minutesFromEnv = (name: string, fallback: number): number => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
// End the meeting when nobody has spoken for this long.
const IDLE_TIMEOUT_MINUTES = minutesFromEnv("MEETING_IDLE_TIMEOUT_MINUTES", 10);
// Hard cap on meeting length.
const MAX_DURATION_MINUTES = minutesFromEnv("MEETING_MAX_DURATION_MINUTES", 60);

// C.1 interim: group-aware behaviour appended to every persona's instructions.
const GROUP_INSTRUCTIONS =
  "\n\nYou are in a live meeting that may include several human participants. " +
  "Never talk over people: wait until they have finished speaking, and if a " +
  "discussion is going on between participants, let it settle before answering. " +
  "When multiple people have contributed, take everyone's input into account and " +
  "address the group (or people by name) rather than only the last speaker. " +
  "Keep replies concise.";

export default defineAgent({
  entry: async (ctx: JobContext) => {
    // Room metadata is set when the meeting is created (see meeting.create).
    // Read it from the dispatch job info — `ctx.room` is an unconnected stub
    // until `ctx.connect()`, so `ctx.room.metadata` is empty at this point.
    const rawMetadata = ctx.job.room?.metadata ?? "";
    const metadata: RoomMeta = rawMetadata
      ? (JSON.parse(rawMetadata) as RoomMeta)
      : {};

    const { meetingId, hostUserId, agentId, agentName, agentInstructions } =
      metadata;

    if (!meetingId || !agentId) {
      console.error(
        "[Agent] Missing meetingId or agentId in room metadata — exiting",
      );
      return;
    }

    console.log(`[Agent] Joining meeting: ${meetingId}, agent: ${agentName}`);

    await ctx.connect();

    const session = new voice.AgentSession({
      llm: new openai.realtime.RealtimeModel({
        model: "gpt-realtime",
        voice: "shimmer",
        turnDetection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          // C.1 interim: a longer pause before the agent considers a turn
          // finished, so it stops jumping into ongoing discussions.
          silence_duration_ms: 800,
          // C.3: the API never auto-replies — the agent decides when to
          // respond (see the agent-modes section below). Muted listening
          // therefore creates no responses and costs no reply tokens.
          create_response: false,
          interrupt_response: true,
        },
        inputAudioTranscription: {
          model: "whisper-1",
        },
        modalities: ["audio", "text"],
      }),
    });

    // Identity of the participant whose audio is currently forwarded to the
    // model (see the ActiveSpeakersChanged handler below). Also used to
    // attribute transcript lines to the person who was actually speaking.
    let linkedSpeakerIdentity: string | undefined;

    // --- Transcript capture ------------------------------------------------
    // Attribute agent lines to agentId and human lines to the human's identity
    // (which equals their user id — set when the LiveKit token is minted), so
    // getTranscript/summarizer resolve speaker names from the DB.
    const transcript: TranscriptItem[] = [];

    const firstHumanIdentity = (): string =>
      Array.from(ctx.room.remoteParticipants.values())[0]?.identity ?? "unknown";

    session.on(voice.AgentSessionEventTypes.ConversationItemAdded, (ev) => {
      const item = ev.item;
      if (!("textContent" in item)) return; // skip non-message items
      const text = item.textContent;
      if (!text) return;

      const now = Date.now();
      if (item.role === "assistant") {
        transcript.push({
          speaker_id: agentId,
          type: "agent",
          text,
          start_ts: now,
          stop_ts: now,
        });
      } else if (item.role === "user") {
        transcript.push({
          speaker_id: linkedSpeakerIdentity ?? firstHumanIdentity(),
          type: "user",
          text,
          start_ts: now,
          stop_ts: now,
        });
      }
    });

    // Persist the transcript to R2 and record its key on the meeting; the
    // room_finished webhook then triggers summarization. Runs at most once —
    // called eagerly BEFORE an agent-initiated meeting end (so room_finished
    // always sees a transcriptUrl) and from the shutdown callback as the
    // normal path. Guarded so a storage/DB misconfig never crashes the agent.
    let saveTranscriptTask: Promise<void> | undefined;
    const saveTranscript = (): Promise<void> => {
      saveTranscriptTask ??= saveTranscriptOnce();
      return saveTranscriptTask;
    };
    const saveTranscriptOnce = async () => {
      if (transcript.length === 0) {
        console.log(`[Agent] No transcript to save for meeting: ${meetingId}`);
        return;
      }
      try {
        const key = `transcripts/${meetingId}.jsonl`;
        const s3 = new S3Client({
          region: "auto",
          endpoint: process.env.R2_ENDPOINT!,
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID!,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
          },
        });

        // C.2: a meeting can have several agent sessions (the host can remove
        // and re-add the agent). Merge with the segment a previous session
        // already saved so the final file covers the whole meeting.
        let previousSegment: TranscriptItem[] = [];
        try {
          const existing = await s3.send(
            new GetObjectCommand({
              Bucket: process.env.R2_BUCKET!,
              Key: key,
            }),
          );
          const body = await existing.Body?.transformToString();
          if (body) {
            previousSegment = JSONL.parse<TranscriptItem>(body);
          }
        } catch {
          // no previous segment — first agent session of this meeting
        }

        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.R2_BUCKET!,
            Key: key,
            Body: JSONL.stringify([...previousSegment, ...transcript]),
            ContentType: "application/jsonl",
          }),
        );

        // SEC-5: store the object KEY — the bucket is private, and readers
        // (getTranscript, summariser) presign their own access.
        // Relative imports so this works when run via tsx outside Next.
        const { db } = await import("../db");
        const { meetings } = await import("../db/schema");
        const { eq } = await import("drizzle-orm");
        await db
          .update(meetings)
          .set({ transcriptUrl: key })
          .where(eq(meetings.id, meetingId));

        console.log(`[Agent] Transcript saved for meeting: ${meetingId}`);
      } catch (err) {
        console.error("[Agent] Failed to save transcript:", err);
      }
    };

    ctx.addShutdownCallback(saveTranscript);

    await session.start({
      agent: new voice.Agent({
        instructions:
          (agentInstructions ?? "You are a helpful AI meeting assistant.") +
          GROUP_INSTRUCTIONS,
      }),
      room: ctx.room,
      inputOptions: {
        // Multi-user: the session must NOT die just because the participant
        // the agent is currently listening to disconnected — remaining humans
        // still need the agent. Lifecycle is managed explicitly below.
        closeOnDisconnect: false,
      },
    });

    // --- Multi-user audio routing -------------------------------------------
    // RoomIO forwards only ONE participant's audio to the realtime model (it
    // links to the first participant by default), so in multi-user meetings
    // the agent only heard whoever joined first. Re-link the audio input to
    // whichever human is actively speaking so the agent hears everyone.
    ctx.room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
      const humanSpeaker = speakers.find(
        (p) => p.kind === ParticipantKind.STANDARD,
      );
      if (!humanSpeaker) return;

      if (!linkedSpeakerIdentity) {
        linkedSpeakerIdentity =
          session._roomIO?.linkedParticipant?.identity ?? undefined;
      }

      if (humanSpeaker.identity !== linkedSpeakerIdentity) {
        linkedSpeakerIdentity = humanSpeaker.identity;
        session._roomIO?.setParticipant(humanSpeaker.identity);
        console.log(`[Agent] Listening to speaker: ${humanSpeaker.identity}`);
      }
    });

    // --- Lifecycle + cost guardrails ----------------------------------------
    // A live meeting burns OpenAI Realtime tokens (even during silence — VAD
    // keeps consuming input audio) and LiveKit agent minutes. Three guards:
    //   1. Idle timeout  — nobody has spoken for IDLE_TIMEOUT_MINUTES.
    //   2. Duration cap  — meeting hit MAX_DURATION_MINUTES.
    //   3. Last human out — agent shuts down instead of idling in the room.

    const remainingHumans = () =>
      Array.from(ctx.room.remoteParticipants.values()).filter(
        (p) => p.kind === ParticipantKind.STANDARD,
      );

    let ending = false;

    // End the meeting FOR EVERYONE: save the transcript first (so the
    // room_finished webhook sees a transcriptUrl and triggers the summary),
    // announce, then delete the room — which disconnects all participants and
    // fires room_finished immediately.
    const endMeetingForAll = async (announcement: string, reason: string) => {
      if (ending) return;
      ending = true;
      console.log(`[Agent] Ending meeting ${meetingId}: ${reason}`);

      try {
        const handle = session.generateReply({ instructions: announcement });
        // Never let a stuck playout keep the meeting (and the bill) alive.
        await Promise.race([
          handle.waitForPlayout(),
          new Promise((resolve) => setTimeout(resolve, 15_000)),
        ]);
      } catch (err) {
        console.error("[Agent] Failed to announce meeting end:", err);
      }

      await saveTranscript();

      try {
        const { RoomServiceClient } = await import("livekit-server-sdk");
        const service = new RoomServiceClient(
          process.env.LIVEKIT_URL!,
          process.env.LIVEKIT_API_KEY!,
          process.env.LIVEKIT_API_SECRET!,
        );
        await service.deleteRoom(meetingId);
      } catch (err) {
        // At minimum stop this agent from burning tokens; the room then
        // empties on its own and room_finished still fires via emptyTimeout.
        console.error("[Agent] Failed to delete room:", err);
        ctx.shutdown("failed to delete room after meeting end");
      }
    };

    // 1. Idle timeout — reset whenever a human starts speaking or joins.
    let idleTimer: NodeJS.Timeout | undefined;
    const resetIdleTimer = () => {
      if (ending) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        void endMeetingForAll(
          "Briefly tell the participants the meeting is closing due to inactivity and say goodbye.",
          `no speech for ${IDLE_TIMEOUT_MINUTES} minutes`,
        );
      }, IDLE_TIMEOUT_MINUTES * 60_000);
    };
    session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
      if (ev.newState === "speaking") {
        resetIdleTimer();
      }
    });
    resetIdleTimer();

    // 2. Hard duration cap.
    const maxDurationTimer = setTimeout(() => {
      void endMeetingForAll(
        "Briefly tell the participants the meeting reached its maximum duration and is ending now; thank them.",
        `max duration of ${MAX_DURATION_MINUTES} minutes reached`,
      );
    }, MAX_DURATION_MINUTES * 60_000);

    // 3. Participant lifecycle.
    ctx.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      if (ending) return;
      const humans = remainingHumans();

      if (humans.length === 0) {
        // Last human left — shut down now instead of idling in an empty room.
        // The shutdown callback saves the transcript; the room then empties
        // and closes via emptyTimeout → room_finished.
        console.log(`[Agent] All participants left meeting ${meetingId} — shutting down`);
        ctx.shutdown("all participants left");
        return;
      }

      // The participant the agent was listening to left — switch to another
      // human so the remaining participants are still heard.
      if (participant.identity === linkedSpeakerIdentity) {
        linkedSpeakerIdentity = humans[0]!.identity;
        session._roomIO?.setParticipant(linkedSpeakerIdentity);
        console.log(`[Agent] Linked speaker left — now listening to: ${linkedSpeakerIdentity}`);
      }
    });

    // A new joiner gets a fresh idle window (e.g. host waiting for guests).
    ctx.room.on(RoomEvent.ParticipantConnected, (participant) => {
      if (participant.kind === ParticipantKind.STANDARD) {
        resetIdleTimer();
      }
    });

    // Don't leak timers past the job (they'd fire against a finished meeting).
    ctx.addShutdownCallback(async () => {
      if (idleTimer) clearTimeout(idleTimer);
      clearTimeout(maxDurationTimer);
    });

    // --- Agent voice modes (C.3) --------------------------------------------
    // The realtime model runs with create_response:false, so replies only
    // happen when the agent asks for one:
    //   active — reply at the end of each user turn (same VAD signal the API
    //            would have used for its auto-response).
    //   muted  — keep listening and transcribing, never speak; no response is
    //            ever created, so muted listening costs no reply tokens.
    // Anyone in the room can still summon one answer via an `ask` message
    // (the "Ask AI" button, shown while muted). Mode switching is host-only.
    let agentMode: AgentMode = "active";

    const tryReply = (opts?: { force?: boolean }) => {
      if (ending) return;
      if (!opts?.force && agentMode !== "active") return;
      const state = session.agentState;
      if (state === "thinking" || state === "speaking") return;
      try {
        session.generateReply();
      } catch (err) {
        console.error("[Agent] generateReply failed:", err);
      }
    };

    session.on(voice.AgentSessionEventTypes.UserStateChanged, (ev) => {
      if (ev.oldState === "speaking" && ev.newState === "listening") {
        tryReply();
      }
    });

    const textEncoder = new TextEncoder();
    const textDecoder = new TextDecoder();

    const broadcastMode = () => {
      const message: AgentStateMessage = {
        type: "mode_changed",
        mode: agentMode,
      };
      ctx.room.localParticipant
        ?.publishData(textEncoder.encode(JSON.stringify(message)), {
          reliable: true,
          topic: AGENT_STATE_TOPIC,
        })
        .catch((err: unknown) =>
          console.error("[Agent] Failed to broadcast mode:", err),
        );
    };

    ctx.room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
      if (topic !== AGENT_CONTROL_TOPIC || !participant) return;
      if (participant.kind !== ParticipantKind.STANDARD) return;

      let message: AgentControlMessage;
      try {
        message = JSON.parse(textDecoder.decode(payload)) as AgentControlMessage;
      } catch {
        return;
      }

      if (message.type === "set_mode") {
        // Host-only. hostUserId travels in the room metadata; rooms created
        // before this shipped lack it — fall back to accepting any human.
        if (hostUserId && participant.identity !== hostUserId) return;
        if (message.mode !== "active" && message.mode !== "muted") return;
        if (message.mode !== agentMode) {
          agentMode = message.mode;
          if (agentMode === "muted") {
            // Cut off anything currently being said.
            try {
              session.interrupt();
            } catch {
              // nothing was playing
            }
          }
          console.log(
            `[Agent] Mode set to ${agentMode} by ${participant.identity}`,
          );
        }
        broadcastMode();
      } else if (message.type === "ask") {
        tryReply({ force: true });
      }
    });

    // Late joiners need the current mode for their UI badge.
    ctx.room.on(RoomEvent.ParticipantConnected, () => broadcastMode());
    broadcastMode();

    console.log(
      `[Agent] Session started for meeting: ${meetingId} ` +
      `(idle timeout ${IDLE_TIMEOUT_MINUTES}m, max duration ${MAX_DURATION_MINUTES}m)`,
    );
  },
});

// Worker entry point. Guard so the file can be dynamically imported by the
// framework (to read the default export) without re-launching the worker.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(
    new WorkerOptions({
      agent: fileURLToPath(import.meta.url),
      // C.2: register as a NAMED agent. Automatic dispatch is off — the agent
      // joins only when explicitly dispatched (webhook on first human join,
      // or the host's Add AI button mid-meeting).
      agentName: MEETING_AGENT_NAME,
    }),
  );
}
