import { describe, expect, it } from "vitest";

import { agentsInsertSchema } from "./schemas";

// S-1 regression: agent instructions flow into the LiveKit room metadata
// (64 KB cap) and into every realtime prompt (token cost) — the caps here
// are what keeps that bounded.
describe("agentsInsertSchema", () => {
  it("accepts a normal agent", () => {
    expect(
      agentsInsertSchema.safeParse({
        name: "Interviewer",
        instructions: "Ask thoughtful follow-up questions.",
      }).success,
    ).toBe(true);
  });

  it("rejects an empty name and empty instructions", () => {
    expect(
      agentsInsertSchema.safeParse({ name: "", instructions: "" }).success,
    ).toBe(false);
  });

  it("accepts a name of exactly 80 characters", () => {
    expect(
      agentsInsertSchema.safeParse({
        name: "x".repeat(80),
        instructions: "ok",
      }).success,
    ).toBe(true);
  });

  it("rejects a name of 81 characters", () => {
    expect(
      agentsInsertSchema.safeParse({
        name: "x".repeat(81),
        instructions: "ok",
      }).success,
    ).toBe(false);
  });

  it("accepts instructions of exactly 10,000 characters", () => {
    expect(
      agentsInsertSchema.safeParse({
        name: "ok",
        instructions: "x".repeat(10_000),
      }).success,
    ).toBe(true);
  });

  it("rejects instructions of 10,001 characters", () => {
    expect(
      agentsInsertSchema.safeParse({
        name: "ok",
        instructions: "x".repeat(10_001),
      }).success,
    ).toBe(false);
  });
});
