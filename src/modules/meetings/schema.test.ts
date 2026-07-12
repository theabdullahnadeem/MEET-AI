import { describe, expect, it } from "vitest";

import { meetingsInsertSchema } from "./schema";

// S-1 regression: the meeting name travels into the LiveKit room metadata
// (64 KB cap), so the length cap is a functional guard, not just hygiene.
describe("meetingsInsertSchema", () => {
  it("accepts a normal meeting", () => {
    const result = meetingsInsertSchema.safeParse({
      name: "Weekly standup",
      agentId: "agent_123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(
      meetingsInsertSchema.safeParse({ name: "", agentId: "a" }).success,
    ).toBe(false);
  });

  it("accepts a name of exactly 120 characters", () => {
    expect(
      meetingsInsertSchema.safeParse({ name: "x".repeat(120), agentId: "a" })
        .success,
    ).toBe(true);
  });

  it("rejects a name of 121 characters", () => {
    expect(
      meetingsInsertSchema.safeParse({ name: "x".repeat(121), agentId: "a" })
        .success,
    ).toBe(false);
  });

  it("rejects a missing agent", () => {
    expect(
      meetingsInsertSchema.safeParse({ name: "ok", agentId: "" }).success,
    ).toBe(false);
  });
});
