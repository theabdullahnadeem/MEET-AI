import { db } from "@/db";
import { agents, meetings, meetingJoinRequests, user } from "@/db/schema";
import { createTRPCRouter, premiumProcedure, protectedProcedure } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, getTableColumns, and, or, ilike, desc, count, sql, inArray } from "drizzle-orm";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
} from "@/constants";
import { meetingsInsertSchema, meetingsUpdateSchema } from "../schema";
import { MeetingStatus } from "@/constants";      
import { livekitRoomService } from "@/lib/livekit";
import { generateAvatarUri } from "@/lib/avatar";
import { fetchTranscriptText } from "@/lib/fetch-transcript";
import { presignR2Get, r2KeyFromStored } from "@/lib/r2";
import JSONL from "jsonl-parse-stringify";
import { StreamTrancriptItem } from "../types";
import { streamChat } from "@/lib/stream-chat";
import { escapeLike } from "@/lib/utils";

// Participant access: a user may READ a meeting they own OR one they were
// admitted to (approved join request). Write/management procedures must keep
// filtering by ownership only.
const canAccessMeeting = (userId: string) =>
  or(
    eq(meetings.userId, userId),
    inArray(
      meetings.id,
      db
        .select({ id: meetingJoinRequests.meetingId })
        .from(meetingJoinRequests)
        .where(
          and(
            eq(meetingJoinRequests.userId, userId),
            eq(meetingJoinRequests.status, "approved"),
          ),
        ),
    ),
  );

