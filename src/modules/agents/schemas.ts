import {z} from "zod";

// S-1: length caps — instructions flow into the LiveKit room metadata
// (64 KB cap) and into every realtime-model prompt (token cost), so they
// must be bounded server-side, not just in the form.
export const agentsInsertSchema = z.object({
    name:z.string()
        .min(1,{message:"Name is required"})
        .max(80,{message:"Name must be 80 characters or fewer"}),
    instructions:z.string()
        .min(1,{message:"Instructions are required"})
        .max(10_000,{message:"Instructions must be 10,000 characters or fewer"}),
})

export const agentsUpdateSchema = agentsInsertSchema.extend({
    id:z.string().min(1,{message:"Id is required"})
});
