import { db } from "@/db";
import { agents, meetings } from "@/db/schema";
import { createTRPCRouter, premiumProcedure, protectedProcedure } from "@/trpc/init";
import { agentsInsertSchema, agentsUpdateSchema } from "../schemas";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, getTableColumns, and, ilike, desc, count } from "drizzle-orm";
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_PAGE,
  MAX_PAGE_SIZE,
  MIN_PAGE_SIZE,
} from "@/constants";
import { escapeLike } from "@/lib/utils";

export const agentRouter = createTRPCRouter({
  update: protectedProcedure
  .input(agentsUpdateSchema)
  .mutation(async ({input, ctx}) => {
    const [updatedAgent] = await db.update(agents).set(input).where(
      and(
        eq(agents.id, input.id),
        eq(agents.userId, ctx.auth.user.id)
      )
    )
    .returning()

    if(!updatedAgent){
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Agent not found",
      });
    }

    return updatedAgent;
  }),
  remove: protectedProcedure
  .input(z.object({id: z.string()}))
  .mutation(async ({input, ctx}) => {
    const [removeAgent] = await db.delete(agents).where(
      and(
        eq(agents.id, input.id),
        eq(agents.userId, ctx.auth.user.id)
      )
    )
    .returning()

    if(!removeAgent){
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Agent not found",
      });
    }

    return removeAgent;
  }),
  getOne: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const [existingAgent] = await db
        .select({
          ...getTableColumns(agents),
          meetingCount: db.$count(meetings, eq(agents.id, meetings.agentId))
        })
        .from(agents)
        .where(
          and(eq(agents.id, input.id), eq(agents.userId, ctx.auth.user.id)),
        );

      if (!existingAgent) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Agent not found",
        });
      }

      return existingAgent;
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
      }),
    )
    .query(async ({ ctx, input }) => {
      const { search, page, pageSize } = input;

      const data = await db
        .select({
          ...getTableColumns(agents),
          meetingCount: db.$count(meetings, eq(agents.id, meetings.agentId)),
        })
        .from(agents)
        .where(
          and(
            eq(agents.userId, ctx.auth.user.id),
            search ? ilike(agents.name, `%${escapeLike(search)}%`) : undefined,
          ),
        )
        .orderBy(desc(agents.createdAt), desc(agents.id))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      const [total] = await db
        .select({
          count: count(),
        })
        .from(agents)
        .where(
          and(
            eq(agents.userId, ctx.auth.user.id),
            search ? ilike(agents.name, `%${escapeLike(search)}%`) : undefined,
          ),
        );

      const totalPages = Math.ceil(total.count / pageSize);

      return {
        items: data,
        total: total.count,
        totalPages,
      };
    }),
  create: premiumProcedure("agents")
    .input(agentsInsertSchema)
    .mutation(async ({ input, ctx }) => {
      const [createdAgent] = await db
        .insert(agents)
        .values({
          ...input,
          userId: ctx.auth.user.id,
        })
        .returning();

      return createdAgent;
    }),
});
