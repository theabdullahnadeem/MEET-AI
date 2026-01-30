import { and, eq, not } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

import {
  CallEndedEvent,
  CallTranscriptionReadyEvent,
  CallSessionParticipantLeftEvent,
  CallRecordingReadyEvent,
  CallSessionStartedEvent,
} from "@stream-io/node-sdk";

import { db } from "@/db";
import { agents, meetings } from "@/db/schema";
import { streamVideo } from "@/lib/stream-video";
import { Call } from "@stream-io/video-react-sdk";
import { inngest } from "@/inngest/client";

function verifySignatureWithSdk(body: string, signature: string): boolean {
  return streamVideo.verifyWebhook(body, signature);
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-signature");
  const apiKey = req.headers.get("x-api-key");

  if (!signature || !apiKey) {
    return NextResponse.json(
      { error: "Missing signature or API key" },
      { status: 400 },
    );
  }

  const body = await req.text();

  if (!verifySignatureWithSdk(body, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const eventType = (payload as Record<string, unknown>)?.type;
  console.log("Webhook event type:", eventType);

  if (eventType === "call.session_started") {
    const event = payload as CallSessionStartedEvent;
    const meetingId = event.call.custom?.meetingId;
    console.log("Meeting ID from event:", meetingId);

    if (!meetingId) {
      return NextResponse.json(
        { error: "Missing meeting ID" },
        { status: 400 },
      );
    }

    const [exsistingMeeting] = await db
      .select()
      .from(meetings)
      .where(
        and(
          eq(meetings.id, meetingId),
          not(eq(meetings.status, "completed")),
          not(eq(meetings.status, "active")),
          not(eq(meetings.status, "cancelled")),
          not(eq(meetings.status, "processing")),
        ),
      );

    console.log(
      "Found meeting:",
      exsistingMeeting ? "YES" : "NO (skipped - already active?)",
    );

    if (!exsistingMeeting) {
      return NextResponse.json(
        { error: "Meeting not found or already completed" },
        { status: 404 },
      );
    }

    await db
      .update(meetings)
      .set({
        status: "active",
        startedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId));

    const [existingAgent] = await db
      .select()
      .from(agents)
      .where(eq(agents.id, exsistingMeeting.agentId));

    console.log("Found agent:", existingAgent ? existingAgent.name : "NO");

    if (!existingAgent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Monkey-patch to fix JWT clock skew issue
    const originalGenerateCallToken =
      streamVideo.generateCallToken.bind(streamVideo);
    streamVideo.generateCallToken = (payload: any) => {
      return originalGenerateCallToken({
        ...payload,
        iat: Math.floor(Date.now() / 1000) - 60, // Backdate by 60 seconds
      });
    };

    try {
      console.log("Connecting AI agent to call...");

      const call = streamVideo.video.call("default", meetingId);
      const realtimeClient = await streamVideo.video.connectOpenAi({
        call,
        openAiApiKey: process.env.OPENAI_API_KEY!,
        agentUserId: existingAgent.id,
        model: "gpt-4o-realtime-preview",
      });

      console.log("Connected! Updating session...");
      realtimeClient.updateSession({
        instructions: existingAgent.instructions,
        modalities: ["audio"],
        voice: "shimmer",
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        input_audio_transcription: {
          model: "whisper-1",
        },
      });
      // Add event listeners for debugging
      realtimeClient.on("error", (error: any) => {
        console.error("Realtime ERROR:", error);
      });

      realtimeClient.on("session.created", () => {
        console.log("OpenAI session created successfully!");
      });
      console.log("AI Agent ready and listening!");
    } catch (error) {
      console.error("AI AGENT ERROR:", error);
    }
  } else if (eventType === "call.session_participant_left") {
    const event = payload as CallSessionParticipantLeftEvent;
    const meetingId = event.call_cid.split(":")[1];

    if (!meetingId) {
      return NextResponse.json(
        { error: "Missing meeting ID" },
        { status: 400 },
      );
    }

    const call = streamVideo.video.call("default", meetingId);
    await call.end();
  } else if(eventType === "call.session_ended"){
    const event = payload as CallEndedEvent;
    const meetingId = event.call.custom?.meetingId;

    if(!meetingId){
      return NextResponse.json(
        { error: "Missing meeting ID" },
        { status: 400 },
      );
    };

    await db
    .update(meetings)
    .set({
      status: "processing",
      endedAt: new Date(),
    })
    .where(
      and(
        eq(meetings.id, meetingId), eq(meetings.status, "active")
      )
    );
  } else if (eventType === "call.transcription_ready"){
    const event = payload as CallTranscriptionReadyEvent;
    const meetingId = event.call_cid.split(":")[1];

    if(!meetingId){
      return NextResponse.json(
        { error: "Missing meeting ID" },
        { status: 404 }, 
      );
    };

    const [updatedMeeting] = await db 
    .update(meetings)
    .set({
      transcriptUrl: event.call_transcription.url,
    })
    .where( 
      eq(meetings.id, meetingId)
    )
    .returning();

    if(!updatedMeeting){
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 },
      );
    }

    await inngest.send({
      name: "meetings/processing",
      data: {
        meetingId: updatedMeeting.id,
        transcriptUrl: updatedMeeting.transcriptUrl,
      },
    })
  } else if (eventType === "call.recording_ready") {
    const event = payload as CallRecordingReadyEvent;
    const meetingId = event.call_cid.split(":")[1];

    if(!meetingId){
      return NextResponse.json(
        { error: "Missing meeting ID" },
        { status: 404 }, 
      );
    };

    await db 
    .update(meetings)
    .set({
      recordingUrl: event.call_recording.url,
    })
    .where( 
      eq(meetings.id, meetingId)
    );

    // TODO: Call ingest background job to summarize the transcript
  }

  return NextResponse.json({ status: "success" });
}
