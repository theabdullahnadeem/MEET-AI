import {z} from "zod";

// S-1: length caps — the meeting name also travels into the LiveKit room
// metadata (64 KB cap shared with the agent instructions), so unbounded
// input can break room creation, not just bloat the DB.
export const meetingsInsertSchema = z.object({
    name:z.string()
        .min(1,{message:"Name is required"})
        .max(120,{message:"Name must be 120 characters or fewer"}),
    agentId:z.string().min(1,{message:"Agent is required"}),
})

export const meetingsUpdateSchema = meetingsInsertSchema.extend({
    id:z.string().min(1,{message:"Id is required"})
});
