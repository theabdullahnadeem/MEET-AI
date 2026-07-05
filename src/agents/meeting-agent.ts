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
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import JSONL from "jsonl-parse-stringify";

interface RoomMeta {
  meetingId?: string;
  meetingName?: string;
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

export default defineAgent({
  entry: async (ctx: JobContext) => {
    // Room metadata is set when the meeting is created (see meeting.create).
    // Read it from the dispatch job info — `ctx.room` is an unconnected stub
    // until `ctx.connect()`, so `ctx.room.metadata` is empty at this point.
    const rawMetadata = ctx.job.room?.metadata ?? "";
    const metadata: RoomMeta = rawMetadata
      ? (JSON.parse(rawMetadata) as RoomMeta)
      : {};

    const { meetingId, agentId, agentName, agentInstructions } = metadata;

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
          silence_duration_ms: 500,
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

    // On shutdown (room closed / job ended) persist the transcript to R2 and
    // record its URL on the meeting. The room_finished webhook then triggers
    // summarization. Guarded so a storage/DB misconfig never crashes the agent.
    ctx.addShutdownCallback(async () => {
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
        await s3.send(
          new PutObjectCommand({
            Bucket: process.env.R2_BUCKET!,
            Key: key,
            Body: JSONL.stringify(transcript),
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
    });

    await session.start({
      agent: new voice.Agent({
        instructions:
          agentInstructions ?? "You are a helpful AI meeting assistant.",
      }),
      room: ctx.room,
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

    console.log(`[Agent] Session started for meeting: ${meetingId}`);
  },
});

// Worker entry point. Guard so the file can be dynamically imported by the
// framework (to read the default export) without re-launching the worker.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(
    new WorkerOptions({
      agent: fileURLToPath(import.meta.url),
    }),
  );
}