export const meetingsRouter = createTRPCRouter({
  cancelMeeting: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const [canceledMeeting] = await db
        .update(meetings)
        .set({ status: MeetingStatus.CANCELLED })
        .where(
          and(
            eq(meetings.id, input.id),
            eq(meetings.userId, ctx.auth.user.id)
          )
        )
        .returning();

      if (!canceledMeeting) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Meeting not found",
        });
      }

      return canceledMeeting;
    }),
  generateChatToken: protectedProcedure.mutation(async ({ctx}) => {
    const token = streamChat.createToken(ctx.auth.user.id)
    await streamChat.upsertUser({
      id: ctx.auth.user.id,
      role: "admin",
    });
    
    return token;
  }) ,
  getTranscript: protectedProcedure.input(z.object({id: z.string()})).query(async ({input, ctx}) => {
    // Participant access: owner OR admitted guest may read the transcript.
    const [existingMeeting] = await db
    .select()
    .from(meetings)
    .where(
      and(
        eq(meetings.id, input.id), canAccessMeeting(ctx.auth.user.id)
      )
    );

    if(!existingMeeting){
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Meeting not found",
      });
    }

    if(!existingMeeting.transcriptUrl){
      return [];
    }

    // SEC-5: the bucket is private — resolve the stored reference (key or
    // legacy public URL) and read via a short-lived presigned URL.
    const transcript = await presignR2Get(
      r2KeyFromStored(existingMeeting.transcriptUrl),
    )
    .then(url => fetchTranscriptText(url))
    .then(text => JSONL.parse<StreamTrancriptItem>(text))
    .catch(() => {
      return [];
    });
    
    const speakerIds = [
      ...new Set(transcript.map(item => item.speaker_id))
    ];

    const userSpeakers = await db
    .select()
    .from(user)
    .where(inArray(user.id, speakerIds))
    .then((users) => (
      users.map((user)=>({
        ...user,
      image: 
          user.image ?? generateAvatarUri({ seed: user.name, variant: "initials" }),
      }))
    ));

    const agentSpeakers = await db
    .select()
    .from(agents)
    .where(inArray(agents.id, speakerIds))
    .then((agents) => (
      agents.map((agent)=>(
        {
          ...agent,
          image: generateAvatarUri({ seed: agent.name, variant: "botttsNeutral" }),
        }
      ))
    ));

    const speakers = [...userSpeakers, ...agentSpeakers];

    const transcriptWithSpeakers = transcript.map((item)=>{
      const speaker = speakers.find(
        (speaker) => speaker.id === item.speaker_id
      );

      if(!speaker){
        return {
          ...item,
          user:{
            name: "Unknown",
            image: generateAvatarUri({ seed: "Unknown", variant: "initials" }),
          }
        }
      };

      return{
        ...item,
        user:{
          name: speaker.name,
          image: speaker.image,
        }
      };
    });

    return transcriptWithSpeakers;
  }),
  remove: protectedProcedure
  .input(z.object({ id: z.string() }))
  .mutation(async ({input, ctx}) => {
    const [removedMeeting] = await db.delete(meetings).where(
      and(
        eq(meetings.id, input.id),
        eq(meetings.userId, ctx.auth.user.id)
      )
    )
    .returning()

    if(!removedMeeting){
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Meeting not found",
      });
    }

    return removedMeeting;
  }),
  update: protectedProcedure
  .input(meetingsUpdateSchema)
  .mutation(async ({input, ctx}) => {
    const [updatedMeeting] = await db.update(meetings).set(input).where(
      and(
        eq(meetings.id, input.id),
        eq(meetings.userId, ctx.auth.user.id)
      )
    )
    .returning()

    if(!updatedMeeting){
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Meeting not found",
      });
    }

    return updatedMeeting;
  }),
  create: premiumProcedure("meetings")
    .input(meetingsInsertSchema)
    .mutation(async ({ input, ctx }) => {
      const [createdMeeting] = await db
        .insert(meetings)
        .values({
          ...input,
          userId: ctx.auth.user.id,
        })
        .returning();

        const [existingAgent] = await db
        .select()
        .from(agents)
        .where(eq(agents.id, createdMeeting.agentId));

        if(!existingAgent){
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Agent not found",
          });
        }

        await livekitRoomService.createRoom({
          name: createdMeeting.id,
          emptyTimeout: 300,        // 5 min — room auto-closes if empty
          maxParticipants: 50,      // supports multi-user expansion
          metadata: JSON.stringify({
            meetingId: createdMeeting.id,
            meetingName: createdMeeting.name,
            // C.3: lets the agent verify that mode switches come from the host.
            hostUserId: ctx.auth.user.id,
            agentId: existingAgent.id,
            agentName: existingAgent.name,
            agentInstructions: existingAgent.instructions,
          }),
        });

      return createdMeeting;
    }),
  // MU-2: call-scoped read — deliberately NOT owner-filtered so a signed-in
  // guest can load the call screen from a shared link (Google Meet model).
  // Returns only what the call page needs; joining the room itself is still
  // gated by /api/livekit-token (owner-only until MU-3 knock-to-join lands).
  // All management procedures (getOne, update, remove, getMany) stay owner-scoped.
  getForCall: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const [existingMeeting] = await db
        .select({
          id: meetings.id,
          name: meetings.name,
          status: meetings.status,
          userId: meetings.userId,
        })
        .from(meetings)
        .where(eq(meetings.id, input.id));

      if (!existingMeeting) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Meeting not found",
        });
      }

      // MU-3: the host UI (admit/deny panel) needs to know it's the host —
      // expose a computed flag rather than leaking the owner's user id.
      return {
        id: existingMeeting.id,
        name: existingMeeting.name,
        status: existingMeeting.status,
        isOwner: existingMeeting.userId === ctx.auth.user.id,
      };
    }),
  // MU-3: knock-to-join. A signed-in non-owner asks to join; the host admits
  // or denies from inside the call. Only an `approved` row unlocks
  // /api/livekit-token (and /api/media/recording) for non-owners.
  requestToJoin: protectedProcedure
    .input(z.object({ meetingId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const [meeting] = await db
        .select({ id: meetings.id, userId: meetings.userId })
        .from(meetings)
        .where(eq(meetings.id, input.meetingId));

      if (!meeting) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Meeting not found",
        });
      }

      // The owner never needs a request.
      if (meeting.userId === ctx.auth.user.id) {
        return { id: null, status: "approved" as const };
      }

      // Reuse an existing live request (pending or approved) — one knock per
      // user per meeting. A previously denied user may ask again.
      const [existing] = await db
        .select({ id: meetingJoinRequests.id, status: meetingJoinRequests.status })
        .from(meetingJoinRequests)
        .where(
          and(
            eq(meetingJoinRequests.meetingId, input.meetingId),
            eq(meetingJoinRequests.userId, ctx.auth.user.id),
            inArray(meetingJoinRequests.status, ["pending", "approved"]),
          ),
        );

      if (existing) {
        return existing;
      }

      const [created] = await db
        .insert(meetingJoinRequests)
        .values({
          meetingId: input.meetingId,
          userId: ctx.auth.user.id,
        })
        // The partial unique index is the backstop against a concurrent knock.
        .onConflictDoNothing()
        .returning({ id: meetingJoinRequests.id, status: meetingJoinRequests.status });

      if (created) {
        return created;
      }

      // Lost the race to a concurrent request — return that one.
      const [raced] = await db
        .select({ id: meetingJoinRequests.id, status: meetingJoinRequests.status })
        .from(meetingJoinRequests)
        .where(
          and(
            eq(meetingJoinRequests.meetingId, input.meetingId),
            eq(meetingJoinRequests.userId, ctx.auth.user.id),
            inArray(meetingJoinRequests.status, ["pending", "approved"]),
          ),
        );

      return raced ?? { id: null, status: "pending" as const };
    }),
  // Guest polls its own request while on the waiting screen.
  getMyJoinRequest: protectedProcedure
    .input(z.object({ meetingId: z.string() }))
    .query(async ({ input, ctx }) => {
      const [request] = await db
        .select({
          id: meetingJoinRequests.id,
          status: meetingJoinRequests.status,
        })
        .from(meetingJoinRequests)
        .where(
          and(
            eq(meetingJoinRequests.meetingId, input.meetingId),
            eq(meetingJoinRequests.userId, ctx.auth.user.id),
          ),
        )
        .orderBy(desc(meetingJoinRequests.createdAt))
        .limit(1);

      return request ?? null;
    }),
  // Host polls the waiting room while in the call.
  getPendingRequests: protectedProcedure
    .input(z.object({ meetingId: z.string() }))
    .query(async ({ input, ctx }) => {
      const [meeting] = await db
        .select({ id: meetings.id })
        .from(meetings)
        .where(
          and(
            eq(meetings.id, input.meetingId),
            eq(meetings.userId, ctx.auth.user.id),
          ),
        );

      if (!meeting) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the host can view join requests",
        });
      }

      return db
        .select({
          id: meetingJoinRequests.id,
          createdAt: meetingJoinRequests.createdAt,
          userName: user.name,
          userImage: user.image,
        })
        .from(meetingJoinRequests)
        .innerJoin(user, eq(meetingJoinRequests.userId, user.id))
        .where(
          and(
            eq(meetingJoinRequests.meetingId, input.meetingId),
            eq(meetingJoinRequests.status, "pending"),
          ),
        )
        .orderBy(meetingJoinRequests.createdAt);
    }),
  admit: protectedProcedure
    .input(z.object({ requestId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const [updated] = await db
        .update(meetingJoinRequests)
        .set({ status: "approved" })
        .where(
          and(
            eq(meetingJoinRequests.id, input.requestId),
            eq(meetingJoinRequests.status, "pending"),
            // Host-only: the request must belong to a meeting this user owns.
            inArray(
              meetingJoinRequests.meetingId,
              db
                .select({ id: meetings.id })
                .from(meetings)
                .where(eq(meetings.userId, ctx.auth.user.id)),
            ),
          ),
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Join request not found",
        });
      }

      return updated;
    }),
  deny: protectedProcedure
    .input(z.object({ requestId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const [updated] = await db
        .update(meetingJoinRequests)
        .set({ status: "denied" })
        .where(
          and(
            eq(meetingJoinRequests.id, input.requestId),
            eq(meetingJoinRequests.status, "pending"),
            inArray(
              meetingJoinRequests.meetingId,
              db
                .select({ id: meetings.id })
                .from(meetings)
                .where(eq(meetings.userId, ctx.auth.user.id)),
            ),
          ),
        )
        .returning();

      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Join request not found",
        });
      }

      return updated;
    }),
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      // Participant access: owner OR admitted guest may read the meeting.
      // isOwner lets the UI hide management actions for guests.
      const [existingMeeting] = await db
        .select({
          ...getTableColumns(meetings),
          agent: agents,
          duration: sql<number>`EXTRACT(EPOCH FROM (ended_at - started_at))`.as("duration"),
        })
        .from(meetings)
        .innerJoin(agents, eq(meetings.agentId, agents.id))
        .where(
          and(eq(meetings.id, input.id), canAccessMeeting(ctx.auth.user.id)),
        );

      if (!existingMeeting) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Meeting not found",
        });
      }

      return {
        ...existingMeeting,
        isOwner: existingMeeting.userId === ctx.auth.user.id,
      };
    }),
  getMany: protectedProcedure
    .input(
      z.object({
        page: z.number().default(DEFAULT_PAGE),
        pageSize: z
          .number()
          .min(MIN_PAGE_SIZE)
          .max(MAX_PAGE_SIZE)
          .default(DEFAULT_PAGE_SIZE),
        search: z.string().nullish(),
        agentId: z.string().nullish(),
        status:z.enum([
          MeetingStatus.UPCOMING,
          MeetingStatus.ACTIVE,
          MeetingStatus.PROCESSING,
          MeetingStatus.COMPLETED,
          MeetingStatus.CANCELLED,
        ]).nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { search, page, pageSize, agentId, status } = input;

      // Participant access: the list shows meetings you own AND meetings you
      // were admitted to ("shared with me"); isOwner drives the Shared badge.
      const data = await db
        .select({
          ...getTableColumns(meetings),
          agent: agents,
          duration: sql<number>`EXTRACT(EPOCH FROM (ended_at - started_at))`.as("duration"),
          isOwner: sql<boolean>`${meetings.userId} = ${ctx.auth.user.id}`.as("is_owner"),
        })
        .from(meetings)
        .innerJoin(agents, eq(meetings.agentId, agents.id))
        .where(
          and(
            canAccessMeeting(ctx.auth.user.id),
            search ? ilike(meetings.name, `%${escapeLike(search)}%`) : undefined,
            agentId ? eq(meetings.agentId, agentId) : undefined,
            status ? eq(meetings.status, status) : undefined,
          ),
        )
        .orderBy(desc(meetings.createdAt), desc(meetings.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const [total] = await db
        .select({
          count: count(),
        })
        .from(meetings)
        .innerJoin(agents, eq(meetings.agentId, agents.id))
        .where(
          and(
            canAccessMeeting(ctx.auth.user.id),
            search ? ilike(meetings.name, `%${escapeLike(search)}%`) : undefined,
            agentId ? eq(meetings.agentId, agentId) : undefined,
            status ? eq(meetings.status, status) : undefined,
          ),
        );

      const totalPages = Math.ceil(total.count / pageSize);

      return {
        items: data,
        total: total.count,
        totalPages,
      };
    }),
});
