import { and, eq, not } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { ChatCompletionMessageParam } from "openai/resources/index.mjs";
import {
  CallEndedEvent,
  CallTranscriptionReadyEvent,
  CallSessionParticipantLeftEvent,
  CallRecordingReadyEvent,
  CallSessionStartedEvent,
  MessageNewEvent
} from "@stream-io/node-sdk";

import { db } from "@/db";
import { agents, meetings } from "@/db/schema";
import { streamVideo } from "@/lib/stream-video";
import { inngest } from "@/inngest/client";
import { generateAvatarUri } from "@/lib/avatar";
import { streamChat } from "@/lib/stream-chat";

const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

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

  // Clock skew tolerance: warn if webhook timestamp drifts >30s from server time
  const eventCreatedAt = (payload as Record<string, unknown>)?.created_at;
  if (typeof eventCreatedAt === "string") {
    const eventTime = new Date(eventCreatedAt).getTime();
    const serverTime = Date.now();
    const driftSeconds = Math.abs(serverTime - eventTime) / 1000;
    if (driftSeconds > 30) {
      console.warn(
        `Webhook clock skew detected: drift=${driftSeconds.toFixed(1)}s, event_time=${eventCreatedAt}, server_time=${new Date(serverTime).toISOString()}`
      );
    }
  }

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


    // Backdate internal call tokens by 10s to absorb Vercel↔Stream clock drift.
    // connectOpenAi() generates a call token internally; without this, Stream
    // rejects it as "issued in the future" when server clocks diverge.
    const originalGenerateCallToken =
      streamVideo.generateCallToken.bind(streamVideo);
    streamVideo.generateCallToken = (payload: any) => {
      return originalGenerateCallToken({
        ...payload,
        iat: Math.floor(Date.now() / 1000) - 10,
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

    // Only end the call when the human user leaves, not the AI agent.
    // If the AI has a transient disconnect, we don't want to kill the session.
    const leftUserId = event.participant?.user?.id;

    const [meeting] = await db
      .select()
      .from(meetings)
      .where(eq(meetings.id, meetingId));

    if (meeting && leftUserId !== meeting.agentId) {
      const call = streamVideo.video.call("default", meetingId);
      await call.end();
    }
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
  } else if (eventType === "message.new") {
    const event = payload as MessageNewEvent;
    
    const userId = event.user?.id;
    const channelId = event.channel_id;
    const text = event.message?.text;

    if(!userId || !channelId || !text){
      return NextResponse.json(
        { error: "Missing user ID, channel ID, or text" },
        { status: 400 },
      );
    };

    const [existingMeeting] = await db
    .select()
    .from(meetings)
    .where(
      and(
        eq(meetings.id, channelId),
        eq(meetings.status, "completed"),
      )
    )

    if(!existingMeeting){
      return NextResponse.json(
        { error: "Meeting not found" },
        { status: 404 },
      );
    }

    const [existingAgent] = await db 
    .select()
    .from(agents)
    .where(eq(agents.id, existingMeeting.agentId));

    if(!existingAgent){
      return NextResponse.json(
        { error: "Agent not found" },
        { status: 404 },
      );
    }

    if (userId !== existingAgent.id){
      const instructions = `
      You are an AI assistant helping the user revisit a recently completed meeting.
      Below is a summary of the meeting, generated from the transcript:
      
      ${existingMeeting.summary}
      
      The following are your original instructions from the live meeting assistant. Please continue to follow these behavioral guidelines as you assist the user:
      
      ${existingAgent.instructions}
      
      The user may ask questions about the meeting, request clarifications, or ask for follow-up actions.
      Always base your responses on the meeting summary above.
      
      You also have access to the recent conversation history between you and the user. Use the context of previous messages to provide relevant, coherent, and helpful responses. If the user's question refers to something discussed earlier, make sure to take that into account and maintain continuity in the conversation.
      
      If the summary does not contain enough information to answer a question, politely let the user know.
      
      Be concise, helpful, and focus on providing accurate information from the meeting and the ongoing conversation.
      `;

      const channel = streamChat.channel("messaging", channelId);
      await channel.watch();

      const previousMessages = channel.state.messages
      .slice(-5)
      .filter((msg)=> msg.text && msg.text.trim() !== "")
      .map<ChatCompletionMessageParam>((message)=>({
        role: message.user?.id === existingAgent.id ? "assistant" : "user",
        content: message.text || "",
      }));

      const GPTResponse = await openaiClient.chat.completions.create({
        messages: [
          {role : "system" , content: instructions},
          ...previousMessages,
          {role: "user", content: text}
        ],
        model: "gpt-4o",
      });

      const GPTResponseText = GPTResponse.choices[0].message.content;

      if(!GPTResponseText){
        return NextResponse.json(
          { error: "No response from AI assistant" },
          { status: 500 },
        );
      }

      const avatarUrl = generateAvatarUri({
        seed: existingAgent.name,
        variant: "botttsNeutral",
      });

      await streamChat.upsertUser({
        id:existingAgent.id,
        name:existingAgent.name,
        image:avatarUrl,
      });

      await channel.sendMessage({
        text: GPTResponseText,
        user_id: existingAgent.id,
      });
    }
  }


  return NextResponse.json({ status: "success" });
}
