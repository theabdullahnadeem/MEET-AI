import { fileURLToPath } from "node:url";

import {
  WorkerOptions,
  cli,
  defineAgent,
  voice,
  type JobContext,
} from "@livekit/agents";
import * as openai from "@livekit/agents-plugin-openai";

interface RoomMeta {
  meetingId?: string;
  meetingName?: string;
  agentId?: string;
  agentName?: string;
  agentInstructions?: string;
}

export default defineAgent({
  entry: async (ctx: JobContext) => {
    // Room metadata is set when the meeting is created (see meeting.create).
    // Read it from the dispatch job info — `ctx.room` is an unconnected stub
    // until `ctx.connect()`, so `ctx.room.metadata` is empty at this point.
    // `ctx.job.room.metadata` carries the room metadata at dispatch time.
    // Guard against an empty string — JSON.parse("") throws.
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

    await session.start({
      agent: new voice.Agent({
        instructions:
          agentInstructions ?? "You are a helpful AI meeting assistant.",
      }),
      room: ctx.room,
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
